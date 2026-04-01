#!/bin/sh
set -e

# 后端固定监听 3001（内部端口，nginx 反代）
export PORT=3001

# 启动后端
cd /app/server
node dist/index.js &

# 启动 nginx（对外 8080）
nginx -g 'daemon off;' &

# 等待任一进程退出
wait -n
exit $?
