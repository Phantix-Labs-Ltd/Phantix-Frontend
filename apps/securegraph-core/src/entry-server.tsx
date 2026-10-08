/**
 * Build-time render of Core's public pages (prerender.mjs).
 *
 * Crawlers and the first paint get real HTML for the home page, the docs and
 * the policies instead of an empty #root. The browser still mounts with
 * createRoot (src/main.tsx), which replaces this markup, so a prerendered page
 * can never cause a hydration mismatch. Signed-in screens are not rendered here.
 */
import React from "react";
import { Writable } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import { MotionConfig } from "framer-motion";
import App from "./App";

export { docs } from "@sg/docs";
export { PUBLIC_PATHS } from "./lib/useSeo";

/** Render `url` once every lazy page under it has resolved. */
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
      <MotionConfig reducedMotion="user">
        <StaticRouter location={url}>
          <App />
        </StaticRouter>
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
