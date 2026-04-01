import { Router } from 'express';
import { getAccount } from '../store/accounts.js';
import { mimoClient, installUvViaWebSocket } from '../services/mimo-client.js';
import { ApiError } from '../middleware/error-handler.js';
import { getInstallStatus, initInstallStatus, appendInstallLog, setInstallResult, setInstallError } from '../store/install-status.js';
import { upsertChannel, setChannelExpiry, updateChannelApiKey, createKeyForChannel } from '../store/api-proxy.js';
import { startAutoRenew, stopAutoRenew, isAutoRenewRunning, getAllRenewStatuses } from '../services/auto-renew.js';

const router = Router();

// 创建 Claw 工作空间
router.post('/create', async (req, res, next) => {
  try {
    const { accountId } = req.body;
    if (!accountId) throw new ApiError(400, 'accountId is required');
    const account = await getAccount(accountId);
    if (!account) throw new ApiError(404, 'Account not found');
    const result = await mimoClient.createClaw(account.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 销毁 Claw 工作空间
router.post('/destroy', async (req, res, next) => {
  try {
    const { accountId } = req.body;
    if (!accountId) throw new ApiError(400, 'accountId is required');
    const account = await getAccount(accountId);
    if (!account) throw new ApiError(404, 'Account not found');
    const result = await mimoClient.destroyClaw(account.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 查询 Claw 状态
router.get('/status', async (req, res, next) => {
  try {
    const { accountId } = req.query;
    if (!accountId) throw new ApiError(400, 'accountId is required');
    const account = await getAccount(accountId as string);
    if (!account) throw new ApiError(404, 'Account not found');
    const result = await mimoClient.getClawStatus(account.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 获取 WebSocket 票据
router.get('/ticket', async (req, res, next) => {
  try {
    const { accountId } = req.query;
    if (!accountId) throw new ApiError(400, 'accountId is required');
    const account = await getAccount(accountId as string);
    if (!account) throw new ApiError(404, 'Account not found');
    const result = await mimoClient.getWsTicket(account.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 列出工作空间文件
router.get('/files', async (req, res, next) => {
  try {
    const { accountId } = req.query;
    if (!accountId) throw new ApiError(400, 'accountId is required');
    const account = await getAccount(accountId as string);
    if (!account) throw new ApiError(404, 'Account not found');
    const result = await mimoClient.listHostFiles(account.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 安装 uv (SSE 流式响应)
router.post('/install-uv', async (req, res, next) => {
  try {
    const { accountId } = req.body;
    if (!accountId) throw new ApiError(400, 'accountId is required');
    const account = await getAccount(accountId);
    if (!account) throw new ApiError(404, 'Account not found');

    await initInstallStatus(accountId);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const closeWs = installUvViaWebSocket(
      { cookie: account.cookie, token: account.token },
      async (log) => {
        await appendInstallLog(accountId, log);
        res.write(`event: log\ndata: ${JSON.stringify({ log })}\n\n`);
      },
      async (result) => {
        await setInstallResult(accountId, result);
        // 自动创建通道 + 绑定 Key
        const channel = await upsertChannel(accountId, account.name);
        const status = await mimoClient.getClawStatus(account.id);
        const expireTime = (status as any)?.expireTime || null;
        if (expireTime) await setChannelExpiry(accountId, expireTime);
        if (result.apiKeys?.length > 0) {
          await updateChannelApiKey(accountId, result.apiKeys[0]);
          await createKeyForChannel(channel.id, expireTime);
        }
        res.write(`event: result\ndata: ${JSON.stringify(result)}\n\n`);
        res.end();
      },
      async (errMsg) => {
        await setInstallError(accountId, errMsg);
        res.write(`event: error\ndata: ${JSON.stringify({ error: errMsg })}\n\n`);
        res.end();
      },
    );

    req.on('close', () => {
      closeWs();
    });
  } catch (err) {
    next(err);
  }
});

// 查询安装状态 (刷新后恢复)
router.get('/install-status', async (req, res, next) => {
  try {
    const { accountId } = req.query;
    if (!accountId) throw new ApiError(400, 'accountId is required');
    const status = await getInstallStatus(accountId as string);
    res.json(status);
  } catch (err) { next(err); }
});

// ========== 自动续期 ==========

// 启动自动续期
router.post('/auto-renew/start', (_req, res) => {
  startAutoRenew();
  res.json({ running: true });
});

// 停止自动续期
router.post('/auto-renew/stop', (_req, res) => {
  stopAutoRenew();
  res.json({ running: false });
});

// 查询自动续期状态
router.get('/auto-renew/status', async (_req, res) => {
  res.json({
    running: isAutoRenewRunning(),
    accounts: await getAllRenewStatuses(),
  });
});

export default router;
