import { icon } from "@fortawesome/fontawesome-svg-core";
import { faObjectGroup, faTrash } from "@fortawesome/free-solid-svg-icons";
import { css, html, nothing } from "lit";
import { defaultScheme } from "../../components/histogram.js";
import BaseDialog, { showDialog } from "../../components/dialogs/baseDialog.js";
import {
    createThresholdGroupAccessor,
    formatThresholdInterval,
} from "../state/groupOperations.js";

/**
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {import("../sampleView.js").default} sampleView
 */
class GroupByThresholdsDialog extends BaseDialog {
    /**
     * @typedef {import("../../components/histogram.js").ThresholdEvent} ThresholdEvent
     */

    /**
     */
    static properties = {
        ...super.properties,
        attributeInfo: {},
        sampleView: {},
        thresholds: {},
        values: {},
    };

    static styles = [
        ...super.styles,
        css`
            .group-by-thresholds-form {
                width: 25em;
            }

            .group-color {
                display: inline-block;
                width: 0.7em;
                height: 0.7em;
            }

            .threshold-groups {
                margin-top: var(--gs-basic-spacing);

                text-align: left;
                font-size: 90%;

                :is(th, td) {
                    padding-right: 1em;

                    &:nth-child(2) {
                        min-width: 9em;
                    }
                }
            }

            gs-histogram {
                margin-top: var(--gs-basic-spacing, 10px);
                margin-bottom: var(--gs-basic-spacing, 10px);
            }
        `,
    ];

    constructor() {
        super();
        /** @type {import("../state/payloadTypes.js").Threshold[]} */
        this.thresholds = [];
        /** @type {import("../types.js").AttributeInfo} */
        this.attributeInfo = null;
        /** @type {import("../sampleView.js").default} */
        this.sampleView = null;
        /** @type {number[]} */
        this.values = [];
    }

    /** @param {Map<string, any>} changed */
    willUpdate(changed) {
        if (changed.has("attributeInfo") && this.attributeInfo) {
            this.dialogTitle = `Group by threshold on ${this.attributeInfo.name}`;
        }
    }

