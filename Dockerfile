# Imagem de produção do VRBAN: um único serviço (web + fila de exportações) com LibreOffice para PDF.
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends libreoffice-writer-nogui python3-uno fonts-liberation \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=10000 \
    LIBREOFFICE_PYTHON=/usr/bin/python3
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY migrations ./migrations
COPY vendor ./vendor
COPY scripts/lo_convert.py ./scripts/lo_convert.py
USER node
EXPOSE 10000
CMD ["node", "dist/server/server/index.js"]
