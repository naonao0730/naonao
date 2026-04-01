import { Router } from 'express';
import { getConversations, getMessages, deleteConversation } from '../store/conversations.js';
import { mimoClient } from '../services/mimo-client.js';
import { getAccount } from '../store/accounts.js';
import { ApiError } from '../middleware/error-handler.js';

const router = Router();

// 获取本地会话列表
router.get('/', async (req, res) => {
  const { accountId } = req.query;
  if (!accountId) throw new ApiError(400, 'accountId is required');
  const conversations = await getConversations(accountId as string);
  res.json(conversations);
});

// 获取会话消息
router.get('/:id/messages', async (req, res) => {
  const messages = await getMessages(req.params.id);
  res.json(messages);
});

// 删除会话
router.delete('/:id', async (req, res) => {
  const deleted = await deleteConversation(req.params.id);
  if (!deleted) throw new ApiError(404, 'Conversation not found');
  res.json({ success: true });
});

// 获取远程会话列表
router.post('/list-remote', async (req, res, next) => {
  try {
    const { accountId, page = 1, pageSize = 20 } = req.body;
    if (!accountId) throw new ApiError(400, 'accountId is required');
    const account = await getAccount(accountId);
    if (!account) throw new ApiError(404, 'Account not found');
    const result = await mimoClient.listConversations(account.id, page, pageSize);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
