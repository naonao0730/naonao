import { v4 as uuidv4 } from 'uuid';
import { randomBytes } from 'crypto';
import db from './db.js';

export interface ApiChannel {
  id: string;
  account_id: string;
  name: string;
  provider: string;
  base_url: string;
  api_key: string | null;
  model_whitelist: string | null;
  is_active: number;
  expire_time: number | null;
  created_at: number;
}

export interface ApiKey {
  id: string;
  name: string;
  key_value: string;
  is_active: number;
  created_at: number;
}

// --- Channels ---

export async function getAllChannels(): Promise<ApiChannel[]> {
  return db.query<ApiChannel>('SELECT * FROM api_channels ORDER BY created_at DESC');
}

export async function getChannel(id: string): Promise<ApiChannel | undefined> {
  return db.get<ApiChannel>('SELECT * FROM api_channels WHERE id = ?', [id]);
}

export async function getChannelByAccountId(accountId: string): Promise<ApiChannel | undefined> {
  return db.get<ApiChannel>('SELECT * FROM api_channels WHERE account_id = ?', [accountId]);
}

/** 获取或创建通道（按 account_id 去重） */
export async function upsertChannel(accountId: string, name: string): Promise<ApiChannel> {
  const existing = await getChannelByAccountId(accountId);
  if (existing) {
    await db.execute('UPDATE api_channels SET name = ?, is_active = 1 WHERE account_id = ?', [name, accountId]);
    return (await getChannelByAccountId(accountId))!;
  }
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  await db.execute(
    `INSERT INTO api_channels (id, account_id, name, provider, base_url, api_key, created_at)
     VALUES (?, ?, ?, 'anthropic', 'https://api.xiaomimimo.com', '', ?)`,
    [id, accountId, name, now],
  );
  return (await getChannel(id))!;
}

/** 更新通道的 expire_time（容器启动时调用） */
export async function setChannelExpiry(accountId: string, expireTime: number): Promise<void> {
  await db.execute('UPDATE api_channels SET expire_time = ? WHERE account_id = ?', [expireTime, accountId]);
}

export async function updateChannelApiKey(accountId: string, apiKey: string): Promise<void> {
  await db.execute('UPDATE api_channels SET api_key = ? WHERE account_id = ?', [apiKey, accountId]);
}

export async function deleteChannel(id: string): Promise<boolean> {
  const result = await db.run('DELETE FROM api_channels WHERE id = ?', [id]);
  return result.changes > 0;
}

// --- 轮询选通道 ---

let roundRobinIndex = 0;

/** 从所有可用通道中轮询选一个 */
export async function getAvailableChannel(): Promise<ApiChannel | null> {
  const channels = await db.query<ApiChannel>(
    `SELECT * FROM api_channels
     WHERE is_active = 1 AND api_key != ''
     AND (expire_time IS NULL OR expire_time > ?)`,
    [Date.now()],
  );
  if (channels.length === 0) return null;
  roundRobinIndex = roundRobinIndex % channels.length;
  const channel = channels[roundRobinIndex];
  roundRobinIndex = (roundRobinIndex + 1) % channels.length;
  return channel;
}

// --- API Keys (全局虚拟 Key，不绑定通道) ---

export async function getAllKeys(): Promise<ApiKey[]> {
  return db.query<ApiKey>('SELECT * FROM api_keys ORDER BY created_at DESC');
}

export async function getKeyByValue(keyValue: string): Promise<ApiKey | undefined> {
  return db.get<ApiKey>('SELECT * FROM api_keys WHERE key_value = ? AND is_active = 1', [keyValue]);
}

/** 创建虚拟 Key */
export async function createApiKey(name: string): Promise<ApiKey> {
  const id = uuidv4();
  const key_value = 'sk-mimo-' + randomBytes(24).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  await db.execute(
    'INSERT INTO api_keys (id, name, key_value, created_at) VALUES (?, ?, ?, ?)',
    [id, name, key_value, now],
  );
  return (await db.get<ApiKey>('SELECT * FROM api_keys WHERE id = ?', [id]))!;
}

export async function deleteApiKey(id: string): Promise<boolean> {
  const result = await db.run('DELETE FROM api_keys WHERE id = ?', [id]);
  return result.changes > 0;
}
