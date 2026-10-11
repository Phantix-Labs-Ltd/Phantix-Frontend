// One organization, one live signal.
//
// The operator product is four SPAs (Core / Attack / Defend / Code) over one
// backend. A finding discovered or fixed in Attack, a risk updated in Defend, an
// asset created in Core — each must land in the others without a manual refresh.
//
// Rather than every page opening its own stream, the shell keeps a single
// shared connection to the org command-centre stream and notifies subscribers,
// which re-fetch quietly. This is deliberately connection-cheap and
// event-agnostic: any event that is not a heartbeat means "some org data moved",
// and a page showing cached data revalidates.

import { API_BASE, isDemoMode, sessionAuthHeaders } from "./api";

type Listener = () => void;

const _listeners = new Set<Listener>();
let _started = false;
let _lastEmit = 0;
let _abort: AbortController | null = null;

/** Minimum gap between revalidations, so an event burst is one refresh. */
const EMIT_THROTTLE_MS = 2_000;
const RECONNECT_MS = 5_000;

function _emit(): void {
  const now = Date.now();
  if (now - _lastEmit < EMIT_THROTTLE_MS) return;
  _lastEmit = now;
  if (typeof document !== "undefined" && document.hidden) return;
  for (const listener of _listeners) {
    try {
      listener();
    } catch {
      /* a listener must never break the stream */
    }
  }
}

function _headers(): Record<string, string> {
  return { Accept: "text/event-stream", ...sessionAuthHeaders() };
}

async function _loop(): Promise<void> {
  for (;;) {
    if (_listeners.size === 0) return;
    try {
      _abort = new AbortController();
      const res = await fetch(`${API_BASE}/org/command-center/stream?replay=0`, {
        headers: _headers(),
        signal: _abort.signal,
      });
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";
        for (const chunk of chunks) {
          let event = "message";
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
          }
          if (event === "heartbeat" || event === "connected") continue;
          _emit();
        }
      }
    } catch {
      /* fall through to reconnect */
    }
    if (_listeners.size === 0) return;
    await new Promise((resolve) => setTimeout(resolve, RECONNECT_MS));
  }
}

/**
 * Subscribe to "some organization data changed". Returns an unsubscribe fn.
 *
 * The first subscriber opens the shared stream; the last one closes it. In demo
 * mode this is a no-op (there is no backend to stream from).
 */
export function onOrgDataChanged(listener: Listener): () => void {
  if (isDemoMode()) return () => {};
  _listeners.add(listener);
  if (!_started) {
    _started = true;
    void _loop();
  }
  return () => {
    _listeners.delete(listener);
    if (_listeners.size === 0 && _abort) {
      try {
        _abort.abort();
      } catch {
        /* ignore */
      }
      _abort = null;
      _started = false;
    }
  };
}
