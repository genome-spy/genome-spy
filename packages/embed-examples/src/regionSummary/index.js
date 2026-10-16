import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";
import "@genome-spy/core/rendering/canvas.js";
import { createViewQuery } from "@genome-spy/core/view-query";
import { html, render } from "lit";
import { dataTable, formatValue, renderTrackInfo } from "../queryExamples.js";
import { observations } from "./data.js";

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    name: "signal",
    title: "Read records in a range",
    description: "A toy signal with high, low, and baseline ranges.",
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
            field: "x",
            type: "quantitative",
            title: "X coordinate",
            scale: { domain: [0, 1200], zoom: true },
        },
        y: {
            field: "value",
            type: "quantitative",
            title: "Value",
            scale: { domain: [-1, 1] },
        },
        color: {
            field: "state",
            type: "nominal",
            scale: {
                domain: ["high", "low", "baseline"],
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
const track = api.views.get({ scope: [], view: "signal" });
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
            fields: ["id", "x", "value"],
            limit: null,
            signal,
        });
        signal.throwIfAborted();
        // Analysis belongs to this example. Core only reads the scoped records.
        const values = result.rows.map((row) => Number(row.value));
        const count = values.length;
        const mean = count
            ? values.reduce((sum, value) => sum + value, 0) / count
            : null;
        const min = count ? Math.min(...values) : null;
        const max = count ? Math.max(...values) : null;
        const preview = result.rows.slice(0, 5);
        status.textContent = "Summary current.";
        render(
            html`
                <h2>Range summary</h2>
                <p>
                    Viewport:
                    ${result.scope.domains.x.map(formatValue).join("–")}
                    ${result.scope.selection ? html`; brush: ${result.scope.selection.value.intervals.x ? result.scope.selection.value.intervals.x.map(formatValue).join("–") : "cleared"}` : ""}
                </p>
                <dl>
                    <dt>Matching records</dt>
                    <dd data-testid="count">${count}</dd>
                    <dt>Mean value</dt>
                    <dd data-testid="mean">${formatValue(mean)}</dd>
                    <dt>Minimum / maximum</dt>
                    <dd>${formatValue(min)} / ${formatValue(max)}</dd>
                </dl>
                <p data-testid="preview-count">
                    Showing ${preview.length} of ${result.rowsMatched} matching
                    records.
                </p>
                ${dataTable(
                    [
                        ["id", "Record"],
                        ["x", "X coordinate"],
                        ["value", "Value"],
                    ],
                    preview
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
    .getElementById("high")
    .addEventListener("click", () => void navigate([300, 500]));
document
    .getElementById("low")
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

/** Release subscriptions and the embed when leaving the page. */
export function dispose() {
    controller.abort();
    scale.removeEventListener("domain", onDomain);
    stopBrush();
    api.finalize();
}
window.addEventListener("pagehide", dispose, { once: true });
await refresh();
