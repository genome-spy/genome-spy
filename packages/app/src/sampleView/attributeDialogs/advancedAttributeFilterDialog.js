import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faArrowUp,
    faFilter,
    faTrashAlt,
} from "@fortawesome/free-solid-svg-icons";
import { css, html, nothing } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { repeat } from "lit/directives/repeat.js";
import { isContinuous, isDiscrete, isDiscretizing } from "vega-scale";
import { messageBox } from "../../utils/ui/modal.js";
import { classMap } from "lit/directives/class-map.js";
import "../../components/histogram.js";
import BaseDialog, { showDialog } from "../../components/dialogs/baseDialog.js";
import { createInputListener } from "../../components/dialogs/saveImageDialog.js";

const checkboxListStyles = css`
    .gs-checkbox-list-wrapper {
        position: relative;

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
    }

    .gs-checkbox-list {
        color: var(--form-control-color);
        border: var(--form-control-border);
        border-radius: var(--form-control-border-radius);
        overflow: auto;
        max-height: 200px;
        box-sizing: border-box;

        padding: 0.375em 0.75em;

        margin: 0;

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
            margin-bottom: 0;

            &:hover {
                background-color: #f4f4f4;
            }
        }

        .hidden {
            display: none;
        }
    }
`;

class DiscreteAttributeFilterDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        categories: {},
        attributeInfo: {},
        sampleView: {},
        categoryToMarker: {},
    };

    static styles = [...super.styles, checkboxListStyles];

    constructor() {
        super();
        /** @type {any[]} */
        this.categories = [];
        /** @type {any|null} */
        this.attributeInfo = null;
        /** @type {any|null} */
        this.sampleView = null;
        /** @type {(category: import("@genome-spy/core/utils/domainArray.js").scalar) => import("lit").TemplateResult} */
        this.categoryToMarker = null;

        this.selection = new Set();
        this.search = "";
    }

    willUpdate(/** @type {Map<string, any>} */ changed) {
        if (changed.has("attributeInfo")) {
            this.dialogTitle = `Filter by ${this.attributeInfo.name}`;
        }
    }

    getFilteredCategories() {
        return this.categories.filter(
            (category) =>
                this.search.length == 0 ||
                category.lowerCaseValue.includes(this.search)
        );
    }

    /** @param {HTMLInputElement} input */
    #onSearchInput(input) {
        this.search = input.value.toLowerCase();
        this.requestUpdate();
    }

    /** @param {Event} event */
    #onChecked(event) {
        const checkbox = /** @type {HTMLInputElement} */ (event.target);
        const category = this.categories[+checkbox.value].value;
        if (checkbox.checked) {
            this.selection.add(category);
        } else {
            this.selection.delete(category);
        }
        this.requestUpdate();
    }

    /** @param {KeyboardEvent} e */
    #handleSearchKeyDown(e) {
        if (e.key == "ArrowDown") {
            const el = /** @type {HTMLInputElement} */ (
                this.renderRoot.querySelector(
                    ".gs-checkbox-list li:first-child input[type='checkbox']"
                )
            );
            el?.focus();
            e.preventDefault();
            e.stopPropagation();
        } else if (e.key == "Enter") {
            const cats = this.getFilteredCategories();
            if (cats.length == 1) {
                this.selection.add(cats[0].value);
                this.requestUpdate();
            }
            e.stopPropagation();
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
                    ".gs-checkbox-list li:last-child input"
                )
            );
            last?.focus();
        } else if (event.key == "Tab" && event.shiftKey) {
            const first = /** @type {HTMLInputElement} */ (
                this.renderRoot.querySelector(
                    ".gs-checkbox-list li:first-child input"
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

    renderBody() {
        const filteredCats = this.getFilteredCategories();
        return html`<div class="gs-form-group">
            <p>Select one or more categories and choose an action.</p>
            <input
                autofocus
                type="text"
                placeholder="Type something to filter the list"
                @keydown=${(/** @type {KeyboardEvent} */ e) =>
                    this.#handleSearchKeyDown(e)}
                @input=${createInputListener((input) =>
                    this.#onSearchInput(input)
                )}
            />
            <div class="gs-checkbox-list-wrapper">
                <ul
                    class="gs-checkbox-list"
                    @input=${(/** @type {Event} */ e) => this.#onChecked(e)}
                    @keydown=${(/** @type {KeyboardEvent} */ e) =>
                        this.#handleCheckboxKeyDown(e)}
                >
                    ${repeat(
                        filteredCats,
                        (category) => category.value,
                        (category) =>
                            html`<li>
                                <label class="checkbox">
                                    ${this.categoryToMarker
                                        ? this.categoryToMarker(category.value)
                                        : nothing}
                                    <input
                                        type="checkbox"
                                        .checked=${this.selection.has(
                                            category.value
                                        )}
                                        .value=${"" + category.index}
                                    />
                                    ${category.stringValue}
                                </label>
                            </li>`
                    )}
                </ul>
                ${filteredCats.length == 0
                    ? html`<div class="search-note">
                          <div>Nothing found</div>
                      </div>`
                    : filteredCats.length == 1 && this.categories.length > 1
                      ? html`<div class="search-note">
                            <div>
                                ${icon(faArrowUp).node[0]} Hit enter to select
                                the exact match
                            </div>
                        </div>`
                      : nothing}
            </div>
            <small>
                The number of selected categories:
                <strong>${this.selection.size}</strong>
            </small>
        </div>`;
    }

    renderButtons() {
        return [
            this.makeButton("Cancel", () => this.finish({ ok: false })),
            this.makeButton("Retain", () => this.#onRetain(false), faFilter),
            this.makeButton("Remove", () => this.#onRetain(true), faTrashAlt),
        ];
    }

    updated() {
        // Prevent the checkbox list from changing size (to smaller) when filtering
        const checkboxList = /** @type {HTMLElement} */ (
            this.renderRoot.querySelector(".gs-checkbox-list")
        );
        checkboxList.style.minHeight = `${checkboxList.offsetHeight}px`;
    }

    /** @param {boolean} remove */
    #onRetain(remove) {
        this.sampleView.dispatchAttributeAction(
            this.sampleView.actions.filterByNominal({
                values: this.categories
                    .map((c) => c.value)
                    .filter((value) => this.selection.has(value)),
                attribute: this.attributeInfo.attribute,
                remove,
            })
        );
        this.finish({ ok: true });
    }
}

if (!customElements.get("gs-discrete-attribute-filter-dialog")) {
    customElements.define(
        "gs-discrete-attribute-filter-dialog",
        DiscreteAttributeFilterDialog
    );
}

class QuantitativeAttributeFilterDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        attributeInfo: {},
        sampleView: {},
        operator: {},
        operand: {},
    };

    constructor() {
        super();
        /** @type {import("../types.js").AttributeInfo} */
        this.attributeInfo = null;
        /** @type {import("../sampleView.js").default} */
        this.sampleView = null;
        this.operator = "lt";
        /** @type {number} */
        this.operand = undefined;
    }

    willUpdate(/** @type {Map<string, any>} */ changed) {
        if (changed.has("attributeInfo")) {
            this.dialogTitle = `Filter by ${this.attributeInfo.name}`;
        }
    }

    /** @param {Event} e */
    #operatorChanged(e) {
        const value = /** @type {HTMLInputElement} */ (e.target).value;
        this.operator = /** @type {ComparisonOperatorType} */ (value);
    }

    /** @param {HTMLInputElement} input */
    #operandChanged(input) {
        const value = input.value;
        if (/^\d+(\.(\d+)?)?$/.test(value)) {
            this.operand = +value;
        }
    }

    /** @param {import("../../components/histogram.js").ThresholdEvent} e */
    #thresholdAdded(e) {
        const val = /** @type {any} */ (e).detail?.value ?? e.value;
        if (typeof this.operand !== "number") this.operand = val;
    }

    /** @param {import("../../components/histogram.js").ThresholdEvent} e */
    #thresholdAdjusted(e) {
        this.operand = /** @type {any} */ (e).detail?.value ?? e.value;
    }

    renderBody() {
        const values = extractValues(
            this.attributeInfo,
            this.sampleView.leafSamples,
            this.sampleView.sampleHierarchy
        );

        return html`<div class="gs-form-group">
            <label
                >Retain samples where
                <em>${this.attributeInfo.name}</em> is</label
            >
            <div class="btn-group" role="group" style="margin-bottom: 1em;">
                ${Object.entries(verboseOps).map(
                    ([k, v]) =>
                        html`<button
                            class=${classMap({
                                btn: true,
                                chosen: k == this.operator,
                            })}
                            .value=${k}
                            @click=${(/** @type {Event} */ e) =>
                                this.#operatorChanged(e)}
                            title="${v[1]}"
                        >
                            ${v[0]}
                        </button>`
                )}
            </div>

            <genome-spy-histogram
                .values=${values}
                .thresholds=${[this.operand].filter((o) => o !== undefined)}
                .operators=${[this.operator]}
                .colors=${["#1f77b4", "#ddd"]}
                .showThresholdNumbers=${false}
                @add=${(
                    /** @type {import("../../components/histogram.js").ThresholdEvent} */ e
                ) => this.#thresholdAdded(e)}
                @adjust=${(
                    /** @type {import("../../components/histogram.js").ThresholdEvent} */ e
                ) => this.#thresholdAdjusted(e)}
            ></genome-spy-histogram>

            <input
                autofocus
                type="text"
                placeholder="... or enter a numeric value here"
                style="margin-top: 0.5em"
                .value=${typeof this.operand == "number"
                    ? "" + this.operand
                    : ""}
                @input=${createInputListener((input) =>
                    this.#operandChanged(input)
                )}
            />
        </div>`;
    }

    renderButtons() {
        return [
            this.makeButton("Cancel", () => this.finish({ ok: false })),
            this.makeButton("Retain", () => this.#onRetain(), faFilter),
        ];
    }

    #onRetain() {
        this.sampleView.dispatchAttributeAction(
            this.sampleView.actions.filterByQuantitative({
                attribute: this.attributeInfo.attribute,
                operator: /** @type {ComparisonOperatorType} */ (this.operator),
                operand: this.operand,
            })
        );
        this.finish({ ok: true });
    }
}

