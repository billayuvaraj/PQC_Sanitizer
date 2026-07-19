# 1. Use the official Python image
FROM python:3.10-slim

# 2. Install C-compilers and tools needed for the post-quantum math
RUN apt-get update && apt-get install -y cmake gcc ninja-build git libssl-dev

# 3. Clone and build the liboqs C-library
RUN git clone -b main https://github.com/open-quantum-safe/liboqs.git \
    && cd liboqs && mkdir build && cd build \
    && cmake -GNinja .. -DBUILD_SHARED_LIBS=ON \
    && ninja && ninja install

# 4. Tell Python where to find the newly built C-library (Fixes your warning)
ENV LD_LIBRARY_PATH=/usr/local/lib

# 5. Set up the FastAPI application
WORKDIR /app

# 6. Copy ONLY requirements first (This prevents the error you just got)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 7. Copy the rest of your code into the container
COPY . .

# 8. Expose the data directory variable for SQLite/Keys
ENV DATA_DIR=/data

# 9. Start the server
CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}