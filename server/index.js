const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const gameRoutes = require('./routes/game');
const { SessionManager } = require('./state/session-manager');

const app = express();
const PORT = process.env.PORT || 3000;

// 会话管理器单例
const sessionManager = new SessionManager({
  timeoutMs: parseInt(process.env.SESSION_TIMEOUT_MS) || 30 * 60 * 1000,
  maxMessages: 15,
});

// 中间件
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// IP 级别速率限制：100 请求/分钟（测试友好）
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' },
  },
});
app.use('/api/', apiLimiter);

// 路由
app.use('/api/game', gameRoutes(sessionManager));

// 健康检查
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', sessions: sessionManager.size });
});

// 启动服务器
const server = app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`会话管理器已启动，清理间隔 5 分钟`);
});

// 定时清理过期会话
const cleanupTimer = setInterval(() => {
  const cleaned = sessionManager.cleanup();
  if (cleaned > 0) {
    console.log(`[SessionManager] Cleaned ${cleaned} expired sessions`);
  }
}, 5 * 60 * 1000);

// 优雅关闭
process.on('SIGTERM', () => {
  clearInterval(cleanupTimer);
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  clearInterval(cleanupTimer);
  server.close(() => process.exit(0));
});

module.exports = app;
