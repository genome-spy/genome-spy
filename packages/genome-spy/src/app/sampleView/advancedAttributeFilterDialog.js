import { icon } from "@fortawesome/fontawesome-svg-core";
import { faFilter, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { html, render } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { isContinuous, isDiscrete } from "vega-scale";
import { createModal, messageBox } from "../utils/ui/modal";

/**
 * @typedef {import("../../spec/channel").Scalar} Scalar
 * @typedef {import("./sampleOperations").ComparisonOperatorType} ComparisonOperatorType
 */

/**
 * @param {import("./types").AttributeInfo} attribute
 * @param {import("./sampleView").default} sampleView TODO: Figure out a better way to pass typings
 */
export function advancedAttributeFilterDialog(attribute, sampleView) {
    if (isDiscrete(attribute.scale?.type)) {
        discreteAttributeFilterDialog(attribute, sampleView);
    } else if (isContinuous(attribute.scale?.type)) {
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
        <button @click=${() => modal.close()}>Cancel</button>

        <button
            ?disabled=${!selection.size}
            @click=${() => dispatchAndClose(false)}
        >
            ${icon(faFilter).node[0]} Retain
        </button>
        <button
            ?disabled=${!selection.size}
            @click=${() => dispatchAndClose(true)}
        >
            ${icon(faTrashAlt).node[0]} Remove
        </button>
    </div>`;

    // TODO: Ensure that the attribute is mapped to a color channel
    const colorify = scale;

    const template = html`<p>
            Please select one or more categories and choose an action.
        </p>
        <ul class="gs-checkbox-list" @input=${updateChecked}>
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
        <button @click=${() => modal.close()}>Cancel</button>

        <button
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
        const value = /** @type {HTMLInputElement} */ (event.target).value;
        operand =
            value.length > 1
                ? +(/** @type {ComparisonOperatorType} */ (value))
                : undefined;

        updateHtml();
    };

    const template = html`
        <div class="gs-form-group">
            <label
                >Select samples where <em>${attributeInfo.name}</em> is</label
            >
            <select .value=${operator} @change=${operatorChanged}>
                ${Object.entries(verboseOps).map(
                    ([k, v]) => html`<option .value=${k}>${v}</option>`
                )}
            </select>
            <input
                type="number"
                placeholder="Please enter a numeric value"
                @input=${operandChanged}
            />
        </div>
    `;

    function updateHtml() {
        render(
            html`${templateTitle}
                <div class="modal-body">${template}</div>
                ${templateButtons()}`,
            modal.content
        );
    }

    updateHtml();
}

/** @type {Record<ComparisonOperatorType, string>} */
const verboseOps = {
    lt: "less than",
    lte: "less than or equal to",
    eq: "equal to",
    gte: "greater than or equal to",
    gt: "greater than",
};
