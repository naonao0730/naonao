import db from './db.js';

export interface InstallStatus {
  account_id: string;
  status: 'idle' | 'running' | 'done' | 'error';
  logs: string[];
  result: { shortCodes: string[]; apiKeys: string[] } | null;
  updated_at: number;
}

export async function getInstallStatus(accountId: string): Promise<InstallStatus | null> {
  const row = await db.get<any>('SELECT * FROM install_status WHERE account_id = ?', [accountId]);
  if (!row) return null;
  return {
    account_id: row.account_id,
    status: row.status,
    logs: JSON.parse(row.logs || '[]'),
    result: row.result ? JSON.parse(row.result) : null,
    updated_at: row.updated_at,
  };
}

export async function initInstallStatus(accountId: string): Promise<void> {
  await db.execute(
    `INSERT INTO install_status (account_id, status, logs, result, updated_at)
     VALUES (?, 'running', '[]', NULL, ?)
     ON DUPLICATE KEY UPDATE status = 'running', logs = '[]', result = NULL, updated_at = VALUES(updated_at)`,
    [accountId, Math.floor(Date.now() / 1000)],
  );
}

export async function appendInstallLog(accountId: string, log: string): Promise<void> {
  const row = await db.get<any>('SELECT logs FROM install_status WHERE account_id = ?', [accountId]);
  if (!row) return;
  const logs: string[] = JSON.parse(row.logs || '[]');
  logs.push(log);
  await db.execute(
    'UPDATE install_status SET logs = ?, updated_at = ? WHERE account_id = ?',
    [JSON.stringify(logs), Math.floor(Date.now() / 1000), accountId],
  );
}

export async function setInstallResult(accountId: string, result: { shortCodes: string[]; apiKeys: string[] }): Promise<void> {
  await db.execute(
    'UPDATE install_status SET status = ?, result = ?, updated_at = ? WHERE account_id = ?',
    ['done', JSON.stringify(result), Math.floor(Date.now() / 1000), accountId],
  );
}

export async function setInstallError(accountId: string, error: string): Promise<void> {
  const row = await db.get<any>('SELECT logs FROM install_status WHERE account_id = ?', [accountId]);
  if (!row) return;
  const logs: string[] = JSON.parse(row.logs || '[]');
  logs.push(`错误: ${error}`);
  await db.execute(
    'UPDATE install_status SET status = ?, logs = ?, updated_at = ? WHERE account_id = ?',
    ['error', JSON.stringify(logs), Math.floor(Date.now() / 1000), accountId],
  );
}
