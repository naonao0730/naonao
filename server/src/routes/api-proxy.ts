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
async function validateKey(req: any, _res: any, next: any) {
  try {
    const auth = req.headers.authorization || '';
    const keyValue = auth.replace(/^Bearer\s+/i, '');
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

// ========== OpenAI 格式 ==========

proxyForwardRouter.post('/chat/completions', handleOpenAI);
proxyForwardRouter.post('/v1/chat/completions', handleOpenAI);

async function handleOpenAI(req: any, res: any, next: any) {
  try {
    const channel = req.channel;
    const upstreamUrl = `${channel.base_url.replace(/\/+$/, '')}/v1/chat/completions`;
    const isStream = req.body?.stream === true;
    console.log(`[proxy/openai] ${req.body?.model || '?'} -> ${upstreamUrl} (channel: ${channel.name})`);

    const upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channel.api_key}`,
        'Accept': isStream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    res.status(upstreamRes.status);
    const contentType = upstreamRes.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    if (isStream && upstreamRes.body) {
      // 流式转发
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

// ========== Anthropic 格式 ==========

proxyForwardRouter.post('/messages', handleAnthropic);
proxyForwardRouter.post('/v1/messages', handleAnthropic);

// Anthropic → OpenAI 请求转换
function anthropicToOpenAI(body: any): any {
  const messages: any[] = [];

  // system 消息
  if (body.system) {
    const sysContent = typeof body.system === 'string'
      ? body.system
      : body.system.map((b: any) => b.text || '').join('\n');
    messages.push({ role: 'system', content: sysContent });
  }

  // 对话消息
  for (const msg of body.messages || []) {
    if (typeof msg.content === 'string') {
      messages.push({ role: msg.role, content: msg.content });
    } else if (Array.isArray(msg.content)) {
      const text = msg.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n');
      messages.push({ role: msg.role, content: text });
    }
  }

  const oai: any = {
    model: body.model || 'gpt-4o',
    messages,
    max_tokens: body.max_tokens || 4096,
  };
  if (body.temperature !== undefined) oai.temperature = body.temperature;
  if (body.top_p !== undefined) oai.top_p = body.top_p;
  if (body.stream) oai.stream = true;
  return oai;
}

// OpenAI → Anthropic 非流式响应转换
function openAIToAnthropic(oaiBody: any, model: string): any {
  const choice = oaiBody.choices?.[0];
  const content: any[] = [];
  if (choice?.message?.content) {
    content.push({ type: 'text', text: choice.message.content });
  }
  return {
    id: oaiBody.id || 'msg_' + Date.now(),
    type: 'message',
    role: 'assistant',
    content,
    model,
    stop_reason: choice?.finish_reason === 'stop' ? 'end_turn' : choice?.finish_reason || 'end_turn',
    usage: {
      input_tokens: oaiBody.usage?.prompt_tokens || 0,
      output_tokens: oaiBody.usage?.completion_tokens || 0,
    },
  };
}

async function handleAnthropic(req: any, res: any, next: any) {
  try {
    const channel = req.channel;
    const isStream = req.body?.stream === true;
    const oaiBody = anthropicToOpenAI(req.body);
    const upstreamUrl = `${channel.base_url.replace(/\/+$/, '')}/v1/chat/completions`;
    const model = req.body?.model || 'gpt-4o';
    console.log(`[proxy/anthropic] ${model} -> ${upstreamUrl} (channel: ${channel.name})`);

    const upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channel.api_key}`,
        'Accept': isStream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify(oaiBody),
    });

    if (!upstreamRes.ok) {
      res.status(upstreamRes.status);
      const errText = await upstreamRes.text();
      res.send(errText);
      return;
    }

    if (isStream && upstreamRes.body) {
      // Anthropic 流式响应
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = upstreamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // 发送 message_start
      res.write(`event: message_start\ndata: ${JSON.stringify({
        type: 'message_start',
        message: {
          id: 'msg_' + Date.now(),
          type: 'message',
          role: 'assistant',
          content: [],
          model,
          stop_reason: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      })}\n\n`);

      // 发送 content_block_start
      res.write(`event: content_block_start\ndata: ${JSON.stringify({
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      })}\n\n`);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            try {
              const chunk = JSON.parse(data);
              const delta = chunk.choices?.[0]?.delta?.content;
              if (delta) {
                res.write(`event: content_block_delta\ndata: ${JSON.stringify({
                  type: 'content_block_delta',
                  index: 0,
                  delta: { type: 'text_delta', text: delta },
                })}\n\n`);
              }
            } catch { /* skip non-json */ }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // 结束事件
      res.write(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: 0 })}\n\n`);
      res.write(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`);
      res.end();
    } else {
      // 非流式：转换响应格式
      res.status(200);
      res.setHeader('Content-Type', 'application/json');
      const oaiJson = await upstreamRes.json();
      res.json(openAIToAnthropic(oaiJson, model));
    }
  } catch (err) { next(err); }
}
