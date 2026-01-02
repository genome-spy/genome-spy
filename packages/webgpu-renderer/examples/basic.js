import runBasicScene from "./basicScene.js";
import runHatchScene from "./hatchScene.js";
import runBarScene from "./barScene.js";
import runPointScene from "./pointScene.js";
import runThresholdScene from "./thresholdScene.js";
import runPiecewiseScene from "./piecewiseScene.js";
import runIndexScene from "./indexScene.js";
import runRuleScene from "./ruleScene.js";
import runLinkScene from "./linkScene.js";
import runTextScene from "./textScene.js";

const canvas = document.querySelector("canvas");
const picker = document.querySelector("select[data-example]");

const EXAMPLES = {
    basic: {
        label: "Animated Grid",
        run: runBasicScene,
    },
    hatch: {
        label: "Hatch Patterns",
        run: runHatchScene,
    },
    points: {
        label: "Point Grid",
        run: runPointScene,
    },
    bars: {
        label: "Bar Chart",
        run: runBarScene,
    },
    threshold: {
        label: "Threshold Colors",
        run: runThresholdScene,
    },
    piecewise: {
        label: "Piecewise Colors",
        run: runPiecewiseScene,
    },
    index: {
        label: "Index Scale",
        run: runIndexScene,
    },
    rules: {
        label: "Rules",
        run: runRuleScene,
    },
    links: {
        label: "Links",
        run: runLinkScene,
    },
    text: {
        label: "Text (Layout)",
        run: runTextScene,
    },
};

const getExampleKey = () => {
    const raw = window.location.hash.replace("#", "");
    if (raw && EXAMPLES[raw]) {
        return raw;
    }
    return "basic";
};

const syncDropdown = (key) => {
    if (!picker) {
        return;
    }
    picker.value = key;
};

const populateDropdown = () => {
    if (!picker) {
        return;
    }
    picker.innerHTML = "";
    for (const [key, example] of Object.entries(EXAMPLES)) {
        const option = document.createElement("option");
        option.value = key;
        option.textContent = example.label;
        picker.append(option);
    }
};

populateDropdown();

let cleanup = null;

const runExample = async (key) => {
    if (cleanup) {
        cleanup();
        cleanup = null;
    }
    const example = EXAMPLES[key] ?? EXAMPLES.basic;
    cleanup = await example.run(canvas);
};

const applyHash = () => {
    const key = getExampleKey();
    syncDropdown(key);
    runExample(key);
};

if (picker) {
    picker.addEventListener("change", (event) => {
        const value = event.target.value;
        window.location.hash = value;
    });
}

window.addEventListener("hashchange", applyHash);

if (!window.location.hash) {
    window.location.hash = "basic";
}

applyHash();
