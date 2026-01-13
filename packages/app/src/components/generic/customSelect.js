import { LitElement, html, css } from "lit";
import { computePosition, autoUpdate, flip, offset } from "@floating-ui/dom";
import { formStyles } from "./componentStyles.js";

/**
 * A lightweight custom select component that mimics the idea of
 * <selectedcontent>: the trigger shows nicely rendered content for the
 * currently selected option, and the popover lists all options.
 */
export default class CustomSelect extends LitElement {
    static properties = {
        options: { type: Array },
        /** Selected value (compared via getValue(option)) */
        value: {},
        /** Disable interaction */
        disabled: { type: Boolean },
        /** Custom renderer for both trigger and list options */
        renderOption: {
            attribute: false,
        },
        /** Maps option -> value. Defaults to identity or option.value */
        getValue: { attribute: false },
        /** Maps option -> label string used for aria/ids */
        getLabel: {
            attribute: false,
        },
        /** Internal: active item index in the list */
        _activeIndex: {
            state: true,
        },
        /** Internal: fallback open state when popover isn't supported */
        _open: {
            state: true,
        },
        //
    };

    /** @type {string} */
    _popoverId;

    /** @type {(() => void) | null} */
    _cleanupAutoUpdate;

    constructor() {
        super();
        /** @type {unknown[]} */
        this.options = [];
        this.value = null;
        this.disabled = false;
        /** @type {((opt: unknown) => unknown) | null} */
        this.renderOption = null;
        /** @type {(opt: unknown) => unknown} */
        this.getValue = (opt) =>
            opt &&
            typeof opt === "object" &&
            "value" in /** @type {any} */ (opt)
                ? /** @type {any} */ (opt).value
                : opt;
        /** @type {(opt: unknown) => string} */
        this.getLabel = (opt) =>
            opt &&
            typeof opt === "object" &&
            "label" in /** @type {any} */ (opt)
                ? String(/** @type {any} */ (opt).label)
                : String(opt);
        this._activeIndex = -1;
        this._open = false;
        this._popoverId = `gs-select-${Math.random().toString(36).slice(2)}`;
        this._cleanupAutoUpdate = null;
        //

        this.addEventListener("keydown", (/** @type {KeyboardEvent} */ e) => {
            // Prevent upstream handlers from interfering with navigation.
            e.stopPropagation();
        });
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        this.#detachOutsideClose();
        this.#stopPositionTracking();
    }

    static styles = [
        formStyles,
        css`
            :host {
                display: inline-block;
                font-size: inherit;
                font-family: inherit;
            }

            .container {
                position: relative;
                display: block;
                min-width: 12em;
            }

            .trigger.btn {
                width: 100%;
                justify-content: flex-start;
                gap: 0.5em;
            }

            .selected-content {
                display: inline-flex;
                align-items: center;
                gap: 0.5em;
                line-height: 1.4;
            }

            .panel {
                background: #fff;
                border: 1px solid var(--form-control-border-color);
                border-radius: var(--form-control-border-radius);
                box-shadow: 0px 8px 18px rgba(0, 0, 0, 0.12);
                padding: 0.35em 0.35em;
                max-height: 300px;
                overflow: auto;
                min-width: 100%;
                /* Avoid default focus ring on the container when keyboard-opening */
                outline: none;
            }

            .panel:focus,
            .panel:focus-visible {
                outline: none;
            }

            /* Popover positioned with floating-ui */
            .panel[popover] {
                position: absolute;
                margin: 0;
                inset: unset;
                border: 1px solid var(--form-control-border-color);
            }

            .option {
                display: flex;
                align-items: center;
                gap: 0.5em;
                padding: 0.35em 0.5em;
                border-radius: 0.3em;
                cursor: pointer;
                user-select: none;
            }

            .option:hover {
                background-color: #f3f4f6;
            }

            .option[aria-selected="true"] {
                background-color: #e9ecef;
            }

            .option.active {
                background-color: #eef3ff;
                outline: 2px solid #c6dbff;
                outline-offset: -2px;
            }
        `,
    ];

