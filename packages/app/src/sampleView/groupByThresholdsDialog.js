import { icon } from "@fortawesome/fontawesome-svg-core";
import { faObjectGroup } from "@fortawesome/free-solid-svg-icons";
import { html, render } from "lit";
import { createModal } from "../utils/ui/modal";

/**
 * @param {import("./types").AttributeInfo} attributeInfo
 * @param {import("./sampleView").default} sampleView TODO: Figure out a better way to pass typings
 */
export default function groupByThresholdsDialog(attributeInfo, sampleView) {
    const dispatch = sampleView.provenance.storeHelper.getDispatcher();

    /** @type {import("./payloadTypes").Threshold[]} */
    const thresholds = [{ operand: undefined, operator: "lt" }];

    const modal = createModal();

    const templateTitle = html`
        <div class="modal-title">
            Group by threshold on <em>${attributeInfo.name}</em>
        </div>
    `;

    const dispatchAndClose = (/** @type {boolean} */ remove) => {
        dispatch(
            sampleView.actions.groupByThresholds({
                attribute: attributeInfo.attribute,
                thresholds,
            })
        );
        modal.close();
    };

    const templateButtons = () => html` <div class="modal-buttons">
        <button class="btn-cancel" @click=${() => modal.close()}>Cancel</button>

        <button
            class="btn-primary"
            ?disabled=${!validateThresholds(thresholds)}
            @click=${() => dispatchAndClose(false)}
        >
            ${icon(faObjectGroup).node[0]} Group
        </button>
    </div>`;

    const operatorChanged = (/** @type {UIEvent} */ event) => {
        const value = /** @type {HTMLInputElement} */ (event.target).value;
        thresholds[0].operator =
            /** @type {import("./payloadTypes").ThresholdOperator} */ (value);

        updateHtml();
    };

    const operandChanged = (/** @type {UIEvent} */ event) => {
        const value = /** @type {HTMLInputElement} */ (event.target).value;
        thresholds[0].operand = value.length > 0 ? +value : undefined;

        updateHtml();
    };

    const template = html`
        <div class="gs-form-group">
            <label>Split into 2 groups using the threshold:</label>
            <div class="threshold-flex">
                <select
                    .value=${thresholds[0].operator}
                    @change=${operatorChanged}
                >
                    <option value="lt">${"<"}</option>
                    <option value="lte">${"\u2264"}</option>
                </select>
                <input
                    .value=${"" + thresholds[0].operand}
                    type="number"
                    placeholder="Numeric value"
                    @input=${operandChanged}
                />
            </div>
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

    modal.content.querySelector("select").focus();
}

/**
 *
 * @param {import("./payloadTypes").Threshold[]} thresholds
 */
function validateThresholds(thresholds) {
    return thresholds[0].operator && typeof thresholds[0].operand == "number";
}
