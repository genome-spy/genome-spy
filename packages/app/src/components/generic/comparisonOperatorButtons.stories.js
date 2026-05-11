import { LitElement, css, html } from "lit";
import "./comparisonOperatorButtons.js";

export default {
    title: "Components/ComparisonOperatorButtons",
    tags: ["autodocs"],
    args: {
        value: "gte",
    },
    argTypes: {
        value: {
            control: { type: "select" },
            options: ["lt", "lte", "eq", "gte", "gt"],
        },
    },
};

if (!customElements.get("gs-comparison-operator-buttons-demo")) {
    class ComparisonOperatorButtonsDemo extends LitElement {
        static properties = {
            value: { type: String },
        };

        static styles = css`
            .stack {
                display: grid;
                gap: 0.5rem;
                max-width: 360px;
                padding: 1rem;
            }

            .selected {
                font-size: 0.92rem;
                color: #4c4c4c;
            }
        `;

        constructor() {
            super();
            this.value = "gte";
        }

        render() {
            return html`
                <div class="stack">
                    <gs-comparison-operator-buttons
                        .value=${this.value}
                        @change=${(/** @type {Event} */ event) => {
                            const change =
                                /** @type {import("./comparisonOperatorButtons.js").ComparisonOperatorChangeEvent} */ (
                                    event
                                );
                            this.value = change.value;
                        }}
                    ></gs-comparison-operator-buttons>
                    <div class="selected">Selected: ${this.value}</div>
                </div>
            `;
        }
    }

    customElements.define(
        "gs-comparison-operator-buttons-demo",
        ComparisonOperatorButtonsDemo
    );
}

export const Basic = {
    render: (/** @type {any} */ args) => html`
        <gs-comparison-operator-buttons-demo
            value=${args.value}
        ></gs-comparison-operator-buttons-demo>
    `,
};
