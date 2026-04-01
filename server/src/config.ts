function requiredEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`[config] 缺少环境变量: ${name}`);
    process.exit(1);
  }
  return val;
}

const config = {
  port: parseInt(process.env.PORT || '3001'),
  mimoBaseUrl: process.env.MIMO_BASE_URL || 'https://aistudio.xiaomimimo.com',
  nodeEnv: process.env.NODE_ENV || 'development',
  mysql: {
    host: requiredEnv('MYSQL_HOST'),
    port: parseInt(requiredEnv('MYSQL_PORT')),
    user: requiredEnv('MYSQL_USER'),
    password: requiredEnv('MYSQL_PASSWORD'),
    database: requiredEnv('MYSQL_DATABASE'),
  },
};

export default config;
