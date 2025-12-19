import { html } from "lit";
import "./histogram.js";

export default {
    title: "Components/Histogram",
    tags: ["autodocs"],
    args: {
        count: 1000,
        mean: 0,
        sd: 1,
        binCount: 40,
        width: 400,
    },
    argTypes: {
        count: { control: { type: "number", min: 1, max: 20000, step: 1 } },
        mean: { control: { type: "number", step: 0.1 } },
        sd: { control: { type: "number", min: 0.01, step: 0.1 } },
        binCount: { control: { type: "number", min: 4, max: 200, step: 1 } },
        width: { control: { type: "number", min: 100, max: 2000, step: 10 } },
        showThresholdNumbers: { control: "boolean" },
    },
};

function normalDataset(n = 100, mean = 0, sd = 1) {
    const out = [];
    for (let i = 0; i < n; i++) {
        // Box-Muller transform
        let u = 0;
        let v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
        out.push(z * sd + mean);
    }
    return out;
}

export const Basic = {
    render: (args) => html`
        <gs-histogram
            .values=${normalDataset(args.count, args.mean, args.sd)}
            .binCount=${args.binCount}
            ?showThresholdNumbers=${args.showThresholdNumbers}
            style="width: ${args.width}px"
        ></gs-histogram>
    `,
};

export const WithThresholds = {
    render: (args) => html`
        <gs-histogram
            .values=${normalDataset(args.count, args.mean, args.sd)}
            .thresholds=${[-1, 1]}
            .operators=${["lt", "gt"]}
            .binCount=${args.binCount}
            ?showThresholdNumbers=${args.showThresholdNumbers}
            style="width: ${args.width}px"
        ></gs-histogram>
    `,
};
