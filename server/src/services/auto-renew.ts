import { mimoClient, installUvViaWebSocket } from './mimo-client.js';
import { getAccount, getAllAccounts } from '../store/accounts.js';
import {
  upsertChannel, setChannelExpiry, updateChannelApiKey,
  getChannelByAccountId,
} from '../store/api-proxy.js';
import {
  getAutoRenewStatus, setAutoRenewStatus, setAutoRenewError, setAutoRenewIdle,
  type AutoRenewStatus,
} from '../store/auto-renew-status.js';

const FIVE_MINUTES = 5 * 60 * 1000;
const CHECK_INTERVAL = 30 * 1000; // 每 30 秒检查一次
const INSTALL_UV_RETRIES = 3;

let timer: ReturnType<typeof setInterval> | null = null;
const renewingAccounts = new Set<string>(); // 正在续期的 account

function log(accountId: string, msg: string) {
  console.log(`[auto-renew][${accountId.slice(0, 8)}] ${msg}`);
}

/** 解析 MiMo API 返回的 claw 状态 */
async function getClawData(accountId: string): Promise<{ status: string; expireTime?: number } | null> {
  const res = await mimoClient.getClawStatus(accountId) as any;
  // MiMo API 返回 { code, msg, data: { status, expireTime } }
  if (res?.code === 0 && res.data) {
    return { status: res.data.status || 'NOT_CREATED', expireTime: res.data.expireTime };
  }
  return null;
}

/** 单次安装 uv（WebSocket），成功返回结果，失败抛异常 */
function tryInstallUv(account: { cookie: string; token: string }): Promise<{ shortCodes: string[]; apiKeys: string[] }> {
  return new Promise((resolve, reject) => {
    const closeWs = installUvViaWebSocket(
      { cookie: account.cookie, token: account.token },
      (_log) => {},
      (result) => resolve(result),
      (errMsg) => reject(new Error(errMsg)),
    );
    // 超时 10 分钟
    setTimeout(() => {
      closeWs();
      reject(new Error('安装 uv 超时'));
    }, 10 * 60_000);
  });
}

/** 安装 uv 流程（容器必须已就绪），失败自动重试 */
async function installUv(accountId: string, account: { cookie: string; token: string; name: string }) {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= INSTALL_UV_RETRIES; attempt++) {
    log(accountId, `正在安装 uv... (第 ${attempt}/${INSTALL_UV_RETRIES} 次)`);
    await setAutoRenewStatus(accountId, 'installing');

    try {
      const result = await tryInstallUv(account);
      log(accountId, `安装完成，获取到 ${result.apiKeys.length} 个 API Key，短码: ${result.shortCodes.join(', ')}`);

      // 更新通道
      await upsertChannel(accountId, account.name);
      const clawData = await getClawData(accountId);
      const expireTime = clawData?.expireTime || null;
      if (expireTime) await setChannelExpiry(accountId, expireTime);

      if (result.apiKeys.length > 0) {
        await updateChannelApiKey(accountId, result.apiKeys[0]);
        log(accountId, `保存上游 API Key: ${result.apiKeys[0].slice(0, 15)}...`);
      } else {
        log(accountId, '警告：未获取到上游 API Key，中转功能将不可用');
      }

      log(accountId, `完成，过期时间: ${expireTime ? new Date(expireTime).toISOString() : '未知'}`);
      await setAutoRenewIdle(accountId);
      return; // 成功，退出
    } catch (err: any) {
      lastError = err;
      log(accountId, `第 ${attempt} 次安装失败: ${err.message}`);
      if (attempt < INSTALL_UV_RETRIES) {
        log(accountId, '等待 10 秒后重试...');
        await sleep(10_000);
      }
    }
  }

  // 所有重试都失败
  throw lastError || new Error('安装 uv 失败');
}

