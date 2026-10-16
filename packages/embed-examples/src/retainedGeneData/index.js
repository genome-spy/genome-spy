import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";
import "@genome-spy/core/rendering/canvas.js";
import { createViewQuery } from "@genome-spy/core/view-query";
import { html, render } from "lit";
import { dataTable, renderTrackInfo } from "../queryExamples.js";
import { genes } from "./data.js";

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    name: "genes",
    title: "Toy genes in prepared lanes",
    description:
        "A display filter hides lanes without removing loaded source rows.",
    width: "container",
    height: "container",
    padding: 8,
    params: [{ name: "shownLanes", value: 2 }],
    data: { values: genes, retainForInspection: true },
    transform: [{ type: "filter", expr: "datum.lane < shownLanes" }],
    mark: { type: "rule", size: 10 },
    encoding: {
        x: {
            field: "startKb",
            type: "quantitative",
            title: "Toy locus position (kb)",
            scale: { domain: [0, 1200], zoom: true },
        },
        x2: { field: "endKb" },
        y: {
            field: "lane",
            type: "quantitative",
            title: "Prepared lane",
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
const track = api.views.get({ scope: [], view: "genes" });
const lanes = /** @type {HTMLSelectElement} */ (
    document.getElementById("lanes")
);
const shownLanes = api.params.get("shownLanes");
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
        const kept = new Set(transformed.rows.map((row) => row.gene));
        const compared = source.rows.map((row) => ({
            ...row,
            display: kept.has(row.gene)
                ? "Kept by filter"
                : "Removed by filter",
        }));
        render(
            html`
                <div class="query-workspace">
                    <div id="source-rows">
                        <h2>Loaded before the display filter</h2>
                        <p data-testid="source-count">
                            ${source.rows.length} retained genes
                        </p>
                        ${dataTable(
                            [
                                ["gene", "Gene"],
                                ["lane", "Lane"],
                                ["display", "Display filter"],
                            ],
                            compared
                        )}
                    </div>
                    <div id="transformed-rows">
                        <h2>After the display filter</h2>
                        <p data-testid="transformed-count">
                            ${transformed.rows.length} genes kept by the filter
                        </p>
                        ${dataTable(
                            [
                                ["gene", "Gene"],
                                ["startKb", "Start (kb)"],
                                ["endKb", "End (kb)"],
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

lanes.addEventListener("change", () =>
    shownLanes.setValue(Number(lanes.value))
);
const stopLanes = shownLanes.subscribe(scheduleRefresh);
document.getElementById("reset").addEventListener("click", async () => {
    lanes.value = "2";
    shownLanes.setValue(2);
    await track.getScaleResolution("x").zoomTo([0, 1200]);
    scheduleRefresh();
});

/** Release the retained-data embed and all example-owned subscriptions. */
export function dispose() {
    cancelAnimationFrame(refreshFrame);
    stopLanes();
    api.finalize();
}
window.addEventListener("pagehide", dispose, { once: true });
refresh();
