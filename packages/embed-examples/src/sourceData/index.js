import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";
import "@genome-spy/core/rendering/canvas.js";
import { createViewQuery } from "@genome-spy/core/view-query";
import { html, render } from "lit";
import { dataTable, renderTrackInfo } from "../queryExamples.js";
import { records } from "./data.js";

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    name: "records",
    title: "Source rows and filtered rows",
    description:
        "A display filter hides categories without removing loaded source rows.",
    width: "container",
    height: "container",
    padding: 8,
    params: [{ name: "categoryCount", value: 2 }],
    data: { values: records, retainForInspection: true },
    transform: [{ type: "filter", expr: "datum.category < categoryCount" }],
    mark: { type: "rule", size: 10 },
    encoding: {
        x: {
            field: "start",
            type: "quantitative",
            title: "X coordinate",
            scale: { domain: [0, 1200], zoom: true },
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
const query = createViewQuery(api.views);
const track = api.views.get({ scope: [], view: "records" });
const categories = /** @type {HTMLSelectElement} */ (
    document.getElementById("categories")
);
const categoryCount = api.params.get("categoryCount");
const status = document.getElementById("status");
const results = document.getElementById("results");
let refreshFrame = 0;

/** Read complete toy tables, then compare only the returned identifiers. */
function refresh() {
    refreshFrame = 0;
    try {
        const source = query.readSourceData(track, { limit: null });
        const transformed = query.readData(track, { limit: 1000 });
        if (source.truncated || transformed.truncated)
            throw new Error(
                "This comparison requires complete inspection tables."
            );
        const kept = new Set(transformed.rows.map((row) => row.id));
        const compared = source.rows.map((row) => ({
            ...row,
            display: kept.has(row.id) ? "Kept by filter" : "Removed by filter",
        }));
        render(
            html`
                <div class="query-workspace">
                    <div id="source-rows">
                        <h2>Loaded before the display filter</h2>
                        <p data-testid="source-count">
                            ${source.rows.length} retained records
                        </p>
                        ${dataTable(
                            [
                                ["id", "Record"],
                                ["category", "Category"],
                                ["display", "Display filter"],
                            ],
                            compared
                        )}
                    </div>
                    <div id="transformed-rows">
                        <h2>After the display filter</h2>
                        <p data-testid="transformed-count">
                            ${transformed.rows.length} records kept by the
                            filter
                        </p>
                        ${dataTable(
                            [
                                ["id", "Record"],
                                ["start", "Start"],
                                ["end", "End"],
                            ],
                            transformed.rows
                        )}
                    </div>
                </div>
                <details>
                    <summary>Source and transformed API responses</summary>
                    <pre>
${JSON.stringify({ source, transformed }, null, 2)}</pre>
                </details>
            `,
            results
        );
        renderTrackInfo(query, track, document.getElementById("track-info"));
        status.textContent =
            "Inspection current. Both tables contain loaded rows, independent of zoom.";
    } catch (error) {
        status.textContent = String(error);
        render(html`<p>Inspection failed. ${String(error)}</p>`, results);
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
const stopCategories = categoryCount.subscribe(scheduleRefresh);
document.getElementById("reset").addEventListener("click", async () => {
    categories.value = "2";
    categoryCount.setValue(2);
    await track.getScaleResolution("x").zoomTo([0, 1200]);
    scheduleRefresh();
});

/** Release the retained-data embed and all example-owned subscriptions. */
export function dispose() {
    cancelAnimationFrame(refreshFrame);
    stopCategories();
    api.finalize();
}
window.addEventListener("pagehide", dispose, { once: true });
refresh();
