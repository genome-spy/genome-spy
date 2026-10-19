import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";
import "@genome-spy/core/rendering/canvas.js";
import "@genome-spy/core/rendering/svg.js";
import {
    attachControls,
    pngButton,
    svgButton,
} from "@genome-spy/core/controls";

/** @typedef {import("@genome-spy/core/spec/config.js").ThemeColors} ThemeColors */

const container = /** @type {HTMLElement} */ (document.getElementById("plot"));
const appearance = /** @type {HTMLSelectElement} */ (
    document.getElementById("appearance")
);
const resolvedMode = document.getElementById("resolved-mode");
const state = document.getElementById("state");
const preference = matchMedia("(prefers-color-scheme: dark)");

function resolveMode() {
    const mode =
        appearance.value == "system"
            ? preference.matches
                ? "dark"
                : "light"
            : appearance.value;
    document.documentElement.dataset.theme = mode;
    resolvedMode.textContent = `Currently ${mode}${appearance.value == "system" ? " (system)" : ""}`;
}

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

resolveMode();

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    width: "container",
    height: 310,
    title: {
        text: "One visualization, two appearances",
        subtitle: "Inline example data / three miniature chromosomes",
    },
    genomes: {
        demo: {
            contigs: [
                { name: "chr1", size: 1_000_000 },
                { name: "chr2", size: 1_000_000 },
                { name: "chr3", size: 1_000_000 },
            ],
        },
    },
    assembly: "demo",
    params: [
        // Supply the current CSS palette before the first visualization frame.
        { name: "themeColors", value: readPalette(), persist: false },
        { name: "brush", select: { type: "interval", encodings: ["x"] } },
    ],
    config: {
        view: {
            fill: { expr: "themeColors.background" },
            stroke: { expr: "themeColors.stroke" },
            strokeWidth: 1,
        },
    },
    encoding: {
        x: {
            chrom: "chrom",
            pos: "pos",
            type: "locus",
            scale: {
                name: "genome",
                domain: [
                    { chrom: "chr1", pos: 0 },
                    { chrom: "chr3", pos: 999_999 },
                ],
                zoom: true,
            },
        },
        y: {
            field: "signal",
            type: "quantitative",
            scale: { domain: [0, 10] },
            title: "Signal",
        },
    },
    layer: [
        {
            data: { values: [{}] },
            mark: { type: "rule", size: 1.5, strokeDash: [4, 3] },
            encoding: {
                x: { value: 0 },
                x2: { value: 1 },
                y: { datum: 5, type: "quantitative" },
            },
        },
        {
            data: {
                values: [
                    { chrom: "chr1", pos: 120_000, end: 750_000, signal: 1 },
                    { chrom: "chr2", pos: 180_000, end: 900_000, signal: 1 },
                ],
            },
            mark: { type: "link", size: 2, arcHeightFactor: 0.3 },
            encoding: { x2: { chrom: "chrom", pos: "end" } },
        },
        {
            data: {
                values: Array.from({ length: 36 }, (_, i) => ({
                    chrom: "chr" + (Math.floor(i / 12) + 1),
                    pos: 60_000 + (i % 12) * 80_000,
                    signal: 3 + Math.sin(i * 0.7) * 2 + (i % 3),
                    evidence: (i % 9) / 8,
                    class: ["A", "B", "C"][i % 3],
                })),
            },
            mark: { type: "point", size: 95, filled: true, strokeWidth: 1 },
            encoding: {
                color: {
                    field: "evidence",
                    type: "quantitative",
                    scale: { scheme: "viridis" },
                    title: "Evidence",
                },
                shape: {
                    field: "class",
                    type: "nominal",
                    scale: { domain: ["A", "B", "C"] },
                    title: "Class",
                },
                opacity: {
                    condition: { param: "brush", value: 1 },
                    value: 0.3,
                },
            },
        },
        {
            data: { values: [{ chrom: "chr2", pos: 500_000 }] },
            mark: { type: "rule", color: "#e5484d", size: 2 },
            encoding: { y: { value: 0 }, y2: { value: 1 } },
        },
    ],
};

// This is the only embed() call: appearance changes write one live parameter.
const api = await embed(container, spec);
const colors =
    /** @type {import("@genome-spy/core/types/embedApi.js").ParamApi<ThemeColors>} */ (
        api.params.get("themeColors")
    );
const brush =
    /** @type {import("@genome-spy/core/types/embedApi.js").IntervalSelectionApi} */ (
        api.params.getSelection("brush")
    );
const genome = api.getScaleResolutionByName("genome");
if (!genome) throw new Error("Missing named scale: genome");
const controls = attachControls(container, api, {
    controls: [
        pngButton({
            filename: "genomespy-dark-mode",
            exportOptions: { pixelRatio: 2 },
        }),
        svgButton({ filename: "genomespy-dark-mode" }),
    ],
});

function syncAppearance() {
    resolveMode();
    colors.setValue(readPalette());
}

function onPreferenceChange() {
    if (appearance.value == "system") syncAppearance();
}

function showState() {
    const domain = genome
        .getDomain()
        .map((value) => Math.round(value).toLocaleString())
        .join("–");
    const interval = brush.getValue().intervals.x;
    const selection = interval
        ? interval
              .map((value) => Math.round(value).toLocaleString())
              .join("–") + " bp"
        : "clear";
    state.textContent = `Genome domain: ${domain} bp · Brush: ${selection}`;
}

appearance.disabled = false;
appearance.addEventListener("change", syncAppearance);
preference.addEventListener("change", onPreferenceChange);
genome.addEventListener("domain", showState);
const unsubscribeBrush = brush.subscribe(showState);
// A preference change during asynchronous initialization must not be missed.
syncAppearance();
showState();

window.addEventListener("pagehide", (event) => {
    if (event.persisted) return;

    appearance.removeEventListener("change", syncAppearance);
    preference.removeEventListener("change", onPreferenceChange);
    genome.removeEventListener("domain", showState);
    unsubscribeBrush();
    controls.dispose();
    api.finalize();
});
