import { icon } from "@fortawesome/fontawesome-svg-core";
import { faObjectGroup, faTrash } from "@fortawesome/free-solid-svg-icons";
import { html, nothing, render } from "lit";
import { createModal } from "../utils/ui/modal";

/**
 * @param {import("./types").AttributeInfo} attributeInfo
 * @param {import("./sampleView").default} sampleView TODO: Figure out a better way to pass typings
 */
export default function groupByThresholdsDialog(attributeInfo, sampleView) {
    const dispatch = sampleView.provenance.storeHelper.getDispatcher();

    /** @type {import("./payloadTypes").Threshold[]} */
    const thresholds = [];

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
        <button class="btn btn-cancel" @click=${() => modal.close()}>
            Cancel
        </button>

        <button
            class="btn btn-primary"
            ?disabled=${!validateThresholds(thresholds)}
            @click=${() => dispatchAndClose(false)}
        >
            ${icon(faObjectGroup).node[0]} Group
        </button>
    </div>`;

    const clampThreshold = (
        /** @type {number} */ value,
        /** @type {number} */ index
    ) => {
        // TODO: This check could be moved to the Histogram component
        if (index > 0) {
            value = Math.max(value, thresholds[index - 1].operand);
        }
        if (index < thresholds.length - 1) {
            value = Math.min(value, thresholds[index + 1].operand);
        }
        return value;
    };

    const operatorChanged = (
        /** @type {UIEvent} */ event,
        /** @type {number} */ index
    ) => {
        const value = /** @type {HTMLInputElement} */ (event.target).value;
        thresholds[index].operator =
            /** @type {import("./payloadTypes").ThresholdOperator} */ (value);

        updateHtml();
    };

    const operandChanged = (
        /** @type {UIEvent} */ event,
        /** @type {number} */ index
    ) => {
        const value = /** @type {HTMLInputElement} */ (event.target).value;
        if (/^\d+(\.\d+)?$/.test(value)) {
            thresholds[index].operand = clampThreshold(+value, index);
            updateHtml();
        }
    };

    const thresholdAdded = (
        /** @type {import("../components/histogram").ThresholdEvent}*/ event
    ) => {
        const index = thresholds.findIndex((t) => t.operand > event.value);

        thresholds.splice(index < 0 ? thresholds.length : index, 0, {
            operand: event.value,
            operator: "lt",
        });
        updateHtml();
    };

    const thresholdAdjusted = (
        /** @type {import("../components/histogram").ThresholdEvent}*/ event
    ) => {
        thresholds[event.index].operand = clampThreshold(
            event.value,
            event.index
        );
        updateHtml();
    };

    const removeThreshold = (/** @type {number} */ index) => {
        thresholds.splice(index, 1);
        updateHtml();
    };

    const values = extractValues(
        attributeInfo,
        sampleView.leafSamples,
        sampleView.sampleHierarchy
    );

    function updateHtml() {
        const template = html`
            <div class="gs-form-group group-by-thresholds-form">
                <label>Split into groups using the thresholds:</label>

                <genome-spy-histogram
                    .values=${values}
                    .thresholds=${thresholds.map((t) => t.operand)}
                    .operators=${thresholds.map((t) => t.operator)}
                    .showThresholdNumbers=${true}
                    @add=${thresholdAdded}
                    @adjust=${thresholdAdjusted}
                ></genome-spy-histogram>

                ${thresholds.map(
                    (threshold, i) => html` <div class="threshold-flex">
                        <select
                            .value=${threshold.operator}
                            @change=${(/** @type {InputEvent} */ event) =>
                                operatorChanged(event, i)}
                        >
                            <option value="lt">${"<"}</option>
                            <option value="lte">${"\u2264"}</option>
                        </select>
                        <input
                            .value=${"" + threshold.operand}
                            type="text"
                            placeholder="Numeric value"
                            @input=${(/** @type {InputEvent} */ event) =>
                                operandChanged(event, i)}
                            @blur=${(/** @type {InputEvent} */ event) => {
                                /** @type {HTMLInputElement} */ (
                                    event.target
                                ).value = "" + thresholds[i].operand;
                            }}
                        />
                        <button
                            @click=${() => removeThreshold(i)}
                            class="btn"
                            title="Remove"
                        >
                            ${icon(faTrash).node[0]}
                        </button>
                    </div>`
                )}
                ${thresholds.length
                    ? html`<small>
                          The operator specifies whether the upper endpoint of
                          the interval (<em>i.e.</em>, the group) is exclusive
                          (<) or inclusive(${"\u2264"}).
                      </small>`
                    : nothing}
            </div>
        `;

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
 *
 * @param {import("./payloadTypes").Threshold[]} thresholds
 */
function validateThresholds(thresholds) {
    // TODO: Check that the order is valid
    return thresholds.length;
}

/**
 * Extract values for histogram
 *
 * N.B. This is copy-paste from advanced filter. TODO: dedupe
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
