import { Router } from 'express';
import { getAccount, touchAccount } from '../store/accounts.js';
import { saveConversation, saveMessage } from '../store/conversations.js';
import { chatViaWebSocket } from '../services/mimo-client.js';
import { ApiError } from '../middleware/error-handler.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// 发送聊天消息 (SSE 流式响应)
router.post('/', async (req, res, next) => {
  try {
    const { accountId, model, messages, conversationId } = req.body;
    if (!accountId || !model || !messages) {
      throw new ApiError(400, 'accountId, model, and messages are required');
    }

    const account = await getAccount(accountId);
    if (!account) throw new ApiError(404, 'Account not found');
    await touchAccount(account.id);

    // 创建或复用本地会话
    let localConvId = conversationId;
    if (!localConvId) {
      localConvId = uuidv4();
      await saveConversation(localConvId, accountId, undefined, model, messages[0]?.content?.slice(0, 50));
    }

    // 保存用户消息
    const userMessage = messages[messages.length - 1];
    if (userMessage) {
      await saveMessage(localConvId, 'user', userMessage.content);
    }

    // 设置 SSE 响应头
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // 发送会话 ID 给前端
    res.write(`event: conversationId\ndata: ${JSON.stringify({ conversationId: localConvId })}\n\n`);

    // 构建发送给 MiMo 的消息文本
    const sendText = userMessage?.content || '';

    const closeWs = chatViaWebSocket(
      { cookie: account.cookie, token: account.token },
      sendText,
      // onDelta: 流式推送增量内容
      (delta) => {
        res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
      },
      // onDone: 保存回复并结束
      async (fullText) => {
        if (fullText) {
          await saveMessage(localConvId, 'assistant', fullText);
        }
        res.end();
      },
      // onError: 推送错误并结束
      (errMsg) => {
        res.write(`event: error\ndata: ${JSON.stringify({ error: errMsg })}\n\n`);
        res.end();
      },
    );

    // 客户端断开时关闭 WebSocket
    req.on('close', () => {
      closeWs();
    });
  } catch (err) {
    next(err);
  }
});

export default router;
