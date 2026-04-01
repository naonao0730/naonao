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

// ========== 转发接口 ==========

export const proxyForwardRouter = Router();

// --- 验证虚拟 Key 的中间件 ---
// 兼容两种传 key 方式：Authorization: Bearer sk-mimo-xxx 或 x-api-key: sk-mimo-xxx
async function validateKey(req: any, _res: any, next: any) {
  try {
    const auth = req.headers.authorization || '';
    let keyValue = auth.replace(/^Bearer\s+/i, '');
    if (!keyValue) {
      keyValue = req.headers['x-api-key'] || '';
    }
    if (!keyValue || !keyValue.startsWith('sk-mimo-')) {
      throw new ApiError(401, 'Invalid API key');
    }
    const apiKey = await getKeyByValue(keyValue);
    if (!apiKey) throw new ApiError(401, 'Invalid or disabled API key');
    (req as any).channel = await getAvailableChannel();
    if (!(req as any).channel) throw new ApiError(503, 'No available upstream channels');
    if (!(req as any).channel.api_key) throw new ApiError(503, 'Channel has no upstream API key');
    next();
  } catch (err) { next(err); }
}

proxyForwardRouter.use(validateKey);

/** 通用转发：透传请求和响应（支持流式 + 非流式） */
async function proxyForward(req: any, res: any, next: any, upstreamPath: string, isAnthropic = false) {
  try {
    const channel = req.channel;
    const upstreamUrl = `${channel.base_url.replace(/\/+$/, '')}${upstreamPath}`;
    const isStream = req.body?.stream === true;
    console.log(`[proxy] ${req.body?.model || '?'} -> ${upstreamUrl} (channel: ${channel.name}, key: ${channel.api_key?.slice(0, 15)}...)`);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': isStream ? 'text/event-stream' : 'application/json',
    };
    // Anthropic 格式用 x-api-key，OpenAI 格式用 Authorization: Bearer
    if (isAnthropic) {
      headers['x-api-key'] = channel.api_key!;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = `Bearer ${channel.api_key}`;
    }

    const upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body),
    });

    res.status(upstreamRes.status);
    for (const [key, value] of upstreamRes.headers.entries()) {
      if (key === 'transfer-encoding' || key === 'content-encoding') continue;
      res.setHeader(key, value);
    }

    if (isStream && upstreamRes.body) {
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
    } else if (upstreamRes.body) {
      const text = await upstreamRes.text();
      res.send(text);
    }
    res.end();
  } catch (err) { next(err); }
}

// OpenAI 格式: https://api.xiaomimimo.com/v1/chat/completions
proxyForwardRouter.post('/chat/completions', (req, res, next) => proxyForward(req, res, next, '/v1/chat/completions'));
proxyForwardRouter.post('/v1/chat/completions', (req, res, next) => proxyForward(req, res, next, '/v1/chat/completions'));

// Anthropic 格式: https://api.xiaomimimo.com/anthropic/v1/messages
proxyForwardRouter.post('/messages', (req, res, next) => proxyForward(req, res, next, '/anthropic/v1/messages', true));
proxyForwardRouter.post('/v1/messages', (req, res, next) => proxyForward(req, res, next, '/anthropic/v1/messages', true));
