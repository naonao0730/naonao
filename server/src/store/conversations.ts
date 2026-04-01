import db from './db.js';

export interface Conversation {
  id: string;
  account_id: string;
  remote_id: string | null;
  model: string;
  title: string | null;
  created_at: number;
}

export interface Message {
  id: number;
  conversation_id: string;
  role: string;
  content: string;
  created_at: number;
}

export async function saveConversation(id: string, accountId: string, remoteId: string | undefined, model: string, title?: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.execute(
    `INSERT INTO conversations (id, account_id, remote_id, model, title, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE remote_id = VALUES(remote_id), model = VALUES(model), title = VALUES(title)`,
    [id, accountId, remoteId || null, model, title || null, now],
  );
}

export async function getConversations(accountId: string): Promise<Conversation[]> {
  return db.query<Conversation>('SELECT * FROM conversations WHERE account_id = ? ORDER BY created_at DESC', [accountId]);
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  return db.get<Conversation>('SELECT * FROM conversations WHERE id = ?', [id]);
}

export async function deleteConversation(id: string): Promise<boolean> {
  await db.execute('DELETE FROM messages WHERE conversation_id = ?', [id]);
  const result = await db.run('DELETE FROM conversations WHERE id = ?', [id]);
  return result.changes > 0;
}

export async function saveMessage(conversationId: string, role: string, content: string): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db.run(
    'INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)',
    [conversationId, role, content, now],
  );
  return Number(result.lastInsertRowid);
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  return db.query<Message>('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC', [conversationId]);
}
