import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";

/** @typedef {import("@genome-spy/core/types/embedApi.js").IntervalSelectionApi} IntervalSelectionApi */
/** @typedef {import("@genome-spy/core/types/embedApi.js").IntervalSnapshot} IntervalSnapshot */
/** @typedef {import("@genome-spy/core/spec/root.js").RootSpec} RootSpec */

const startPos = 134_567_890;
const trackData = Array.from({ length: 101 }, (_, x) => ({
    chrom: "chr3",
    pos: startPos + x,
    y: Math.sin(x / 8) * 18 + 50,
}));

/** @type {Record<string, unknown>[]} */
let annotations = [];

/** @type {RootSpec} */
const spec = {
    assembly: "hg38",
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
                    chrom: "chrom",
                    pos: "pos",
                    type: "locus",
                    scale: {
                        domain: [
                            { chrom: "chr3", pos: startPos },
                            { chrom: "chr3", pos: startPos + 100 },
                        ],
                    },
                },
                y: { field: "y", type: "quantitative", axis: null },
            },
        },
        {
            name: "reference-track",
            data: {
                values: trackData.map(({ chrom, pos, y }) => ({
                    chrom,
                    pos,
                    y: y / 2 + 35,
                })),
            },
            height: 80,
            mark: { type: "rule", size: 2 },
            encoding: {
                x: {
                    chrom: "chrom",
                    pos: "pos",
                    type: "locus",
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
                x: { field: "start", type: "locus" },
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

const api = await embed(container, spec);
const brush = /** @type {IntervalSelectionApi} */ (
    api.params.getSelection("brush")
);
const track = api.views.get({ scope: [], view: "signal-track" });

/** @type {IntervalSnapshot | undefined} */
let pendingSelection;

function renderRows() {
    rows.replaceChildren(
        ...annotations.map((annotation) => {
            const row = document.createElement("tr");
            for (const value of [
                `${formatCoordinate(annotation.start)}–${formatCoordinate(annotation.end)}`,
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

/** @param {unknown} value */
function formatCoordinate(value) {
    if (
        typeof value === "object" &&
        value !== null &&
        "chrom" in value &&
        "pos" in value
    ) {
        return `${String(value.chrom)}:${String(value.pos)}`;
    }
    return String(value);
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
    void openContextMenu(sourceEvent, event.point);
});

/**
 * @param {MouseEvent} sourceEvent
 * @param {{ x: number, y: number }} point
 */
async function openContextMenu(sourceEvent, point) {
    const result = await track.marks.pick(point);
    if (result.status !== "hit") {
        return;
    }

    pendingSelection = brush.getValue();
    if (!pendingSelection.active || !pendingSelection.complexIntervals.x) {
        return;
    }

    menu.hidden = false;
    menu.style.position = "fixed";
    menu.style.left = `${sourceEvent.clientX}px`;
    menu.style.top = `${sourceEvent.clientY}px`;
    form.querySelector("input").focus();
}

form.addEventListener("submit", (event) => {
    event.preventDefault();
    const interval = pendingSelection?.complexIntervals.x;
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
