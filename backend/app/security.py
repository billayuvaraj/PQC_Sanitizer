import os
import oqs

class MasterSigner:
    """
    Handles the persistent ML-DSA-44 (Dilithium) master keypair.
    Loads from disk if available, otherwise generates and saves a new pair.
    """
    def __init__(self):
        self.sig_name = "ML-DSA-44" 
        self.key_file = "master_keys.bin"
        
        # Save the master keys in the persistent volume
        DATA_DIR = os.environ.get("DATA_DIR", ".")
        self.key_file = os.path.join(DATA_DIR, "master_keys.bin")
        
        # Check if the persistent key file exists in the root directory
        if os.path.exists(self.key_file):
            with open(self.key_file, "rb") as f:
                key_data = f.read()
                # ML-DSA-44 Specs: Public key is 1312 bytes, Secret key is 2560 bytes
                self.public_key = key_data[:1312]
                self.secret_key = key_data[1312:]
        else:
            # Generate a new quantum-safe keypair if none exists
            with oqs.Signature(self.sig_name) as signer:
                self.public_key = signer.generate_keypair()
                self.secret_key = signer.export_secret_key()
                
            # Persist to disk so verifications survive server restarts
            with open(self.key_file, "wb") as f:
                f.write(self.public_key + self.secret_key)

    def sign(self, message: bytes) -> bytes:
        """Signs an arbitrary byte message using the secret key."""
        with oqs.Signature(self.sig_name, secret_key=self.secret_key) as signer:
            return signer.sign(message)
            
        
    

# Instantiate the signer so it can be imported directly by your routers
signer = MasterSigner()