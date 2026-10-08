import { useEffect, useState } from 'react';
import { config } from '@/utils/config';
import type { SignalingClient } from '@/services/signaling/client';

export function useLatency(enabled: boolean, client: SignalingClient, intervalMs = 3000) {
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const ms = await client.measureLatency();
        if (!cancelled) setLatencyMs(ms);
      } catch {
        if (!cancelled) setLatencyMs(null);
      }
    };

    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, intervalMs, client]);

  return latencyMs;
}

export function useDevMode() {
  return config.isDev;
}
