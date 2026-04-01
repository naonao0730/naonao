const config = {
  port: parseInt(process.env.PORT || '3001'),
  mimoBaseUrl: process.env.MIMO_BASE_URL || 'https://aistudio.xiaomimimo.com',
  nodeEnv: process.env.NODE_ENV || 'development',
  mysql: {
    url: process.env.MYSQL_URL || '',
    host: process.env.MYSQL_HOST || '',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || '',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || '',
  },
};

if (!config.mysql.url && !config.mysql.host) {
  console.error('[config] 请设置 MYSQL_URL 或 MYSQL_HOST 环境变量');
  process.exit(1);
}

export default config;
