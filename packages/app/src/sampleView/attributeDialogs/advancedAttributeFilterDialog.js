import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faArrowUp,
    faFilter,
    faTrashAlt,
} from "@fortawesome/free-solid-svg-icons";
import { html, nothing, render } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { repeat } from "lit/directives/repeat.js";
import { isContinuous, isDiscrete, isDiscretizing } from "vega-scale";
import { createModal, messageBox } from "../../utils/ui/modal.js";
import { classMap } from "lit/directives/class-map.js";
import "../../components/histogram.js";

/**
 * @typedef {import("@genome-spy/core/spec/channel.js").Scalar} Scalar
 * @typedef {import("../sampleOperations.js").ComparisonOperatorType} ComparisonOperatorType
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
    const store = sampleView.provenance.store;

    const presentValues = new Set(
        extractValues(
            attributeInfo,
            sampleView.leafSamples,
            sampleView.sampleHierarchy
        )
    );

    // Use domain to maintain a consistent order
    const categoryObjects = categories
        .filter((value) => presentValues.has(value))
        .map((value, index) => ({
            index,
            value,
            stringValue: `${value}`,
            lowerCaseValue: `${value}`.toLowerCase(),
        }));

    const modal = createModal();

    const templateTitle = html`
        <div class="modal-title">Filter by <em>${attributeInfo.name}</em></div>
    `;

    /** @type {Set<Scalar>} */
    const selection = new Set();

    /** Filter the listed categories */
    let search = "";

    const dispatchAndClose = (/** @type {boolean} */ remove) => {
        store.dispatch(
            sampleView.actions.filterByNominal({
                // Sort the selection based on the domain. Otherwise they are in the selection order.
                values: categories.filter((value) => selection.has(value)),
                attribute: attributeInfo.attribute,
                remove,
            })
        );
        modal.close();
    };

    const getFilteredCategories = () =>
        categoryObjects.filter(
            (category) =>
                search.length == 0 || category.lowerCaseValue.includes(search)
        );

    const updateSearch = (/** @type {InputEvent} */ event) => {
        const input = /** @type {HTMLInputElement} */ (event.target);
        search = input.value.toLowerCase();
        updateHtml();
    };

    const updateChecked = (/** @type {InputEvent} */ event) => {
        const checkbox = /** @type {HTMLInputElement} */ (event.target);
        const category = categoryObjects[+checkbox.value].value;
        if (checkbox.checked) {
            selection.add(category);
        } else {
            selection.delete(category);
        }
        updateHtml();
    };

    const handleSearchKeyDown = (/** @type {KeyboardEvent} */ event) => {
        if (event.key == "ArrowDown") {
            /** @type {HTMLInputElement} */ (
                modal.content.querySelector(
                    ".gs-checkbox-list li:first-child input[type='checkbox']"
                )
            )?.focus();
            event.preventDefault();
            event.stopPropagation();
        } else if (event.key == "Enter") {
            const categories = getFilteredCategories();
            if (categories.length == 1) {
                selection.add(categories[0].value);
                updateHtml();
            }
            event.stopPropagation();
        }
    };

    const focusSearch = () => {
        /** @type {HTMLElement} */ (
            modal.content.querySelector("input[type='text']")
        ).focus();
    };

    const handleCheckboxKeyDown = (/** @type {KeyboardEvent} */ event) => {
        const element = /** @type {HTMLInputElement} */ (event.target);

        if (element.type != "checkbox") {
            return;
        }

        if (event.key == "ArrowDown") {
            /** @type {HTMLInputElement} */ (
                element
                    .closest("li")
                    .nextElementSibling?.querySelector("input[type='checkbox']")
            )?.focus();
            event.preventDefault();
        } else if (event.key == "ArrowUp") {
            const previous = /** @type {HTMLInputElement} */ (
                element
                    .closest("li")
                    .previousElementSibling?.querySelector(
                        "input[type='checkbox']"
                    )
            );

            if (previous) {
                previous.focus();
            } else {
                focusSearch();
            }
            event.preventDefault();
        } else if (event.key == "Esc") {
            focusSearch();
            event.stopPropagation();
        } else if (event.key == "Tab" && !event.shiftKey) {
            // Don't prevent default, let the browser move focus to the next focusable element
            // after we have focused the last checkbox.
            /** @type {HTMLInputElement} */ (
                element
                    .closest(".gs-checkbox-list")
                    .querySelector("li:last-child input")
            )?.focus();
        } else if (event.key == "Tab" && event.shiftKey) {
            /** @type {HTMLInputElement} */ (
                element
                    .closest(".gs-checkbox-list")
                    .querySelector("li:first-child input")
            )?.focus();
        }
    };

    const templateButtons = () =>
        html` <div class="modal-buttons">
            <button class="btn btn-cancel" @click=${() => modal.close()}>
                Cancel
            </button>

            <button
                class="btn"
                ?disabled=${!selection.size}
                @click=${() => dispatchAndClose(false)}
            >
                ${icon(faFilter).node[0]} Retain
            </button>
            <button
                class="btn"
                ?disabled=${!selection.size}
                @click=${() => dispatchAndClose(true)}
            >
                ${icon(faTrashAlt).node[0]} Remove
            </button>
        </div>`;

    function updateHtml() {
        const filteredCats = getFilteredCategories();

        const template = html`<div class="gs-form-group">
            <p>Please select one or more categories and choose an action.</p>
            <input
                type="text"
                placeholder="Type something to filter the list"
                @keydown=${handleSearchKeyDown}
                @input=${updateSearch}
            />
            <div class="gs-checkbox-list-wrapper">
                <ul
                    class="gs-checkbox-list"
                    @input=${updateChecked}
                    @keydown=${handleCheckboxKeyDown}
                >
                    ${repeat(
                        filteredCats,
                        (category) => category.value,
                        (category) =>
                            html`<li>
                                <label class="checkbox">
                                    ${categoryToMarker(category.value)}
                                    <input
                                        type="checkbox"
                                        .checked=${selection.has(
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
                    : // check length of (all) categories to ensure there's room for the label
                      filteredCats.length == 1 && categoryObjects.length > 1
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
                <strong>${selection.size}</strong>
            </small>
        </div>`;

        render(
            html`${templateTitle}
                <div class="modal-body">${template}</div>
                ${templateButtons()}`,
            modal.content
        );

        // Ensure that checkbox list's height stays constant when the list is filtered
        const checkboxList = /** @type {HTMLElement} */ (
            modal.content.querySelector(".gs-checkbox-list")
        );
        checkboxList.style.minHeight = `${checkboxList.offsetHeight}px`;
    }

    updateHtml();
    focusSearch();
}

/**
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {import("../sampleView.js").default} sampleView TODO: Figure out a better way to pass typings
 */
export function quantitativeAttributeFilterDialog(attributeInfo, sampleView) {
    const store = sampleView.provenance.store;

    /** @type {ComparisonOperatorType} */
    let operator = "lt";
    /** @type {number} */
    let operand;

    const modal = createModal();

    const templateTitle = html`
        <div class="modal-title">Filter by <em>${attributeInfo.name}</em></div>
    `;

    const dispatchAndClose = (/** @type {boolean} */ remove) => {
        store.dispatch(
            sampleView.actions.filterByQuantitative({
                attribute: attributeInfo.attribute,
                operator,
                operand,
            })
        );
        modal.close();
    };

    const templateButtons = () =>
        html` <div class="modal-buttons">
            <button class="btn btn-cancel" @click=${() => modal.close()}>
                Cancel
            </button>

            <button
                class="btn btn-primary"
                ?disabled=${typeof operand === "undefined"}
                @click=${() => dispatchAndClose(false)}
            >
                ${icon(faFilter).node[0]} Retain
            </button>
        </div>`;

    const operatorChanged = (/** @type {UIEvent} */ event) => {
        const value = /** @type {HTMLInputElement} */ (event.target).value;
        operator = /** @type {ComparisonOperatorType} */ (value);

        updateHtml();
    };

    const operandChanged = (/** @type {UIEvent} */ event) => {
        const elem = /** @type {HTMLInputElement} */ (event.target);
        const value = elem.value;
        if (/^\d+(\.(\d+)?)?$/.test(value)) {
            operand = +value;
            updateHtml();
        }
    };

    const thresholdAdded = (
        /** @type {import("../../components/histogram.js").ThresholdEvent}*/ event
    ) => {
        if (typeof operand !== "number") {
            operand = event.value;
            updateHtml();
        }
    };

    const thresholdAdjusted = (
        /** @type {import("../../components/histogram.js").ThresholdEvent}*/ event
    ) => {
        operand = event.value;
        updateHtml();
    };

    const values = extractValues(
        attributeInfo,
        sampleView.leafSamples,
        sampleView.sampleHierarchy
    );

    const template = () => html`
        <div class="gs-form-group">
            <label
                >Retain samples where <em>${attributeInfo.name}</em> is</label
            >
            <div class="btn-group" role="group">
                ${Object.entries(verboseOps).map(
                    ([k, v]) =>
                        html`<button
                            class=${classMap({
                                btn: true,
                                chosen: k == operator,
                            })}
                            .value=${k}
                            @click=${operatorChanged}
                            title="${v[1]}"
                        >
                            ${v[0]}
                        </button>`
                )}
            </div>
            <genome-spy-histogram
                .values=${values}
                .thresholds=${[operand].filter((o) => o !== undefined)}
                .operators=${[operator]}
                .colors=${["#1f77b4", "#ddd"]}
                .showThresholdNumbers=${false}
                @add=${thresholdAdded}
                @adjust=${thresholdAdjusted}
            ></genome-spy-histogram>
            <input
                type="text"
                placeholder="... or enter a numeric value here"
                .value=${typeof operand == "number" ? "" + operand : ""}
                @input=${operandChanged}
            />
        </div>
    `;

    function updateHtml() {
        render(
            html`${templateTitle}
                <div class="modal-body">${template()}</div>
                ${templateButtons()}`,
            modal.content
        );
    }

    updateHtml();

    /** @type {HTMLInputElement} */ (
        modal.content.querySelector("input[type='text']")
    )?.focus();
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
 * @param {import("../sampleSlice.js").SampleHierarchy} sampleHierarchy
 */
function extractValues(attributeInfo, samples, sampleHierarchy) {
    const a = attributeInfo.accessor;
    return /** @type {Scalar[]} */ (
        samples.map((sampleId) => a(sampleId, sampleHierarchy))
    );
}
