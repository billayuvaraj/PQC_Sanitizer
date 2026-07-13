FROM python:3.11-slim

# 1. Install necessary dependencies, adding libssl-dev
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    ninja-build \
    libssl-dev \
    && rm -rf /var/list/apt/lists/*

# 2. Clone liboqs
RUN git clone --branch main https://github.com/open-quantum-safe/liboqs.git /opt/liboqs

# 3. Configure and compile liboqs safely
# We limit Ninja to 1 job (-j 1) to prevent the Render Free Tier from running out of RAM
WORKDIR /opt/liboqs/build
RUN cmake -GNinja -DBUILD_SHARED_LIBS=ON .. \
    && ninja -j 1 \
    && ninja install

# 4. Set environment variable so Python can find the compiled C library
ENV LD_LIBRARY_PATH=/usr/local/lib:$LD_LIBRARY_PATH

# 5. Set up application directory
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 6. Copy backend code
COPY . .

# 7. Expose port and run the FastAPI application
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]