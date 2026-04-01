import { useCallback, useRef } from 'react';

interface SSEOptions {
  onEvent: (event: string, data: string) => void;
  onError?: (error: string) => void;
  onDone?: () => void;
}

export function useSSE() {
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async (response: Response, options: SSEOptions) => {
    const reader = response.body?.getReader();
    if (!reader) {
      options.onError?.('No response stream');
      return;
    }

    const abort = new AbortController();
    abortRef.current = abort;

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (!abort.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        buffer += text;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = 'message';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            options.onEvent(currentEvent, line.slice(6));
            currentEvent = 'message';
          }
        }
      }

      options.onDone?.();
    } catch (err: any) {
      if (!abort.signal.aborted) {
        options.onError?.(err.message || 'Stream error');
      }
    }
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  return { start, abort };
}
