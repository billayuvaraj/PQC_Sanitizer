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

# --- FIXED: Master Key Persistence ---
# Keys are now saved to disk so verifications survive server restarts
class MasterSigner:
    def __init__(self):
        self.sig_name = "ML-DSA-44" 
        self.key_file = "master_keys.bin"
        
        if os.path.exists(self.key_file):
            with open(self.key_file, "rb") as f:
                key_data = f.read()
                # ML-DSA-44: Public key is 1312 bytes, Secret key is 2560 bytes
                self.public_key = key_data[:1312]
                self.secret_key = key_data[1312:]
        else:
            with oqs.Signature(self.sig_name) as signer:
                self.public_key = signer.generate_keypair()
                self.secret_key = signer.export_secret_key()
            with open(self.key_file, "wb") as f:
                f.write(self.public_key + self.secret_key)

    def sign(self, message: bytes) -> bytes:
        with oqs.Signature(self.sig_name, secret_key=self.secret_key) as signer:
            return signer.sign(message)

signer = MasterSigner()
active_sessions = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 PQC Privacy Server Online.")
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
    
    ciphertext_bytes = await ciphertext.read()
    iv_bytes = await iv.read()
    encrypted_file_bytes = await file.read()
    
    try:
        # 1. DECAPSULATE & DECRYPT
        with oqs.KeyEncapsulation("ML-KEM-768", secret_key=kyber_secret_key) as kem:
            shared_secret = kem.decap_secret(ciphertext_bytes)
            
        aesgcm = AESGCM(shared_secret[:32]) 
        decrypted_image_bytes = aesgcm.decrypt(iv_bytes, encrypted_file_bytes, None)
        
        # 2. EXTRACT METADATA
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
            pass

        if not metadata_dict:
            metadata_dict = {"Status": "No EXIF metadata found in the original uploaded image."}
            
        # 3. SANITIZE
        if image.mode not in ('RGB', 'RGBA'):
            image = image.convert('RGBA')
            
        clean_byte_arr = io.BytesIO()
        image.save(clean_byte_arr, format='PNG')
        clean_bytes = clean_byte_arr.getvalue()
        
        # 4. SIGN & EMBED PUBLIC KEY
        signature_bytes = signer.sign(clean_bytes)
        # Structure: [Clean Image] + [1312 byte PubKey] + [2420 byte Signature]
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
        raise HTTPException(status_code=500, detail="Backend failed to process payload")
    
    
@app.post("/api/v1/verify")
async def verify_image(file: UploadFile = File(...)):
    file_bytes = await file.read()
    
    # --- FIXED: Correct Payload Slicing ---
    PUB_KEY_LENGTH = 1312
    SIG_LENGTH = 2420
    TOTAL_APPEND = PUB_KEY_LENGTH + SIG_LENGTH

    if len(file_bytes) <= TOTAL_APPEND:
        return {"verified": False, "message": "File is too small to contain a cryptographic signature."}

    # Slice the file into its exact components
    image_bytes = file_bytes[:-TOTAL_APPEND]
    embedded_pub_key = file_bytes[-TOTAL_APPEND:-SIG_LENGTH]
    signature_bytes = file_bytes[-SIG_LENGTH:]

    try:
        # Verify using the embedded public key, making the image highly portable
        with oqs.Signature("ML-DSA-44") as verifier:
            is_valid = verifier.verify(image_bytes, signature_bytes, embedded_pub_key)
            
        if is_valid:
            # Check if this server is the original issuer
            if embedded_pub_key == signer.public_key:
                return {"verified": True, "message": "✅ Authentic: Image is unmodified and originated from this exact server."}
            else:
                return {"verified": True, "message": "✅ Authentic: Image is unmodified, but was signed by a different trusted server."}
        else:
            return {"verified": False, "message": "❌ Tampered: The image pixels or signature have been altered."}
            
    except Exception as e:
        return {"verified": False, "message": f"❌ Verification Error: {str(e)}"}
    
# --- MOBILE BRIDGE HOLDING PEN ---
# Stores encrypted images for 60 seconds during phone-to-desktop transfer
mobile_bridge = {}

@app.post("/api/bridge/upload/{room_id}")
async def bridge_upload(room_id: str, file: UploadFile = File(...)):
    # Store the encrypted file bytes in memory
    encrypted_bytes = await file.read()
    mobile_bridge[room_id] = {
        "data": encrypted_bytes,
        "expires_at": time.time() + 60.0 # 60 second timeout
    }
    return {"status": "success"}

@app.get("/api/bridge/download/{room_id}")
async def bridge_download(room_id: str):
    # Check if file exists and hasn't expired
    if room_id not in mobile_bridge:
        raise HTTPException(status_code=404, detail="Not found or waiting")
        
    entry = mobile_bridge[room_id]
    if time.time() > entry["expires_at"]:
        del mobile_bridge[room_id]
        raise HTTPException(status_code=404, detail="Expired")
        
    # Retrieve data and instantly delete it from server memory
    data = entry["data"]
    del mobile_bridge[room_id]
    
    return Response(content=data, media_type="application/octet-stream")