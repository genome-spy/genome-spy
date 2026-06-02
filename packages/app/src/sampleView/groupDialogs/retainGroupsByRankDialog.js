import { faFilter } from "@fortawesome/free-solid-svg-icons";
import { html } from "lit";
import BaseDialog, { showDialog } from "../../components/generic/baseDialog.js";
import { createInputListener } from "../../components/dialogs/saveImageDialog.js";

class RetainGroupsByRankDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        sampleView: {},
        level: { type: Number },
        limit: { type: Number },
        order: {},
    };

    constructor() {
        super();
        /** @type {import("../sampleView.js").default} */
        this.sampleView = null;
        this.level = 0;
        this.limit = 5;
        /** @type {"descending" | "ascending"} */
        this.order = "descending";
    }

    firstUpdated() {
        super.firstUpdated?.();
        this.dialogTitle = `Retain ranked groups by size at level ${this.level}`;
    }

    renderBody() {
        return html`
            <div class="gs-form-group">
                <p>
                    Keep the selected number of groups separately within each
                    ancestor group.
                </p>
                <label>Rank order:</label>
                <select
                    .value=${this.order}
                    @change=${createInputListener((input) => {
                        this.order = /** @type {"descending" | "ascending"} */ (
                            input.value
                        );
                    })}
                >
                    <option value="descending">Largest groups</option>
                    <option value="ascending">Smallest groups</option>
                </select>
            </div>
            <div class="gs-form-group">
                <label>Number of groups to retain:</label>
                <input
                    autofocus
                    type="number"
                    min="1"
                    .valueAsNumber=${this.limit}
                    @change=${createInputListener((input) => {
                        this.limit = input.valueAsNumber;
                    })}
                />
            </div>
        `;
    }

    renderButtons() {
        return [
            this.makeButton("Cancel", () => this.finish({ ok: false })),
            this.makeButton("Retain", () => this.#onRetain(), {
                iconDef: faFilter,
                isPrimary: true,
                disabled: !Number.isFinite(this.limit) || this.limit < 1,
            }),
        ];
    }

    #onRetain() {
        this.sampleView.provenance.store.dispatch(
            this.sampleView.actions.retainGroupsByRank({
                level: this.level,
                measure: "size",
                limit: this.limit,
                order: this.order,
            })
        );
        this.finish({ ok: true });
    }
}

customElements.define(
    "gs-retain-groups-by-rank-dialog",
    RetainGroupsByRankDialog
);

/**
 * @param {import("../sampleView.js").default} sampleView
 * @param {number} level
 * @returns {Promise<import("../../components/generic/baseDialog.js").DialogFinishDetail>}
 */
export function showRetainGroupsByRankDialog(sampleView, level) {
    return showDialog(
        "gs-retain-groups-by-rank-dialog",
        (/** @type {RetainGroupsByRankDialog} */ el) => {
            el.sampleView = sampleView;
            el.level = level;
            el.limit = 5;
            el.order = "descending";
        }
    );
}
