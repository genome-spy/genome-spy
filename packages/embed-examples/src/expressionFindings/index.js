import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";
import "@genome-spy/core/rendering/canvas.js";
import "@genome-spy/core/rendering/svg.js";
import { createViewQuery } from "@genome-spy/core/view-query";
import { html, render } from "lit";
import { dataTable, formatValue, renderTrackInfo } from "../queryExamples.js";
import { contrastA, contrastB } from "./data.js";

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    name: "expression",
    title: "Toy expression contrast",
    description:
        "Prepared toy fold changes and significance scores for three pathways.",
    width: "container",
    height: "container",
    padding: 8,
    datasets: { expression: contrastA },
    data: { name: "expression" },
    params: [
        { name: "chosen", select: "point" },
        { name: "region", select: { type: "interval", encodings: ["x", "y"] } },
    ],
    mark: { type: "point", size: 85 },
    encoding: {
        key: { field: "gene" },
        opacity: {
            condition: { param: "chosen", empty: false, value: 1 },
            value: 0.2,
        },
        size: {
            condition: { param: "chosen", empty: false, value: 160 },
            value: 55,
        },
        x: {
            field: "log2FoldChange",
            type: "quantitative",
            title: "Log2 fold change",
            scale: { domain: [-3, 3], zoom: true },
        },
        y: {
            field: "negLog10Padj",
            type: "quantitative",
            title: "−log10 adjusted p-value score",
            scale: { domain: [0, 7], zoom: true },
        },
        color: {
            field: "pathway",
            type: "nominal",
            scale: {
                domain: ["Interferon", "Cell cycle", "Metabolism"],
                range: ["#be6042", "#4777a8", "#549579"],
            },
        },
    },
};

const renderer =
    new URLSearchParams(location.search).get("renderer") === "canvas"
        ? "canvas"
        : "webgl";
export const api = await embed(document.getElementById("plot"), spec, {
    renderer,
});
const query = createViewQuery(api.views);
const track = api.views.get({ scope: [], view: "expression" });
const scales = [track.getScaleResolution("x"), track.getScaleResolution("y")];
const brush = track.params.getSelection("region");
const selection = track.params.getSelection("chosen");
if (selection.type !== "point") throw new Error("Expected a point selection.");
const chosen = selection;
const form = /** @type {HTMLFormElement} */ (
    document.getElementById("controls")
);
const fold = /** @type {HTMLInputElement} */ (document.getElementById("fold"));
const score = /** @type {HTMLInputElement} */ (
    document.getElementById("score")
);
const scopeControl = /** @type {HTMLSelectElement} */ (
    document.getElementById("scope")
);
const contrast = /** @type {HTMLSelectElement} */ (
    document.getElementById("contrast")
);
const find = /** @type {HTMLButtonElement} */ (document.getElementById("find"));
const status = document.getElementById("status");
const results = document.getElementById("results");
const info = document.getElementById("track-info");
let controller = new AbortController();

/** @returns {import("@genome-spy/core/view-query").ViewQueryScopeOptions} */
function getScope() {
    return {
        channels: ["x", "y"],
        ...(scopeControl.value === "brush" ? { selection: "region" } : {}),
    };
}

/** Show the same membership used by conditional encodings, including clicks. */
function showSelection() {
    const { data } = chosen.getValue();
    document.getElementById("selection-status").textContent =
        data.length + " selected records.";
    render(
        html`
            <h2>Selected expression records</h2>
            <p>
                These are the records highlighted by the plot's conditional
                encodings.
            </p>
            ${dataTable(
                [
                    ["gene", "Gene"],
                    ["pathway", "Pathway"],
                    ["log2FoldChange", "Log2 fold change"],
                    ["negLog10Padj", "Score"],
                ],
                data
            )}
        `,
        results
    );
}

/** Cancel a previous read when its controls or captured scope change. */
function invalidate() {
    controller.abort();
    const scope = query.assessQuery(track, getScope());
    find.disabled = !form.checkValidity() || scope.status !== "ready";
    status.textContent =
        scope.status !== "ready"
            ? scope.status + ": " + scope.reason
            : "Scope or controls changed. Apply thresholds to update the selection.";
}

/** The host owns the thresholds; Core reads records and sets membership. */
async function highlightQualifying() {
    controller.abort();
    controller = new AbortController();
    const { signal } = controller;
    const minimumFold = fold.valueAsNumber;
    const minimumScore = score.valueAsNumber;
    status.textContent = "Reading the captured region…";
    try {
        const result = await query.queryData(track, {
            ...getScope(),
            fields: ["gene", "pathway", "log2FoldChange", "negLog10Padj"],
            limit: null,
            signal,
        });
        signal.throwIfAborted();
        const qualifying = result.rows.filter(
            (row) =>
                Math.abs(Number(row.log2FoldChange)) >= minimumFold &&
                Number(row.negLog10Padj) >= minimumScore
        );
        chosen.setValue(qualifying.map((row) => [String(row.gene)]));
        status.textContent = `${qualifying.length} of ${result.rowsMatched} records qualify in the captured region. Viewport x: ${result.scope.domains.x.map(formatValue).join("–")}; y: ${result.scope.domains.y.map(formatValue).join("–")}.${result.scope.selection ? " Also constrained by the brush." : ""}`;
        renderTrackInfo(query, track, info);
    } catch (error) {
        if (signal.aborted) return;
        status.textContent = String(error);
        console.error(error);
    }
}

form.addEventListener("submit", (event) => {
    event.preventDefault();
    void highlightQualifying();
});
fold.addEventListener("input", invalidate);
score.addEventListener("input", invalidate);
scopeControl.addEventListener("change", invalidate);
contrast.addEventListener("change", () => {
    controller.abort();
    // Membership refers to the current publication. The host decides when to
    // clear or reapply it after replacing data.
    chosen.clear();
    api.datasets.set(
        "expression",
        contrast.value === "A" ? contrastA : contrastB
    );
    invalidate();
    renderTrackInfo(query, track, info);
});
document
    .getElementById("clear-brush")
    .addEventListener("click", () => brush.clear());
document.getElementById("clear-selection").addEventListener("click", () => {
    controller.abort();
    chosen.clear();
    status.textContent =
        "Selection cleared. Apply thresholds to select records again.";
});
document.getElementById("download").addEventListener("click", async () => {
    const { blob } = await api.imageExport.svg();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "expression-findings.svg";
    link.click();
    URL.revokeObjectURL(url);
});
document.getElementById("reset-example").addEventListener("click", async () => {
    controller.abort();
    form.reset();
    brush.clear();
    chosen.clear();
    api.datasets.set("expression", contrastA);
    await Promise.all([scales[0].zoomTo([-3, 3]), scales[1].zoomTo([0, 7])]);
    invalidate();
    renderTrackInfo(query, track, info);
});
scales.forEach((scale) => scale.addEventListener("domain", invalidate));
const stopBrush = brush.subscribe(invalidate, { delivery: "commit" });
const stopChosen = chosen.subscribe(showSelection);

/** Release subscriptions and the embed when leaving the page. */
export function dispose() {
    controller.abort();
    scales.forEach((scale) => scale.removeEventListener("domain", invalidate));
    stopBrush();
    stopChosen();
    api.finalize();
}
window.addEventListener("pagehide", dispose, { once: true });
invalidate();
status.textContent =
    "Ready. Apply thresholds to highlight every qualifying record.";
renderTrackInfo(query, track, info);
showSelection();
