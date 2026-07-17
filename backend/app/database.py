from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Targets the pqc_users.db file in your root backend directory
SQLALCHEMY_DATABASE_URL = "sqlite:///./pqc_users.db"

# connect_args={"check_same_thread": False} is required for FastAPI + SQLite
# to prevent cross-thread thread errors during concurrent requests.
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

# Each instance of SessionLocal will be a database session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class that all your SQLAlchemy models (in models.py) will inherit from
Base = declarative_base()

# Dependency generator to manage database session lifecycles
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()