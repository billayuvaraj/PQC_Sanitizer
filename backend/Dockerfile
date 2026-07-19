# 1. Use the official Python image
FROM python:3.10-slim

# 2. Install C-compilers and tools needed for the post-quantum math
RUN apt-get update && apt-get install -y cmake gcc ninja-build git libssl-dev

# 3. Clone and build the liboqs C-library
RUN git clone -b main https://github.com/open-quantum-safe/liboqs.git \
    && cd liboqs && mkdir build && cd build \
    && cmake -GNinja .. -DBUILD_SHARED_LIBS=ON \
    && ninja && ninja install

# 4. Tell Python where to find the newly built C-library
ENV LD_LIBRARY_PATH=/usr/local/lib
WORKDIR /app

# 5. BULLETPROOF FIX: We write the requirements directly inside Docker!
# This completely bypasses the "COPY requirements.txt not found" error.
RUN echo "fastapi\n\
uvicorn\n\
sqlalchemy\n\
passlib[bcrypt]\n\
pyjwt\n\
python-multipart\n\
liboqs-python\n\
cryptography\n\
pillow" > requirements.txt

# 6. Install the packages we just generated
RUN pip install --no-cache-dir -r requirements.txt

# 7. Copy your Python files into the container
COPY . .

# 8. Expose the data directory variable for SQLite/Keys
ENV DATA_DIR=/data

# 9. Start the server (Using the correct JSON format to fix your other warning)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]