import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";
import UnitView from "@genome-spy/core/view/unitView.js";
import Rectangle from "@genome-spy/core/view/layout/rectangle.js";
import { RegionSelectionController } from "@genome-spy/core/view/gridView/regionSelectionController.js";
import { materializeRegionSelection } from "@genome-spy/core/selection/regionSelection.js";

const values = [
    { name: "A", x: 10, y: 16 },
    { name: "B", x: 10, y: 36 },
    { name: "C", x: 10, y: 25 },
];
/** @type {[number, number][]} */
const triangle = [
    [0, 0],
    [1, 0],
    [0, 1],
];

/** @param {"linear" | "nonlinear"} id */
async function setup(id) {
    const element = document.getElementById(id);
    const plot = /** @type {HTMLDivElement} */ (element.querySelector(".plot"));
    const path = element.querySelector("path");
    const result = element.querySelector(".result");
    /** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
    const spec = {
        width: { grow: 1 },
        height: { grow: 1 },
        data: { values },
        datasets: { selected: [] },
        transform: [{ type: "identifier" }],
        encoding: {
            x: {
                field: "x",
                type: "quantitative",
                scale: {
                    type: id === "linear" ? "linear" : "log",
                    domain: [1, 100],
                    zero: false,
                    zoom: false,
                },
            },
            y: {
                field: "y",
                type: "quantitative",
                scale: {
                    type: id === "linear" ? "linear" : "sqrt",
                    domain: [0, 100],
                    zoom: false,
                },
            },
        },
        layer: [
            {
                name: "points",
                mark: {
                    type: "point",
                    size: 140,
                    color: "#64748b",
                    tooltip: null,
                },
            },
            {
                data: { name: "selected" },
                mark: {
                    type: "point",
                    size: 140,
                    color: "#f97316",
                    tooltip: null,
                },
            },
            {
                mark: { type: "text", align: "left", dx: 12, size: 16 },
                encoding: { text: { field: "name" } },
            },
        ],
    };
    const api = await embed(plot, spec, { renderer: "webgl" });
    const root =
        /** @type {import("@genome-spy/core/view/view.js").default} */ (
            api.debug.getViewRoot()
        );
    const view = root
        .getDescendants()
        .find((v) => v instanceof UnitView && v.spec.name === "points");
    if (!(view instanceof UnitView))
        throw new Error("Point producer not found");
    const collector = view.getCollector();
    /** @type {ReadonlyArray<readonly [number, number]>} */
    let committed = [];

    function bounds() {
        const b = api.views.getLayoutBounds({ scope: [], view: "points" });
        if (!b) throw new Error("Point layout unavailable");
        return Rectangle.create(b.x, b.y, b.width, b.height);
    }

    /** @param {ReadonlyArray<readonly [number, number]>} points */
    function draw(points) {
        path.setAttribute(
            "d",
            points.length
                ? points
                      .map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`)
                      .join(" ") + " Z"
                : ""
        );
    }

    function drawCommitted() {
        const b = bounds();
        draw(
            committed.map(([x, y]) => [
                b.x + x * b.width,
                b.y + (1 - y) * b.height,
            ])
        );
    }

    /** @param {import("@genome-spy/core/types/selectionTypes.js").RegionSelection} pending */
    function select(pending) {
        if (pending.status === "cleared") throw new Error("Expected a polygon");
        const selected = materializeRegionSelection(
            pending,
            collector.getData()
        );
        api.datasets.set("selected", Array.from(selected.data.values()));
        committed = pending.intent.polygon;
        drawCommitted();
        result.textContent =
            "Selected: " +
            (Array.from(selected.data.values(), (row) => row.name).join(", ") ||
                "none");
    }

    const controller = new RegionSelectionController(view, {
        getCoords: bounds,
        isEnabled: () => true,
        onTrace: (points) => (points.length ? draw(points) : drawCommitted()),
        onCommit: select,
    });
    const resize = new ResizeObserver(() =>
        requestAnimationFrame(drawCommitted)
    );
    resize.observe(plot);
    window.addEventListener(
        "pagehide",
        () => {
            resize.disconnect();
            api.finalize();
        },
        { once: true }
    );
    return () => select(controller.createSelection(triangle));
}

async function main() {
    const examples = await Promise.all([setup("linear"), setup("nonlinear")]);
    const button = /** @type {HTMLButtonElement} */ (
        document.getElementById("triangle")
    );
    const draw = () => examples.forEach((example) => example());
    button.onclick = draw;
    button.disabled = false;
    draw();
}
void main().catch((error) => {
    document.getElementById("error").textContent =
        error instanceof Error ? error.message : String(error);
});
