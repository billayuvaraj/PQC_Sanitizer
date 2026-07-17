from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import bcrypt

from app.database import get_db
from app.models import User
from app.schemas import UserCreate, UserLogin, UserResponse

router = APIRouter(prefix="/api/users", tags=["User Authentication"])

@router.post("/register", response_model=UserResponse)
def register_user(user: UserCreate, db: Session = Depends(get_db)):
    # 1. Check if email OR username already exists
    if db.query(User).filter((User.username == user.username) | (User.email == user.email)).first():
        raise HTTPException(status_code=400, detail="Username or Email already registered")
    
    # 2. Hash password
    salt = bcrypt.gensalt()
    hashed_pw_bytes = bcrypt.hashpw(user.password.encode('utf-8'), salt)
    
    # 3. Create user
    new_user = User(
        username=user.username, 
        email=user.email,
        hashed_password=hashed_pw_bytes.decode('utf-8')
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return new_user

@router.post("/login")
def login_user(user: UserLogin, db: Session = Depends(get_db)):
    # 1. Look up the user by EMAIL now
    db_user = db.query(User).filter(User.email == user.email).first()
    
    # 2. Verify password
    if not db_user or not bcrypt.checkpw(user.password.encode('utf-8'), db_user.hashed_password.encode('utf-8')):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # 3. Return the username so React can display it in the dropdown!
    return {"id": db_user.id, "username": db_user.username}