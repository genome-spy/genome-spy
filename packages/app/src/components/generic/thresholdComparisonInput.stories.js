import { LitElement, css, html } from "lit";
import "./thresholdComparisonInput.js";

const VALUES = [
    -2.5, -1.8, -1.2, -0.9, -0.4, -0.2, 0.1, 0.2, 0.4, 0.7, 0.8, 1.1, 1.4, 1.8,
    2.2,
];

export default {
    title: "Components/ThresholdComparisonInput",
    tags: ["autodocs"],
    args: {
        operator: "gte",
        operand: 0.4,
        width: 420,
        autofocus: false,
    },
    argTypes: {
        operator: {
            control: { type: "select" },
            options: ["lt", "lte", "eq", "gte", "gt"],
        },
        operand: { control: { type: "number", step: 0.1 } },
        width: { control: { type: "number", min: 200, max: 800, step: 10 } },
        autofocus: { control: "boolean" },
    },
};

if (!customElements.get("gs-threshold-comparison-input-demo")) {
    class ThresholdComparisonInputDemo extends LitElement {
        static properties = {
            operator: { type: String },
            operand: { type: Number },
            width: { type: Number },
            autofocus: { type: Boolean },
        };

        static styles = css`
            .stack {
                display: grid;
                gap: 0.5rem;
                padding: 1rem;
            }

            .selected {
                font-size: 0.92rem;
                color: #4c4c4c;
            }
        `;

        constructor() {
            super();
            this.operator = "gte";
            this.operand = 0.4;
            this.width = 420;
            this.autofocus = false;
        }

        render() {
            return html`
                <div class="stack" style="max-width: ${this.width}px">
                    <gs-threshold-comparison-input
                        ?autofocus=${this.autofocus}
                        .values=${VALUES}
                        .operator=${this.operator}
                        .operand=${this.operand}
                        @change=${(/** @type {Event} */ event) => {
                            const change =
                                /** @type {import("./thresholdComparisonInput.js").ThresholdComparisonInputChangeEvent} */ (
                                    event
                                );
                            this.operator = change.operator;
                            this.operand = change.operand;
                        }}
                    ></gs-threshold-comparison-input>
                    <div class="selected">
                        Selected: ${this.operator}
                        ${typeof this.operand === "number"
                            ? this.operand
                            : "..."}
                    </div>
                </div>
            `;
        }
    }

    customElements.define(
        "gs-threshold-comparison-input-demo",
        ThresholdComparisonInputDemo
    );
}

export const Basic = {
    render: (/** @type {any} */ args) => html`
        <gs-threshold-comparison-input-demo
            operator=${args.operator}
            .operand=${args.operand}
            .width=${args.width}
            ?autofocus=${args.autofocus}
        ></gs-threshold-comparison-input-demo>
    `,
};
