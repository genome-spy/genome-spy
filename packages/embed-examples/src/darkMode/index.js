import { embed } from "@genome-spy/core";
import plotSpec from "./plotSpec.js";

const container = /** @type {HTMLElement} */ (document.getElementById("plot"));
const appearance = /** @type {HTMLSelectElement} */ (
    document.getElementById("appearance")
);

// The host controls its page through CSS. Light/Dark force color-scheme;
// Custom also overrides GenomeSpy's CSS color properties (see style.scss).
function updatePageTheme() {
    document.documentElement.dataset.appearance = appearance.value;
}

updatePageTheme();
// No palette declaration or parameter updates: GenomeSpy reads the CSS and
// observes browser preference and host attribute changes on the existing embed.
await embed(container, plotSpec);

appearance.disabled = false;
appearance.addEventListener("change", updatePageTheme);
