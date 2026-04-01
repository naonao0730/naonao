const port = parseInt(process.env.PORT || '3001');
const mysqlUrl = process.env.MYSQL_URL || '';
const mysqlPort = parseInt(process.env.MYSQL_PORT || '3306');

const config = {
  port,
  mimoBaseUrl: process.env.MIMO_BASE_URL || 'https://aistudio.xiaomimimo.com',
  nodeEnv: process.env.NODE_ENV || 'development',
  mysql: {
    url: mysqlUrl,
    host: process.env.MYSQL_HOST || '',
    port: isNaN(mysqlPort) ? 3306 : mysqlPort,
    user: process.env.MYSQL_USER || '',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || '',
  },
};

if (!config.mysql.url && !config.mysql.host) {
  console.error('[config] 请设置 MYSQL_URL 或 MYSQL_HOST 环境变量');
  process.exit(1);
}

if (config.mysql.url) {
  const safeUrl = config.mysql.url.replace(/:[^:@]+@/, ':***@');
  console.log(`[config] 使用 MYSQL_URL: ${safeUrl}`);
} else {
  console.log(`[config] 连接数据库: ${config.mysql.host}:${config.mysql.port}/${config.mysql.database}`);
}

export default config;