/** 统一的创建+安装uv流程 */
async function createAndInstall(accountId: string, account: { cookie: string; token: string; name: string }) {
  const MAX_CREATE_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_CREATE_RETRIES; attempt++) {
    // 先检查当前容器状态
    let clawData: { status: string; expireTime?: number } | null = null;
    try {
      clawData = await getClawData(accountId);
    } catch (err: any) {
      log(accountId, `获取容器状态失败 (${err?.message})`);
    }

    const status = clawData?.status || 'UNKNOWN';

    if (status === 'AVAILABLE') {
      log(accountId, '工作空间就绪，开始安装 uv');
      await installUv(accountId, account);
      return; // 成功
    }

    if (status === 'CREATING') {
      log(accountId, `工作空间正在创建中，等待就绪... (第 ${attempt}/${MAX_CREATE_RETRIES} 轮)`);
      try {
        await waitForContainerReady(accountId, 120_000);
        log(accountId, '工作空间就绪，开始安装 uv');
        await installUv(accountId, account);
        return; // 成功
      } catch {
        log(accountId, '等待超时，将重新检查状态');
        continue; // 回到循环顶部重新检查
      }
    }

    // NOT_CREATED / UNKNOWN / 其他状态 — 尝试创建
    log(accountId, `状态: ${status}，正在创建工作空间... (第 ${attempt}/${MAX_CREATE_RETRIES} 次)`);
    await setAutoRenewStatus(accountId, 'creating');
    try {
      await mimoClient.createClaw(accountId);
    } catch (err: any) {
      log(accountId, `创建工作空间失败: ${err.message}`);
      if (attempt < MAX_CREATE_RETRIES) {
        await sleep(10_000);
        continue;
      }
      throw err;
    }

    // 等待容器就绪
    log(accountId, '等待工作空间就绪...');
    try {
      await waitForContainerReady(accountId, 120_000);
      log(accountId, '工作空间就绪，开始安装 uv');
      await installUv(accountId, account);
      return; // 成功
    } catch {
      log(accountId, '等待超时，将重新尝试');
      // 继续下一轮循环
    }
  }

  throw new Error(`经过 ${MAX_CREATE_RETRIES} 次尝试仍未能创建并启动工作空间`);
}

/** 初始化账号：没有安装 uv 时自动安装 */
async function initAccount(accountId: string) {
  if (renewingAccounts.has(accountId)) return;
  renewingAccounts.add(accountId);

  const account = await getAccount(accountId);
  if (!account) {
    renewingAccounts.delete(accountId);
    return;
  }

  try {
    log(accountId, '检测到未安装 uv，自动处理中...');
    await createAndInstall(accountId, account);
  } catch (err: any) {
    log(accountId, `初始化失败: ${err.message}`);
    await setAutoRenewError(accountId, err.message);
  } finally {
    renewingAccounts.delete(accountId);
  }
}

async function renewAccount(accountId: string) {
  if (renewingAccounts.has(accountId)) return;
  renewingAccounts.add(accountId);

  const account = await getAccount(accountId);
  if (!account) {
    renewingAccounts.delete(accountId);
    return;
  }

  try {
    log(accountId, '容器已过期，开始续期...');

    // 1. 销毁旧容器
    log(accountId, '正在销毁旧容器...');
    await setAutoRenewStatus(accountId, 'destroying');
    try {
      await mimoClient.destroyClaw(accountId);
    } catch (err: any) {
      log(accountId, `销毁旧容器失败（可能已过期自动销毁）: ${err.message}`);
    }

    // 3. 创建+安装（会生成新 key）
    await createAndInstall(accountId, account);
  } catch (err: any) {
    log(accountId, `续期失败: ${err.message}`);
    await setAutoRenewError(accountId, err.message);
  } finally {
    renewingAccounts.delete(accountId);
  }
}