    /** @param {number} value @param {number} index */
    #clampThreshold(value, index) {
        if (index > 0) {
            value = Math.max(value, this.thresholds[index - 1].operand);
        }
        if (index < this.thresholds.length - 1) {
            value = Math.min(value, this.thresholds[index + 1].operand);
        }
        return value;
    }

    /**
     * @param {Event} e
     * @param {number} index
     */
    #operatorChanged(e, index) {
        const value = /** @type {HTMLInputElement} */ (e.target).value;
        this.thresholds[index].operator =
            /** @type {import("../state/payloadTypes.js").ThresholdOperator} */ (
                value
            );
        this.requestUpdate();
    }

    /**
     * @param {Event} e
     * @param {number} index
     */
    #operandChanged(e, index) {
        const value = /** @type {HTMLInputElement} */ (e.target).value;
        if (/^\d+(\.\d+)?$/.test(value)) {
            this.thresholds[index].operand = this.#clampThreshold(
                +value,
                index
            );
            this.requestUpdate();
        }
    }

    /**
     * @param {ThresholdEvent} e
     */
    #thresholdAdded(e) {
        const index = this.thresholds.findIndex((t) => t.operand > e.value);
        this.thresholds.splice(index < 0 ? this.thresholds.length : index, 0, {
            operand: e.value,
            operator:
                /** @type {import("../state/payloadTypes.js").ThresholdOperator} */ (
                    "lt"
                ),
        });
        this.requestUpdate();
    }

    /**
     * @param {ThresholdEvent} e
     */
    #thresholdAdjusted(e) {
        this.thresholds[e.index].operand = this.#clampThreshold(
            e.value,
            e.index
        );
        this.requestUpdate();
    }

    /**
     * @param {number} index
     */
    #removeThreshold(index) {
        this.thresholds.splice(index, 1);
        this.requestUpdate();
    }

    renderBody() {
        const makeTable = () => {
            /** @type {import("../state/payloadTypes.js").Threshold[]} */
            const t = [
                { operand: -Infinity, operator: "lt" },
                ...this.thresholds,
                { operand: Infinity, operator: "lte" },
            ];
            const a = createThresholdGroupAccessor(
                (x) => x,
                /** @type {any} */ (t)
            );
            const groupSizes = new Array(t.length - 1).fill(0);
            for (const value of this.values) groupSizes[a(value) - 1]++;
            const groups = [];
            for (let i = 1; i < t.length; i++) {
                groups.push({
                    index: i - 1,
                    name: i,
                    interval: formatThresholdInterval(t[i - 1], t[i]),
                    n: groupSizes[i - 1],
                });
            }

            return html`<table class="threshold-groups">
                <thead>
                    <tr>
                        <th>Group</th>
                        <th>Interval</th>
                        <th>n</th>
                    </tr>
                </thead>
                <tbody>
                    ${groups.map(
                        (g) => html`
                            <tr>
                                <td>
                                    <span
                                        class="group-color"
                                        style="background-color: ${defaultScheme[
                                            g.index
                                        ]}"
                                    ></span>
                                    ${g.name}
                                </td>
                                <td>${g.interval}</td>
                                <td>${g.n}</td>
                            </tr>
                        `
                    )}
                </tbody>
            </table>`;
        };

        return html`<div class="gs-form-group group-by-thresholds-form">
            <label>Split into groups using the thresholds:</label>

            <gs-histogram
                .values=${this.values}
                .thresholds=${this.thresholds.map((t) => t.operand)}
                .operators=${this.thresholds.map((t) => t.operator)}
                .showThresholdNumbers=${true}
                @add=${(/** @type {ThresholdEvent} */ e) =>
                    this.#thresholdAdded(e)}
                @adjust=${(/** @type {ThresholdEvent} */ e) =>
                    this.#thresholdAdjusted(e)}
            ></gs-histogram>

            ${this.thresholds.map(
                (threshold, i) =>
                    html` <div class="threshold-flex">
                        <select
                            .value=${threshold.operator}
                            @change=${(/** @type {InputEvent} */ event) =>
                                this.#operatorChanged(event, i)}
                        >
                            <option value="lt">${"<"}</option>
                            <option value="lte">${"\u2264"}</option>
                        </select>
                        <input
                            .value=${"" + threshold.operand}
                            type="text"
                            placeholder="Numeric value"
                            @input=${(/** @type {InputEvent} */ event) =>
                                this.#operandChanged(event, i)}
                            @blur=${(/** @type {InputEvent} */ event) => {
                                /** @type {HTMLInputElement} */ (
                                    event.target
                                ).value = "" + this.thresholds[i].operand;
                            }}
                        />
                        <button
                            @click=${() => this.#removeThreshold(i)}
                            class="btn"
                            title="Remove"
                        >
                            ${icon(faTrash).node[0]}
                        </button>
                    </div>`
            )}
            ${this.thresholds.length
                ? html`<small>
                          The operator specifies whether the upper endpoint of
                          the interval (<em>i.e.</em>, the group) is exclusive
                          (&lt;) or inclusive(&le;).
                      </small>
                      ${makeTable()}`
                : nothing}
        </div>`;
    }

    renderButtons() {
        return [
            this.makeButton("Cancel", () => this.finish({ ok: false })),
            this.makeButton("Group", () => this.#onGroup(), faObjectGroup),
        ];
    }

    #onGroup() {
        this.sampleView.dispatchAttributeAction(
            this.sampleView.actions.groupByThresholds({
                attribute: this.attributeInfo.attribute,
                thresholds: this.thresholds,
            })
        );
        this.finish({ ok: true });
    }
}

customElements.define("gs-group-by-thresholds-dialog", GroupByThresholdsDialog);

/**
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {import("../sampleView.js").default} sampleView
 */
export function showGroupByThresholdsDialog(attributeInfo, sampleView) {
    return showDialog(
        "gs-group-by-thresholds-dialog",
        (/** @type {any} */ el) => {
            el.thresholds =
                /** @type {import("../state/payloadTypes.js").Threshold[]} */ ([]);
            el.attributeInfo = attributeInfo;
            el.sampleView = sampleView;
            el.values = extractValues(
                attributeInfo,
                sampleView.leafSamples,
                sampleView.sampleHierarchy
            );
        }
    );
}

/**
 *
 * @param {import("../state/payloadTypes.js").Threshold[]} thresholds
 */

/**
 * Extract values for histogram
 *
 * N.B. This is copy-paste from advanced filter. TODO: dedupe
 *
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {string[]} samples
 * @param {import("../state/sampleSlice.js").SampleHierarchy} sampleHierarchy
 */
function extractValues(attributeInfo, samples, sampleHierarchy) {
    const a = attributeInfo.accessor;
    return /** @type {number[]} */ (
        samples.map((sampleId) => a(sampleId, sampleHierarchy))
    );
}
