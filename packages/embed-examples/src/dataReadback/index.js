import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    name: "observations",
    width: "container",
    height: 220,
    data: { url: new URL("./data.json", import.meta.url).href },
    transform: [
        {
            type: "aggregate",
            groupby: ["group"],
            fields: ["value", "value"],
            ops: ["count", "mean"],
            as: ["count", "mean"],
        },
    ],
    params: [
        { name: "selected", select: "point" },
        { name: "brush", select: { type: "interval", encodings: ["x", "y"] } },
    ],
    mark: { type: "point", size: 180 },
    encoding: {
        key: { field: "group" },
        x: {
            field: "mean",
            type: "quantitative",
            scale: { name: "position", domain: [0, 6], zoom: true },
        },
        y: {
            field: "count",
            type: "quantitative",
            scale: { domain: [0, 5], zoom: true },
        },
        opacity: {
            condition: { param: "selected", empty: false, value: 1 },
            value: 0.2,
        },
    },
};

export const api = await embed(document.getElementById("plot"), spec);
const view = api.views.get({ scope: [], view: "observations" });
const capability = view.params.getSelection("selected");
if (capability.type !== "point" || capability.membership !== "records")
    throw new Error("Expected a record point selection.");
const selected = capability;
const scope = /** @type {HTMLSelectElement} */ (
    document.getElementById("scope")
);
const selectButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("select")
);
const clearButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("clear")
);

/** Read group summaries computed by Core; the page does no aggregation. */
function selectMatches() {
    const { rows, truncated } = view.data.read({
        scope:
            scope.value === "brush"
                ? { selection: "brush" }
                : /** @type {"all" | "viewport"} */ (scope.value),
        limit: 100,
    });
    if (truncated)
        throw new Error("Increase the limit before selecting all matches.");
    document.getElementById("records").textContent = JSON.stringify(
        rows,
        null,
        2
    );
    const keys = rows.map((row) => [String(row.group)]);
    selected.setValue(keys);
}

/** Show membership from either API writes or interactive picking. */
function showSelection() {
    const groups = selected.getValue().data.map((row) => row.group);
    document.getElementById("selection").textContent =
        "Selected: " + (groups.join(", ") || "none");
}

selectButton.addEventListener("click", selectMatches);
clearButton.addEventListener("click", () => selected.clear());
document
    .getElementById("zoom")
    .addEventListener("click", () =>
        api.getScaleResolutionByName("position").zoomTo([3, 5])
    );
document
    .getElementById("reset")
    .addEventListener("click", () =>
        api.getScaleResolutionByName("position").zoomTo([0, 6])
    );
const stop = selected.subscribe(showSelection);
selectButton.disabled = clearButton.disabled = false;
selectMatches();
showSelection();
window.addEventListener(
    "pagehide",
    () => {
        stop();
        api.finalize();
    },
    { once: true }
);
