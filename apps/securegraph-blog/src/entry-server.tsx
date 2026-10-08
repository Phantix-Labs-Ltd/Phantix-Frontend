/**
 * Build-time render of the Weekly (prerender.mjs).
 *
 * Crawlers and the first paint get the issue and every essay as real HTML
 * instead of an empty #root. `snapshot` loads the content the same way the
 * browser does (API, or the bundled launch issue) and primes the caches, so the
 * render below is synchronous data-wise. The browser mounts with createRoot
 * (src/main.tsx), which replaces this markup.
 */
import React from "react";
import { Writable } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import App from "./App";

export { API_MODE, setContentOrigin, snapshot } from "./lib/content";

/** Render `url` to HTML. */
export function render(url: string, timeoutMs = 20_000): Promise<string> {
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
      <StaticRouter location={url}>
        <App />
      </StaticRouter>,
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
