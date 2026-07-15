import os
import secrets
import base64
import json
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from io import BytesIO
from PIL import Image
import oqs
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

app = FastAPI()

# --- CORS CONFIGURATION ---
origins = [
    "http://localhost:5173",             
    "https://pqc-sanitizer.vercel.app",  
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- IN-MEMORY SESSION STORE ---
active_sessions = {}

# --- 1. THE HANDSHAKE (Kyber ML-KEM) ---
@app.get("/api/handshake")
def handshake():
    kem = oqs.KeyEncapsulation('Kyber768')
    public_key = kem.generate_keypair()
    session_id = secrets.token_hex(16)
    active_sessions[session_id] = kem
    
    return {
        "session_id": session_id,
        "public_key": base64.b64encode(public_key).decode('utf-8')
    }

# --- 2. SANITIZE & SIGN ---
@app.post("/api/v1/sanitize")
async def sanitize(
    request: Request, # Added to trace incoming Origin headers dynamically on error blocks
    file: UploadFile = File(...),
    session_id: str = Form(...),
    encapsulated_key: str = Form(...),
    iv: str = Form(...)
):
    if session_id not in active_sessions:
        origin = request.headers.get("origin", "*")
        return JSONResponse(
            status_code=400,
            content={"detail": "Invalid or expired session. Please refresh."},
            headers={"Access-Control-Allow-Origin": origin}
        )
        
    kem = active_sessions.pop(session_id) 
    
    try:
        # A. Decapsulate AES Key
        ciphertext_bytes = base64.b64decode(encapsulated_key)
        aes_key = kem.decap_secret(ciphertext_bytes)
        
        # B. Decrypt Image
        iv_bytes = base64.b64decode(iv)
        encrypted_image = await file.read()
        aesgcm = AESGCM(aes_key)
        raw_image_bytes = aesgcm.decrypt(iv_bytes, encrypted_image, None)
        
        # C. Process Metadata
        image_stream = BytesIO(raw_image_bytes)
        img = Image.open(image_stream)
        raw_metadata = img.info.copy()
        
        # Defensive processing: Summarize huge binary blobs so they don't crash the JSON parser
        metadata = {}
        if raw_metadata:
            for k, v in raw_metadata.items():
                str_k = str(k)
                if isinstance(v, bytes):
                    if len(v) > 100:
                        metadata[str_k] = f"<Raw Binary Data: {len(v)} bytes - Stripped Successfully>"
                    else:
                        metadata[str_k] = str(v)
                else:
                    str_v = str(v)
                    if len(str_v) > 200:
                        metadata[str_k] = str_v[:200] + "... [Truncated]"
                    else:
                        metadata[str_k] = str_v
        else:
            metadata = {"Status": "No metadata found."}
        
        # =====================================================================
        # CRITICAL FIX: Explicitly clear the internal info dict before saving.
        # This completely blocks Pillow from feeding corrupted or incompatible
        # JPEG metadata markers into the PNG engine, eliminating the crash!
        # =====================================================================
        img.info = {}
        
        clean_stream = BytesIO()
        img.save(clean_stream, format="PNG")
        clean_image_bytes = clean_stream.getvalue()
        
        # D. Sign Image (Dilithium)
        signer = oqs.Signature('Dilithium2')
        signer_pub_key = signer.generate_keypair()
        signature = signer.sign(clean_image_bytes)
        
        # E. Package & Re-encrypt
        final_payload = clean_image_bytes + signer_pub_key + signature
        response_data = {
            "metadata": metadata,
            "image_b64": base64.b64encode(final_payload).decode('utf-8')
        }
        json_bytes = json.dumps(response_data).encode('utf-8')
        
        return_iv = os.urandom(12)
        return_ciphertext = aesgcm.encrypt(return_iv, json_bytes, None)
        
        return Response(content=return_iv + return_ciphertext, media_type="application/octet-stream")
        
    except Exception as e:
        print(f"Error during sanitization: {e}")
        # CORS Bulletproofing: Capture the error and force mirror the header response origin
        # so the frontend reads the actual message text instead of generating a CORS failure block.
        origin = request.headers.get("origin", "*")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Cryptographic processing or format conversion failed: {str(e)}"},
            headers={"Access-Control-Allow-Origin": origin}
        )

# --- 3. VERIFICATION ---
@app.post("/api/v1/verify")
async def verify(file: UploadFile = File(...)):
    file_bytes = await file.read()
    
    pk_size = 1312
    sig_size = 2420
    
    if len(file_bytes) < (sig_size + pk_size):
        return {"verified": False, "message": "File is too small. Missing signature block."}
        
    signature = file_bytes[-sig_size:]
    public_key = file_bytes[-(sig_size + pk_size):-sig_size]
    image_data = file_bytes[:-(sig_size + pk_size)]
    
    try:
        verifier = oqs.Signature('Dilithium2')
        is_valid = verifier.verify(image_data, signature, public_key)
        
        if is_valid:
            return {"verified": True, "message": "Valid signature. Image is pristine."}
        else:
            return {"verified": False, "message": "WARNING: File tampered or corrupted."}
            
    except Exception as e:
        return {"verified": False, "message": "Failed to parse signature."}