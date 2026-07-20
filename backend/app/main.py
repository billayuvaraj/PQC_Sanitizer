from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Import your modular routers
from app.routers import auth, bridge, pqc, users
from app.database import engine, Base

# Automatically create the SQLite tables if they don't exist yet
Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # This runs when the server boots
    print("🚀 PQC Privacy Server Online.")
    yield
    # This runs when the server shuts down
    print("Shutting down...")

# Initialize FastAPI
app = FastAPI(
    title="PQC Privacy Guard",
    description="Quantum-Safe Image Sanitization & Signing API",
    lifespan=lifespan
)

# Configure CORS (Cross-Origin Resource Sharing)
# Note: Update allow_origins with your exact frontend domains before production
# 1. Define the allowed URLs
origins = [
    "http://localhost:5173",                    # Local React development
    "https://pqc-sanitizer.vercel.app",         # Your deployed Vercel frontend
]

# 2. Add the CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,                      # Only allow these domains
    allow_credentials=True,
    allow_methods=["*"],                        # Allow all methods (GET, POST, etc.)
    allow_headers=["*"],                        # Allow all headers
)

# Register all modular routers
app.include_router(auth.router)
app.include_router(bridge.router)
app.include_router(pqc.router)
app.include_router(users.router)

# Optional: A simple health-check endpoint for the root URL
@app.get("/", tags=["Health"])
def health_check():
    return {"status": "online", "message": "PQC Privacy Guard API is running."}

