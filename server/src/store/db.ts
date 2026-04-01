import mysql from 'mysql2/promise';
import config from '../config.js';

const pool = mysql.createPool({
  host: config.mysql.host,
  port: config.mysql.port,
  user: config.mysql.user,
  password: config.mysql.password,
  database: config.mysql.database,
  waitForConnections: true,
  connectionLimit: 10,
});

// 建表
const tables = [
  `CREATE TABLE IF NOT EXISTS accounts (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    token TEXT NOT NULL,
    cookie TEXT,
    created_at BIGINT DEFAULT 0,
    last_used BIGINT
  )`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL,
    remote_id VARCHAR(255),
    model VARCHAR(255) NOT NULL,
    title VARCHAR(255),
    created_at BIGINT DEFAULT 0,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id VARCHAR(36) NOT NULL,
    role VARCHAR(50) NOT NULL,
    content LONGTEXT NOT NULL,
    created_at BIGINT DEFAULT 0,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS api_channels (
    id VARCHAR(36) PRIMARY KEY,
    account_id VARCHAR(36) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL DEFAULT 'anthropic',
    base_url TEXT NOT NULL,
    api_key TEXT,
    model_whitelist TEXT,
    is_active TINYINT DEFAULT 1,
    expire_time BIGINT,
    created_at BIGINT DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS api_keys (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    key_value VARCHAR(255) NOT NULL UNIQUE,
    is_active TINYINT DEFAULT 1,
    created_at BIGINT DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS install_status (
    account_id VARCHAR(36) PRIMARY KEY,
    status VARCHAR(20) NOT NULL DEFAULT 'idle',
    logs LONGTEXT,
    result TEXT,
    updated_at BIGINT DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS auto_renew_status (
    account_id VARCHAR(36) PRIMARY KEY,
    status VARCHAR(20) NOT NULL DEFAULT 'idle',
    error TEXT,
    updated_at BIGINT DEFAULT 0
  )`,
];

for (const sql of tables) {
  await pool.execute(sql);
}

console.log('MySQL connected and tables ensured');

export default {
  /** 查询多行 */
  async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
    const [rows] = await pool.query(sql, params);
    return rows as T[];
  },
  /** 查询单行 */
  async get<T = any>(sql: string, params?: any[]): Promise<T | undefined> {
    const rows = await this.query<T>(sql, params);
    return rows[0];
  },
  /** 执行写操作 */
  async execute(sql: string, params?: any[]) {
    const [result] = await pool.execute(sql, params);
    return result;
  },
  /** 兼容 SQLite 风格的 run */
  async run(sql: string, params?: any[]) {
    const result: any = await this.execute(sql, params);
    return { changes: result.affectedRows, lastInsertRowid: result.insertId };
  },
};
