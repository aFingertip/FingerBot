import * as WebSocket from 'ws';
import { Server as HTTPServer } from 'http';
import { QQMessage, OneBotSendMessage, WSEvent } from './qq-types';
import { logger } from '../utils/logger';
import { config } from '../utils/config';

interface ClientInfo {
  socket: WebSocket;
  id: string;
  ip: string;
  userAgent: string;
  connectedAt: Date;
}

export class WSServer {
  private wss: WebSocket.Server | null = null;
  private clients: Map<string, ClientInfo> = new Map();
  private messageHandlers: ((message: QQMessage) => void)[] = [];
  private eventHandlers: ((event: WSEvent) => void)[] = [];
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    // 构造函数保持简洁
  }

  // 启动WebSocket服务器
  start(httpServer?: HTTPServer): void {
    const port = config.port;

    // 如果提供了HTTP服务器，则附加到HTTP服务器，否则创建独立服务器
    if (httpServer) {
      this.wss = new WebSocket.Server({
        server: httpServer,
        path: config.websocket.serverPath,
        perMessageDeflate: false
      });
      logger.info(`🚀 WebSocket服务器已附加到HTTP服务器 路径: ${config.websocket.serverPath}`);
    } else {
      this.wss = new WebSocket.Server({
        port,
        perMessageDeflate: false
      });
      logger.info(`🚀 WebSocket独立服务器启动 端口: ${port}`);
    }

    this.setupConnectionHandler();
    this.startHealthCheck();
  }

  // 设置连接处理器
  private setupConnectionHandler(): void {
    if (!this.wss) return;

    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = this.generateClientId();
      const clientInfo: ClientInfo = {
        socket: ws,
        id: clientId,
        ip: req.socket.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        connectedAt: new Date()
      };

      this.clients.set(clientId, clientInfo);

      logger.info(`🔗 WebSocket客户端连接成功`, {
        clientId,
        ip: clientInfo.ip,
        userAgent: clientInfo.userAgent.substring(0, 50),
        totalClients: this.clients.size
      });

      this.setupClientHandlers(ws, clientInfo);

      // 发送连接确认消息
      this.sendToClient(clientId, {
        type: 'connected',
        clientId,
        message: 'FingerBot WebSocket连接成功',
        timestamp: new Date().toISOString()
      });
    });

    this.wss.on('error', (error) => {
      logger.error('❌ WebSocket服务器错误', { error });
    });
  }

  // 设置客户端事件处理器
  private setupClientHandlers(ws: WebSocket, clientInfo: ClientInfo): void {
    const { id: clientId } = clientInfo;

    // 处理消息
    ws.on('message', async (data: WebSocket.RawData) => {
      try {
        const dataSize = Buffer.isBuffer(data) ? data.length :
                        data instanceof ArrayBuffer ? data.byteLength :
                        String(data).length;

        logger.debug(`📨 收到WebSocket原始消息 [${clientId}]`, {
          size: dataSize,
          type: typeof data
        });

        const message = JSON.parse(data.toString());
        logger.debug(`📥 WebSocket消息解析成功 [${clientId}]`, {
          post_type: message.post_type,
          message_type: message.message_type
        });

        await this.handleMessage(message, clientId);

      } catch (error) {
        logger.error(`❌ WebSocket消息处理失败 [${clientId}]`, {
          error: error instanceof Error ? error.message : String(error),
          rawData: data.toString().substring(0, 200)
        });

        this.sendToClient(clientId, {
          type: 'error',
          message: '消息处理失败',
          timestamp: new Date().toISOString()
        });
      }
    });

    // 处理连接关闭
    ws.on('close', (code: number, reason: Buffer) => {
      this.clients.delete(clientId);
      logger.info(`🔌 WebSocket客户端断开连接`, {
        clientId,
        code,
        reason: reason.toString(),
        duration: Date.now() - clientInfo.connectedAt.getTime(),
        remainingClients: this.clients.size
      });
    });

    // 处理连接错误
    ws.on('error', (error) => {
      logger.error(`❌ WebSocket连接错误 [${clientId}]`, {
        error: error.message,
        code: (error as any).code
      });
      this.clients.delete(clientId);
    });

    // 处理心跳
    ws.on('ping', (data) => {
      logger.debug(`💓 收到ping [${clientId}]`);
      ws.pong(data);
    });

    ws.on('pong', (data) => {
      logger.debug(`💓 收到pong [${clientId}]`);
    });
  }

  // 处理收到的消息
  private async handleMessage(message: any, clientId: string): Promise<void> {
    // 如果是OneBot协议的事件消息
    if (message.post_type) {
      const event = message as WSEvent;

      // 处理消息事件
      if (event.post_type === 'message') {
        const qqMessage = event as QQMessage;
        // logger.info(`📨 收到QQ消息事件 [${clientId}]`, {
        //   messageType: qqMessage.message_type,
        //   userId: qqMessage.user_id,
        //   groupId: qqMessage.group_id,
        //   messageId: qqMessage.message_id
        // });

        // 调用消息处理器
        this.messageHandlers.forEach(handler => {
          try {
            handler(qqMessage);
          } catch (error) {
            logger.error(`消息处理器执行失败 [${clientId}]`, { error });
          }
        });
      }

      // 调用事件处理器
      this.eventHandlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          logger.error(`事件处理器执行失败 [${clientId}]`, { error });
        }
      });
    } else {
      // 处理其他类型的消息
      logger.debug(`📄 收到非OneBot消息 [${clientId}]`, { type: message.type || 'unknown' });
    }
  }

  // 发送私聊消息
  async sendPrivateMessage(userId: number, message: string): Promise<boolean> {
    const payload: OneBotSendMessage = {
      action: 'send_private_msg',
      params: {
        user_id: userId,
        message: message
      },
      echo: Date.now().toString()
    };

    logger.info(`💬 发送私聊消息`, {
      userId,
      message: message.length > 200 ? message.substring(0, 200) + '...' : message,
      messageLength: message.length
    });
    return this.broadcast(payload);
  }

  // 发送群消息
  async sendGroupMessage(groupId: number, message: string, atUser?: number): Promise<boolean> {
    let finalMessage = message;

    if (atUser) {
      finalMessage = `[CQ:at,qq=${atUser}] ${message}`;
    }

    const payload: OneBotSendMessage = {
      action: 'send_group_msg',
      params: {
        group_id: groupId,
        message: finalMessage
      },
      echo: Date.now().toString()
    };

    logger.info(`📢 发送群消息`, {
      groupId,
      message: finalMessage.length > 200 ? finalMessage.substring(0, 200) + '...' : finalMessage,
      messageLength: finalMessage.length,
      originalMessageLength: message.length,
      atUser: atUser || 'none'
    });

    return this.broadcast(payload);
  }

  // 广播消息到所有连接的客户端
  broadcast(message: any): boolean {
    if (this.clients.size === 0) {
      logger.warn('⚠️  没有可用的WebSocket连接，无法广播消息');
      return false;
    }

    const payload = JSON.stringify(message);
    let successCount = 0;
    const failedClients: string[] = [];

    this.clients.forEach((clientInfo, clientId) => {
      const { socket } = clientInfo;

      try {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(payload);
          successCount++;
        } else {
          logger.debug(`⏸️  客户端未就绪 [${clientId}] 状态: ${this.getReadyStateText(socket.readyState)}`);
          if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
            failedClients.push(clientId);
          }
        }
      } catch (error) {
        logger.warn(`❌ 广播到客户端失败 [${clientId}]`, { error });
        failedClients.push(clientId);
      }
    });

    // 清理失败的连接
    failedClients.forEach(clientId => this.clients.delete(clientId));

    if (successCount > 0) {
      logger.debug(`📊 消息广播成功: ${successCount}/${this.clients.size + failedClients.length}`);
    }

    return successCount > 0;
  }

  // 发送消息到指定客户端
  sendToClient(clientId: string, message: any): boolean {
    const clientInfo = this.clients.get(clientId);

    if (!clientInfo) {
      logger.warn(`客户端不存在 [${clientId}]`);
      return false;
    }

    const { socket } = clientInfo;

    if (socket.readyState !== WebSocket.OPEN) {
      logger.warn(`客户端未就绪 [${clientId}] 状态: ${this.getReadyStateText(socket.readyState)}`);
      return false;
    }

    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      logger.error(`发送消息失败 [${clientId}]`, { error });
      this.clients.delete(clientId);
      return false;
    }
  }

  // 注册消息处理器
  onMessage(handler: (message: QQMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  // 注册事件处理器
  onEvent(handler: (event: WSEvent) => void): void {
    this.eventHandlers.push(handler);
  }

  // 获取连接信息
  getConnectionInfo() {
    const connections = Array.from(this.clients.entries()).map(([id, info]) => ({
      id,
      ip: info.ip,
      userAgent: info.userAgent,
      connectedAt: info.connectedAt.toISOString(),
      readyState: info.socket.readyState,
      readyStateText: this.getReadyStateText(info.socket.readyState)
    }));

    return {
      connectedCount: this.clients.size,
      connections
    };
  }

  // 检查是否有活跃连接
  isConnected(): boolean {
    for (const [, clientInfo] of this.clients.entries()) {
      if (clientInfo.socket.readyState === WebSocket.OPEN) {
        return true;
      }
    }
    return false;
  }

  // 启动健康检查
  private startHealthCheck(): void {
    if (this.healthCheckInterval) return;

    this.healthCheckInterval = setInterval(() => {
      this.cleanupDeadConnections();

      const activeCount = Array.from(this.clients.values()).filter(
        info => info.socket.readyState === WebSocket.OPEN
      ).length;

      if (activeCount > 0) {
        logger.debug(`💓 健康检查: ${activeCount}个活跃连接`);
      }
    }, 30000); // 30秒检查一次
  }

  // 清理死连接
  private cleanupDeadConnections(): void {
    const deadClients: string[] = [];

    this.clients.forEach((clientInfo, clientId) => {
      const { socket } = clientInfo;
      if (socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
        deadClients.push(clientId);
      }
    });

    if (deadClients.length > 0) {
      logger.info(`🧹 清理${deadClients.length}个死连接: ${deadClients.join(', ')}`);
      deadClients.forEach(clientId => this.clients.delete(clientId));
    }
  }

  // 生成客户端ID
  private generateClientId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // 获取WebSocket状态文本
  private getReadyStateText(state: number): string {
    switch (state) {
      case WebSocket.CONNECTING: return 'CONNECTING';
      case WebSocket.OPEN: return 'OPEN';
      case WebSocket.CLOSING: return 'CLOSING';
      case WebSocket.CLOSED: return 'CLOSED';
      default: return 'UNKNOWN';
    }
  }

  // 关闭WebSocket服务器
  async close(): Promise<void> {
    logger.info('🔌 正在关闭WebSocket服务器...');

    // 停止健康检查
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // 关闭所有客户端连接
    const clientIds = Array.from(this.clients.keys());
    for (const clientId of clientIds) {
      const clientInfo = this.clients.get(clientId);
      if (clientInfo) {
        try {
          const { socket } = clientInfo;
          if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
            socket.close(1000, 'Server shutdown');
          }
        } catch (error) {
          logger.debug(`客户端 ${clientId} 关闭时出现非关键错误`, { error });
        }
      }
    }

    // 关闭服务器
    if (this.wss) {
      return new Promise((resolve) => {
        this.wss!.close(() => {
          logger.info(`✅ WebSocket服务器已关闭 (共关闭${clientIds.length}个连接)`);
          resolve();
        });
      });
    }

    // 清理资源
    this.clients.clear();
    this.messageHandlers = [];
    this.eventHandlers = [];
  }
}
