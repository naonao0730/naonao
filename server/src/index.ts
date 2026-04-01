import express from 'express';
import cors from 'cors';
import config from './config.js';
import accountsRouter from './routes/accounts.js';
import chatRouter from './routes/chat.js';
import conversationsRouter from './routes/conversations.js';
import clawRouter from './routes/claw.js';
import apiProxyRouter, { proxyForwardRouter } from './routes/api-proxy.js';
import { errorHandler } from './middleware/error-handler.js';
import { startAutoRenew } from './services/auto-renew.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '100mb' }));

// 路由
app.use('/api/accounts', accountsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/claw', clawRouter);
app.use('/api/proxy', apiProxyRouter);
app.use('/api/v1', proxyForwardRouter);

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// 错误处理
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`MiMo Studio server running on port ${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`MiMo API: ${config.mimoBaseUrl}`);

  // 启动自动续期
  startAutoRenew();
});

export default app;
