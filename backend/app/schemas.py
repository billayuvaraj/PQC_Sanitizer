from pydantic import BaseModel, ConfigDict
from datetime import datetime

# Used for Registration
class UserCreate(BaseModel):
    email: str 
    username: str
    password: str

# Used for Login
class UserLogin(BaseModel):
    email: str 
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    
    model_config = ConfigDict(from_attributes=True)

# --- Audit Log Schemas ---
class AuditLogBase(BaseModel):
    event_type: str

class AuditLogCreate(AuditLogBase):
    pass

class AuditLogResponse(AuditLogBase):
    id: int
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)