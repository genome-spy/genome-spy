import { LitElement, css, html, nothing } from "lit";
import { formStyles } from "./formStyles.js";

/**
 * @typedef {"lt" | "lte" | "eq" | "gte" | "gt"} ComparisonOperatorType
 */

/** @satisfies {{ value: ComparisonOperatorType, label: string, ariaLabel: string }[]} */
const operatorOptions = [
    { value: "lt", label: "<", ariaLabel: "Less than" },
    { value: "lte", label: "≤", ariaLabel: "Less than or equal to" },
    { value: "eq", label: "=", ariaLabel: "Equal to" },
    { value: "gte", label: "≥", ariaLabel: "Greater than or equal to" },
    { value: "gt", label: ">", ariaLabel: "Greater than" },
];

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
 * Edit a comparison operator and one numeric threshold. Finite sample values
 * add an interactive histogram to the numeric input.
 *
 * @tag gs-threshold-comparison-input
 * @fires {ThresholdComparisonInputChangeEvent} change - Bubbles across shadow roots with `event.operator` and `event.operand`.
 * @csspart input - Numeric threshold field.
 * @cssprop --gs-theme-primary - Highlight color for matching values in the histogram.
 * @cssprop --gs-control-border - Field border and color for the other histogram bars.
 * @cssprop --gs-histogram-background - Histogram surface.
 */
export default class ThresholdComparisonInput extends LitElement {
    static properties = {
        values: { attribute: false },
        operator: { type: String },
        operand: { type: Number },
        autofocus: { type: Boolean, reflect: true },
        label: { type: String, attribute: "aria-label" },
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
                font-size: 1.3em;
            }

            input {
                margin-top: 0.5em;
            }
        `,
    ];

    constructor() {
        super();
        /** @type {unknown[]} Samples for the histogram. The component uses finite numbers. */
        this.values = [];
        /** @type {ComparisonOperatorType} Active comparison operator. */
        this.operator = "lt";
        /** @type {number | undefined} Numeric threshold. Undefined displays an empty field. */
        this.operand = undefined;
        /** Mark this control as an autofocus target for the containing dialog. */
        this.autofocus = false;
        /** Accessible name for the numeric threshold field. */
        this.label = "Threshold value";
        /** Prompt in the empty numeric field. */
        this.placeholder = "... or enter a numeric value here";
    }

    /** @returns {number[]} */
    get #numericValues() {
        return this.values.filter(isFiniteNumber);
    }

    /** @param {import("./segmentedControl.js").SegmentedControlChangeEvent} event */
    #operatorChanged(event) {
        event.stopPropagation();
        this.operator = /** @type {ComparisonOperatorType} */ (event.value);
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

    /** @returns {import("lit").HTMLTemplateResult} */
    render() {
        const numericValues = this.#numericValues;

        return html`
            <div class="gs-form-group">
                <gs-segmented-control
                    class="operator"
                    label="Comparison operator"
                    .options=${operatorOptions}
                    .value=${this.operator}
                    @change=${(
                        /** @type {import("./segmentedControl.js").SegmentedControlChangeEvent} */ event
                    ) => this.#operatorChanged(event)}
                ></gs-segmented-control>

                ${
                    numericValues.length
                        ? html`<gs-histogram
                              .values=${numericValues}
                              .thresholds=${getSingleThresholds(this.operand)}
                              .operators=${[this.operator]}
                              .colors=${[
                                  "var(--gs-theme-primary, #1f77b4)",
                                  "var(--gs-control-border, #ddd)",
                              ]}
                              .showThresholdNumbers=${false}
                              @add=${(
                                  /** @type {import("./histogram.js").ThresholdEvent} */ event
                              ) => this.#thresholdAdded(event)}
                              @adjust=${(
                                  /** @type {import("./histogram.js").ThresholdEvent} */ event
                              ) => this.#thresholdAdjusted(event)}
                          ></gs-histogram>`
                        : nothing
                }

                <input
                    type="number"
                    part="input"
                    aria-label=${this.label || "Threshold value"}
                    placeholder=${this.placeholder}
                    .value=${
                        isFiniteNumber(this.operand) ? String(this.operand) : ""
                    }
                    @input=${(/** @type {Event} */ event) =>
                        this.#inputChanged(event)}
                />
            </div>
        `;
    }
}

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
