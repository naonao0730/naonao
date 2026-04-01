// Test script to figure out the correct WebSocket challenge response format
// Usage: npx tsx test-ws.ts

import WebSocket from 'ws';

const TICKET = process.argv[2] || 'YOUR_TICKET_HERE';
const WS_URL = `wss://aistudio.xiaomimimo.com/ws/proxy?ticket=${TICKET}`;

// Try different challenge response formats
const formats = [
  // Format 1: Just echo back the nonce
  (payload: any) => JSON.stringify({ type: "challenge_response", nonce: payload.nonce }),
  // Format 2: Echo back type + event + payload
  (payload: any) => JSON.stringify({ type: "event", event: "connect.challenge", payload }),
  // Format 3: Just the nonce as string
  (payload: any) => payload.nonce,
  // Format 4: Pong with nonce
  (payload: any) => JSON.stringify({ type: "pong", nonce: payload.nonce }),
  // Format 5: Connect response
  (payload: any) => JSON.stringify({ type: "connect", nonce: payload.nonce, ts: Date.now() }),
];

let formatIndex = 0;

function tryFormat() {
  if (formatIndex >= formats.length) {
    console.log('\nAll formats tried. None worked.');
    process.exit(1);
  }

  console.log(`\n--- Trying format ${formatIndex + 1} ---`);
  const ws = new WebSocket(WS_URL, {
    headers: {
      'Origin': 'https://aistudio.xiaomimimo.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }
  });

  let responded = false;

  ws.on('open', () => {
    console.log('WebSocket connected');
  });

  ws.on('message', (data) => {
    const msg = data.toString();
    console.log('<<', msg.substring(0, 500));

    try {
      const parsed = JSON.parse(msg);
      if (parsed.event === 'connect.challenge' || parsed.type === 'event') {
        const payload = parsed.payload || parsed;
        if (payload.nonce) {
          const response = formats[formatIndex](payload);
          console.log('>>', response);
          ws.send(response);
          responded = true;
        }
      }
    } catch {
      // not JSON
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`Closed: ${code} ${reason.toString()}`);
    if (responded && code === 1008) {
      // Challenge response was wrong, try next format
      formatIndex++;
      setTimeout(tryFormat, 500);
    } else if (code === 1000) {
      console.log('SUCCESS! Connection stayed open with format', formatIndex + 1);
      // Keep alive for a few seconds to see more messages
      setTimeout(() => process.exit(0), 3000);
    }
  });

  ws.on('error', (err) => {
    console.error('Error:', err.message);
  });

  // Timeout: if no close after 5s, consider it a success
  setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('Connection still open after 5s - format', formatIndex + 1, 'might work!');
      // Try sending a chat message to see what happens
      const chatMsg = {
        type: "event",
        event: "bot.chat",
        payload: {
          model: "mimo-v2-flash-studio",
          messages: [{ role: "user", content: "hello" }],
          stream: true,
        }
      };
      console.log('>> Sending chat:', JSON.stringify(chatMsg).substring(0, 200));
      ws.send(JSON.stringify(chatMsg));
    }
  }, 5000);
}

console.log('Testing WebSocket challenge formats...');
console.log('URL:', WS_URL);
tryFormat();
