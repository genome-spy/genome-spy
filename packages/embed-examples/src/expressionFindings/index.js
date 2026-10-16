import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";
import "@genome-spy/core/rendering/canvas.js";
import "@genome-spy/core/rendering/svg.js";
import { createViewQuery } from "@genome-spy/core/view-query";
import { html, render } from "lit";
import { dataTable, formatValue, renderTrackInfo } from "../queryExamples.js";
import { contrastA, contrastB } from "./data.js";

/** @typedef {import("@genome-spy/core/view-query").ViewSliceAnalysisStage} AnalysisStage */
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
        { name: "region", select: { type: "interval", encodings: ["x", "y"] } },
    ],
    mark: { type: "point", size: 85 },
    encoding: {
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
const brush = api.params.getSelection("region");
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

/** Reflect the applied annotation state, including source-update invalidation. */
function showAnnotations() {
    const state = query.annotations.inspect();
    document.getElementById("annotation-status").textContent = state.invalidated
        ? "Findings cleared because the source data changed."
        : state.activeTargets + " labeled findings.";
}

/** Cancel obsolete work and explain why the action is available or unavailable. */
function invalidate() {
    controller.abort();
    const scope = query.assessQuery(track, getScope());
    const annotations = query.assessAnnotations(track);
    find.disabled =
        !form.checkValidity() ||
        scope.status !== "ready" ||
        annotations.status !== "ready";
    status.textContent =
        scope.status !== "ready"
            ? scope.status + ": " + scope.reason
            : annotations.status !== "ready"
              ? annotations.status + ": " + annotations.reason
              : "Scope or controls changed. Run the query for current findings.";
}

/** Query summaries and row-preserving representatives, then annotate the latter. */
async function findRepresentatives() {
    controller.abort();
    controller = new AbortController();
    const { signal } = controller;
    const scope = getScope();
    /** @type {AnalysisStage[]} */
    const filters = [
        {
            type: "filter",
            field: "log2FoldChange",
            op: "gte",
            value: fold.valueAsNumber,
            absolute: true,
        },
        {
            type: "filter",
            field: "negLog10Padj",
            op: "gte",
            value: score.valueAsNumber,
        },
    ];
    /** @type {import("@genome-spy/core/view-query").ViewSliceQueryOptions} */
    const options = {
        ...scope,
        fields: ["gene", "pathway", "log2FoldChange", "negLog10Padj"],
        limit: null,
        signal,
    };
    status.textContent = "Analyzing the captured region…";
    render(html`<p>Updating findings…</p>`, results);
    try {
        const [summary, points] = await Promise.all([
            query.queryData(track, {
                ...options,
                analysis: [
                    ...filters,
                    {
                        type: "aggregate",
                        groupby: ["pathway"],
                        fields: [null, "log2FoldChange"],
                        ops: ["count", "mean"],
                        as: ["eligibleCount", "meanFoldChange"],
                    },
                ],
            }),
            query.queryData(track, {
                ...options,
                includeAnnotationTargets: true,
                analysis: [
                    ...filters,
                    {
                        type: "window",
                        groupby: ["pathway"],
                        sort: {
                            field: ["negLog10Padj", "gene"],
                            order: ["descending", "ascending"],
                        },
                        ops: ["row_number", "count"],
                        as: ["rank", "eligibleCount"],
                        frame: [null, null],
                    },
                    { type: "filter", field: "rank", op: "eq", value: 1 },
                ],
            }),
        ]);
        signal.throwIfAborted();
        // Both independently validated queries must describe the same evidence.
        const captured = (/** @type {typeof summary} */ result) =>
            JSON.stringify([
                result.scope.domains,
                result.scope.selection,
                result.scope.dataRevision,
            ]);
        if (captured(summary) !== captured(points))
            throw new Error("Query scopes changed; run the query again.");
        await query.annotations.replace(
            {
                targets: points.annotationTargets.map((reference, i) => ({
                    reference,
                    text: String(points.rows[i].gene),
                })),
                emphasis: "purple",
                connectors: true,
            },
            { signal }
        );
        signal.throwIfAborted();
        render(
            html`
                <h2>Captured findings</h2>
                <p>
                    ${points.rowsMatched} genes in the captured region;
                    ${points.outputRows} pathway representatives.
                </p>
                <p class="hint">
                    Viewport x:
                    ${points.scope.domains.x.map(formatValue).join("–")}; y:
                    ${points.scope.domains.y.map(formatValue).join("–")}.
                    ${points.scope.selection ? "Also constrained by the captured brush." : "No brush constraint."}
                </p>
                <h3>Pathway summary</h3>
                <div id="pathways">
                    ${dataTable(
                        [
                            ["pathway", "Pathway"],
                            ["eligibleCount", "Qualifying genes"],
                            ["meanFoldChange", "Mean log2 fold change"],
                        ],
                        summary.rows
                    )}
                </div>
                <h3>Representative genes</h3>
                <div id="representatives">
                    ${dataTable(
                        [
                            ["gene", "Gene"],
                            ["pathway", "Pathway"],
                            ["negLog10Padj", "Score"],
                            ["eligibleCount", "Qualifying genes"],
                        ],
                        points.rows
                    )}
                </div>
                ${points.rows.length ? "" : html`<p>No genes meet the current criteria. Previous labels were cleared.</p>`}
                <details>
                    <summary>Captured query responses</summary>
                    <pre>
${JSON.stringify({ summary, representatives: points }, null, 2)}</pre>
                </details>
            `,
            results
        );
        status.textContent =
            "Findings current. Pan or zoom to follow their labels.";
        renderTrackInfo(query, track, info);
        showAnnotations();
    } catch (error) {
        if (signal.aborted) return;
        status.textContent = String(error);
        render(html`<p>Analysis failed. ${String(error)}</p>`, results);
        console.error(error);
    }
}

form.addEventListener("submit", (event) => {
    event.preventDefault();
    void findRepresentatives();
});
fold.addEventListener("input", invalidate);
score.addEventListener("input", invalidate);
scopeControl.addEventListener("change", invalidate);
contrast.addEventListener("change", () => {
    controller.abort();
    api.datasets.set(
        "expression",
        contrast.value === "A" ? contrastA : contrastB
    );
    render(
        html`<p>
            Source data changed. Run the query to inspect this contrast.
        </p>`,
        results
    );
    invalidate();
    renderTrackInfo(query, track, info);
    showAnnotations();
});
document
    .getElementById("clear-brush")
    .addEventListener("click", () => brush.clear());
document.getElementById("download").addEventListener("click", async () => {
    const { blob } = await api.imageExport.svg();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "expression-findings.svg";
    link.click();
    URL.revokeObjectURL(url);
});
document.getElementById("clear-labels").addEventListener("click", async () => {
    controller.abort();
    await query.annotations.clear();
    showAnnotations();
    status.textContent =
        "Labels cleared. Run the query to label findings again.";
});
document.getElementById("reset-example").addEventListener("click", async () => {
    controller.abort();
    form.reset();
    brush.clear();
    api.datasets.set("expression", contrastA);
    await Promise.all([scales[0].zoomTo([-3, 3]), scales[1].zoomTo([0, 7])]);
    await query.annotations.clear();
    render(html`<p>Run a query to inspect the expression data.</p>`, results);
    invalidate();
    renderTrackInfo(query, track, info);
    showAnnotations();
});
scales.forEach((scale) => scale.addEventListener("domain", invalidate));
const stopBrush = brush.subscribe(invalidate, { delivery: "commit" });

/** Release references and generated marks as well as ordinary subscriptions. */
export function dispose() {
    controller.abort();
    scales.forEach((scale) => scale.removeEventListener("domain", invalidate));
    stopBrush();
    query.annotations.dispose();
    api.finalize();
}
window.addEventListener("pagehide", dispose, { once: true });
invalidate();
status.textContent =
    "Ready. Find and label representatives in the current region.";
render(html`<p>Run a query to inspect the expression data.</p>`, results);
renderTrackInfo(query, track, info);
showAnnotations();
