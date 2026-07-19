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
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://pqc-sanitizer.vercel.app", 
        "http://localhost:5173" # Keep this so you can still test locally
    ], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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

