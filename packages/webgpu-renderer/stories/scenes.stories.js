import { renderScene } from "./sceneRunner.js";
import runBasicScene from "../examples/basicScene.js";
import runHatchScene from "../examples/hatchScene.js";
import runBarScene from "../examples/barScene.js";
import runPointScene from "../examples/pointScene.js";
import runPathPointScene from "../examples/pathPointScene.js";
import runPathTextScene from "../examples/pathTextScene.js";
import runTextEffectsScene from "../examples/textEffectsScene.js";
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
    { backend: "wgsl" },
    {
        args: { backend: "wgsl" },
        argTypes: {
            backend: {
                control: "select",
                options: ["wgsl", "msdfgen"],
                description:
                    "Atlas generator. msdfgen is a downloaded development oracle.",
            },
        },
        render: (args) => renderScene(runPathPointScene, args),
    }
);

export const PathText = withSource("runPathTextScene", null, {
    render: () => renderScene(runPathTextScene),
});

export const TextEffects = withSource(
    "runTextEffectsScene",
    {
        size: 64,
        angle: -6,
        fill: "#f7f8ff",
        outlineColor: "#14213d",
        outlineWidth: 4,
        outlineOpacity: 1,
        shadowColor: "#2457ff",
        shadowOpacity: 0.55,
        shadowBlur: 7,
        shadowOffsetX: 5,
        shadowOffsetY: 7,
        background: "#ffffff",
    },
    {
        args: {
            size: 64,
            angle: -6,
            fill: "#f7f8ff",
            outlineColor: "#14213d",
            outlineWidth: 4,
            outlineOpacity: 1,
            shadowColor: "#2457ff",
            shadowOpacity: 0.55,
            shadowBlur: 7,
            shadowOffsetX: 5,
            shadowOffsetY: 7,
            background: "#ffffff",
        },
        argTypes: {
            size: { control: { type: "range", min: 8, max: 140, step: 1 } },
            angle: {
                control: { type: "range", min: -180, max: 180, step: 1 },
            },
            fill: { control: "color" },
            outlineColor: { control: "color" },
            outlineWidth: {
                control: { type: "range", min: 0, max: 24, step: 0.5 },
            },
            outlineOpacity: {
                control: { type: "range", min: 0, max: 1, step: 0.01 },
            },
            shadowColor: { control: "color" },
            shadowOpacity: {
                control: { type: "range", min: 0, max: 1, step: 0.01 },
            },
            shadowBlur: {
                control: { type: "range", min: 0, max: 24, step: 0.5 },
            },
            shadowOffsetX: {
                control: { type: "range", min: -24, max: 24, step: 1 },
            },
            shadowOffsetY: {
                control: { type: "range", min: -24, max: 24, step: 1 },
            },
            background: { control: "color" },
        },
        render: (args) => renderScene(runTextEffectsScene, args),
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
