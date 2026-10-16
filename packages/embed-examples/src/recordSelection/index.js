import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";
import "@genome-spy/core/rendering/canvas.js";
import "@genome-spy/core/rendering/svg.js";
import { html, render } from "lit";
import { dataTable, formatValue } from "../queryExamples.js";

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    name: "records",
    title: "Select records by key",
    description: "Twelve toy records with x/y coordinates and three groups.",
    width: "container",
    height: "container",
    padding: 8,
    data: { url: new URL("./data.json", import.meta.url).href },
    params: [
        { name: "chosen", select: "point" },
        { name: "region", select: { type: "interval", encodings: ["x", "y"] } },
    ],
    mark: { type: "point", size: 85 },
    encoding: {
        key: { field: "id" },
        opacity: {
            condition: { param: "chosen", empty: false, value: 1 },
            value: 0.2,
        },
        size: {
            condition: { param: "chosen", empty: false, value: 160 },
            value: 55,
        },
        x: {
            field: "x",
            type: "quantitative",
            title: "X value",
            scale: { name: "x", domain: [0, 3], zoom: true },
        },
        y: {
            field: "y",
            type: "quantitative",
            title: "Y value",
            scale: { name: "y", domain: [0, 7], zoom: true },
        },
        color: {
            field: "group",
            type: "nominal",
            scale: {
                domain: ["Group A", "Group B", "Group C"],
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
const track = api.views.get({ scope: [], view: "records" });
const scales = [
    api.getScaleResolutionByName("x"),
    api.getScaleResolutionByName("y"),
];
const region = track.params.getSelection("region");
if (region.type !== "interval")
    throw new Error("Expected an interval selection.");
const brush = region;
const selection = track.params.getSelection("chosen");
if (selection.type !== "point") throw new Error("Expected a point selection.");
const chosen = selection;
const form = /** @type {HTMLFormElement} */ (
    document.getElementById("controls")
);
const minimumXInput = /** @type {HTMLInputElement} */ (
    document.getElementById("minimum-x")
);
const minimumYInput = /** @type {HTMLInputElement} */ (
    document.getElementById("minimum-y")
);
const scopeControl = /** @type {HTMLSelectElement} */ (
    document.getElementById("scope")
);
const find = /** @type {HTMLButtonElement} */ (document.getElementById("find"));
const status = document.getElementById("status");
const results = document.getElementById("results");
let controller = new AbortController();

/** Show the same membership used by conditional encodings, including clicks. */
function showSelection() {
    const { data } = chosen.getValue();
    document.getElementById("selection-status").textContent =
        data.length + " selected records.";
    render(
        html`
            <h2>Selected records</h2>
            <p>
                These are the records highlighted by the plot's conditional
                encodings.
            </p>
            ${dataTable(
                [
                    ["id", "Record"],
                    ["group", "Group"],
                    ["x", "X value"],
                    ["y", "Y value"],
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
    find.disabled = !form.checkValidity();
    status.textContent =
        "Scope or controls changed. Apply thresholds to update the selection.";
}

/** The host owns the thresholds; Core reads records and sets membership. */
async function highlightQualifying() {
    controller.abort();
    controller = new AbortController();
    const { signal } = controller;
    const minimumX = minimumXInput.valueAsNumber;
    const minimumY = minimumYInput.valueAsNumber;
    status.textContent = "Reading the captured region…";
    try {
        await api.awaitVisibleLazyData(signal);
        signal.throwIfAborted();
        const result = track.readData({ limit: 10000 });
        if (result.truncated)
            throw new Error(
                "Increase the read limit before selecting all matches."
            );
        const domains = scales.map((scale) => scale.getDomain());
        const intervals = brush.getValue().intervals;
        const rows = result.rows.filter((row) =>
            /** @type {("x" | "y")[]} */ (["x", "y"]).every((field, i) => {
                const value = Number(row[field]);
                const domain = domains[i];
                const interval = intervals[field];
                return (
                    value >= domain[0] &&
                    value <= domain[1] &&
                    (scopeControl.value !== "brush" ||
                        (interval &&
                            value >= interval[0] &&
                            value <= interval[1]))
                );
            })
        );
        const qualifying = rows.filter(
            (row) => Number(row.x) >= minimumX && Number(row.y) >= minimumY
        );
        chosen.setValue(qualifying.map((row) => [String(row.id)]));
        status.textContent = `${qualifying.length} of ${rows.length} records qualify. Viewport x: ${domains[0].map(formatValue).join("–")}; y: ${domains[1].map(formatValue).join("–")}.`;
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
minimumXInput.addEventListener("input", invalidate);
minimumYInput.addEventListener("input", invalidate);
scopeControl.addEventListener("change", invalidate);
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
    link.download = "selected-records.svg";
    link.click();
    URL.revokeObjectURL(url);
});
document.getElementById("reset-example").addEventListener("click", async () => {
    controller.abort();
    form.reset();
    brush.clear();
    chosen.clear();
    await Promise.all([scales[0].zoomTo([0, 3]), scales[1].zoomTo([0, 7])]);
    invalidate();
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
showSelection();
