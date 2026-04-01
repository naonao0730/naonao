# ---- 构建前端 ----
FROM node:20-alpine AS frontend-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json* ./
RUN npm install
COPY client/tsconfig.json client/vite.config.ts client/index.html ./
COPY client/src/ ./src/
RUN npx vite build

# ---- 构建后端 ----
FROM node:20-alpine AS backend-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm install
COPY server/tsconfig.json ./
COPY server/src/ ./src/
RUN npx tsc

# ---- 运行 ----
FROM node:20-alpine
WORKDIR /app

# 安装 nginx
RUN apk add --no-cache nginx

# 后端
COPY server/package.json server/package-lock.json* ./server/
WORKDIR /app/server
RUN apk add --no-cache python3 make g++ && \
    npm install --omit=dev && \
    apk del python3 make g++
COPY --from=backend-build /app/server/dist ./dist

# 前端
COPY --from=frontend-build /app/client/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/http.d/default.conf

# 启动脚本
WORKDIR /app
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENV PORT=3001
ENV MIMO_BASE_URL=https://aistudio.xiaomimimo.com
ENV NODE_ENV=production
EXPOSE 8080

CMD ["./docker-entrypoint.sh"]
