import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";

/** @typedef {import("@genome-spy/core/types/embedApi.js").IntervalSelectionApi} IntervalSelectionApi */
/** @typedef {import("@genome-spy/core/types/embedApi.js").IntervalSnapshot} IntervalSnapshot */
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
            mark: { type: "rule", size: 2 },
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
            name: "annotations",
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
const menu = /** @type {HTMLDivElement} */ (
    document.getElementById("annotation-menu")
);
const form = /** @type {HTMLFormElement} */ (
    document.getElementById("annotation-form")
);
const cancel = /** @type {HTMLButtonElement} */ (
    document.getElementById("annotation-cancel")
);
const rows = /** @type {HTMLTableSectionElement} */ (
    document.getElementById("annotation-rows")
);
const status = /** @type {HTMLParagraphElement} */ (
    document.getElementById("annotation-status")
);
const hoverStatus = /** @type {HTMLParagraphElement} */ (
    document.getElementById("annotation-hover")
);
const clickStatus = /** @type {HTMLParagraphElement} */ (
    document.getElementById("annotation-click")
);

const api = await embed(container, spec);
const brush = /** @type {IntervalSelectionApi} */ (
    api.params.getSelection("brush")
);
const marks = api.views.get({ scope: [], view: "annotations" }).marks;

/** @type {IntervalSnapshot | undefined} */
let pendingSelection;

marks.subscribe("click", ({ hit }) => {
    if ("start" in hit.datum) {
        clickStatus.textContent = `Annotation clicked: ${hit.datum.name}`;
    }
});

marks.observeHover((hit) => {
    if (hit && "start" in hit.datum) {
        hoverStatus.textContent = `Annotation hovered: ${hit.datum.name}`;
    } else {
        hoverStatus.textContent = "";
    }
});

function renderRows() {
    rows.replaceChildren(
        ...annotations.map((annotation) => {
            const row = document.createElement("tr");
            for (const value of [
                `${annotation.start}–${annotation.end}`,
                annotation.name,
                annotation.description,
            ]) {
                const cell = row.insertCell();
                cell.textContent = String(value);
            }
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

    const sourceEvent = /** @type {MouseEvent} */ (event.sourceEvent);
    sourceEvent.preventDefault();
    event.preventViewDefault();
    pendingSelection = brush.getValue();
    if (!pendingSelection.active || !pendingSelection.intervals.x) {
        return;
    }

    menu.hidden = false;
    menu.style.position = "fixed";
    menu.style.left = `${sourceEvent.clientX}px`;
    menu.style.top = `${sourceEvent.clientY}px`;
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
