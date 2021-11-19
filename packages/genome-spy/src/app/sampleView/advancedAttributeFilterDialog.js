import { icon } from "@fortawesome/fontawesome-svg-core";
import { faFilter, faTrashAlt } from "@fortawesome/free-solid-svg-icons";
import { html, render } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { isDiscrete } from "vega-scale";
import { createModal, messageBox } from "../utils/ui/modal";

/**
 * @typedef {import("../../spec/channel").Scalar} Scalar
 */

/**
 * @param {import("./types").AttributeInfo} attribute
 * @param {import("./sampleView").default} sampleView TODO: Figure out a better way to pass typings
 */
export function advancedAttributeFilterDialog(attribute, sampleView) {
    if (isDiscrete(attribute.scale.type)) {
        discreteAttributeFilterDialog(attribute, sampleView);
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

    const modal = createModal();

    const templateTitle = html`
        <div class="modal-title">Filter by <em>${attributeInfo.name}</em></div>
    `;

    /** @type {Set<Scalar>} */
    const selection = new Set();

    const dispatchAndClose = (/** @type {boolean} */ remove) => {
        dispatch(
            sampleView.actions.filterByNominal({
                values: [...selection],
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

    const scale =
        /** @type {import("d3-scale").ScaleOrdinal<Scalar, Scalar>} */ (
            attributeInfo.scale
        );

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
