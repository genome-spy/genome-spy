import { LitElement, css, html } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { formStyles } from "./componentStyles.js";

/**
 * @typedef {import("../../sampleView/state/payloadTypes.js").ComparisonOperatorType} ComparisonOperatorType
 */

/**
 * @typedef {object} ComparisonOperatorOption
 * @property {ComparisonOperatorType} value
 * @property {string} label
 * @property {string} title
 */

/** @type {ComparisonOperatorOption[]} */
export const COMPARISON_OPERATOR_OPTIONS = [
    { value: "lt", label: "<", title: "less than" },
    { value: "lte", label: "\u2264", title: "less than or equal to" },
    { value: "eq", label: "=", title: "equal to" },
    { value: "gte", label: "\u2265", title: "greater than or equal to" },
    { value: "gt", label: ">", title: "greater than" },
];

/**
 * Segmented comparison-operator button group.
 */
export default class ComparisonOperatorButtons extends LitElement {
    static properties = {
        value: { type: String },
        options: { attribute: false },
    };

    static styles = [
        formStyles,
        css`
            :host {
                display: block;
            }
        `,
    ];

    constructor() {
        super();
        /** @type {ComparisonOperatorType} */
        this.value = "lt";
        /** @type {ComparisonOperatorOption[]} */
        this.options = COMPARISON_OPERATOR_OPTIONS;
    }

    /** @param {ComparisonOperatorType} value */
    #choose(value) {
        this.value = value;
        this.dispatchEvent(new ComparisonOperatorChangeEvent(value));
    }

    render() {
        return html`<div class="btn-group" role="group">
            ${this.options.map(
                (option) =>
                    html`<button
                        class=${classMap({
                            btn: true,
                            chosen: option.value === this.value,
                        })}
                        .value=${option.value}
                        @click=${() => this.#choose(option.value)}
                        title=${option.title}
                    >
                        ${option.label}
                    </button>`
            )}
        </div>`;
    }
}

customElements.define(
    "gs-comparison-operator-buttons",
    ComparisonOperatorButtons
);

/**
 * @extends {Event}
 */
export class ComparisonOperatorChangeEvent extends Event {
    /** @type {ComparisonOperatorType} */
    value;

    /**
     * @param {ComparisonOperatorType} value
     */
    constructor(value) {
        super("change", { bubbles: true, composed: true });
        this.value = value;
    }
}
