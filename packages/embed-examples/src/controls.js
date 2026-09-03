// The minimal entry point requires explicit renderer imports. Here WebGL draws
// the interactive plot, while SVG enables vector downloads. The controls module
// supplies its own styles but does not import or register either renderer.
import { embed } from "@genome-spy/core/minimal";
import "@genome-spy/core/rendering/webgl.js";
import "@genome-spy/core/rendering/svg.js";
import {
    attachControls,
    pngButton,
    svgButton,
    fullWindowButton,
    button,
} from "@genome-spy/core/controls";

// The Inspector implements the same control contract from its own package.
// Its UI loads on demand, and it uses debug helpers from this embed's runtime.
import { inspectorButton } from "@genome-spy/inspector";

// Pass this same element to embed() and attachControls(); no wrapper is needed.
const container = /** @type {HTMLElement} */ (document.getElementById("plot"));
const clearIcon = /** @type {HTMLTemplateElement} */ (
    document.getElementById("clear-selection-icon")
).content.firstElementChild;
const reset = /** @type {HTMLButtonElement} */ (
    document.getElementById("reset")
);
const placement = /** @type {HTMLSelectElement} */ (
    document.getElementById("placement")
);
const visibility = /** @type {HTMLSelectElement} */ (
    document.getElementById("visibility")
);

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    // Follow the container's dimensions, including during full-window expansion.
    // A specification with fixed numeric dimensions would retain its size.
    width: "container",
    height: "container",
    data: {
        values: Array.from({ length: 80 }, (_, i) => ({
            x: i,
            y: Math.sin(i / 7) + Math.cos(i / 3) / 3,
        })),
    },
    params: [
        { name: "brush", select: { type: "interval", encodings: ["x", "y"] } },
    ],
    mark: { type: "point", size: 80 },
    encoding: {
        x: { field: "x", type: "quantitative", scale: { zoom: true } },
        y: { field: "y", type: "quantitative" },
        color: {
            condition: { param: "brush", value: "#bd4b32" },
            value: "#427b9f",
        },
    },
};

let api = await embed(container, structuredClone(spec));
let controls = createControls();

function createControls() {
    return attachControls(container, api, {
        // The list is explicit and its order is the button order. Omit a factory
        // to remove that action. Each factory owns its options and creates fresh
        // DOM/state when mounted, so definitions can be reused across embeds.
        controls: [
            // Filenames omit the extension. exportOptions go to the image export
            // API; pixelRatio: 2 doubles the PNG's logical width and height.
            pngButton({
                filename: "genomespy-controls-example",
                exportOptions: { pixelRatio: 2 },
            }),
            // Requires the SVG renderer import above. Both exports capture the
            // current visualization state, including zoom and selection.
            svgButton({ filename: "genomespy-controls-example" }),
            // Use an SVG or HTML icon, cloned independently for each button.
            // label names it for assistive technology; title supplies hover text.
            // Omit icon to display the label as a text button.
            // Async actions receive a disposal signal: check it before side effects.
            button({
                label: "Clear selection",
                title: "Clear the selected region",
                icon: clearIcon,
                onClick: ({ api }) =>
                    api.getParam("brush").setValue({
                        type: "interval",
                        intervals: {},
                    }),
            }),
            // Closing, changing controls, or resetting the embed cleans up the
            // Inspector. It remains interactive during full-window expansion.
            inspectorButton(),
            // Moves the live container into a modal dialog, keeping zoom and
            // selections. Escape restores it. Controls sit inside while expanded;
            // within an iframe, expansion fills only that iframe's viewport.
            fullWindowButton(),
        ],

        // "inside" is the default overlay. "top" and "bottom" sit just
        // outside the same container without changing the plot's size.
        // controls.html provides margins to make room for them.
        placement: /** @type {"inside" | "top" | "bottom"} */ (placement.value),

        // undefined selects the placement default: hover inside, always
        // visible outside. "hover" also reveals controls on keyboard
        // focus; devices without hover keep them visible. On hover,
        // buttons are subdued until the pointer reaches the controls.
        visibility:
            visibility.value == "default"
                ? undefined
                : /** @type {"hover" | "always"} */ (visibility.value),

        // Errors and SVG warnings appear beside the buttons. An optional
        // onError callback can also report failures to your application.
    });
}

function updateControls() {
    // Reattach only the controls. Reusing the embed API preserves plot state.
    controls.dispose();
    controls = createControls();
}

async function resetExample() {
    // Prevent option changes while the replacement embed is loading.
    reset.disabled = placement.disabled = visibility.disabled = true;
    try {
        // Dispose controls before finalizing the embed or removing its DOM.
        // This restores an expanded container and suppresses pending downloads.
        controls.dispose();
        api.finalize();
        api = await embed(container, structuredClone(spec));
        controls = createControls();
    } finally {
        reset.disabled = placement.disabled = visibility.disabled = false;
    }
}

// Register page listeners once; they use the current embed and controls.
placement.addEventListener("change", updateControls);
visibility.addEventListener("change", updateControls);
reset.addEventListener("click", resetExample);
