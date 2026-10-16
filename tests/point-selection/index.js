import { embed } from "../../packages/core/src/index.js";

const { document, window, location, URLSearchParams } = globalThis;

document.getElementById("version").textContent =
    new URLSearchParams(location.search).get("label") ||
    "Current source checkout";
const cursor = document.getElementById("cursor");
const modifier = document.getElementById("modifier");
document.addEventListener("pointermove", (event) => {
    cursor.style.display = "block";
    cursor.style.left = event.clientX + "px";
    cursor.style.top = event.clientY + "px";
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Shift") modifier.style.display = "block";
});
document.addEventListener("keyup", (event) => {
    if (event.key === "Shift") modifier.style.display = "none";
});
window.addEventListener("error", (event) => {
    document.getElementById("error").textContent = event.message;
});

/** @type {import("../../packages/core/src/spec/root.js").RootSpec} */
const spec = {
    data: {
        values: [
            { id: "A", x: 1, y: 1 },
            { id: "B", x: 2, y: 2 },
            { id: "C", x: 3, y: 1 },
        ],
    },
    params: [{ name: "picked", value: null }],
    // Assign identity once, before the dataflow branches into linked views.
    transform: [{ type: "identifier" }],
    hconcat: ["left", "right"].map((name) => ({
        name,
        title: name === "left" ? "First view" : "Linked view",
        width: 420,
        height: 240,
        params: [{ name: "picked", select: "point", push: "outer" }],
        mark: { type: "point", filled: true, size: 900 },
        encoding: {
            key: { field: "id" },
            x: {
                field: "x",
                type: "quantitative",
                scale: { domain: [0, 4], nice: false },
            },
            y: {
                field: "y",
                type: "quantitative",
                scale: { domain: [0, 3], nice: false },
            },
            color: { value: name === "left" ? "#2364aa" : "#bc4b27" },
            opacity: {
                condition: { param: "picked", empty: true, value: 1 },
                value: 0.15,
            },
            tooltip: [{ field: "id", type: "nominal" }],
        },
    })),
};

export const api = await embed(document.getElementById("plot"), spec, {
    renderer: "canvas",
});
const selection = api.views
    .get({ scope: [], view: "left" })
    .params.getSelection("picked");
if (selection.type !== "point") throw new Error("Expected a point selection.");

/** @returns {void} */
function showSelection() {
    const snapshot = selection.getValue();
    document.getElementById("selection").textContent =
        "Selected: " +
        (snapshot.data.map((row) => row.id).join(", ") || "none");
}

const stop = selection.subscribe(showSelection);
showSelection();
window.addEventListener(
    "pagehide",
    () => {
        stop();
        api.finalize();
    },
    { once: true }
);
