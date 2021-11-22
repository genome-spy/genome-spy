import { embed } from "./app/index";

// This is for development purposes. Use "npm start" to launch.

const specUrl = new URLSearchParams(window.location.search).get("spec");
if (specUrl) {
    embed(document.body, specUrl);
} else {
    document.body.innerHTML = `
        <p style="color: firebrick">No 'spec' url parameter defined!</p>
        <p>Try this one from the "static" folder, for example:
        <a href="?spec=examples/first.json">examples/first.json</a></p>`;
}
