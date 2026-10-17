import { embed, intervalSelection } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    name: "measurements",
    width: "container",
    height: 220,
    data: { url: new URL("../dataReadback/data.json", import.meta.url).href },
    params: [{ name: "brush", select: { type: "interval", encodings: ["x"] } }],
    mark: { type: "point", size: 100 },
    encoding: {
        x: { field: "value", type: "quantitative", scale: { domain: [0, 9] } },
        y: {
            field: "group",
            type: "nominal",
            scale: { type: "band", domain: ["A", "B", "C", "D"] },
        },
    },
};

export const api = await embed(document.getElementById("plot"), spec);
const view = api.views.get({ scope: [], view: "measurements" });
const analyzeButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("analyze")
);
const clearButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("clear")
);

/** The page requests analysis and displays results; Core performs aggregation. */
function analyze() {
    const { rows, truncated } = view.transformData({
        scope: { selection: "brush" },
        transform: [
            {
                type: "aggregate",
                groupby: ["group"],
                fields: ["value", "value"],
                ops: ["count", "mean"],
                as: ["count", "mean"],
            },
        ],
        inputLimit: 100,
        limit: 100,
    });
    if (truncated)
        throw new Error(
            "Increase the result limit before using all summaries."
        );
    document.getElementById("results").textContent = JSON.stringify(
        rows,
        null,
        2
    );
}

analyzeButton.addEventListener("click", analyze);
clearButton.addEventListener("click", () => {
    view.params.getSelection("brush").clear();
    analyze();
});
view.params.get("brush").setValue(intervalSelection({ x: [1.5, 6.5] }));
analyzeButton.disabled = clearButton.disabled = false;
analyze();
window.addEventListener("pagehide", () => api.finalize(), { once: true });
