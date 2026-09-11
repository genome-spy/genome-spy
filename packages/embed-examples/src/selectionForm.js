import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";

const bridgeUrl = "http://127.0.0.1:8765";
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
        {
            name: "brush",
            select: { type: "interval", encodings: ["x"], extent: "container" },
        },
        {
            name: "selected",
            select: { type: "point", encodings: ["x"], on: "pointerover" },
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
            mark: { type: "rule", strokeWidth: 2 },
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
const brush = api.params.getSelection("brush");
const selected = api.params.getSelection("selected");
const form = document.getElementById("selection-form");
const status = document.getElementById("selection-status");
const summary = document.getElementById("selection-summary");
const rows = document.getElementById("selection-rows");

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

function setFormEnabled(enabled) {
    form.disabled = !enabled;
    for (const control of form.elements) {
        control.disabled = !enabled;
    }
}

function showSelection(snapshot) {
    if (snapshot.type === "interval") {
        const interval = snapshot.intervals.x;
        summary.textContent = interval
            ? `Brushed ${interval[0]}–${interval[1]}`
            : "No region selected.";
        return;
    }

    summary.textContent = snapshot.data.length
        ? `Selected ${snapshot.data.map((datum) => datum.label).join(", ")}`
        : "No point selected.";
}

brush.subscribe(
    (snapshot) => {
        showSelection(snapshot);
        setFormEnabled(snapshot.active);
        if (bridgeEnabled) {
            void fetch(`${bridgeUrl}/selection`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(snapshot),
            }).catch(() => undefined);
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
        }).catch(() => undefined);
    }
});

form.addEventListener("submit", (event) => {
    event.preventDefault();
    const interval = brush.getValue().intervals.x;
    if (!interval) {
        return;
    }

    const formData = new FormData(form);
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
        }).catch(() => undefined);
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

renderRows();
setFormEnabled(false);
if (bridgeEnabled) {
    setInterval(pullBridgeAnnotations, 1000);
}
