import { Router } from 'express';
import { ApiError } from '../middleware/error-handler.js';
import {
  getAllChannels, deleteChannel,
  getAllKeys, getKeyByValue, createApiKey, deleteApiKey,
  getAvailableChannel,
} from '../store/api-proxy.js';

const router = Router();

// ========== 管理接口 ==========

// 通道列表
router.get('/channels', async (_req, res) => {
  const channels = await getAllChannels();
  res.json(channels);
});

// 删除通道
router.delete('/channels/:id', async (req, res, next) => {
  try {
    if (!await deleteChannel(req.params.id)) throw new ApiError(404, 'Channel not found');
    res.json({ success: true });
  } catch (err) { next(err); }
});

// 虚拟 Key 列表
router.get('/keys', async (_req, res) => {
  const keys = await getAllKeys();
  res.json(keys);
});

// 创建虚拟 Key
router.post('/keys', async (req, res, next) => {
  try {
    const name = req.body?.name || 'default';
    const key = await createApiKey(name);
    res.json(key);
  } catch (err) { next(err); }
});

// 删除虚拟 Key
router.delete('/keys/:id', async (req, res, next) => {
  try {
    if (!await deleteApiKey(req.params.id)) throw new ApiError(404, 'Key not found');
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;

// ========== 转发接口 (独立路由) ==========

export const proxyForwardRouter = Router();

proxyForwardRouter.post('/chat/completions', async (req, res, next) => {
  try {
    // 1. 提取虚拟 Key
    const auth = req.headers.authorization || '';
    const keyValue = auth.replace(/^Bearer\s+/i, '');
    if (!keyValue || !keyValue.startsWith('sk-mimo-')) {
      throw new ApiError(401, 'Invalid API key');
    }

    const apiKey = await getKeyByValue(keyValue);
    if (!apiKey) throw new ApiError(401, 'Invalid or disabled API key');

    // 2. 轮询选一个可用通道
    const channel = await getAvailableChannel();
    if (!channel) throw new ApiError(503, 'No available upstream channels');
    if (!channel.api_key) throw new ApiError(503, 'Channel has no upstream API key - uv may not be installed');

    // 3. 转发到上游
    const upstreamUrl = `${channel.base_url.replace(/\/+$/, '')}/v1/chat/completions`;
    console.log(`[proxy] ${req.body?.model || '?'} -> ${upstreamUrl} (channel: ${channel.name})`);
    const upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channel.api_key}`,
        'Accept': req.body?.stream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    // 4. 转发响应
    res.status(upstreamRes.status);
    const contentType = upstreamRes.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    if (upstreamRes.body) {
      const reader = upstreamRes.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(decoder.decode(value, { stream: true }));
        }
      } finally {
        reader.releaseLock();
      }
    }
    res.end();
  } catch (err) { next(err); }
});
