import { faFilter } from "@fortawesome/free-solid-svg-icons";
import { html } from "lit";
import BaseDialog, { showDialog } from "../../components/generic/baseDialog.js";
import "../../components/generic/thresholdComparisonInput.js";
import { isFiniteNumber } from "../../components/generic/thresholdComparisonInput.js";

class RetainGroupsBySizeDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        sampleView: {},
        level: { type: Number },
        operator: {},
        operand: {},
    };

    constructor() {
        super();
        /** @type {import("../sampleView.js").default} */
        this.sampleView = null;
        this.level = 1;
        /** @type {import("../state/payloadTypes.js").ComparisonOperatorType} */
        this.operator = "gte";
        /** @type {number | undefined} */
        this.operand = undefined;
    }

    firstUpdated() {
        super.firstUpdated?.();
        this.dialogTitle = `Retain groups by size at level ${this.level}`;
    }

    /** @param {import("../../components/generic/thresholdComparisonInput.js").ThresholdComparisonInputChangeEvent} event */
    #thresholdComparisonChanged(event) {
        this.operator = event.operator;
        this.operand = event.operand;
    }

    renderBody() {
        return html`
            <div class="gs-form-group">
                <p>Keep groups where size matches:</p>
                <gs-threshold-comparison-input
                    autofocus
                    .operator=${this.operator}
                    .operand=${this.operand}
                    .placeholder=${"Enter sample-count threshold"}
                    @change=${(
                        /** @type {import("../../components/generic/thresholdComparisonInput.js").ThresholdComparisonInputChangeEvent} */ event
                    ) => this.#thresholdComparisonChanged(event)}
                ></gs-threshold-comparison-input>
            </div>
        `;
    }

    renderButtons() {
        return [
            this.makeButton("Cancel", () => this.finish({ ok: false })),
            this.makeButton("Retain", () => this.#onRetain(), {
                iconDef: faFilter,
                isPrimary: true,
                disabled: !isFiniteNumber(this.operand),
            }),
        ];
    }

    #onRetain() {
        if (!isFiniteNumber(this.operand)) {
            throw new Error("Group size threshold is missing.");
        }

        this.sampleView.provenance.store.dispatch(
            this.sampleView.actions.retainGroupsBySize({
                level: this.level,
                measure: "size",
                operator: this.operator,
                operand: this.operand,
            })
        );
        this.finish({ ok: true });
    }
}

customElements.define(
    "gs-retain-groups-by-size-dialog",
    RetainGroupsBySizeDialog
);

/**
 * @param {import("../sampleView.js").default} sampleView
 * @param {number} level
 * @returns {Promise<import("../../components/generic/baseDialog.js").DialogFinishDetail>}
 */
export function showRetainGroupsBySizeDialog(sampleView, level) {
    return showDialog(
        "gs-retain-groups-by-size-dialog",
        (/** @type {RetainGroupsBySizeDialog} */ el) => {
            el.sampleView = sampleView;
            el.level = level;
            el.operator = "gte";
            el.operand = undefined;
        }
    );
}
