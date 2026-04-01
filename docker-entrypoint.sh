#!/bin/sh
set -e

# 启动后端
cd /app/server
node dist/index.js &

# 启动 nginx
nginx -g 'daemon off;' &

# 等待任一进程退出
wait -n
exit $?
