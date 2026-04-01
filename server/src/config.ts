const config = {
  port: parseInt(process.env.PORT || '3001'),
  mimoBaseUrl: process.env.MIMO_BASE_URL || 'https://aistudio.xiaomimimo.com',
  nodeEnv: process.env.NODE_ENV || 'development',
  mysql: {
    host: process.env.MYSQL_HOST || '47.89.241.232',
    port: parseInt(process.env.MYSQL_PORT || '31753'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '0d4H9PsLy1eJmR26Dp8bvXNKtk3Zq7a5',
    database: process.env.MYSQL_DATABASE || 'zeabur',
  },
};

export default config;
