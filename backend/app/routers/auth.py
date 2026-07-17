import os
import time
import base64
import oqs
from fastapi import APIRouter

# Create a dedicated router for authentication and session endpoints
router = APIRouter(
    prefix="/api",
    tags=["Handshake & Session"]
)

# ---------------------------------------------------------
# SESSION STATE MANAGEMENT
# ---------------------------------------------------------
# This dictionary stores the active Kyber secret keys linked to session IDs.
# Note: For local development, this in-memory dictionary is perfect. 
# For production (especially with Docker/multiple workers), you will 
# eventually replace this with a Redis instance.
active_sessions = {}

def cleanup_expired_sessions():
    """Removes sessions older than 1 hour to free up memory."""
    current_time = time.time()
    expired = [sid for sid, data in active_sessions.items() if current_time > data["expires_at"]]
    for sid in expired:
        del active_sessions[sid]

# ---------------------------------------------------------
# ENDPOINTS
# ---------------------------------------------------------
@router.get("/handshake")
def generate_handshake():
    """
    Client requests a new secure session. The server generates an ephemeral
    ML-KEM-768 keypair, stores the secret key, and sends back the public key.
    """
    cleanup_expired_sessions()
    
    with oqs.KeyEncapsulation("ML-KEM-768") as kem:
        public_key = kem.generate_keypair()
        secret_key = kem.export_secret_key()
        session_id = os.urandom(16).hex()
        
        # Store the secret key securely on the backend, linked to the session
        active_sessions[session_id] = {
            "secret_key": secret_key,
            "expires_at": time.time() + 3600.0  # Session valid for 1 hour
        }
        
        return {
            "session_id": session_id,
            "public_key": base64.b64encode(public_key).decode('utf-8')
        }