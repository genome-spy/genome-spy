import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    name: "observations",
    width: "container",
    height: 220,
    data: { url: new URL("./data.json", import.meta.url).href },
    transform: [{ type: "formula", expr: "datum.value * 2", as: "score" }],
    params: [{ name: "selected", select: "point" }],
    mark: { type: "point", size: 180 },
    encoding: {
        key: { field: "id" },
        x: { field: "value", type: "quantitative", scale: { domain: [0, 6] } },
        y: { field: "score", type: "quantitative", scale: { domain: [0, 12] } },
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
const threshold = /** @type {HTMLInputElement} */ (
    document.getElementById("threshold")
);
const selectButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("select")
);
const clearButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("clear")
);

/** Read Core's derived values; the page never loads or repeats the input pipeline. */
function selectMatches() {
    if (!threshold.reportValidity()) return;
    const { rows, truncated } = view.readData({ limit: 100 });
    if (truncated)
        throw new Error("Increase the limit before selecting all matches.");
    document.getElementById("records").textContent = JSON.stringify(
        rows,
        null,
        2
    );
    const keys = rows
        .filter((row) => Number(row.score) >= threshold.valueAsNumber)
        .map((row) => [String(row.id)]);
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
