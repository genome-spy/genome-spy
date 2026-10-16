import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";
import "@genome-spy/core/rendering/canvas.js";
import { html, render } from "lit";
import { dataTable } from "../queryExamples.js";

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    name: "records",
    title: "Read transformed records",
    description:
        "Core loads a file, filters categories, and calculates interval lengths.",
    width: "container",
    height: "container",
    padding: 8,
    params: [{ name: "categoryCount", value: 2 }],
    data: { url: new URL("./data.json", import.meta.url).href },
    transform: [
        { type: "filter", expr: "datum.category < categoryCount" },
        { type: "formula", expr: "datum.end - datum.start", as: "length" },
    ],
    mark: { type: "rule", size: 10 },
    encoding: {
        x: {
            field: "start",
            type: "quantitative",
            title: "X coordinate",
            scale: { name: "position", domain: [0, 1200], zoom: true },
        },
        x2: { field: "end" },
        y: {
            field: "category",
            type: "quantitative",
            title: "Category",
            axis: { values: [0, 1, 2] },
            scale: { domain: [-0.5, 2.5] },
        },
        color: { value: "#4777a8" },
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
const categories = /** @type {HTMLSelectElement} */ (
    document.getElementById("categories")
);
const categoryCount = api.params.get("categoryCount");
const status = document.getElementById("status");
const results = document.getElementById("results");
let refreshFrame = 0;

/** The page never loads the input file or repeats Core's filter/formula. */
function refresh() {
    refreshFrame = 0;
    try {
        const result = track.readData({ limit: 100 });
        if (result.truncated)
            throw new Error(
                "Increase the read limit to show the complete table."
            );
        render(
            html`
                <h2>Records after Core transforms</h2>
                <p data-testid="transformed-count">
                    ${result.rows.length} records kept by the filter
                </p>
                ${dataTable(
                    [
                        ["id", "Record"],
                        ["start", "Start"],
                        ["end", "End"],
                        ["category", "Category"],
                        ["length", "Core-derived length"],
                    ],
                    result.rows
                )}
                <details>
                    <summary>Readback response</summary>
                    <pre>${JSON.stringify(result, null, 2)}</pre>
                </details>
            `,
            results
        );
        status.textContent =
            "Readback current. Changing categoryCount changes the records returned by Core.";
    } catch (error) {
        status.textContent = String(error);
        console.error(error);
    }
}

/** Let the parameter's dataflow effects publish before reading the collector. */
function scheduleRefresh() {
    cancelAnimationFrame(refreshFrame);
    status.textContent = "Updating the display filter…";
    refreshFrame = requestAnimationFrame(refresh);
}

categories.addEventListener("change", () =>
    categoryCount.setValue(Number(categories.value))
);
// URL-backed filters replay asynchronously. Existing loading observations
// tell the app when the transformed publication can be read again.
const stopLoading = api.dataLoading.subscribe(() => {
    if (
        api.dataLoading
            .getSnapshot()
            .every((entry) => entry.status === "complete")
    )
        scheduleRefresh();
});
document.getElementById("reset").addEventListener("click", async () => {
    categories.value = "2";
    categoryCount.setValue(2);
    await api.getScaleResolutionByName("position").zoomTo([0, 1200]);
});

/** Release the embed and all example-owned subscriptions. */
export function dispose() {
    cancelAnimationFrame(refreshFrame);
    stopLoading();
    api.finalize();
}
window.addEventListener("pagehide", dispose, { once: true });
refresh();
