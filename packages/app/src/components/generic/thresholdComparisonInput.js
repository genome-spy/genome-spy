import { LitElement, css, html, nothing } from "lit";
import { formStyles } from "./componentStyles.js";
import "./comparisonOperatorButtons.js";
import "./histogram.js";

/**
 * @typedef {import("../../sampleView/state/payloadTypes.js").ComparisonOperatorType} ComparisonOperatorType
 */

/**
 * @param {string} value
 * @returns {number | undefined}
 */
export function parseThresholdOperand(value) {
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }

    const numericValue = Number(trimmed);
    return Number.isFinite(numericValue) ? numericValue : undefined;
}

/**
 * @param {number | undefined} operand
 * @returns {number[]}
 */
export function getSingleThresholds(operand) {
    return isFiniteNumber(operand) ? [operand] : [];
}

/**
 * @param {number | undefined} operand
 * @param {number} threshold
 * @returns {number}
 */
export function updateOperandFromAddedThreshold(operand, threshold) {
    return isFiniteNumber(operand) ? operand : threshold;
}

/**
 * Single-threshold comparison input with a histogram-backed threshold picker.
 */
export default class ThresholdComparisonInput extends LitElement {
    static properties = {
        values: { attribute: false },
        operator: { type: String },
        operand: { type: Number },
        autofocus: { type: Boolean, reflect: true },
        placeholder: { type: String },
    };

    static styles = [
        formStyles,
        css`
            :host {
                display: block;
            }

            .operator {
                margin-bottom: 1em;
            }

            input {
                margin-top: 0.5em;
            }
        `,
    ];

    constructor() {
        super();
        /** @type {unknown[]} */
        this.values = [];
        /** @type {ComparisonOperatorType} */
        this.operator = "lt";
        /** @type {number | undefined} */
        this.operand = undefined;
        this.autofocus = false;
        this.placeholder = "... or enter a numeric value here";
    }

    /** @returns {number[]} */
    get #numericValues() {
        return this.values.filter(isFiniteNumber);
    }

    /** @param {import("./comparisonOperatorButtons.js").ComparisonOperatorChangeEvent} event */
    #operatorChanged(event) {
        event.stopPropagation();
        this.operator = event.value;
        this.#dispatchChange();
    }

    /** @param {Event} event */
    #inputChanged(event) {
        const value = /** @type {HTMLInputElement} */ (event.target).value;
        const operand = parseThresholdOperand(value);
        if (operand !== undefined || value.trim() === "") {
            this.operand = operand;
            this.#dispatchChange();
        }
    }

    /** @param {import("./histogram.js").ThresholdEvent} event */
    #thresholdAdded(event) {
        const operand = updateOperandFromAddedThreshold(
            this.operand,
            event.value
        );
        if (operand !== this.operand) {
            this.operand = operand;
            this.#dispatchChange();
        }
    }

    /** @param {import("./histogram.js").ThresholdEvent} event */
    #thresholdAdjusted(event) {
        this.operand = event.value;
        this.#dispatchChange();
    }

    #dispatchChange() {
        this.dispatchEvent(
            new ThresholdComparisonInputChangeEvent(this.operator, this.operand)
        );
    }

    /** @param {FocusOptions} [options] */
    focus(options) {
        // Dialog autofocus targets the custom element host, so forward focus
        // to the editable field inside the shadow root.
        const input = /** @type {HTMLInputElement | null} */ (
            this.renderRoot.querySelector("input")
        );
        input?.focus(options);
    }

    render() {
        const numericValues = this.#numericValues;

        return html`
            <div class="gs-form-group">
                <gs-comparison-operator-buttons
                    class="operator"
                    .value=${this.operator}
                    @change=${(
                        /** @type {import("./comparisonOperatorButtons.js").ComparisonOperatorChangeEvent} */ event
                    ) => this.#operatorChanged(event)}
                ></gs-comparison-operator-buttons>

                ${numericValues.length
                    ? html`<gs-histogram
                          .values=${numericValues}
                          .thresholds=${getSingleThresholds(this.operand)}
                          .operators=${[this.operator]}
                          .colors=${["#1f77b4", "#ddd"]}
                          .showThresholdNumbers=${false}
                          @add=${(
                              /** @type {import("./histogram.js").ThresholdEvent} */ event
                          ) => this.#thresholdAdded(event)}
                          @adjust=${(
                              /** @type {import("./histogram.js").ThresholdEvent} */ event
                          ) => this.#thresholdAdjusted(event)}
                      ></gs-histogram>`
                    : nothing}

                <input
                    type="number"
                    placeholder=${this.placeholder}
                    .value=${isFiniteNumber(this.operand)
                        ? String(this.operand)
                        : ""}
                    @input=${(/** @type {Event} */ event) =>
                        this.#inputChanged(event)}
                />
            </div>
        `;
    }
}

customElements.define(
    "gs-threshold-comparison-input",
    ThresholdComparisonInput
);

/**
 * @extends {Event}
 */
export class ThresholdComparisonInputChangeEvent extends Event {
    /** @type {ComparisonOperatorType} */
    operator;

    /** @type {number | undefined} */
    operand;

    /**
     * @param {ComparisonOperatorType} operator
     * @param {number | undefined} operand
     */
    constructor(operator, operand) {
        super("change", { bubbles: true, composed: true });
        this.operator = operator;
        this.operand = operand;
    }
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
export function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