if (!customElements.get("gs-quantitative-attribute-filter-dialog")) {
    customElements.define(
        "gs-quantitative-attribute-filter-dialog",
        QuantitativeAttributeFilterDialog
    );
}

/**
 * @typedef {import("@genome-spy/core/spec/channel.js").Scalar} Scalar
 * @typedef {import("../state/sampleOperations.js").ComparisonOperatorType} ComparisonOperatorType
 */

/**
 * @param {import("../types.js").AttributeInfo} attribute
 * @param {import("../sampleView.js").default} sampleView TODO: Figure out a better way to pass typings
 */
export function advancedAttributeFilterDialog(attribute, sampleView) {
    const type = attribute.scale?.type;
    if (isDiscrete(type)) {
        discreteScaleAttributeFilterDialog(attribute, sampleView);
    } else if (isContinuous(type) || isDiscretizing(type)) {
        quantitativeAttributeFilterDialog(attribute, sampleView);
    } else if (attribute.type === "identifier") {
        identifierAttributeFilterDialog(attribute, sampleView);
    } else {
        messageBox("Not implemented (yet).");
    }
}

/**
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {import("../sampleView.js").default} sampleView TODO: Figure out a better way to pass typings
 */
export function identifierAttributeFilterDialog(attributeInfo, sampleView) {
    discreteAttributeFilterDialog(
        sampleView.getSamples().map((sample) => sample.id),
        attributeInfo,
        sampleView
    );
}

