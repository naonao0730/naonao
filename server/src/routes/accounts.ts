import { Router } from 'express';
import { getAllAccounts, getAccount, createAccount, updateAccount, deleteAccount, touchAccount } from '../store/accounts.js';
import { mimoClient } from '../services/mimo-client.js';
import { ApiError } from '../middleware/error-handler.js';

const router = Router();

// 获取所有账号
router.get('/', async (_req, res) => {
  const accounts = await getAllAccounts();
  res.json(accounts);
});

// 创建账号
router.post('/', async (req, res) => {
  const { name, token, cookie } = req.body;
  if (!name || !token) {
    throw new ApiError(400, 'name and token are required');
  }
  const cleanToken = token.replace(/^["']|["']$/g, '');
  const cleanCookie = (cookie || '').replace(/^["']|["']$/g, '');
  const account = await createAccount(name, cleanToken, cleanCookie);
  res.status(201).json(account);
});

// 更新账号
router.put('/:id', async (req, res) => {
  const { name, token, cookie } = req.body;
  const cleanToken = token ? token.replace(/^["']|["']$/g, '') : undefined;
  const cleanCookie = cookie !== undefined ? cookie.replace(/^["']|["']$/g, '') : undefined;
  const account = await updateAccount(req.params.id, name, cleanToken, cleanCookie);
  if (!account) {
    throw new ApiError(404, 'Account not found');
  }
  res.json(account);
});

// 删除账号
router.delete('/:id', async (req, res) => {
  const deleted = await deleteAccount(req.params.id);
  if (!deleted) {
    throw new ApiError(404, 'Account not found');
  }
  res.json({ success: true });
});

// 获取账号的 MiMo 用户信息
router.get('/:id/profile', async (req, res, next) => {
  try {
    const account = await getAccount(req.params.id);
    if (!account) throw new ApiError(404, 'Account not found');
    await touchAccount(account.id);
    const result = await mimoClient.getUserInfo(account.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 获取账号的模型列表
router.get('/:id/models', async (req, res, next) => {
  try {
    const account = await getAccount(req.params.id);
    if (!account) throw new ApiError(404, 'Account not found');
    const result = await mimoClient.getBotConfig(account.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
