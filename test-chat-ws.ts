import WebSocket from 'ws';
import { randomUUID } from 'crypto';

// 直接从你的账号信息构建
const COOKIE = 'serviceToken="lBp+en8jmZclRZ3zFZn3GMt8ePlvFErThFc+00QUbuwoxcX8sygvMWgGn/rDSdvIBxz4crF5x8KuvijybPvgV4VRaG9fnyOqae4I1v74NUu3BTYwEtwjoBFEgJOVvG92Uw8baiz7ZqW5ykxjWFTAUkvaJeFJPfRRvrUKAIOpYw8Isatrrzb2BYCTOOsasbh8PeiDzO7ry8Zmuof9IkhWY5X/0LfM8QK3Rb/JL0rQl+fqRa/9V12sPkFLxeNRuCHnaROOEzrpMPkyAOW7IlYCMuJ51V4MDj9r9oBZ3bN3/49Uqin6OEU73tDBse+TcZ1O3Vd3QcufxEUzhG5lw3tuOkgPbKCji6b7hCdtpR/qi9wG+eXtwKECdjM8EmZuYaLd"; userId=6863516613; xiaomichatbot_ph="9e3Z99komPsHLH2RW/upnw=="';
const TOKEN = '9e3Z99komPsHLH2RW/upnw==';

async function getTicket(): Promise<string> {
  const url = `https://aistudio.xiaomimimo.com/open-apis/user/ws/ticket?xiaomichatbot_ph=${encodeURIComponent(TOKEN)}`;
  const res = await fetch(url, {
    headers: {
      'Cookie': COOKIE,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }
  });
  const data = await res.json() as any;
  console.log('[TICKET]', data);
  return data.data.ticket;
}

async function main() {
  const ticket = await getTicket();
  console.log('[TICKET]', ticket);

  const WS_URL = `wss://aistudio.xiaomimimo.com/ws/proxy?ticket=${ticket}`;

  const ws = new WebSocket(WS_URL, {
    headers: {
      'Origin': 'https://aistudio.xiaomimimo.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Cookie': COOKIE,
    }
  });

  let chatSent = false;

  ws.on('open', () => {
    console.log('[OPEN] WebSocket connected');
  });

  ws.on('message', (data) => {
    const msg = data.toString();
    console.log('[RECV]', msg.substring(0, 800));

    try {
      const parsed = JSON.parse(msg);

      // 收到 challenge，发送 connect 请求
      if (parsed.event === 'connect.challenge') {
        const nonce = parsed.payload?.nonce;
        console.log('[CHALLENGE] nonce:', nonce);

        // 格式1: 把 nonce 作为 challenge 字段
        const connectReq = {
          type: 'req',
          id: randomUUID(),
          method: 'connect',
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            clientType: 'web',
            challenge: nonce,
          }
        };
        console.log('[SEND connect]', JSON.stringify(connectReq));
        ws.send(JSON.stringify(connectReq));
        return;
      }

      // connect 响应
      if (parsed.type === 'res') {
        console.log('[RES]', JSON.stringify(parsed));
        if (parsed.result && !chatSent) {
          chatSent = true;
          const chatReq = {
            type: 'req',
            id: randomUUID(),
            method: 'chat.send',
            params: {
              sessionKey: 'agent:main:main',
              message: '你好，这是一个测试消息',
              deliver: false,
              idempotencyKey: randomUUID(),
            }
          };
          console.log('[SEND chat]', JSON.stringify(chatReq));
          ws.send(JSON.stringify(chatReq));
        }
        return;
      }

      // chat 事件
      if (parsed.event === 'chat') {
        console.log('[CHAT]', JSON.stringify(parsed.payload).substring(0, 500));
      }

    } catch (e) {
      console.log('[RAW]', msg.substring(0, 200));
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[CLOSE] ${code} ${reason.toString()}`);
  });

  ws.on('error', (err) => {
    console.error('[ERROR]', err.message);
  });

  setTimeout(() => {
    console.log('[TIMEOUT] Closing...');
    ws.close();
    process.exit(0);
  }, 30000);
}

main().catch(console.error);
