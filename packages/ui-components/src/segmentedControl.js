import { LitElement, css, html, nothing } from "lit";
import { live } from "lit/directives/live.js";
import { formStyles } from "./formStyles.js";

/**
 * @typedef {object} SegmentedControlOption
 * @property {string} value Unique ID for this option.
 * @property {string} label Text shown on the segment.
 * @property {string} [ariaLabel] Accessible name and tooltip for a symbolic label.
 */

/**
 * Choose one value from a short list using a group of native radio inputs.
 *
 * @tag gs-segmented-control
 * @fires {SegmentedControlChangeEvent} change - Bubbles across shadow roots with the new selection on `event.value`.
 * @csspart segment - Label of a radio option.
 * @cssprop --gs-button-background - Unselected segment fill.
 * @cssprop --gs-button-selected-background - Selected segment fill.
 * @cssprop --gs-button-selected-shadow - Selected segment shadow.
 * @cssprop --gs-focus-color - Keyboard focus outline.
 */
export default class SegmentedControl extends LitElement {
    static properties = {
        label: { type: String },
        value: { type: String },
        options: { attribute: false },
    };

    static styles = [
        formStyles,
        css`
            :host {
                display: block;
            }

            .btn-group {
                font-size: inherit;
            }

            label {
                position: relative;
            }

            input {
                position: absolute;
                width: 1px;
                height: 1px;
                clip-path: inset(50%);
            }

            label:has(input:focus-visible) {
                outline: 2px solid var(--gs-focus-color, #2563a6);
                outline-offset: 2px;
                z-index: 1;
            }

            @media (forced-colors: active) {
                label.chosen {
                    border-color: Highlight;
                }
            }
        `,
    ];

    constructor() {
        super();
        /** Accessible name for the group. */
        this.label = "";
        /** Selected option ID. An unmatched value leaves the group unselected. */
        this.value = "";
        /** @type {SegmentedControlOption[]} Choices shown in display order. */
        this.options = [];
    }

    /** @param {Event} event */
    #change(event) {
        event.stopPropagation();
        this.value = /** @type {HTMLInputElement} */ (
            event.currentTarget
        ).value;
        this.dispatchEvent(new SegmentedControlChangeEvent(this.value));
    }

    /** @returns {import("lit").HTMLTemplateResult} */
    render() {
        return html`<div
            class="btn-group"
            role="radiogroup"
            aria-label=${this.label}
        >
            ${this.options.map(
                ({ value, label, ariaLabel }) =>
                    html`<label
                        class=${value === this.value ? "btn chosen" : "btn"}
                        part="segment"
                        title=${ariaLabel ?? nothing}
                    >
                        <input
                            type="radio"
                            name="option"
                            .value=${value}
                            .checked=${live(value === this.value)}
                            aria-label=${ariaLabel ?? nothing}
                            @change=${this.#change}
                        />
                        ${label}
                    </label>`
            )}
        </div>`;
    }
}

export class SegmentedControlChangeEvent extends Event {
    /** @param {string} value The selected option ID. */
    constructor(value) {
        super("change", { bubbles: true, composed: true });
        this.value = value;
    }
}
