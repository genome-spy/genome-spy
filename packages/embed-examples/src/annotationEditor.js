import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";

/** @typedef {import("@genome-spy/core/types/embedApi.js").SelectionSnapshot} SelectionSnapshot */
/** @typedef {import("@genome-spy/core/spec/root.js").RootSpec} RootSpec */

const trackData = Array.from({ length: 101 }, (_, x) => ({
    x,
    y: Math.sin(x / 8) * 18 + 50,
}));

/** @type {Record<string, unknown>[]} */
let annotations = [];

/** @type {RootSpec} */
const spec = {
    params: [
        {
            name: "brush",
            select: { type: "interval", encodings: ["x"], extent: "container" },
        },
    ],
    datasets: { annotations },
    vconcat: [
        {
            name: "signal-track",
            data: { values: trackData },
            height: 100,
            mark: { type: "point", size: 32 },
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { domain: [0, 100] },
                },
                y: { field: "y", type: "quantitative", axis: null },
            },
        },
        {
            name: "reference-track",
            data: {
                values: trackData.map(({ x, y }) => ({ x, y: y / 2 + 35 })),
            },
            height: 80,
            mark: { type: "rule", strokeWidth: 2 },
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { domain: [0, 100] },
                },
                y: { field: "y", type: "quantitative", axis: null },
            },
        },
    ],
    annotate: [
        {
            data: { name: "annotations" },
            mark: { type: "rect", fill: "#f59e0b", fillOpacity: 0.35 },
            encoding: {
                x: { field: "start", type: "quantitative" },
                x2: { field: "end" },
            },
        },
    ],
};

const container = document.getElementById("annotation-plot");
const menu = document.getElementById("annotation-menu");
const form = document.getElementById("annotation-form");
const cancel = document.getElementById("annotation-cancel");
const rows = document.getElementById("annotation-rows");
const status = document.getElementById("annotation-status");

const api = await embed(container, spec);
const brush = api.params.getSelection("brush");

/** @type {SelectionSnapshot | undefined} */
let pendingSelection;

function renderRows() {
    rows.replaceChildren(
        ...annotations.map((annotation) => {
            const row = document.createElement("tr");
            row.innerHTML =
                `<td>${annotation.start}–${annotation.end}</td>` +
                `<td>${annotation.name}</td><td>${annotation.description}</td>`;
            return row;
        })
    );
}

function closeMenu() {
    menu.hidden = true;
    form.reset();
    pendingSelection = undefined;
}

api.events.subscribe("contextmenu", (event) => {
    if (!brush.contains(event.point)) {
        return;
    }

    event.sourceEvent.preventDefault();
    event.preventViewDefault();
    pendingSelection = brush.getValue();
    if (!pendingSelection.active || !pendingSelection.intervals.x) {
        return;
    }

    menu.hidden = false;
    menu.style.position = "fixed";
    menu.style.left = `${event.sourceEvent.clientX}px`;
    menu.style.top = `${event.sourceEvent.clientY}px`;
    form.querySelector("input").focus();
});

form.addEventListener("submit", (event) => {
    event.preventDefault();
    const interval = pendingSelection?.intervals.x;
    if (!interval) {
        return;
    }

    const values = new FormData(form);
    annotations = [
        ...annotations,
        {
            start: interval[0],
            end: interval[1],
            name: values.get("name"),
            description: values.get("description"),
        },
    ];
    api.datasets.set("annotations", annotations);
    brush.clear();
    renderRows();
    status.textContent = "Annotation saved.";
    closeMenu();
});

cancel.addEventListener("click", () => {
    closeMenu();
    status.textContent = "Annotation canceled.";
});

renderRows();
