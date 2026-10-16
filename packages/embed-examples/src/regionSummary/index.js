import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";
import "@genome-spy/core/rendering/canvas.js";
import { html, render } from "lit";
import { dataTable, formatValue } from "../queryExamples.js";

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
    data: { url: new URL("./data.json", import.meta.url).href },
    transform: [{ type: "formula", expr: "datum.value * 100", as: "percent" }],
    mark: { type: "point", size: 55 },
    encoding: {
        x: {
            field: "x",
            type: "quantitative",
            title: "X coordinate",
            scale: { name: "position", domain: [0, 1200], zoom: true },
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
const track = api.views.get({ scope: [], view: "signal" });
const scale = api.getScaleResolutionByName("position");
const region = api.params.getSelection("region");
if (region.type !== "interval")
    throw new Error("Expected an interval selection.");
const brush = region;
const scopeControl = /** @type {HTMLSelectElement} */ (
    document.getElementById("scope")
);
const status = document.getElementById("status");
const results = document.getElementById("results");
let controller = new AbortController();

/** Read once, then interpret this example's numeric coordinates in page code. */
async function refresh() {
    controller.abort();
    controller = new AbortController();
    const { signal } = controller;
    try {
        await api.awaitVisibleLazyData(signal);
        signal.throwIfAborted();
        const result = track.readData({ limit: 10000 });
        if (result.truncated)
            throw new Error(
                "Increase the read limit before computing statistics."
            );
        const domain = scale.getDomain();
        const interval = brush.getValue().intervals.x;
        // These are point coordinates. The application defines inclusive bounds
        // and requires a nonempty brush when brush mode is selected.
        const rows = result.rows.filter(
            (row) =>
                Number(row.x) >= domain[0] &&
                Number(row.x) <= domain[1] &&
                (scopeControl.value !== "brush" ||
                    (interval &&
                        Number(row.x) >= interval[0] &&
                        Number(row.x) <= interval[1]))
        );
        const values = rows.map((row) => Number(row.value));
        const count = rows.length;
        const mean = count
            ? values.reduce((sum, value) => sum + value, 0) / count
            : null;
        const preview = rows.slice(0, 5);
        status.textContent =
            "Summary current. Scope filtering and statistics run in the page.";
        render(
            html`
                <h2>Range summary</h2>
                <p>Viewport: ${domain.map(formatValue).join("–")}</p>
                <dl>
                    <dt>Matching records</dt>
                    <dd data-testid="count">${count}</dd>
                    <dt>Mean value</dt>
                    <dd data-testid="mean">${formatValue(mean)}</dd>
                    <dt>Minimum / maximum</dt>
                    <dd>
                        ${formatValue(count ? Math.min(...values) : null)} /
                        ${formatValue(count ? Math.max(...values) : null)}
                    </dd>
                </dl>
                <p data-testid="preview-count">
                    Showing ${preview.length} of ${count} matching records.
                </p>
                ${dataTable(
                    [
                        ["id", "Record"],
                        ["x", "X coordinate"],
                        ["value", "Value"],
                        ["percent", "Core-derived percent"],
                    ],
                    preview
                )}
                <details>
                    <summary>
                        Raw readback response (before app filtering)
                    </summary>
                    <pre>${JSON.stringify(result, null, 2)}</pre>
                </details>
            `,
            results
        );
    } catch (error) {
        if (signal.aborted) return;
        status.textContent = String(error);
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
