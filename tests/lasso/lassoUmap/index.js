import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";
import { materializeRegionSelection } from "@genome-spy/core/selection/regionSelection.js";
import { RegionSelectionController } from "@genome-spy/core/view/gridView/regionSelectionController.js";
import Rectangle from "@genome-spy/core/view/layout/rectangle.js";
import UnitView from "@genome-spy/core/view/unitView.js";

const plot = document.getElementById("plot");
const status = document.getElementById("status");
const outline = document.querySelector("#outline path");
const buttons = Array.from(document.querySelectorAll("button"));

/** @param {string} name @param {string} value */
function metric(name, value) {
    document.getElementById(name).textContent = value;
}

/** @param {boolean} busy */
function setBusy(busy) {
    for (const button of buttons) button.disabled = busy;
}

/** @returns {Promise<void>} */
function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function main() {
    const dataUrl = new URL(
        "../private/lasso/allen-wmb.csv",
        window.location.href
    );
    const check = await fetch(dataUrl, { method: "HEAD" });
    if (!check.ok || !check.headers.get("content-type")?.includes("csv")) {
        throw new Error(
            "Prepare the data first: python3 tests/lasso/prepareData.py"
        );
    }

    /** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
    const spec = {
        width: { grow: 1 },
        height: { grow: 1 },
        datasets: { selected: [] },
        data: {
            url: dataUrl.href,
            format: { type: "csv", parse: { x: "number", y: "number" } },
        },
        transform: [{ type: "identifier" }],
        encoding: {
            x: {
                field: "x",
                type: "quantitative",
                axis: null,
                scale: { name: "umapX", zero: false, zoom: true },
            },
            y: {
                field: "y",
                type: "quantitative",
                axis: null,
                scale: { name: "umapY", zero: false, zoom: true },
            },
        },
        layer: [
            {
                name: "umap",
                mark: {
                    type: "point",
                    size: 3,
                    color: "#64748b",
                    opacity: 0.15,
                    tooltip: null,
                },
            },
            {
                name: "highlight",
                data: { name: "selected" },
                mark: {
                    type: "point",
                    size: 4,
                    color: "#f97316",
                    opacity: 0.5,
                    tooltip: null,
                },
            },
        ],
    };
    const started = performance.now();
    const api = await embed(plot, spec, { renderer: "webgl" });
    const root =
        /** @type {import("@genome-spy/core/view/view.js").default} */ (
            api.debug.getViewRoot()
        );
    const producer = root
        .getDescendants()
        .find((view) => view instanceof UnitView && view.spec.name === "umap");
    if (!(producer instanceof UnitView)) throw new Error("UMAP view not found");
    const collector = producer.getCollector();
    const count = collector.getItemCount();
    metric("cells", count.toLocaleString());
    metric("selected", "0");
    status.textContent = `Ready: ${count.toLocaleString()} real cells; loaded and embedded in ${((performance.now() - started) / 1000).toFixed(1)} s.`;
    setBusy(false);

    const xResolution = producer.getScaleResolution("x");
    const yResolution = producer.getScaleResolution("y");
    const initialX = Array.from(xResolution.getDomain());
    const initialY = Array.from(yResolution.getDomain());
    let busy = false;

    /** @param {import("@genome-spy/core/types/selectionTypes.js").RegionSelection} pending */
    async function select(pending) {
        if (busy) return;
        busy = true;
        setBusy(true);
        status.textContent = `Scanning ${count.toLocaleString()} cells…`;
        await nextFrame();
        try {
            if (pending.status === "cleared")
                throw new Error("Expected a polygon query");
            const start = performance.now();
            const selected = materializeRegionSelection(
                pending,
                collector.getData()
            );
            metric("scan", `${(performance.now() - start).toFixed(1)} ms`);
            metric("selected", selected.data.size.toLocaleString());
            metric("vertices", pending.intent.polygon.length.toLocaleString());
            const published = performance.now();
            api.datasets.set("selected", Array.from(selected.data.values()));
            await nextFrame();
            await nextFrame();
            metric(
                "update",
                `${(performance.now() - published).toFixed(1)} ms`
            );
            status.textContent = `Selected ${selected.data.size.toLocaleString()} of ${count.toLocaleString()} cells.`;
        } catch (error) {
            status.textContent =
                error instanceof Error ? error.message : String(error);
        } finally {
            busy = false;
            setBusy(false);
        }
    }

    const controller = new RegionSelectionController(producer, {
        getCoords: () => {
            const b = api.views.getLayoutBounds({ scope: [], view: "umap" });
            if (!b) throw new Error("UMAP layout is unavailable");
            return Rectangle.create(b.x, b.y, b.width, b.height);
        },
        isEnabled: () => !busy,
        onTrace: (trace) => {
            setBusy(busy || trace.length > 0);
            outline.setAttribute(
                "d",
                trace.length
                    ? trace
                          .map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`)
                          .join(" ") + " Z"
                    : ""
            );
        },
        onCommit: (selection) => void select(selection),
    });
    api.events.subscribe("wheel", (event) => {
        if (busy) event.preventViewDefault();
    });
    window.addEventListener("pagehide", () => api.finalize(), { once: true });

    document.getElementById("center").onclick = () => {
        void select(
            controller.createSelection([
                [0.25, 0.25],
                [0.75, 0.25],
                [0.75, 0.75],
                [0.25, 0.75],
            ])
        );
    };
    document.getElementById("all").onclick = () =>
        void select(
            controller.createSelection([
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
            ])
        );
    document.getElementById("clear").onclick = () => {
        api.datasets.set("selected", []);
        metric("selected", "0");
        status.textContent = "Selection cleared.";
    };
    document.getElementById("reset").onclick = () => {
        void xResolution.zoomTo(initialX);
        void yResolution.zoomTo(initialY);
    };
}

void main().catch((error) => {
    status.textContent = error instanceof Error ? error.message : String(error);
});
