#!/bin/bash

# FingerBot 停止脚本
set -e

echo "⏹️  正在停止 FingerBot 服务..."

# 检查是否有运行的服务
if ! docker-compose ps | grep -q "Up"; then
    echo "ℹ️  没有运行中的服务"
    exit 0
fi

# 停止服务
docker-compose down

# 显示停止后状态
echo "🔍 服务状态："
docker-compose ps

echo ""
echo "✅ FingerBot 服务已停止"
echo ""
echo "💡 其他操作："
echo "🚀 重新启动: ./scripts/start.sh"
echo "🔄 代码同步重启: ./scripts/sync-restart.sh" 
echo "🧹 清理数据: docker-compose down -v"
echo "🗑️  清理镜像: docker-compose down --rmi all"