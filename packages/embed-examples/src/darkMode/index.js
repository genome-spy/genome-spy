import { embed } from "@genome-spy/core";
import plotSpec from "./plotSpec.js";

/** @typedef {import("@genome-spy/core/spec/config.js").ThemeColors} ThemeColors */

const container = /** @type {HTMLElement} */ (document.getElementById("plot"));
const appearance = /** @type {HTMLSelectElement} */ (
    document.getElementById("appearance")
);
const resolvedMode = document.getElementById("resolved-mode");
const preference = matchMedia("(prefers-color-scheme: dark)");

// 1. Let the host choose the appearance. data-theme selects the CSS palette in
// style.scss; an explicit Light or Dark choice takes precedence over the OS.
function updatePageTheme() {
    const systemMode = preference.matches ? "dark" : "light";
    const mode = appearance.value == "system" ? systemMode : appearance.value;
    document.documentElement.dataset.theme = mode;
    resolvedMode.textContent = "Currently " + mode;
}

// 2. Rendered marks don't inherit CSS colors. Read concrete colors from the host
// element and collect all six roles into GenomeSpy's themeColors palette.
/** @returns {ThemeColors} */
function readPalette() {
    const css = getComputedStyle(container);
    /** @param {string} name */
    const read = (name) => css.getPropertyValue("--gs-" + name).trim();
    return {
        foreground: read("foreground"),
        stroke: read("stroke"),
        grid: read("grid"),
        chromosomeTick: read("chromosome-tick"),
        symbolStroke: read("symbol-stroke"),
        background: read("background"),
    };
}

// 3. Choose the palette before embedding so the first frame matches the page.
// persist: false keeps host appearance out of saved interaction state.
updatePageTheme();
const api = await embed(container, {
    ...plotSpec,
    params: [
        { name: "themeColors", value: readPalette(), persist: false },
        { name: "brush", select: { type: "interval", encodings: ["x"] } },
    ],
});

/** @type {import("@genome-spy/core/types/embedApi.js").ParamApi<ThemeColors>} */
const colors = api.params.get("themeColors");

// 4. Update the existing embed by replacing the whole palette object. Mutating
// individual fields would not notify GenomeSpy. Zoom and brushing stay intact.
function updateTheme() {
    updatePageTheme();
    colors.setValue(readPalette());
}

appearance.disabled = false;
appearance.addEventListener("change", updateTheme);
preference.addEventListener("change", updateTheme);
// The OS preference may have changed while await embed() was initializing.
updateTheme();
