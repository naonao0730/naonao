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
  channel_id: string;
  name: string;
  key_value: string;
  is_active: number;
  expire_time: number | null;
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
  const ch = await getChannelByAccountId(accountId);
  if (ch) {
    await db.execute('UPDATE api_keys SET expire_time = ? WHERE channel_id = ?', [expireTime, ch.id]);
  }
}

export async function updateChannelApiKey(accountId: string, apiKey: string): Promise<void> {
  await db.execute('UPDATE api_channels SET api_key = ? WHERE account_id = ?', [apiKey, accountId]);
}

export async function deleteChannel(id: string): Promise<boolean> {
  const result = await db.run('DELETE FROM api_channels WHERE id = ?', [id]);
  return result.changes > 0;
}

// --- API Keys ---

export async function getAllKeys(): Promise<ApiKey[]> {
  return db.query<ApiKey>('SELECT * FROM api_keys ORDER BY created_at DESC');
}

export async function getKeyByValue(keyValue: string): Promise<ApiKey | undefined> {
  return db.get<ApiKey>('SELECT * FROM api_keys WHERE key_value = ? AND is_active = 1', [keyValue]);
}

/** 为某个通道创建虚拟 Key（如果已存在则复用），绑定到容器的过期时间 */
export async function createKeyForChannel(channelId: string, expireTime: number | null): Promise<ApiKey> {
  // 检查是否已有该通道的 key
  const existing = await db.get<ApiKey>('SELECT * FROM api_keys WHERE channel_id = ? AND name = ? LIMIT 1', [channelId, 'auto']);
  if (existing) {
    // 更新过期时间
    await db.execute('UPDATE api_keys SET expire_time = ?, is_active = 1 WHERE id = ?', [expireTime, existing.id]);
    return (await db.get<ApiKey>('SELECT * FROM api_keys WHERE id = ?', [existing.id]))!;
  }
  const id = uuidv4();
  const key_value = 'sk-mimo-' + randomBytes(24).toString('hex');
  await db.execute(
    'INSERT INTO api_keys (id, channel_id, name, key_value, expire_time) VALUES (?, ?, ?, ?, ?)',
    [id, channelId, 'auto', key_value, expireTime],
  );
  return (await db.get<ApiKey>('SELECT * FROM api_keys WHERE id = ?', [id]))!;
}

export async function deleteApiKey(id: string): Promise<boolean> {
  const result = await db.run('DELETE FROM api_keys WHERE id = ?', [id]);
  return result.changes > 0;
}

/** 检查 Key 是否有效（未过期） */
export function isKeyValid(key: ApiKey): boolean {
  if (!key.is_active) return false;
  if (key.expire_time && Date.now() > key.expire_time) return false;
  return true;
}
