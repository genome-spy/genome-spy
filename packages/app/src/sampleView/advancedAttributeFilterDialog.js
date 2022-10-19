import { icon } from "@fortawesome/fontawesome-svg-core";
import { faFilter, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { html, render } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { isContinuous, isDiscrete, isDiscretizing } from "vega-scale";
import { createModal, messageBox } from "../utils/ui/modal";
import "../components/histogram";

/**
 * @typedef {import("@genome-spy/core/spec/channel").Scalar} Scalar
 * @typedef {import("./sampleOperations").ComparisonOperatorType} ComparisonOperatorType
 */

/**
 * @param {import("./types").AttributeInfo} attribute
 * @param {import("./sampleView").default} sampleView TODO: Figure out a better way to pass typings
 */
export function advancedAttributeFilterDialog(attribute, sampleView) {
    const type = attribute.scale?.type;
    if (isDiscrete(type)) {
        discreteAttributeFilterDialog(attribute, sampleView);
    } else if (isContinuous(type) || isDiscretizing(type)) {
        quantitativeAttributeFilterDialog(attribute, sampleView);
    } else {
        messageBox("Not implemented (yet).");
    }
}

/**
 * @param {import("./types").AttributeInfo} attributeInfo
 * @param {import("./sampleView").default} sampleView TODO: Figure out a better way to pass typings
 */
export function discreteAttributeFilterDialog(attributeInfo, sampleView) {
    const dispatch = sampleView.provenance.storeHelper.getDispatcher();

    const scale =
        /** @type {import("d3-scale").ScaleOrdinal<Scalar, Scalar>} */ (
            attributeInfo.scale
        );

    const modal = createModal();

    const templateTitle = html`
        <div class="modal-title">Filter by <em>${attributeInfo.name}</em></div>
    `;

    /** @type {Set<Scalar>} */
    const selection = new Set();

    const dispatchAndClose = (/** @type {boolean} */ remove) => {
        dispatch(
            sampleView.actions.filterByNominal({
                // Sort the selection based on the domain. Otherwise they are in the selection order.
                values: scale.domain().filter((value) => selection.has(value)),
                attribute: attributeInfo.attribute,
                remove,
            })
        );
        modal.close();
    };

    const updateChecked = (/** @type {InputEvent} */ event) => {
        const checkbox = /** @type {HTMLInputElement} */ (event.target);
        if (checkbox.checked) {
            selection.add(checkbox.value);
        } else {
            selection.delete(checkbox.value);
        }
        updateHtml();
    };

    const templateButtons = () => html` <div class="modal-buttons">
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

    // TODO: Ensure that the attribute is mapped to a color channel
    const colorify = scale;

    // TODO: Provide only categories that are present in the current dataset, not the full scale domain
    const template = html`<p>
            Please select one or more categories and choose an action.
        </p>
        <ul class="gs-checkbox-list" @input=${updateChecked} tabindex="0">
            ${scale.domain().map(
                (value) =>
                    html`<li>
                        <label class="checkbox">
                            <span
                                class="color"
                                style=${styleMap({
                                    backgroundColor: colorify(value).toString(),
                                })}
                            ></span>
                            <input type="checkbox" .value=${value} />
                            ${value}</label
                        >
                    </li>`
            )}
        </ul>`;

    function updateHtml() {
        render(
            html`${templateTitle}
                <div class="modal-body">${template}</div>
                ${templateButtons()}`,
            modal.content
        );
    }

    updateHtml();

    /** @type {HTMLElement} */ (
        modal.content.querySelector(".gs-checkbox-list input[type='checkbox']")
    ).focus();
}

/**
 * @param {import("./types").AttributeInfo} attributeInfo
 * @param {import("./sampleView").default} sampleView TODO: Figure out a better way to pass typings
 */
export function quantitativeAttributeFilterDialog(attributeInfo, sampleView) {
    const dispatch = sampleView.provenance.storeHelper.getDispatcher();

    /** @type {ComparisonOperatorType} */
    let operator = "lt";
    /** @type {number} */
    let operand;

    const modal = createModal();

    const templateTitle = html`
        <div class="modal-title">Filter by <em>${attributeInfo.name}</em></div>
    `;

    const dispatchAndClose = (/** @type {boolean} */ remove) => {
        dispatch(
            sampleView.actions.filterByQuantitative({
                attribute: attributeInfo.attribute,
                operator,
                operand,
            })
        );
        modal.close();
    };

    const templateButtons = () => html` <div class="modal-buttons">
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
        /** @type {import("../components/histogram").ThresholdEvent}*/ event
    ) => {
        if (typeof operand !== "number") {
            operand = event.value;
            updateHtml();
        }
    };

    const thresholdAdjusted = (
        /** @type {import("../components/histogram").ThresholdEvent}*/ event
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
            <select .value=${operator} @change=${operatorChanged}>
                ${Object.entries(verboseOps).map(
                    ([k, v]) => html`<option .value=${k}>${v}</option>`
                )}
            </select>
            <input
                type="text"
                placeholder="Please enter a numeric value"
                .value=${typeof operand == "number" ? "" + operand : ""}
                @input=${operandChanged}
            />
            <genome-spy-histogram
                .values=${values}
                .thresholds=${[operand].filter((o) => o !== undefined)}
                .operators=${[operator]}
                .colors=${["#1f77b4", "#ddd"]}
                .showThresholdNumbers=${false}
                @add=${thresholdAdded}
                @adjust=${thresholdAdjusted}
            ></genome-spy-histogram>
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

    modal.content.querySelector("select").focus();
}

/** @type {Record<ComparisonOperatorType, string>} */
const verboseOps = {
    lt: "less than",
    lte: "less than or equal to",
    eq: "equal to",
    gte: "greater than or equal to",
    gt: "greater than",
};

/**
 * Extract values for histogram
 *
 * @param {import("./types").AttributeInfo} attributeInfo
 * @param {string[]} samples
 * @param {import("./sampleSlice").SampleHierarchy} sampleHierarchy
 */
function extractValues(attributeInfo, samples, sampleHierarchy) {
    const a = attributeInfo.accessor;
    return /** @type {number[]} */ (
        samples.map((sampleId) => a(sampleId, sampleHierarchy))
    );
}
