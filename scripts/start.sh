#!/bin/bash

# FingerBot 启动脚本
set -e

echo "🤖 正在启动 FingerBot 服务..."

# 检查配置文件
if [ ! -f ".env.docker" ]; then
    echo "❌ 未找到 .env.docker 配置文件"
    echo "请复制 .env.docker 并配置相关参数"
    exit 1
fi

# 检查必要的环境变量
source .env.docker

if [ -z "$GEMINI_API_KEY" ] || [ "$GEMINI_API_KEY" = "your-gemini-api-key-here" ]; then
    echo "❌ 请在 .env.docker 中配置有效的 GEMINI_API_KEY"
    exit 1
fi

# 创建日志目录
mkdir -p logs
echo "📁 日志目录: $(pwd)/logs"

# 构建和启动服务
echo "🔨 构建 Docker 镜像..."
docker-compose build

echo "🚀 启动服务..."
docker-compose up -d

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 10

# 检查服务状态
echo "🔍 检查服务状态..."
docker-compose ps

# 显示日志（最后20行）
echo "📋 最新日志："
docker-compose logs --tail=20 fingerbot

echo ""
echo "✅ FingerBot 服务启动完成！"
echo "📱 WebUI 地址: http://localhost:8080"
echo "📊 健康检查: http://localhost:8080/health"
echo "📋 查看日志: docker-compose logs -f fingerbot"
echo "⏹️  停止服务: docker-compose down"
echo "🔄 重启服务: docker-compose restart"