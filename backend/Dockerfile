# Use an official Python base image
FROM python:3.11-slim

# Install system dependencies required to compile liboqs (C-toolchain)
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    ninja-build \
    && rm -rf /var/list/apt/lists/*

# Clone and compile liboqs (Post-Quantum Library)
RUN git clone --branch main https://github.com/open-quantum-safe/liboqs.git /opt/liboqs \
    && cd /opt/liboqs \
    && mkdir build && cd build \
    && cmake -GNinja -DBUILD_SHARED_LIBS=ON .. \
    && ninja install

# Set environment variables so Python can find the compiled C library
ENV LD_LIBRARY_PATH=/usr/local/lib:$LD_LIBRARY_PATH

# Set up application directory
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY . .

# Expose port and run the FastAPI application
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]