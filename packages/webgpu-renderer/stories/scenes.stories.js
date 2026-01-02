import { renderScene } from "./sceneRunner.js";
import runBasicScene from "../examples/basicScene.js";
import runHatchScene from "../examples/hatchScene.js";
import runBarScene from "../examples/barScene.js";
import runPointScene from "../examples/pointScene.js";
import runThresholdScene from "../examples/thresholdScene.js";
import runPiecewiseScene from "../examples/piecewiseScene.js";
import runIndexScene from "../examples/indexScene.js";
import runRuleScene from "../examples/ruleScene.js";
import runLinkScene from "../examples/linkScene.js";
import runTextScene from "../examples/textScene.js";
import runRangedTextScene from "../examples/rangedTextScene.js";

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
