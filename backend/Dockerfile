FROM node:22-slim

# yt-dlp ve ffmpeg kurulumu
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      python3 \
      python3-pip \
      python3-venv \
      ffmpeg \
      ca-certificates && \
    python3 -m pip install --break-system-packages yt-dlp && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Çalışma dizini
WORKDIR /app

# Bağımlılıkları önce kopyala (Docker cache optimizasyonu)
COPY package.json package-lock.json ./

# Bağımlılıkları yükle
RUN npm ci --omit=dev

# Uygulama kodunu kopyala
COPY . .

# Port
EXPOSE 8010

# Başlat
CMD ["node", "main.js"]
