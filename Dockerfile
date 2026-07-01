# Imagen ligera: Node 24 trae SQLite de serie, así que no hace falta
# compilar módulos nativos. Funciona igual en Synology Intel o ARM.
FROM node:24-bookworm-slim

# LibreOffice (Impress) + poppler para convertir las presentaciones PPTX en
# diapositivas que se puedan ver dentro de la web. fonts-liberation da tipos
# decentes a las diapositivas convertidas.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-impress \
      poppler-utils \
      fonts-liberation \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instala solo las dependencias de producción, aprovechando la caché de capas.
COPY package*.json ./
RUN npm install --omit=dev

# Copia el resto de la aplicación.
COPY . .

ENV NODE_ENV=production
ENV DATA_DIR=/data
EXPOSE 3000

# Los datos (base de datos + archivos subidos) viven en /data, montado como volumen.
VOLUME ["/data"]

CMD ["node", "server.js"]
