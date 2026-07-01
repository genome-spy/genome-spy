import { embed } from "@genome-spy/core/minimal";
import { attachInspectorOverlay } from "@genome-spy/inspector";

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    height: 240,
    data: {
        values: [
            { category: "A", value: 3 },
            { category: "B", value: 7 },
            { category: "C", value: 5 },
            { category: "D", value: 9 },
        ],
    },
    mark: "rect",
    encoding: {
        x: { field: "category", type: "nominal" },
        y: { field: "value", type: "quantitative" },
        color: { field: "category", type: "nominal" },
    },
};

const container = /** @type {HTMLElement} */ (
    document.getElementById("container")
);
const openButton = /** @type {HTMLButtonElement} */ (
    document.getElementById("open-inspector")
);
const api = await embed(container, spec);

/** @type {Awaited<ReturnType<typeof attachInspectorOverlay>> | undefined} */
let inspector;

openButton.addEventListener("click", async () => {
    if (inspector) {
        inspector.dispose();
    }
    inspector = await attachInspectorOverlay(api.debug, {
        activePanel: "elements",
    });
});
