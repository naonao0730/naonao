import { Transform, type TransformCallback } from 'stream';

export interface SSEEvent {
  event: string;
  data: string;
}

export class SSEParser extends Transform {
  private buffer = '';

  constructor() {
    super({ objectMode: true });
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.buffer += chunk.toString();
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    let currentEvent = 'message';
    let currentData = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        currentData = line.slice(6);
      } else if (line === '') {
        if (currentData) {
          this.push({ event: currentEvent, data: currentData } as SSEEvent);
        }
        currentEvent = 'message';
        currentData = '';
      }
    }

    callback();
  }

  _flush(callback: TransformCallback): void {
    if (this.buffer.trim()) {
      const lines = this.buffer.split('\n');
      let currentEvent = 'message';
      let currentData = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          currentData = line.slice(6);
        } else if (line === '') {
          if (currentData) {
            this.push({ event: currentEvent, data: currentData } as SSEEvent);
          }
          currentEvent = 'message';
          currentData = '';
        }
      }

      if (currentData) {
        this.push({ event: currentEvent, data: currentData } as SSEEvent);
      }
    }
    callback();
  }
}

// 解析 SSE 文本为事件数组 (用于 fetch ReadableStream)
export function parseSSEText(text: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const lines = text.split('\n');
  let currentEvent = 'message';
  let currentData = '';

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      currentData = line.slice(6);
    } else if (line === '') {
      if (currentData) {
        events.push({ event: currentEvent, data: currentData });
      }
      currentEvent = 'message';
      currentData = '';
    }
  }

  return events;
}
