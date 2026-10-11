/**
 * Build-time render of Core's public pages (prerender.mjs): the home page,
 * the docs and the policies. Signed-in screens are not rendered here.
 */
import App from "./App";
import { renderAppAt } from "@sg/ssrRender";

export { docs } from "@sg/docs";
export { PUBLIC_PATHS } from "./lib/useSeo";

export const render = (url: string) => renderAppAt(<App />, url);
