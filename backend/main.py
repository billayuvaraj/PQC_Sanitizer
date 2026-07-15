import os
import base64
import time
import io
import json
import oqs
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Response
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from PIL import Image, ExifTags
from fastapi.middleware.cors import CORSMiddleware
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


# In-Memory State Store for Session-Scoped Keys
active_sessions = {}

class MasterSigner:
    def __init__(self):
        self.sig_name = "ML-DSA-44" 
        with oqs.Signature(self.sig_name) as signer:
            self.public_key = signer.generate_keypair()
            self.secret_key = signer.export_secret_key()

    def sign(self, message: bytes) -> bytes:
        with oqs.Signature(self.sig_name, secret_key=self.secret_key) as signer:
            return signer.sign(message)

signer = MasterSigner()

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 PQC Privacy Server Online (Session-Scoped).")
    yield
    print("Shutting down...")

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

def cleanup_expired_sessions():
    current_time = time.time()
    expired = [sid for sid, data in active_sessions.items() if current_time > data["expires_at"]]
    for sid in expired:
        del active_sessions[sid]

@app.get("/api/handshake")
def generate_handshake():
    cleanup_expired_sessions()
    with oqs.KeyEncapsulation("ML-KEM-768") as kem:
        public_key = kem.generate_keypair()
        secret_key = kem.export_secret_key()
        session_id = os.urandom(16).hex()
        
        # Keep session alive for 1 hour
        active_sessions[session_id] = {
            "secret_key": secret_key,
            "expires_at": time.time() + 3600.0
        }
        
        return {
            "session_id": session_id,
            "public_key": base64.b64encode(public_key).decode('utf-8')
        }

@app.post("/api/v1/sanitize")
async def sanitize_image(
    session_id: str = Form(...),
    ciphertext: UploadFile = File(...),
    iv: UploadFile = File(...),
    file: UploadFile = File(...)
):
    session = active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=403, detail="Session expired or invalid")
    
    kyber_secret_key = session["secret_key"]
    # NOT deleting the session here so the frontend can reuse it!
    
    ciphertext_bytes = await ciphertext.read()
    iv_bytes = await iv.read()
    encrypted_file_bytes = await file.read()
    
    try:
        # 1. DECAPSULATE & DECRYPT
        with oqs.KeyEncapsulation("ML-KEM-768", secret_key=kyber_secret_key) as kem:
            shared_secret = kem.decap_secret(ciphertext_bytes)
            
        aesgcm = AESGCM(shared_secret[:32]) 
        decrypted_image_bytes = aesgcm.decrypt(iv_bytes, encrypted_file_bytes, None)
        
        # 2. EXTRACT METADATA (Aggressively read the ORIGINAL file before doing anything)
        image = Image.open(io.BytesIO(decrypted_image_bytes))
        metadata_dict = {}
        
        try:
            if hasattr(image, '_getexif') and image._getexif():
                for tag_id, value in image._getexif().items():
                    tag = ExifTags.TAGS.get(tag_id, tag_id)
                    if isinstance(value, bytes):
                        value = value.decode('utf-8', 'ignore')
                    metadata_dict[str(tag)] = str(value)
        except Exception as e:
            print(f"Metadata extraction error: {e}")

        if not metadata_dict:
            metadata_dict = {"Status": "No EXIF metadata found in the original uploaded image."}
            
        # 3. SANITIZE (Convert to PNG to physically destroy metadata structures)
        if image.mode not in ('RGB', 'RGBA'):
            image = image.convert('RGBA')
            
        clean_byte_arr = io.BytesIO()
        image.save(clean_byte_arr, format='PNG')
        clean_bytes = clean_byte_arr.getvalue()
        
        # 4. SIGN & EMBED PUBLIC KEY
        signature_bytes = signer.sign(clean_bytes)
        final_payload = clean_bytes + signer.public_key + signature_bytes
        
        # 5. SECURE JSON WRAPPER
        b64_image = base64.b64encode(final_payload).decode('utf-8')
        response_data = {
            "metadata": metadata_dict,
            "image_b64": b64_image
        }
        json_bytes = json.dumps(response_data).encode('utf-8')
        
        # 6. ENCRYPT THE RETURN TRIP
        return_iv = os.urandom(12)
        encrypted_json = aesgcm.encrypt(return_iv, json_bytes, None)
        secure_response = return_iv + encrypted_json
        
        return Response(
            content=secure_response, 
            media_type="application/octet-stream"
        )
        
    except Exception as e:
        print(f"🔥 Cryptographic Crash: {e}")
        raise HTTPException(status_code=500, detail="Backend failed to process payload")
    
@app.post("/api/v1/verify")
async def verify_image_self_contained(file: UploadFile = File(...)):
    file_bytes = await file.read()
    
    # Fixed lengths for ML-DSA-44
    SIG_LENGTH = 2420
    PUB_KEY_LENGTH = 1312
    TOTAL_APPENDED = SIG_LENGTH + PUB_KEY_LENGTH

    if len(file_bytes) <= TOTAL_APPENDED:
        return {"verified": False, "message": "File is too small to contain a key and signature."}

    # Slice the file from the bottom up
    signature_bytes = file_bytes[-SIG_LENGTH:]
    public_key_bytes = file_bytes[-TOTAL_APPENDED:-SIG_LENGTH]
    image_bytes = file_bytes[:-TOTAL_APPENDED]

    try:
        # Verify using the public key EXTRACTED FROM THE FILE
        with oqs.Signature("ML-DSA-44") as verifier:
            is_valid = verifier.verify(image_bytes, signature_bytes, public_key_bytes)
            
        if is_valid:
            return {
                "verified": True, 
                "message": "✅ Authentic: Math checks out! (Verified using embedded public key)."
            }
        else:
            return {
                "verified": False, 
                "message": "❌ Tampered: The image or signature was altered."
            }
            
    except Exception as e:
        return {"verified": False, "message": f"❌ Verification Error: {str(e)}"}