import db from './db.js';

export interface AutoRenewStatus {
  account_id: string;
  status: 'idle' | 'waiting' | 'destroying' | 'creating' | 'installing' | 'error';
  error: string | null;
  updated_at: number;
}

export async function getAutoRenewStatus(accountId: string): Promise<AutoRenewStatus | null> {
  const row = await db.get<any>('SELECT * FROM auto_renew_status WHERE account_id = ?', [accountId]);
  if (!row) return null;
  return {
    account_id: row.account_id,
    status: row.status,
    error: row.error,
    updated_at: row.updated_at,
  };
}

export async function setAutoRenewStatus(accountId: string, status: AutoRenewStatus['status']): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.execute(
    `INSERT INTO auto_renew_status (account_id, status, error, updated_at)
     VALUES (?, ?, NULL, ?)
     ON DUPLICATE KEY UPDATE status = VALUES(status), error = NULL, updated_at = VALUES(updated_at)`,
    [accountId, status, now],
  );
}

export async function setAutoRenewIdle(accountId: string): Promise<void> {
  await setAutoRenewStatus(accountId, 'idle');
}

export async function setAutoRenewError(accountId: string, error: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.execute(
    `INSERT INTO auto_renew_status (account_id, status, error, updated_at)
     VALUES (?, 'error', ?, ?)
     ON DUPLICATE KEY UPDATE status = 'error', error = VALUES(error), updated_at = VALUES(updated_at)`,
    [accountId, error, now],
  );
}
