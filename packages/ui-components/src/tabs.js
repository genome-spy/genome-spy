import { LitElement, css, html } from "lit";
import { repeat } from "lit/directives/repeat.js";

/**
 * @typedef {object} TabOption
 * @property {string} value Unique, nonempty ID matching the panel's slot name.
 * @property {string} label Text shown on the tab.
 */

/**
 * Switch between mounted panels using a horizontal tab list. Supply one
 * named slot per tab, using the tab's value as the slot name.
 *
 * @tag gs-tabs
 * @fires {TabsChangeEvent} gs-tab-change - Bubbles across shadow roots with the newly selected tab on `event.value`.
 * @csspart tablist - Row containing the tabs.
 * @csspart tab - A tab button. The active tab has `aria-selected="true"`.
 * @csspart panel - Container for a slotted panel.
 * @cssprop --gs-control-border - Border around the active tab.
 * @cssprop --gs-divider-color - Separator below the tab row.
 * @cssprop --gs-selected-background - Active tab fill.
 * @cssprop --gs-hover-background - Hovered tab fill.
 * @cssprop --gs-focus-color - Keyboard focus outline.
 */
export default class Tabs extends LitElement {
    static properties = {
        label: { type: String },
        tabs: { attribute: false },
        value: { type: String },
    };

    static styles = css`
        :host {
            display: block;
            --tab-border: var(--gs-control-border, #ced4da);
        }

        :host([hidden]) {
            display: none;
        }

        [role="tablist"] {
            display: flex;
            margin-block-end: var(--gs-basic-spacing, 10px);

            &::after {
                content: "";
                flex: 1;
                border-block-end: 1px solid
                    var(--gs-divider-color, var(--tab-border));
            }
        }

        [role="tab"] {
            padding: 0.6em var(--gs-basic-spacing, 10px);
            border: 1px solid transparent;
            border-block-end-color: var(--gs-divider-color, var(--tab-border));
            border-radius: var(--gs-control-radius, 5px)
                var(--gs-control-radius, 5px) 0 0;
            background: var(--gs-control-background, transparent);
            color: var(--gs-control-text, inherit);
            font: inherit;
            cursor: pointer;

            &:hover {
                background: var(
                    --gs-hover-background,
                    var(--gs-control-background, #f0f2f4)
                );
            }

            &[aria-selected="true"] {
                border-color: var(--tab-border);
                border-block-end-color: transparent;
                background: var(
                    --gs-selected-background,
                    var(--gs-control-background, transparent)
                );
                font-weight: 600;
            }

            &:focus-visible {
                z-index: 1;
            }
        }

        [role]:focus-visible {
            outline: 2px solid var(--gs-focus-color, #2563a6);
            outline-offset: 2px;
        }

        @media (forced-colors: active) {
            [role="tab"][aria-selected="true"] {
                border-color: Highlight;
            }
        }
    `;

    constructor() {
        super();

        /** Accessible name of the tab list. */
        this.label = "Tabs";

        /** @type {TabOption[]} Tabs in display order. Assign a new array to update. */
        this.tabs = [];

        /** Selected tab ID. Defaults to the first tab when no value matches. */
        this.value = "";
    }

    willUpdate() {
        if (
            this.tabs.length &&
            !this.tabs.some((tab) => tab.value === this.value)
        ) {
            this.value = this.tabs[0].value;
        }
    }

    /** @param {number} index */
    #activate(index) {
        const value = this.tabs[index].value;
        const button = /** @type {HTMLButtonElement} */ (
            this.renderRoot.querySelector("#tab-" + index)
        );
        button.focus();

        if (value !== this.value) {
            this.value = value;
            this.dispatchEvent(new TabsChangeEvent(value));
        }
    }

    /**
     * @param {KeyboardEvent} event
     * @param {number} index
     */
    #onKeyDown(event, index) {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
            return;
        }

        const count = this.tabs.length;
        let next;
        switch (event.key) {
            case "ArrowLeft":
            case "ArrowRight": {
                const rtl = getComputedStyle(this).direction === "rtl";
                const forward = (event.key === "ArrowRight") !== rtl;
                next = (index + (forward ? 1 : -1) + count) % count;
                break;
            }
            case "Home":
                next = 0;
                break;
            case "End":
                next = count - 1;
                break;
            default:
                return;
        }
        event.preventDefault();
        this.#activate(next);
    }

    /** @returns {import("lit").HTMLTemplateResult} */
    render() {
        return html`
            <div part="tablist" role="tablist" aria-label=${this.label}>
                ${repeat(
                    this.tabs,
                    (tab) => tab.value,
                    ({ value, label }, index) => html`
                        <button
                            type="button"
                            part="tab"
                            role="tab"
                            id=${"tab-" + index}
                            aria-controls=${"panel-" + index}
                            aria-selected=${String(this.value === value)}
                            tabindex=${this.value === value ? 0 : -1}
                            @click=${() => this.#activate(index)}
                            @keydown=${(/** @type {KeyboardEvent} */ event) =>
                                this.#onKeyDown(event, index)}
                        >
                            ${label}
                        </button>
                    `
                )}
            </div>
            ${repeat(
                this.tabs,
                (tab) => tab.value,
                ({ value }, index) => html`
                    <div
                        part="panel"
                        role="tabpanel"
                        id=${"panel-" + index}
                        aria-labelledby=${"tab-" + index}
                        tabindex="0"
                        ?hidden=${this.value !== value}
                    >
                        <slot name=${value}></slot>
                    </div>
                `
            )}
        `;
    }
}

export class TabsChangeEvent extends Event {
    /** @param {string} value ID of the selected tab. */
    constructor(value) {
        super("gs-tab-change", { bubbles: true, composed: true });
        this.value = value;
    }
}