async function waitForContainerReady(accountId: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  let lastStatus = '';
  while (Date.now() - start < timeoutMs) {
    try {
      const clawData = await getClawData(accountId);
      const status = clawData?.status || 'UNKNOWN';
      if (status !== lastStatus) {
        log(accountId, `容器状态: ${status}`);
        lastStatus = status;
      }
      if (status === 'AVAILABLE') return;
    } catch {
      // 忽略，继续等待
    }
    await sleep(5000);
  }
  throw new Error('等待容器就绪超时');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** 收集需要处理的账号任务 */
async function collectPendingTasks(): Promise<Array<{ accountId: string; type: 'renew' | 'init' }>> {
  const accounts = await getAllAccounts();
  const now = Date.now();
  const tasks: Array<{ accountId: string; type: 'renew' | 'init' }> = [];

  for (const acc of accounts) {
    if (renewingAccounts.has(acc.id)) continue;

    try {
      const clawData = await getClawData(acc.id);
      const status = clawData?.status || 'UNKNOWN';

      if (status === 'AVAILABLE') {
        // 容器可用
        if (clawData?.expireTime && now > clawData.expireTime) {
          log(acc.id, `检测到容器已过期 (${new Date(clawData.expireTime).toISOString()})`);
          tasks.push({ accountId: acc.id, type: 'renew' });
        } else {
          // 检查是否装了 uv
          const channel = await getChannelByAccountId(acc.id);
          if (!channel || !channel.api_key) {
            log(acc.id, '容器运行中但未安装 uv');
            tasks.push({ accountId: acc.id, type: 'init' });
          }
        }
      } else {
        // 非 AVAILABLE 状态（NOT_CREATED / CREATING / UNKNOWN 等），都需要初始化
        log(acc.id, `容器状态: ${status}，需要初始化`);
        tasks.push({ accountId: acc.id, type: 'init' });
      }
    } catch (err: any) {
      // API 调用失败（cookie 过期、网络问题等），也尝试初始化
      const channel = await getChannelByAccountId(acc.id);
      if (!channel || !channel.api_key) {
        log(acc.id, `API 调用失败 (${err?.message || 'unknown'})，尝试初始化`);
        tasks.push({ accountId: acc.id, type: 'init' });
      }
    }
  }

  return tasks;
}

/** 检查所有账号：过期的续期，有容器但没装uv的自动安装（串行执行，每个间隔5分钟） */
async function checkAndRenew() {
  const tasks = await collectPendingTasks();
  if (tasks.length === 0) return;

  log('system', `发现 ${tasks.length} 个待处理账号，串行执行中...`);

  for (let i = 0; i < tasks.length; i++) {
    const { accountId, type } = tasks[i];

    // 非第一个任务，先等5分钟
    if (i > 0) {
      log('system', `等待 ${FIVE_MINUTES / 60_000} 分钟后处理下一个账号...`);
      await sleep(FIVE_MINUTES);
    }

    // 执行任务
    if (type === 'renew') {
      await renewAccount(accountId);
    } else {
      await initAccount(accountId);
    }
  }

  log('system', '所有待处理账号已完成');
}

/** 启动自动续期定时器 */
export function startAutoRenew() {
  if (timer) return;
  log('system', `自动续期已启动，每 ${CHECK_INTERVAL / 1000} 秒检查一次`);
  timer = setInterval(checkAndRenew, CHECK_INTERVAL);
  // 启动时立即检查一次
  checkAndRenew();
}

/** 停止自动续期定时器 */
export function stopAutoRenew() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    log('system', '自动续期已停止');
  }
}

/** 获取定时器运行状态 */
export function isAutoRenewRunning(): boolean {
  return timer !== null;
}

/** 获取所有账号的续期状态 */
export async function getAllRenewStatuses(): Promise<AutoRenewStatus[]> {
  const accounts = await getAllAccounts();
  const statuses: AutoRenewStatus[] = [];
  for (const acc of accounts) {
    const status = await getAutoRenewStatus(acc.id);
    statuses.push(status || {
      account_id: acc.id,
      status: 'idle' as const,
      error: null,
      updated_at: 0,
    });
  }
  return statuses;
}
