#!/bin/bash

# FingerBot 代码同步重启脚本（重新创建容器但不重新构建镜像）
set -e

echo "🔄 正在同步代码并重启 FingerBot 服务..."

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

# 检查是否有已构建的镜像
EXISTING_IMAGE=$(docker images -q fingerbot-fingerbot 2>/dev/null || true)

if [ -z "$EXISTING_IMAGE" ]; then
    echo "⚠️  未找到现有的 FingerBot 镜像，需要先构建"
    echo "请先运行: ./scripts/start.sh"
    exit 1
fi

# 检查是否有现有的同步模式服务在运行
SYNC_SERVICES=$(docker-compose -f docker-compose.sync.yml ps --services --filter "status=running" 2>/dev/null || true)

if [ -n "$SYNC_SERVICES" ]; then
    echo "⏹️  停止现有同步模式服务..."
    docker-compose -f docker-compose.sync.yml down
    echo "✅ 同步模式容器已停止和移除"
fi

# 检查是否有标准模式服务在运行
STANDARD_SERVICES=$(docker-compose ps --services --filter "status=running" 2>/dev/null || true)

if [ -n "$STANDARD_SERVICES" ]; then
    echo "⏹️  停止现有标准模式服务..."
    docker-compose down
    echo "✅ 标准模式容器已停止和移除"
fi

if [ -z "$SYNC_SERVICES" ] && [ -z "$STANDARD_SERVICES" ]; then
    echo "ℹ️  没有运行中的服务"
fi

# 创建日志目录
mkdir -p logs
echo "📁 日志目录: $(pwd)/logs"

# 始终编译最新代码，确保 dist 与 public-vite 为最新产物
echo "🔨 编译最新的后端与 WebUI 代码..."
if ! npm run build; then
    echo "❌ 代码编译失败"
    exit 1
fi
echo "✅ 代码编译完成"

# 校验关键输出
if [ ! -f "dist/server.js" ]; then
    echo "❌ 未找到编译后的 dist/server.js"
    exit 1
fi

if [ ! -d "public-vite" ]; then
    echo "❌ 未找到 Vite 构建输出 public-vite/"
    exit 1
fi

# 重新创建和启动容器（使用同步配置）
echo "🔄 重新创建容器（代码同步模式）..."
docker-compose -f docker-compose.sync.yml up -d --no-build

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 8

# 将最新 WebUI 构建结果同步进容器内，避免读取镜像中的旧版本
SYNC_CONTAINER="fingerbot-app-sync"
if docker ps -q -f name="^${SYNC_CONTAINER}$" >/dev/null 2>&1; then
    echo "🗂️  正在同步最新的 WebUI 静态资源..."
    docker exec -u root ${SYNC_CONTAINER} sh -c 'rm -rf /app/public-vite && mkdir -p /app/public-vite'
    docker cp public-vite/. ${SYNC_CONTAINER}:/app/public-vite
    docker exec -u root ${SYNC_CONTAINER} sh -c 'chown -R nextjs:nodejs /app/public-vite'
    echo "✅ WebUI 资源同步完成"
else
    echo "⚠️  未找到正在运行的 ${SYNC_CONTAINER} 容器，跳过 WebUI 资源同步"
fi

# 检查服务状态
echo "🔍 检查服务状态..."
docker-compose -f docker-compose.sync.yml ps

# 检查健康状态
echo "🏥 检查服务健康状态..."
for i in {1..8}; do
    HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health 2>/dev/null || echo "000")
    
    if [ "$HEALTH_STATUS" = "200" ]; then
        echo "✅ 服务健康检查通过"
        break
    elif [ $i -eq 8 ]; then
        echo "⚠️  服务健康检查失败 (状态码: $HEALTH_STATUS)"
        echo "📋 查看详细日志:"
        docker-compose -f docker-compose.sync.yml logs --tail=40 fingerbot
        break
    else
        echo "⏳ 等待服务启动... ($i/8)"
        sleep 5
    fi
done

# 显示最新日志
echo ""
echo "📋 最新日志（最后10行）："
docker-compose -f docker-compose.sync.yml logs --tail=10 fingerbot

echo ""
echo "🔄 FingerBot 代码同步重启完成！"
echo "📱 WebUI 地址: http://localhost:8080"
echo "📊 健康检查: http://localhost:8080/health"
echo ""
echo "💡 说明："
echo "🔸 此脚本重新创建容器以同步代码变更"
echo "🔸 使用现有镜像，不重新构建（节省时间）"
echo "🔸 如需重新构建镜像，请使用: ./scripts/start.sh"
echo ""
echo "🛠️  其他操作："
echo "📋 查看实时日志: docker-compose logs -f fingerbot"
echo "🔄 重新启动: ./scripts/start.sh"
echo "⏹️  停止服务: ./scripts/stop.sh"
