FROM node:20-alpine AS builder

WORKDIR /app

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app/package*.json ./
RUN npm install

COPY --from=builder /app/vite.config.js ./vite.config.js
COPY --from=builder /app/dist ./dist

EXPOSE 5173
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "5173"]
