/**
 * Build-time render of SecureGraph Attack's public pages: the documentation
 * (prerender.mjs). Signed-in screens are not rendered here.
 */
import App from "./App";
import { renderAppAt } from "@sg/ssrRender";

export { docs } from "@sg/docs";

export const render = (url: string) => renderAppAt(<App />, url);
