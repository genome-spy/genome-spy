import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";
import "@genome-spy/core/rendering/canvas.js";
import { createViewQuery } from "@genome-spy/core/view-query";
import { html, render } from "lit";
import { dataTable, formatValue, renderTrackInfo } from "../queryExamples.js";
import { observations } from "./data.js";

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    name: "copyNumber",
    title: "Toy copy number signal",
    description: "A synthetic locus with gain, loss, and neutral regions.",
    width: "container",
    height: "container",
    padding: 8,
    params: [
        { name: "region", select: { type: "interval", encodings: ["x"] } },
    ],
    data: { values: observations },
    mark: { type: "point", size: 55 },
    encoding: {
        x: {
            field: "positionKb",
            type: "quantitative",
            title: "Toy locus position (kb)",
            scale: { domain: [0, 1200], zoom: true },
        },
        y: {
            field: "log2Ratio",
            type: "quantitative",
            title: "Log2 ratio",
            scale: { domain: [-1, 1] },
        },
        color: {
            field: "state",
            type: "nominal",
            scale: {
                domain: ["gain", "loss", "neutral"],
                range: ["#bd5b35", "#426fa4", "#858585"],
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
const track = api.views.get({ scope: [], view: "copyNumber" });
const scale = track.getScaleResolution("x");
const brush = api.params.getSelection("region");
const scopeControl = /** @type {HTMLSelectElement} */ (
    document.getElementById("scope")
);
const status = document.getElementById("status");
const results = document.getElementById("results");
const info = document.getElementById("track-info");
let controller = new AbortController();

/** Replaces obsolete work so a slow response cannot overwrite a newer scope. */
async function refresh() {
    controller.abort();
    controller = new AbortController();
    const { signal } = controller;
    const scope = {
        channels: /** @type {("x" | "y")[]} */ (["x"]),
        ...(scopeControl.value === "brush" ? { selection: "region" } : {}),
    };
    renderTrackInfo(query, track, info);
    const assessment = query.assessQuery(track, scope);
    if (assessment.status !== "ready") {
        status.textContent = assessment.status + ": " + assessment.reason;
        render(html`<p>Summary unavailable for this scope.</p>`, results);
        return;
    }
    status.textContent = "Updating summary…";
    render(html`<p>Updating results for the current region…</p>`, results);
    try {
        const result = await query.queryData(track, {
            ...scope,
            fields: ["id", "positionKb", "log2Ratio"],
            limit: 5,
            aggregate: [
                { op: "count", as: "count" },
                { op: "mean", field: "log2Ratio", as: "mean" },
                { op: "min", field: "log2Ratio", as: "min" },
                { op: "max", field: "log2Ratio", as: "max" },
            ],
            signal,
        });
        signal.throwIfAborted();
        status.textContent = "Summary current.";
        render(
            html`
                <h2>Region summary</h2>
                <p>
                    Viewport:
                    ${result.scope.domains.x.map(formatValue).join("–")}
                    kb${result.scope.selection ? html`; brush: ${result.scope.selection.value.intervals.x ? result.scope.selection.value.intervals.x.map(formatValue).join("–") + " kb" : "cleared"}` : ""}
                </p>
                <dl>
                    <dt>Matching bins</dt>
                    <dd data-testid="count">${result.aggregates.count}</dd>
                    <dt>Mean log2 ratio</dt>
                    <dd data-testid="mean">
                        ${formatValue(result.aggregates.mean)}
                    </dd>
                    <dt>Minimum / maximum</dt>
                    <dd>
                        ${formatValue(result.aggregates.min)} /
                        ${formatValue(result.aggregates.max)}
                    </dd>
                </dl>
                <p data-testid="preview-count">
                    Showing ${result.rows.length} of ${result.rowsMatched}
                    matching bins.
                </p>
                ${dataTable(
                    [
                        ["id", "Bin"],
                        ["positionKb", "Position (kb)"],
                        ["log2Ratio", "Log2 ratio"],
                    ],
                    result.rows
                )}
                <details>
                    <summary>Captured query response</summary>
                    <pre>${JSON.stringify(result, null, 2)}</pre>
                </details>
            `,
            results
        );
    } catch (error) {
        if (signal.aborted) return;
        status.textContent = String(error);
        render(html`<p>Query failed. ${String(error)}</p>`, results);
        console.error(error);
    }
}

/** @param {number[]} domain */
async function navigate(domain) {
    await scale.zoomTo(domain);
    await refresh();
}

document
    .getElementById("whole")
    .addEventListener("click", () => void navigate([0, 1200]));
document
    .getElementById("gain")
    .addEventListener("click", () => void navigate([300, 500]));
document
    .getElementById("loss")
    .addEventListener("click", () => void navigate([800, 950]));
document
    .getElementById("clear-brush")
    .addEventListener("click", () => brush.clear());
scopeControl.addEventListener("change", () => void refresh());
document.getElementById("reset").addEventListener("click", () => {
    scopeControl.value = "viewport";
    brush.clear();
    void navigate([0, 1200]);
});
const onDomain = () => {
    void refresh();
};
scale.addEventListener("domain", onDomain);
const stopBrush = brush.subscribe(() => void refresh(), { delivery: "commit" });

/** Release subscriptions, query annotations, and the embed when leaving the page. */
export function dispose() {
    controller.abort();
    scale.removeEventListener("domain", onDomain);
    stopBrush();
    query.annotations.dispose();
    api.finalize();
}
window.addEventListener("pagehide", dispose, { once: true });
await refresh();
