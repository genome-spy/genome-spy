import { embed, intervalSelection } from "@genome-spy/core/minimal";
import { html, render } from "lit";

/** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
const spec = {
    width: 300,
    height: 300,
    params: [
        { name: "threshold", value: 4 },
        { name: "doubleThreshold", expr: "threshold * 2" },
        {
            name: "brush",
            select: { type: "interval", encodings: ["x", "y"] },
        },
    ],
    layer: [
        {
            data: {
                values: [
                    { sample: "A", x: 1, y: 2 },
                    { sample: "B", x: 2, y: 5 },
                    { sample: "C", x: 3, y: 7 },
                    { sample: "D", x: 4, y: 3 },
                    { sample: "E", x: 5, y: 9 },
                ],
            },
            transform: [{ type: "filter", expr: "datum.y >= threshold" }],
            name: "scatter",
            width: 300,
            height: 220,
            mark: { type: "point", size: 120 },
            encoding: {
                x: { field: "x", type: "quantitative" },
                y: { field: "y", type: "quantitative" },
                color: {
                    condition: {
                        param: "brush",
                        field: "sample",
                        type: "nominal",
                    },
                    value: "lightgray",
                },
            },
        },
        {
            data: { values: [{}] },
            name: "thresholdLine",
            mark: {
                type: "rule",
            },
            encoding: {
                y: { datum: { expr: "threshold" } },
            },
        },
    ],
};

const container = document.getElementById("container");
const dashboard = document.getElementById("dashboard");

const api = await embed(container, spec);

/** @type {import("@genome-spy/core/types/embedApi.js").ParamApi<number>} */
const threshold = api.getParam("threshold");

/** @type {import("@genome-spy/core/types/embedApi.js").ParamApi<import("@genome-spy/core/types/selectionTypes.js").IntervalSelection>} */
const brush = api.getParam("brush");

/** @type {import("@genome-spy/core/types/embedApi.js").ParamApi<number>} */
const doubleThreshold = api.getParam("doubleThreshold");

threshold.subscribe(updateDashboard);
brush.subscribe(updateDashboard);
doubleThreshold.subscribe(updateDashboard);

updateDashboard();

function updateDashboard() {
    render(
        html`
            <p>
                threshold: <code>${JSON.stringify(threshold.getValue())}</code>
            </p>
            <p>
                doubleThreshold:
                <code>${JSON.stringify(doubleThreshold.getValue())}</code>
            </p>
            <p>brush: <code>${JSON.stringify(brush.getValue())}</code></p>
            <p>
                <button
                    @click=${() =>
                        brush.setValue(
                            intervalSelection({
                                x: [1.5, 4.5],
                                y: [3, 8],
                            })
                        )}
                >
                    Set brush
                </button>
                <button
                    @click=${() =>
                        brush.setValue(
                            intervalSelection({
                                x: null,
                                y: null,
                            })
                        )}
                >
                    Clear brush
                </button>
            </p>
            <p>
                <button
                    @click=${() => threshold.setValue(threshold.getValue() - 1)}
                >
                    Decrease threshold
                </button>
                <button
                    @click=${() => threshold.setValue(threshold.getValue() + 1)}
                >
                    Increase threshold
                </button>
            </p>
        `,
        dashboard
    );
}
