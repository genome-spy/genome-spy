import { renderScene } from "./sceneRunner.js";
import runBasicScene from "../examples/basicScene.js";
import runHatchScene from "../examples/hatchScene.js";
import runBarScene from "../examples/barScene.js";
import runPointScene from "../examples/pointScene.js";
import runPathPointScene from "../examples/pathPointScene.js";
import runPathTextScene from "../examples/pathTextScene.js";
import runThresholdScene from "../examples/thresholdScene.js";
import runPiecewiseScene from "../examples/piecewiseScene.js";
import runIndexScene from "../examples/indexScene.js";
import runRuleScene from "../examples/ruleScene.js";
import runLinkScene from "../examples/linkScene.js";
import runTextScene from "../examples/textScene.js";
import runRangedTextScene from "../examples/rangedTextScene.js";
import runSelectionUnionScene from "../examples/selectionUnionScene.js";
import runConditionalOrderScene from "../examples/conditionalOrderScene.js";
import runGroupScene from "../examples/groupScene.js";
import {
    runIndexedPlacementScene,
    runRepeatedPlacementScene,
} from "../examples/placementScene.js";

export default {
    title: "WebGPU Renderer/Scenes",
    parameters: {
        layout: "fullscreen",
    },
};

const formatArgs = (args) => {
    if (!args || Object.keys(args).length === 0) {
        return "";
    }
    return JSON.stringify(args, null, 2);
};

const withSource = (runnerName, args, story) => {
    const snippetArgs = formatArgs(args);
    const code = snippetArgs
        ? `renderScene(${runnerName}, ${snippetArgs});`
        : `renderScene(${runnerName});`;
    return {
        ...story,
        parameters: {
            ...story.parameters,
            docs: {
                source: {
                    code,
                },
            },
        },
    };
};

const PATH_TEXT_BACKENDS = [
    { value: "gpu", label: "WGSL GPU" },
    { value: "wasm", label: "msdfgen WASM" },
];

const renderPathTextComparison = (args) => {
    const wrapper = document.createElement("div");
    wrapper.style.position = "relative";
    wrapper.style.width = "100%";
    wrapper.style.height = "100vh";

    const scene = renderScene(runPathTextScene, args);
    const controls = document.createElement("fieldset");
    controls.setAttribute("aria-label", "Path text atlas generator");
    controls.style.position = "absolute";
    controls.style.zIndex = "1";
    controls.style.top = "12px";
    controls.style.right = "12px";
    controls.style.display = "flex";
    controls.style.gap = "12px";
    controls.style.margin = "0";
    controls.style.padding = "8px 12px";
    controls.style.border = "1px solid #b8bdc7";
    controls.style.borderRadius = "6px";
    controls.style.background = "rgba(255, 255, 255, 0.94)";
    controls.style.font = "13px system-ui, sans-serif";

    const legend = document.createElement("legend");
    legend.textContent = "Atlas generator";
    legend.style.padding = "0 4px";
    controls.append(legend);

    for (const backend of PATH_TEXT_BACKENDS) {
        const label = document.createElement("label");
        label.style.display = "flex";
        label.style.alignItems = "center";
        label.style.gap = "4px";
        label.style.cursor = "pointer";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "path-text-atlas-backend";
        input.value = backend.value;
        input.checked = args.atlasBackend === backend.value;
        input.addEventListener("change", () => {
            if (input.checked) {
                scene.args = { ...args, atlasBackend: backend.value };
            }
        });
        label.append(input, backend.label);
        controls.append(label);
    }

    wrapper.append(scene, controls);
    return wrapper;
};

export const Basic = withSource("runBasicScene", null, {
    render: (args) => renderScene(runBasicScene, args),
});

export const Hatch = withSource("runHatchScene", null, {
    render: (args) => renderScene(runHatchScene, args),
});

export const Bars = withSource("runBarScene", null, {
    render: (args) => renderScene(runBarScene, args),
});

export const Points = withSource("runPointScene", null, {
    render: (args) => renderScene(runPointScene, args),
});

export const PathPoints = withSource(
    "runPathPointScene",
    { atlasBackend: "gpu", atlasFormat: "rgba8unorm" },
    {
        args: { atlasBackend: "gpu", atlasFormat: "rgba8unorm" },
        argTypes: {
            atlasBackend: {
                name: "Atlas generator",
                control: "inline-radio",
                options: ["gpu", "wasm"],
            },
            atlasFormat: {
                name: "Distance texture",
                control: {
                    type: "inline-radio",
                    labels: {
                        rgba8unorm: "RGBA8",
                        rgba16float: "RGBA16F",
                    },
                },
                options: ["rgba8unorm", "rgba16float"],
                if: { arg: "atlasBackend", eq: "gpu" },
            },
        },
        render: (args) => renderScene(runPathPointScene, args),
    }
);

export const PathText = withSource(
    "runPathTextScene",
    { atlasBackend: "gpu" },
    {
        args: { atlasBackend: "gpu" },
        argTypes: {
            atlasBackend: {
                name: "Atlas generator",
                control: {
                    type: "inline-radio",
                    labels: {
                        gpu: "WGSL GPU",
                        wasm: "msdfgen WASM",
                    },
                },
                options: ["gpu", "wasm"],
            },
        },
        render: renderPathTextComparison,
    }
);

export const Threshold = withSource("runThresholdScene", null, {
    render: (args) => renderScene(runThresholdScene, args),
});

export const Piecewise = withSource("runPiecewiseScene", null, {
    render: (args) => renderScene(runPiecewiseScene, args),
});

export const IndexScale = withSource("runIndexScene", null, {
    render: (args) => renderScene(runIndexScene, args),
});

export const Rules = withSource("runRuleScene", null, {
    render: (args) => renderScene(runRuleScene, args),
});

export const Links = withSource("runLinkScene", null, {
    render: (args) => renderScene(runLinkScene, args),
});

export const Text = withSource(
    "runTextScene",
    { size: 32, opacity: 0.85 },
    {
        args: {
            size: 32,
            opacity: 0.85,
        },
        argTypes: {
            size: { control: { type: "range", min: 8, max: 120, step: 1 } },
            opacity: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
        },
        render: (args) => renderScene(runTextScene, args),
    }
);

export const RangedText = withSource(
    "runRangedTextScene",
    { size: 250, opacity: 0.9 },
    {
        args: {
            size: 250,
            opacity: 0.9,
        },
        argTypes: {
            size: { control: { type: "range", min: 32, max: 320, step: 1 } },
            opacity: {
                control: { type: "range", min: 0, max: 1, step: 0.01 },
            },
        },
        render: (args) => renderScene(runRangedTextScene, args),
    }
);

export const SelectionUnion = withSource("runSelectionUnionScene", null, {
    render: (args) => renderScene(runSelectionUnionScene, args),
});

export const ConditionalOrder = withSource("runConditionalOrderScene", null, {
    render: (args) => renderScene(runConditionalOrderScene, args),
});

export const IndexedPlacements = withSource("runIndexedPlacementScene", null, {
    render: (args) => renderScene(runIndexedPlacementScene, args),
});

export const RepeatedRangePlacements = withSource(
    "runRepeatedPlacementScene",
    null,
    {
        render: (args) => renderScene(runRepeatedPlacementScene, args),
    }
);

export const RenderScope = withSource(
    "runGroupScene",
    { opacity: 0.65 },
    {
        args: { opacity: 0.65 },
        argTypes: {
            opacity: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
        },
        render: (args) => renderScene(runGroupScene, args),
    }
);
