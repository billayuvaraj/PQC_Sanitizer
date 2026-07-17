import os
import base64
import io
import json
import oqs
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Response
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from PIL import Image, ExifTags

# Import the shared state and keys from your other modules
from app.routers.auth import active_sessions
from app.security import signer

router = APIRouter(
    prefix="/api/v1",
    tags=["PQC Image Processing"]
)

@router.post("/sanitize")
async def sanitize_image(
    session_id: str = Form(...),
    ciphertext: UploadFile = File(...),
    iv: UploadFile = File(...),
    file: UploadFile = File(...)
):
    """
    Decapsulates the ML-KEM secret, decrypts the incoming image, strips metadata,
    signs the raw bytes with ML-DSA-44, and symmetrically returns the payload.
    """
    # 1. Validate Session
    session = active_sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=403, detail="Session expired or invalid")
    
    kyber_secret_key = session["secret_key"]
    
    ciphertext_bytes = await ciphertext.read()
    iv_bytes = await iv.read()
    encrypted_file_bytes = await file.read()
    
    try:
        # 2. Decapsulate & Decrypt
        with oqs.KeyEncapsulation("ML-KEM-768", secret_key=kyber_secret_key) as kem:
            shared_secret = kem.decap_secret(ciphertext_bytes)
            
        aesgcm = AESGCM(shared_secret[:32]) 
        decrypted_image_bytes = aesgcm.decrypt(iv_bytes, encrypted_file_bytes, None)
        
        # 3. Extract Metadata
        image = Image.open(io.BytesIO(decrypted_image_bytes))
        metadata_dict = {}
        
        try:
            if hasattr(image, '_getexif') and image._getexif():
                for tag_id, value in image._getexif().items():
                    tag = ExifTags.TAGS.get(tag_id, tag_id)
                    if isinstance(value, bytes):
                        value = value.decode('utf-8', 'ignore')
                    metadata_dict[str(tag)] = str(value)
        except Exception:
            pass

        if not metadata_dict:
            metadata_dict = {"Status": "No EXIF metadata found in the original uploaded image."}
            
        # 4. Sanitize to pure pixel data
        if image.mode not in ('RGB', 'RGBA'):
            image = image.convert('RGBA')
            
        clean_byte_arr = io.BytesIO()
        image.save(clean_byte_arr, format='PNG')
        clean_bytes = clean_byte_arr.getvalue()
        
        # 5. Sign & Embed Public Key
        signature_bytes = signer.sign(clean_bytes)
        
        # Structure: [Clean Image] + [1312 byte PubKey] + [2420 byte Signature]
        final_payload = clean_bytes + signer.public_key + signature_bytes
        
        # 6. Secure JSON Wrapper
        b64_image = base64.b64encode(final_payload).decode('utf-8')
        response_data = {
            "metadata": metadata_dict,
            "image_b64": b64_image
        }
        json_bytes = json.dumps(response_data).encode('utf-8')
        
        # 7. Encrypt the Return Trip
        return_iv = os.urandom(12)
        encrypted_json = aesgcm.encrypt(return_iv, json_bytes, None)
        secure_response = return_iv + encrypted_json
        
        return Response(
            content=secure_response, 
            media_type="application/octet-stream"
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail="Backend failed to process payload")

@router.post("/verify")
async def verify_image(file: UploadFile = File(...)):
    """
    Slices the exact byte lengths off the bottom of the uploaded file 
    to extract the ML-DSA-44 public key and mathematical signature.
    """
    file_bytes = await file.read()
    
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
        # Verify using the embedded public key to allow for stateless portability
        with oqs.Signature("ML-DSA-44") as verifier:
            is_valid = verifier.verify(image_bytes, signature_bytes, embedded_pub_key)
            
        if is_valid:
            if embedded_pub_key == signer.public_key:
                return {"verified": True, "message": "✅ Authentic: Image is unmodified and originated from this exact server."}
            else:
                return {"verified": True, "message": "✅ Authentic: Image is unmodified, but was signed by a different trusted server."}
        else:
            return {"verified": False, "message": "❌ Tampered: The image pixels or signature have been altered."}
            
    except Exception as e:
        return {"verified": False, "message": f"❌ Verification Error: {str(e)}"} 