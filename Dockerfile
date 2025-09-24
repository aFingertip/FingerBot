# 使用官方 Node.js 20 镜像作为基础镜像（Vite 7 要求 20.19+）
FROM node:20-alpine

# 安装必要的系统工具
RUN apk add --no-cache curl

# 设置工作目录
WORKDIR /app

# 创建日志目录
RUN mkdir -p /app/logs

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装所有依赖（包括开发依赖用于构建）
RUN npm ci

# 复制源代码和配置文件
COPY src ./src
COPY tsconfig.json ./
COPY public ./public
COPY webui ./webui
COPY vite.config.ts ./

# 构建应用（包括现代WebUI）
RUN npm run build

# 清理开发依赖以减小镜像大小
RUN npm prune --production

# 创建非root用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# 设置日志目录权限
RUN chown -R nextjs:nodejs /app/logs

# 切换到非root用户
USER nextjs

# 暴露端口
EXPOSE 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# 启动应用
CMD ["npm", "start"]