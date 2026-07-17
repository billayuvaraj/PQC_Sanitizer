from fastapi import APIRouter, HTTPException, UploadFile, File, Response

router = APIRouter(
    prefix="/api/bridge",
    tags=["Mobile to Desktop Bridge"]
)

# ---------------------------------------------------------
# EPHEMERAL STORAGE
# ---------------------------------------------------------
# Stores the encrypted blob from the phone temporarily.
# The data is kept entirely in RAM and is destroyed the moment 
# the desktop fetches it.
bridge_storage = {}

@router.post("/upload/{room}")
async def upload_mobile_image(room: str, file: UploadFile = File(...)):
    """
    Receives the AES-encrypted binary blob from the mobile phone
    and holds it in memory linked to the QR code's room ID.
    """
    file_bytes = await file.read()
    bridge_storage[room] = file_bytes
    
    return {"status": "success", "message": "Encrypted payload held in secure memory."}

@router.get("/download/{room}")
async def download_mobile_image(room: str):
    """
    Desktop client polls this endpoint. If the phone has uploaded the file,
    it returns the raw bytes and immediately deletes it from server memory.
    """
    if room not in bridge_storage:
        # Returning a 404 is intentional here, as it triggers the frontend 
        # to wait 2 seconds and poll again.
        raise HTTPException(status_code=404, detail="Image not yet uploaded by mobile device.")
    
    # Pop retrieves the data AND removes it from the dictionary instantly
    encrypted_bytes = bridge_storage.pop(room)
    
    return Response(
        content=encrypted_bytes, 
        media_type="application/octet-stream"
    )