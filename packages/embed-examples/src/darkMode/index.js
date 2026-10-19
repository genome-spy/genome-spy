import { embed } from "@genome-spy/core";
import plotSpec from "./plotSpec.js";

const container = /** @type {HTMLElement} */ (document.getElementById("plot"));
const appearance = /** @type {HTMLSelectElement} */ (
    document.getElementById("appearance")
);
const resolvedMode = document.getElementById("resolved-mode");
const preference = matchMedia("(prefers-color-scheme: dark)");

// The host controls its page through CSS. Light/Dark force color-scheme;
// Custom also overrides GenomeSpy's CSS color properties (see style.scss).
function updatePageTheme() {
    document.documentElement.dataset.appearance = appearance.value;
    updateLabel();
}

function updateLabel() {
    const systemMode = preference.matches ? "dark" : "light";
    const mode = appearance.value === "system" ? systemMode : appearance.value;
    resolvedMode.textContent = "Currently " + mode;
}

updatePageTheme();
// No palette declaration or parameter updates: GenomeSpy reads the CSS and
// observes browser preference and host attribute changes on the existing embed.
await embed(container, plotSpec);

appearance.disabled = false;
appearance.addEventListener("change", updatePageTheme);
// This listener only updates the label; GenomeSpy handles its own mode changes.
preference.addEventListener("change", updateLabel);
updateLabel();
