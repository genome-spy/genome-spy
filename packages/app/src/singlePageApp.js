import { embed } from "./index.js";

// This is for development purposes. Use "npm start" to launch.

/**
 * @typedef {Window & typeof globalThis & {
 *     __genomeSpy?: {
 *         api: import("@genome-spy/core/types/embedApi.js").EmbedResult;
 *         readonly viewRoot: object | undefined;
 *     };
 * }} DevelopmentWindow
 */

const developmentWindow = /** @type {DevelopmentWindow} */ (window);

const searchParams = new URLSearchParams(window.location.search);
const specUrl = searchParams.get("spec");
const renderer =
    /** @type {import("./appTypes.js").AppEmbedOptions["renderer"]} */ (
        searchParams.get("renderer") ?? undefined
    );
if (specUrl) {
    const plugins = [];
    const { appInspector } = await import("@genome-spy/inspector");
    const agentBaseUrl = import.meta.env.VITE_AGENT_BASE_URL;

    plugins.push(appInspector());

    if (agentBaseUrl) {
        const { appAgent } = await import("@genome-spy/app-agent");
        plugins.push(appAgent({ baseUrl: agentBaseUrl }));
    }

    const api = await embed(document.body, specUrl, { plugins, renderer });
    developmentWindow.__genomeSpy = {
        api,
        get viewRoot() {
            return api.debug.getViewRoot();
        },
    };
} else {
    document.body.innerHTML = `
        <p style="color: firebrick">No 'spec' url parameter defined!</p>
        <p>Try this one from the "static" folder, for example:
        <a href="?spec=examples/core/first.json">examples/core/first.json</a></p>`;
}
