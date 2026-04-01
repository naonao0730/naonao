import { v4 as uuidv4 } from 'uuid';
import db from './db.js';

export interface Account {
  id: string;
  name: string;
  token: string;
  cookie: string;
  created_at: number;
  last_used: number | null;
}

export async function getAllAccounts(): Promise<Account[]> {
  return db.query<Account>('SELECT * FROM accounts ORDER BY created_at DESC');
}

export async function getAccount(id: string): Promise<Account | undefined> {
  return db.get<Account>('SELECT * FROM accounts WHERE id = ?', [id]);
}

export async function createAccount(name: string, token: string, cookie?: string): Promise<Account> {
  const id = uuidv4();
  const now = Math.floor(Date.now() / 1000);
  await db.execute(
    'INSERT INTO accounts (id, name, token, cookie, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, name, token, cookie || '', now],
  );
  return (await getAccount(id))!;
}

export async function updateAccount(id: string, name?: string, token?: string, cookie?: string): Promise<Account | null> {
  const account = await getAccount(id);
  if (!account) return null;
  const newName = name ?? account.name;
  const newToken = token ?? account.token;
  const newCookie = cookie ?? account.cookie;
  await db.execute(
    'UPDATE accounts SET name = ?, token = ?, cookie = ? WHERE id = ?',
    [newName, newToken, newCookie, id],
  );
  return (await getAccount(id)) ?? null;
}

export async function deleteAccount(id: string): Promise<boolean> {
  const result = await db.run('DELETE FROM accounts WHERE id = ?', [id]);
  return result.changes > 0;
}

export async function touchAccount(id: string): Promise<void> {
  await db.execute(
    'UPDATE accounts SET last_used = ? WHERE id = ?',
    [Math.floor(Date.now() / 1000), id],
  );
}
