# --- GIAI ĐOẠN 1: BUILD ---
FROM node:25-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# --- GIAI ĐOẠN 2: CHẠY THỰC TẾ (PRODUCTION) ---
FROM node:25-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist

EXPOSE 5001

CMD ["npm", "start"]