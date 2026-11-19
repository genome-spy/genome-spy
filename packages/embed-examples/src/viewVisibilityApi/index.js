import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/canvas.js";

/** @satisfies {Array<import("@genome-spy/core/spec/view.js").UnitSpec & { name: string, title: string }>} */
const tracks = [
    {
        name: "coverage",
        title: "Coverage",
        height: 88,
        data: {
            values: Array.from({ length: 60 }, (_, i) => ({
                start: i * 2,
                end: i * 2 + 2,
                depth: 24 + 12 * Math.sin(i / 8) ** 2 + ((i * 7) % 9),
            })),
        },
        mark: { type: "rect", color: "#317ea9" },
        encoding: {
            x: { field: "start", type: "index", title: "Position" },
            x2: { field: "end" },
            y: { field: "depth", type: "quantitative", title: "Depth" },
        },
    },
    {
        name: "variants",
        title: "Variants",
        height: 42,
        data: { values: [12, 23, 49, 63, 91, 108].map((pos) => ({ pos })) },
        mark: { type: "point", color: "#ae455b", size: 85 },
        encoding: { x: { field: "pos", type: "index", title: "Position" } },
    },
    {
        name: "annotations",
        title: "Annotations",
        height: 42,
        data: {
            values: [
                { start: 8, end: 29 },
                { start: 43, end: 75 },
                { start: 87, end: 111 },
            ],
        },
        mark: { type: "rect", color: "#3d7c69" },
        encoding: {
            x: { field: "start", type: "index", title: "Position" },
            x2: { field: "end" },
            y: { value: 0.3 },
            y2: { value: 0.7 },
        },
    },
];

const errorMessage = document.getElementById("visibility-error");
const api = await embed(
    document.getElementById("container"),
    {
        width: "container",
        padding: 8,
        spacing: 14,
        // Keep the coordinate range fixed as tracks are hidden or shown.
        scales: { x: { domain: [0, 120] } },
        resolve: { axis: { x: "shared" } },
        config: { title: { anchor: "start" }, view: { stroke: "#e5e5e5" } },
        vconcat: tracks,
    },
    {
        renderer: "canvas",
        onError: (error) => {
            errorMessage.textContent = String(error);
        },
    }
);

const choices = document.getElementById("track-choices");
for (const { name, title } of tracks) {
    // These views are in the root selector scope. Resolve each handle once
    // and reuse its visibility API when the view is hidden or shown again.
    const { visibility } = api.views.get({ scope: [], view: name });
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    // Read the initial state from the embed so the checkbox follows the spec.
    checkbox.checked = visibility.locallyVisible;

    checkbox.addEventListener("change", async () => {
        errorMessage.textContent = "";
        try {
            // A boolean sets an explicit choice. Pass undefined to restore the
            // authored default. Await the write because first show can load data.
            await visibility.setOverride(checkbox.checked);
        } catch (error) {
            errorMessage.textContent = String(error);
        } finally {
            checkbox.checked = visibility.locallyVisible;
        }
    });

    const label = document.createElement("label");
    label.append(checkbox, title);
    choices.append(label);
}
document.getElementById("track-visibility").hidden = false;
