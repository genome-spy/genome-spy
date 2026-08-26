import { embed } from "./index.js";

// This is for development purposes. Use "npm start" to launch.

const searchParams = new URLSearchParams(window.location.search);
const specUrl = searchParams.get("spec");
const renderer =
    /** @type {import("./types/embedApi.js").EmbedOptions["renderer"]} */ (
        searchParams.get("renderer") ?? undefined
    );
if (specUrl) {
    embed(document.body, specUrl, { renderer });
} else {
    document.body.innerHTML = `
        <p style="color: firebrick">No 'spec' url parameter defined!</p>
        <p>Try this one from the "static" folder, for example:
        <a href="?spec=examples/core/first.json&renderer=webgpu">examples/core/first.json with WebGPU</a></p>`;
}