    /** @returns {HTMLElement | null} */
    #panelEl() {
        return /** @type {HTMLElement | null} */ (
            this.renderRoot.querySelector(`#${this._popoverId}`)
        );
    }

    /** @returns {HTMLElement | null} */
    #triggerEl() {
        return /** @type {HTMLElement | null} */ (
            this.renderRoot.querySelector(".trigger")
        );
    }

    /** @returns {number} */
    #indexOfValue() {
        const v = this.value;
        const idx = this.options.findIndex((o) => this.getValue(o) === v);
        return idx;
    }

    /** @returns {unknown} */
    #selectedOption() {
        const idx = this.#indexOfValue();
        return idx >= 0 ? this.options[idx] : null;
    }

    /** @param {unknown} option */
    #emitSelection(option) {
        const value = this.getValue(option);
        this.dispatchEvent(new SelectionChangeEvent(value, option));
    }

    /** @returns {void} */
    #openPanel() {
        this._open = true;
        // Initialize active index to current selection (or 0)
        const current = this.#indexOfValue();
        this._activeIndex = current >= 0 ? current : 0;
        // Show popover and set up positioning
        this.updateComplete.then(() => {
            const panel = this.#panelEl();
            if (panel) {
                panel.showPopover();
                this.#startPositionTracking();
                this.#scrollActiveIntoView();
                panel.focus();
            }
        });
    }

    /** @returns {void} */
    #closePanel() {
        this._open = false;
        this.#stopPositionTracking();
        const panel = this.#panelEl();
        if (panel) {
            panel.hidePopover();
        }
    }

    /** @returns {void} */
    #scrollActiveIntoView() {
        const panel = this.#panelEl();
        const active = panel?.querySelector(
            `[data-index="${this._activeIndex}"]`
        );
        active?.scrollIntoView({ block: "nearest" });
    }

    /** @returns {void} */
    #updatePosition() {
        const trigger = this.#triggerEl();
        const panel = this.#panelEl();
        if (!trigger || !panel) {
            return;
        }

        const triggerRect = trigger.getBoundingClientRect();
        panel.style.minWidth = `${triggerRect.width}px`;

        computePosition(trigger, panel, {
            placement: "bottom-start",
            middleware: [offset(4), flip()],
        }).then(({ x, y }) => {
            if (!this._open) {
                return;
            }
            panel.style.left = `${x}px`;
            panel.style.top = `${y}px`;
        });
    }

    /** @returns {void} */
    #startPositionTracking() {
        const trigger = this.#triggerEl();
        const panel = this.#panelEl();
        if (!trigger || !panel) {
            return;
        }

        this.#stopPositionTracking();
        this.#updatePosition();

        this._cleanupAutoUpdate = autoUpdate(trigger, panel, () =>
            this.#updatePosition()
        );
    }

    /** @returns {void} */
    #stopPositionTracking() {
        if (this._cleanupAutoUpdate) {
            this._cleanupAutoUpdate();
            this._cleanupAutoUpdate = null;
        }
    }

    /** @returns {void} */
    #attachOutsideClose() {
        // Popover API handles light dismiss automatically
    }

    /** @returns {void} */
    #detachOutsideClose() {
        // Popover API handles cleanup automatically
    }

    /** @param {MouseEvent} e */
    #onTriggerClick(e) {
        e.preventDefault();
        if (this.disabled) return;
        // Toggle fallback panel
        if (this._open) {
            this.#closePanel();
        } else {
            this.#openPanel();
        }
    }

    /** @param {KeyboardEvent} e */
    #onTriggerKeyDown(e) {
        if (this.disabled) return;
        if (
            e.key === "ArrowDown" ||
            e.key === "ArrowUp" ||
            e.key === " " ||
            e.key === "Enter"
        ) {
            e.preventDefault();
            this.#openPanel();
        }
    }

    /** @param {KeyboardEvent} e */
    #onListKeyDown(e) {
        if (e.key === "Escape") {
            e.preventDefault();
            this.#closePanel();
            /** @type {HTMLElement | null} */ (
                this.renderRoot.querySelector(".trigger")
            )?.focus();
            return;
        }

        if (e.key === "Enter") {
            e.preventDefault();
            const idx = this._activeIndex;
            if (idx >= 0 && idx < this.options.length) {
                const opt = this.options[idx];
                this.value = this.getValue(opt);
                this.#emitSelection(opt);
                this.#closePanel();
                /** @type {HTMLElement | null} */ (
                    this.renderRoot.querySelector(".trigger")
                )?.focus();
            }
            return;
        }

        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const dir = e.key === "ArrowDown" ? 1 : -1;
            const next = Math.max(
                0,
                Math.min(this.options.length - 1, this._activeIndex + dir)
            );
            this._activeIndex = next;
            this.#scrollActiveIntoView();
        }
    }

    /** @param {unknown} opt */
    #renderSelected(opt) {
        if (this.renderOption && opt) {
            return html`<span class="selected-content"
                >${this.renderOption(opt)}</span
            >`;
        }
        const label = opt ? this.getLabel(opt) : "";
        return html`<span class="selected-content">${label}</span>`;
    }

    /**
     * @param {unknown} opt
     * @param {number} index
     */
    #renderOptionRow(opt, index) {
        const selected = this.getValue(opt) === this.value;
        const active = index === this._activeIndex;
        const id = `${this._popoverId}-opt-${index}`;
        return html`
            <div
                id=${id}
                class=${active ? "option active" : "option"}
                role="option"
                aria-selected=${selected ? "true" : "false"}
                tabindex="-1"
                data-index=${index}
                @click=${() => {
                    this.value = this.getValue(opt);
                    this.#emitSelection(opt);
                    this.#closePanel();
                    /** @type {HTMLElement | null} */ (
                        this.renderRoot.querySelector(".trigger")
                    )?.focus();
                }}
                @mousemove=${() => {
                    this._activeIndex = index;
                }}
            >
                ${this.renderOption
                    ? this.renderOption(opt)
                    : html`${this.getLabel(opt)}`}
            </div>
        `;
    }

    render() {
        const selected = this.#selectedOption();
        const activeId =
            this._activeIndex >= 0
                ? `${this._popoverId}-opt-${this._activeIndex}`
                : undefined;

        return html`
            <div class="container">
                <button
                    class="trigger btn"
                    type="button"
                    popovertarget=${this._popoverId}
                    aria-haspopup="listbox"
                    aria-expanded=${this._open}
                    ?disabled=${this.disabled}
                    @click=${(/** @type {MouseEvent} */ e) =>
                        this.#onTriggerClick(e)}
                    @keydown=${(/** @type {KeyboardEvent} */ e) =>
                        this.#onTriggerKeyDown(e)}
                >
                    ${this.#renderSelected(selected)}
                </button>

                <div
                    id=${this._popoverId}
                    class="panel"
                    popover="auto"
                    role="listbox"
                    tabindex="0"
                    aria-activedescendant=${activeId}
                    @keydown=${(/** @type {KeyboardEvent} */ e) =>
                        this.#onListKeyDown(e)}
                    @toggle=${(/** @type {ToggleEvent} */ e) => {
                        if (e.newState === "closed" && this._open) {
                            this.#closePanel();
                        }
                    }}
                >
                    ${this.options.map((opt, i) =>
                        this.#renderOptionRow(opt, i)
                    )}
                </div>
            </div>
        `;
    }
}

customElements.define("gs-custom-select", CustomSelect);

/**
 * SelectionChangeEvent extends the standard Event and uses the native
 * 'change' type to signal selection changes. Consumers can read the selected
 * value from `event.target.value` or from the custom properties
 * `event.value`/`event.option`.
 *
 * @template T
 */
export class SelectionChangeEvent extends Event {
    /** @type {unknown} */ value;
    /** @type {T} */ option;

    /**
     * @param {unknown} value
     * @param {T} option
     */
    constructor(value, option) {
        super("change", { bubbles: true, composed: true });
        this.value = value;
        this.option = /** @type {T} */ (option);
    }
}
