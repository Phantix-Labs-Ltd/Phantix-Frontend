/**
 * Build-time render of an app's public pages (see vite/prerender.mjs).
 *
 * Each app's src/entry-server.tsx passes its <App/> here. The browser still
 * mounts with createRoot (src/main.tsx), which replaces this markup, so a
 * prerendered page can never cause a hydration mismatch. Signed-in screens are
 * not rendered here.
 */
import React from "react";
import { Writable } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { MotionConfig } from "framer-motion";

/** Render `app` at `url` once every lazy page under it has resolved. */
export function renderAppAt(app: React.ReactNode, url: string, timeoutMs = 20_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let html = "";
    const sink = new Writable({
      write(chunk, _encoding, done) {
        html += chunk.toString();
        done();
      },
      final(done) {
        resolve(html);
        done();
      },
    });
    const stream = renderToPipeableStream(
      <MotionConfig reducedMotion="user">
        <StaticRouter location={url}>{app}</StaticRouter>
      </MotionConfig>,
      {
        onAllReady() {
          stream.pipe(sink);
        },
        onShellError: reject,
        onError(error) {
          reject(error);
        },
      },
    );
    setTimeout(() => {
      stream.abort();
      reject(new Error(`prerender of ${url} timed out`));
    }, timeoutMs).unref();
  });
}
