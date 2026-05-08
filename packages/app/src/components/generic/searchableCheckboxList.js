import { icon } from "@fortawesome/fontawesome-svg-core";
import { faArrowUp } from "@fortawesome/free-solid-svg-icons";
import { LitElement, css, html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { createInputListener } from "../dialogs/saveImageDialog.js";
import { faStyles } from "./componentStyles.js";

/**
 * @typedef {import("@genome-spy/core/spec/channel.js").Scalar} Scalar
 */

/**
 * @typedef {object} SearchableCheckboxListItem
 * @property {Scalar} value
 * @property {string} label
 * @property {string} [searchText]
 */

/**
 * Searchable checkbox list for selecting multiple values from a finite domain.
 */
export default class SearchableCheckboxList extends LitElement {
    static properties = {
        items: { attribute: false },
        selectedValues: { attribute: false },
        placeholder: { type: String },
        selectedItemName: { type: String },
        itemMarker: { attribute: false },
        search: { state: true },
    };

    static styles = [
        faStyles,
        css`
            :host {
                display: block;
                --form-control-color: #212529;
                --form-control-border-color: #ced4da;
                --form-control-border: 1px solid
                    var(--form-control-border-color);
                --form-control-border-radius: 0.25em;
            }

            input[type="text"] {
                display: block;
                width: 100%;
                box-sizing: border-box;
                padding: 0.375em 0.75em;
                font-size: 1em;
                font-family: var(--font-family);
                line-height: 1.5;
                color: var(--form-control-color);
                background-color: #fff;
                background-clip: padding-box;
                border: var(--form-control-border);
                border-radius: var(--form-control-border-radius);
                transition:
                    border-color 0.15s ease-in-out,
                    box-shadow 0.15s ease-in-out;
            }

            input[type="text"]::placeholder {
                color: #a0a0a0;
            }

            .checkbox-list-wrapper {
                position: relative;
            }

            .search-note {
                position: absolute;
                inset: 0;
                display: grid;
                justify-content: center;
                align-content: center;

                color: #808080;
                font-size: 85%;

                pointer-events: none;

                > * {
                    position: relative;
                    top: 0.7em;
                }
            }

            .checkbox-list {
                color: var(--form-control-color);
                border: var(--form-control-border);
                border-radius: var(--form-control-border-radius);
                overflow: auto;
                max-height: 200px;
                box-sizing: border-box;

                padding: 0.375em 0.75em;

                margin: 0;
            }

            .color {
                display: inline-block;
                width: 0.5em;
                height: 1em;
                margin-right: 0.4em;
            }

            li {
                list-style: none;
            }

            label.checkbox {
                display: inline-block;
                margin-bottom: 0;

                &:hover {
                    background-color: #f4f4f4;
                }
            }

            small {
                display: block;
                margin-top: 0.3em;
                color: #606060;
            }
        `,
    ];

    constructor() {
        super();
        /** @type {SearchableCheckboxListItem[]} */
        this.items = [];
        /** @type {Scalar[]} */
        this.selectedValues = [];
        this.placeholder = "Type something to filter the list";
        this.selectedItemName = "items";
        /** @type {(value: Scalar) => import("lit").TemplateResult | typeof nothing} */
        this.itemMarker = () => nothing;
        this.search = "";
    }

    /**
     * @returns {SearchableCheckboxListItem[]}
     */
    getFilteredItems() {
        return this.items.filter((item) => {
            const searchText = item.searchText ?? item.label.toLowerCase();
            return this.search.length === 0 || searchText.includes(this.search);
        });
    }

    /** @param {HTMLInputElement} input */
    #onSearchInput(input) {
        this.search = input.value.toLowerCase();
    }

    /** @param {Event} event */
    #onChecked(event) {
        const checkbox = /** @type {HTMLInputElement} */ (event.target);
        const selectedValues = new Set(this.selectedValues);
        const item = this.items[+checkbox.value];

        if (checkbox.checked) {
            selectedValues.add(item.value);
        } else {
            selectedValues.delete(item.value);
        }

        this.selectedValues = this.items
            .map((candidate) => candidate.value)
            .filter((value) => selectedValues.has(value));
        this.dispatchEvent(
            new SearchableCheckboxListChangeEvent(this.selectedValues)
        );
    }

    /** @param {KeyboardEvent} event */
    #handleSearchKeyDown(event) {
        if (event.key == "ArrowDown") {
            const el = /** @type {HTMLInputElement} */ (
                this.renderRoot.querySelector(
                    ".checkbox-list li:first-child input[type='checkbox']"
                )
            );
            el?.focus();
            event.preventDefault();
            event.stopPropagation();
        } else if (event.key == "Enter") {
            const items = this.getFilteredItems();
            if (items.length == 1) {
                const selectedValues = new Set(this.selectedValues);
                selectedValues.add(items[0].value);
                this.selectedValues = this.items
                    .map((candidate) => candidate.value)
                    .filter((value) => selectedValues.has(value));
                this.dispatchEvent(
                    new SearchableCheckboxListChangeEvent(this.selectedValues)
                );
            }
            event.stopPropagation();
        }
    }

    /** @param {KeyboardEvent} event */
    #handleCheckboxKeyDown(event) {
        const element = /** @type {HTMLInputElement} */ (event.target);
        if (element.type != "checkbox") return;

        if (event.key == "ArrowDown") {
            const next = /** @type {HTMLInputElement} */ (
                element
                    .closest("li")
                    .nextElementSibling?.querySelector("input[type='checkbox']")
            );
            next?.focus();
            event.preventDefault();
        } else if (event.key == "ArrowUp") {
            const previous = /** @type {HTMLInputElement} */ (
                element
                    .closest("li")
                    .previousElementSibling?.querySelector(
                        "input[type='checkbox']"
                    )
            );
            if (previous) previous.focus();
            else this.#focusSearch();
            event.preventDefault();
        } else if (event.key == "Esc") {
            this.#focusSearch();
            event.stopPropagation();
        } else if (event.key == "Tab" && !event.shiftKey) {
            const last = /** @type {HTMLInputElement} */ (
                this.renderRoot.querySelector(
                    ".checkbox-list li:last-child input"
                )
            );
            last?.focus();
        } else if (event.key == "Tab" && event.shiftKey) {
            const first = /** @type {HTMLInputElement} */ (
                this.renderRoot.querySelector(
                    ".checkbox-list li:first-child input"
                )
            );
            first?.focus();
        }
    }

    #focusSearch() {
        const el = /** @type {HTMLInputElement} */ (
            this.renderRoot.querySelector("input[type='text']")
        );
        el?.focus();
    }

    updated() {
        // Prevent the checkbox list from changing size when filtering.
        const checkboxList = /** @type {HTMLElement | null} */ (
            this.renderRoot.querySelector(".checkbox-list")
        );
        if (checkboxList) {
            checkboxList.style.minHeight = `${checkboxList.offsetHeight}px`;
        }
    }

    render() {
        const selectedValues = new Set(this.selectedValues);
        const filteredItems = this.getFilteredItems();

        return html`
            <input
                autofocus
                type="text"
                placeholder=${this.placeholder}
                @keydown=${(/** @type {KeyboardEvent} */ event) =>
                    this.#handleSearchKeyDown(event)}
                @input=${createInputListener((input) =>
                    this.#onSearchInput(input)
                )}
            />
            <div class="checkbox-list-wrapper">
                <ul
                    class="checkbox-list"
                    @input=${(/** @type {Event} */ event) =>
                        this.#onChecked(event)}
                    @keydown=${(/** @type {KeyboardEvent} */ event) =>
                        this.#handleCheckboxKeyDown(event)}
                >
                    ${repeat(
                        filteredItems,
                        (item) => item.value,
                        (item) => {
                            return html`<li>
                                <label class="checkbox">
                                    ${this.itemMarker(item.value)}
                                    <input
                                        type="checkbox"
                                        .checked=${selectedValues.has(
                                            item.value
                                        )}
                                        .value=${String(
                                            this.items.indexOf(item)
                                        )}
                                    />
                                    ${item.label}
                                </label>
                            </li>`;
                        }
                    )}
                </ul>
                ${filteredItems.length == 0
                    ? html`<div class="search-note">
                          <div>Nothing found</div>
                      </div>`
                    : filteredItems.length == 1 && this.items.length > 1
                      ? html`<div class="search-note">
                            <div>
                                ${icon(faArrowUp).node[0]} Hit enter to select
                                the exact match
                            </div>
                        </div>`
                      : nothing}
            </div>
            <small>
                The number of selected ${this.selectedItemName}:
                <strong>${selectedValues.size}</strong>
            </small>
        `;
    }
}

customElements.define("gs-searchable-checkbox-list", SearchableCheckboxList);

/**
 * @extends {Event}
 */
export class SearchableCheckboxListChangeEvent extends Event {
    /** @type {Scalar[]} */
    values;

    /**
     * @param {Scalar[]} values
     */
    constructor(values) {
        super("change", { bubbles: true, composed: true });
        this.values = values;
    }
}