/**
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {import("../sampleView.js").default} sampleView TODO: Figure out a better way to pass typings
 */
export function discreteScaleAttributeFilterDialog(attributeInfo, sampleView) {
    const scale =
        /** @type {import("d3-scale").ScaleOrdinal<Scalar, Scalar>} */ (
            attributeInfo.scale
        );

    const categoryToMarker = (/** @type {Scalar} */ value) =>
        html`<span
            class="color"
            style=${styleMap({
                backgroundColor: scale(value).toString(),
            })}
        ></span>`;

    discreteAttributeFilterDialog(
        scale.domain(),
        attributeInfo,
        sampleView,
        categoryToMarker
    );
}

/**
 * @param {Scalar[]} categories
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {import("../sampleView.js").default} sampleView TODO: Figure out a better way to pass typings
 * @param {(value: Scalar) => (import("lit").TemplateResult | typeof nothing)} [categoryToMarker]
 */
export function discreteAttributeFilterDialog(
    categories,
    attributeInfo,
    sampleView,
    categoryToMarker = (value) => nothing
) {
    const presentValues = new Set(
        extractValues(
            attributeInfo,
            sampleView.leafSamples,
            sampleView.sampleHierarchy
        )
    );

    const categoryObjects = categories
        .filter((value) => presentValues.has(value))
        .map((value, index) => ({
            index,
            value,
            stringValue: `${value}`,
            lowerCaseValue: `${value}`.toLowerCase(),
        }));

    return showDialog(
        "gs-discrete-attribute-filter-dialog",
        (/** @type {any} */ el) => {
            el.categories = categoryObjects;
            el.attributeInfo = attributeInfo;
            el.sampleView = sampleView;
            el.categoryToMarker = categoryToMarker;
        }
    );
}

/**
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {import("../sampleView.js").default} sampleView TODO: Figure out a better way to pass typings
 */
export function quantitativeAttributeFilterDialog(attributeInfo, sampleView) {
    return showDialog(
        "gs-quantitative-attribute-filter-dialog",
        (/** @type {any} */ el) => {
            el.attributeInfo = attributeInfo;
            el.sampleView = sampleView;
        }
    );
}

/** @type {Record<ComparisonOperatorType, [string, string]>} */
const verboseOps = {
    lt: ["<", "less than"],
    lte: ["\u2264", "less than or equal to"],
    eq: ["=", "equal to"],
    gte: ["\u2265", "greater than or equal to"],
    gt: [">", "greater than"],
};

/**
 * Extract values for histogram
 *
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {string[]} samples
 * @param {import("../state/sampleSlice.js").SampleHierarchy} sampleHierarchy
 */
function extractValues(attributeInfo, samples, sampleHierarchy) {
    const a = attributeInfo.accessor;
    return /** @type {Scalar[]} */ (
        samples.map((sampleId) => a(sampleId, sampleHierarchy))
    );
}
