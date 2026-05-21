import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faExclamationCircle,
    faObjectGroup,
    faTrash,
} from "@fortawesome/free-solid-svg-icons";
import { css, html, nothing } from "lit";
import { defaultScheme } from "../../components/generic/histogram.js";
import BaseDialog, { showDialog } from "../../components/generic/baseDialog.js";
import {
    createThresholdGroupAccessor,
    formatThresholdInterval,
} from "../state/groupOperations.js";
import { extractAttributeValues } from "../attributeValues.js";

/**
 * @param {import("../types.js").AttributeInfo} attributeInfo
 * @param {import("../sampleView.js").default} sampleView
 */
class GroupByThresholdsDialog extends BaseDialog {
    /**
     * @typedef {import("../../components/generic/histogram.js").ThresholdEvent} ThresholdEvent
     */

    /**
     */
    static properties = {
        ...super.properties,
        attributeInfo: {},
        sampleView: {},
        thresholds: {},
        groupTitles: {},
        validationError: {},
        values: {},
    };

    static styles = [
        ...super.styles,
        css`
            .group-by-thresholds-form {
                width: 27em;
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

                input[type="text"] {
                    width: 12em;
                    margin-bottom: 0;
                    padding-top: 0.2em;
                    padding-bottom: 0.2em;
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
        /** @type {string[]} */
        this.groupTitles = [];
        /** @type {string | undefined} */
        this.validationError = undefined;
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

    #ensureGroupTitles() {
        const expectedLength = this.thresholds.length + 1;
        while (this.groupTitles.length < expectedLength) {
            this.groupTitles.push("");
        }
        if (this.groupTitles.length > expectedLength) {
            this.groupTitles.length = expectedLength;
        }
    }

    /**
     * @param {number} index
     * @returns {string}
     */
    #getGroupTitle(index) {
        return this.groupTitles[index] ?? "";
    }

    /**
     * @returns {string[]}
     */
    #getGroupTitles() {
        return Array.from({ length: this.thresholds.length + 1 }, (_, i) =>
            this.#getGroupTitle(i)
        );
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
        this.validationError = undefined;
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
            this.validationError = undefined;
            this.requestUpdate();
        }
    }

    /**
     * @param {Event} e
     * @param {number} index
     */
    #groupTitleChanged(e, index) {
        this.groupTitles[index] = /** @type {HTMLInputElement} */ (
            e.target
        ).value;
        this.validationError = undefined;
        this.requestUpdate();
    }

    /**
     * @param {ThresholdEvent} e
     */
    #thresholdAdded(e) {
        const index = this.thresholds.findIndex((t) => t.operand > e.value);
        const insertionIndex = index < 0 ? this.thresholds.length : index;
        this.#ensureGroupTitles();
        this.thresholds.splice(insertionIndex, 0, {
            operand: e.value,
            operator:
                /** @type {import("../state/payloadTypes.js").ThresholdOperator} */ (
                    "lt"
                ),
        });
        this.groupTitles.splice(insertionIndex + 1, 0, "");
        this.validationError = undefined;
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
        this.validationError = undefined;
        this.requestUpdate();
    }

    /**
     * @param {number} index
     */
    #removeThreshold(index) {
        this.#ensureGroupTitles();
        this.thresholds.splice(index, 1);
        this.groupTitles.splice(index + 1, 1);
        this.validationError = undefined;
        this.requestUpdate();
    }

    /**
     * @returns {string[] | undefined}
     */
    #getGroupTitlesForDispatch() {
        const titles = this.#getGroupTitles().map((title) => title.trim());
        if (titles.every((title) => !title)) {
            return undefined;
        }
        const missingTitleIndex = titles.findIndex((title) => !title);
        if (missingTitleIndex >= 0) {
            throw new Error(
                `Group ${missingTitleIndex + 1} is missing a title.`
            );
        }
        const seen = new Set();
        for (const title of titles) {
            if (seen.has(title)) {
                throw new Error(`Duplicate group title: "${title}".`);
            }
            seen.add(title);
        }
        return titles;
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
                        <th>Custom title</th>
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
                                <td>
                                    <input
                                        .value=${this.#getGroupTitle(g.index)}
                                        type="text"
                                        placeholder="Defaults to interval"
                                        @input=${(
                                            /** @type {InputEvent} */ event
                                        ) =>
                                            this.#groupTitleChanged(
                                                event,
                                                g.index
                                            )}
                                    />
                                </td>
                            </tr>
                        `
                    )}
                </tbody>
            </table>`;
        };

        return html`<div class="gs-form-group group-by-thresholds-form">
            ${this.validationError
                ? html`<div class="gs-alert danger">
                      ${icon(faExclamationCircle).node[0]}
                      <span>${this.validationError}</span>
                  </div>`
                : nothing}

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
            this.makeButton("Group", () => this.#onGroup(), {
                iconDef: faObjectGroup,
                isPrimary: true,
            }),
        ];
    }

    #onGroup() {
        if (!this.thresholds.length) {
            throw new Error("At least one threshold is required.");
        }

        /** @type {string[] | undefined} */
        let groupTitles;
        try {
            groupTitles = this.#getGroupTitlesForDispatch();
        } catch (error) {
            this.validationError = /** @type {Error} */ (error).message;
            this.requestUpdate();
            return true;
        }

        this.sampleView.dispatchAttributeAction(
            this.sampleView.actions.groupByThresholds({
                attribute: this.attributeInfo.attribute,
                thresholds:
                    /** @type {[import("../state/payloadTypes.js").Threshold, ...import("../state/payloadTypes.js").Threshold[]]} */ (
                        this.thresholds
                    ),
                ...(groupTitles ? { groupTitles } : {}),
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
            el.groupTitles = [""];
            el.validationError = undefined;
            el.attributeInfo = attributeInfo;
            el.sampleView = sampleView;
            el.values = extractAttributeValues(
                attributeInfo,
                sampleView.leafSamples,
                sampleView.sampleHierarchy
            );
        }
    );
}
