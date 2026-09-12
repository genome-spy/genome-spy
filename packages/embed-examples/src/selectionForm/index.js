import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";

/** @typedef {import("@genome-spy/core/types/embedApi.js").IntervalSelectionApi} IntervalSelectionApi */
/** @typedef {import("@genome-spy/core/types/embedApi.js").PointSelectionApi} PointSelectionApi */
/** @typedef {import("@genome-spy/core/types/embedApi.js").SelectionSnapshot} SelectionSnapshot */

const bridgeUrl = "http://127.0.0.1:8765";
// Add `?bridge` to exchange selections and annotations with the optional
// notebook bridge. The browser-only example works without it.
const bridgeEnabled = new URLSearchParams(location.search).has("bridge");
const values = Array.from({ length: 51 }, (_, x) => ({
    x,
    y: Math.cos(x / 6) * 20 + 50,
    label: `point-${x}`,
}));

/** @type {Record<string, unknown>[]} */
let annotations = [];

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    params: [
        // A committed interval drives the annotation form. The form is
        // updated only after the drag has finished.
        {
            name: "brush",
            select: { type: "interval", encodings: ["x"], extent: "container" },
        },
        // Hovering a point demonstrates point-selection snapshots alongside
        // the interval selection used by the form.
        {
            name: "selected",
            select: { type: "point", on: "pointerover" },
        },
    ],
    datasets: { annotations },
    vconcat: [
        {
            name: "selection-track",
            data: { values },
            height: 130,
            mark: { type: "point", size: 70 },
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { domain: [0, 50] },
                },
                y: { field: "y", type: "quantitative", axis: null },
            },
        },
        {
            name: "selection-reference",
            data: { values: values.map(({ x, y }) => ({ x, y: y / 2 + 35 })) },
            height: 70,
            mark: { type: "rule", size: 2 },
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { domain: [0, 50] },
                },
                y: { field: "y", type: "quantitative", axis: null },
            },
        },
    ],
    annotate: [
        {
            // This view is backed by the mutable annotations dataset below,
            // so newly saved or bridged annotations appear immediately.
            name: "selection-annotations",
            data: { name: "annotations" },
            mark: { type: "rect", fill: "#0ea5e9", fillOpacity: 0.35 },
            encoding: {
                x: { field: "start", type: "quantitative" },
                x2: { field: "end" },
            },
        },
    ],
};

const api = await embed(document.getElementById("selection-plot"), spec);
const brush = /** @type {IntervalSelectionApi} */ (
    api.params.getSelection("brush")
);
const selected = /** @type {PointSelectionApi} */ (
    api.params.getSelection("selected")
);
const form = /** @type {HTMLFormElement} */ (
    document.getElementById("selection-form")
);
const fields = /** @type {HTMLFieldSetElement} */ (
    document.getElementById("selection-fields")
);
const status = /** @type {HTMLParagraphElement} */ (
    document.getElementById("selection-status")
);
const summary = /** @type {HTMLParagraphElement} */ (
    document.getElementById("selection-summary")
);
const rows = /** @type {HTMLTableSectionElement} */ (
    document.getElementById("selection-rows")
);

// Keep the table as a plain HTML view of the annotations dataset.
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

/** @param {boolean} enabled */
function setFormEnabled(enabled) {
    fields.disabled = !enabled;
    summary.textContent = enabled
        ? "Annotation form enabled for the brushed region."
        : "Brush a region to enable the annotation form.";
}

/** @param {SelectionSnapshot} snapshot */
function showSelection(snapshot) {
    if (snapshot.type === "interval") {
        const interval = snapshot.intervals.x;
        status.textContent = interval
            ? `Brushed ${interval[0]}–${interval[1]}`
            : "No region selected.";
        return;
    }

    status.textContent = snapshot.data.length
        ? `Selected ${snapshot.data.map((datum) => datum.label).join(", ")}`
        : "No point selected.";
}

// Commit interval selections before enabling the form. Point selections are
// delivered on hover to show that both selection types use the same API.
brush.subscribe(
    (snapshot) => {
        showSelection(snapshot);
        setFormEnabled(snapshot.active);
        if (bridgeEnabled) {
            void fetch(`${bridgeUrl}/selection`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(snapshot),
            }).catch(ignoreBridgeError);
        }
    },
    { delivery: "commit" }
);

selected.subscribe((snapshot) => {
    showSelection(snapshot);
    if (bridgeEnabled) {
        void fetch(`${bridgeUrl}/selection`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(snapshot),
        }).catch(ignoreBridgeError);
    }
});

form.addEventListener("submit", (event) => {
    event.preventDefault();
    const interval = brush.getValue().intervals.x;
    if (!interval) {
        return;
    }

    const formData = new FormData(form);
    // Update the dataset through the embed API so the annotation overlay and
    // the HTML table stay in sync.
    annotations = [
        ...annotations,
        {
            start: interval[0],
            end: interval[1],
            name: formData.get("name"),
            description: formData.get("description"),
        },
    ];
    api.datasets.set("annotations", annotations);
    if (bridgeEnabled) {
        void fetch(`${bridgeUrl}/annotations`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(annotations),
        }).catch(ignoreBridgeError);
    }
    brush.clear();
    form.reset();
    setFormEnabled(false);
    status.textContent = "Annotation saved.";
    renderRows();
});

async function pullBridgeAnnotations() {
    try {
        const response = await fetch(`${bridgeUrl}/annotations`);
        if (!response.ok) return;
        const next = await response.json();
        if (!Array.isArray(next)) return;
        annotations = next;
        api.datasets.set("annotations", annotations);
        renderRows();
    } catch {
        // The notebook bridge is optional for this browser-only example.
    }
}

/** @returns {void} */
function ignoreBridgeError() {}

renderRows();
setFormEnabled(false);
if (bridgeEnabled) {
    setInterval(pullBridgeAnnotations, 1000);
}
