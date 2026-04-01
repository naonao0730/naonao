import { Router } from 'express';
import { ApiError } from '../middleware/error-handler.js';
import {
  getAllChannels, getChannel, deleteChannel,
  getAllKeys, getKeyByValue, deleteApiKey, isKeyValid,
} from '../store/api-proxy.js';

const router = Router();

// ========== 管理接口 ==========

// 通道列表
router.get('/channels', async (_req, res) => {
  const channels = await getAllChannels();
  const keys = await getAllKeys();
  const keyCountMap = new Map<string, number>();
  for (const k of keys) {
    keyCountMap.set(k.channel_id, (keyCountMap.get(k.channel_id) || 0) + 1);
  }
  res.json(channels.map(ch => ({
    ...ch,
    key_count: keyCountMap.get(ch.id) || 0,
  })));
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
  const channels = new Map((await getAllChannels()).map(c => [c.id, c]));
  res.json(keys.map(k => {
    const ch = channels.get(k.channel_id);
    return {
      ...k,
      channel_name: ch?.name || '(已删除)',
      expired: k.expire_time ? Date.now() > k.expire_time : false,
    };
  }));
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
    if (!isKeyValid(apiKey)) throw new ApiError(401, 'API key expired');

    // 2. 查找绑定的通道
    const channel = await getChannel(apiKey.channel_id);
    if (!channel) throw new ApiError(500, 'Channel not found');
    if (!channel.is_active) throw new ApiError(403, 'Channel is disabled');

    // 3. 检查模型白名单
    if (channel.model_whitelist) {
      const whitelist = JSON.parse(channel.model_whitelist) as string[];
      const reqModel = req.body?.model;
      if (reqModel && whitelist.length > 0 && !whitelist.includes(reqModel)) {
        throw new ApiError(403, `Model "${reqModel}" is not allowed for this channel`);
      }
    }

    // 4. 转发到上游
    const upstreamUrl = `${channel.base_url.replace(/\/+$/, '')}/v1/chat/completions`;
    const upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channel.api_key}`,
        'Accept': req.body?.stream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    // 5. 转发响应
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
