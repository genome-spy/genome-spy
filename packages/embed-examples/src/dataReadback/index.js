import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    name: "observations",
    width: "container",
    height: 220,
    data: { url: new URL("./data.json", import.meta.url).href },
    transform: [{ type: "formula", expr: "datum.value * 2", as: "score" }],
    params: [
        { name: "selected", select: "point" },
        { name: "brush", select: { type: "interval", encodings: ["x", "y"] } },
    ],
    mark: { type: "point", size: 180 },
    encoding: {
        key: { field: "id" },
        x: {
            field: "value",
            type: "quantitative",
            scale: { name: "position", domain: [0, 6], zoom: true },
        },
        y: {
            field: "score",
            type: "quantitative",
            scale: { domain: [0, 12], zoom: true },
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
if (capability.type !== "point") throw new Error("Expected a point selection.");
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

/** Read Core's derived values; the page never loads or repeats the input pipeline. */
function selectMatches() {
    const { rows, truncated } = view.readData({
        scope: scope.value === "brush" ? { selection: "brush" } : "viewport",
        limit: 100,
    });
    if (truncated)
        throw new Error("Increase the limit before selecting all matches.");
    document.getElementById("records").textContent = JSON.stringify(
        rows,
        null,
        2
    );
    const keys = rows.map((row) => [String(row.id)]);
    selected.setValue(keys);
}

/** Show membership from either API writes or interactive picking. */
function showSelection() {
    const ids = selected.getValue().data.map((row) => row.id);
    document.getElementById("selection").textContent =
        "Selected: " + (ids.join(", ") || "none");
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
