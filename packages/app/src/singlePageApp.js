import { embed } from "./index.js";

// This is for development purposes. Use "npm start" to launch.

const specUrl = new URLSearchParams(window.location.search).get("spec");
if (specUrl) {
    const plugins = [];
    const agentBaseUrl = import.meta.env.VITE_AGENT_BASE_URL;

    if (agentBaseUrl) {
        const { appAgent } = await import("@genome-spy/app-agent");
        plugins.push(appAgent({ baseUrl: agentBaseUrl }));
    }

    const mlBaseUrl = import.meta.env.VITE_ML_BASE_URL;
    const mlFastaUrl = import.meta.env.VITE_ML_FASTA_URL;
    if (mlBaseUrl && mlFastaUrl) {
        const { mlPlugin } = await import("@genome-spy/app-agent");
        plugins.push(mlPlugin({ baseUrl: mlBaseUrl, fastaUrl: mlFastaUrl }));
    }

    embed(document.body, specUrl, { plugins });
} else {
    document.body.innerHTML = `
        <p style="color: firebrick">No 'spec' url parameter defined!</p>
        <p>Try this one from the "static" folder, for example:
        <a href="?spec=examples/core/first.json">examples/core/first.json</a></p>`;
}
