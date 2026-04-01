import { css, html } from "lit";
import BaseDialog, { showDialogAndMap } from "../generic/baseDialog.js";

export default class AgentChoiceDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        message: {},
        choiceLabel: {},
        options: {},
        value: {},
    };

    static styles = [
        ...super.styles,
        css`
            dialog {
                width: 480px;
            }

            .body {
                display: grid;
                gap: var(--gs-basic-spacing);
                min-width: 360px;
            }

            select {
                width: 100%;
                padding: 0.4rem 0.5rem;
                font: inherit;
            }
        `,
    ];

    constructor() {
        super();
        /** @type {string} */
        this.message = "";
        /** @type {string} */
        this.choiceLabel = "Choice";
        /** @type {Array<{ value: string, label: string }>} */
        this.options = [];
        /** @type {string} */
        this.value = "";
    }

    renderBody() {
        return html`
            <div class="body">
                <div>${this.message}</div>
                <label>
                    <div>${this.choiceLabel}</div>
                    <select
                        autofocus
                        .value=${this.value}
                        @change=${(/** @type {Event} */ event) => {
                            this.value = /** @type {HTMLSelectElement} */ (
                                event.target
                            ).value;
                        }}
                    >
                        ${this.options.map(
                            (option) => html`
                                <option value=${option.value}>
                                    ${option.label}
                                </option>
                            `
                        )}
                    </select>
                </label>
            </div>
        `;
    }

    renderButtons() {
        return [
            this.makeCloseButton("Cancel"),
            this.makeButton(
                "OK",
                () => {
                    this.finish({ ok: true, data: this.value });
                    this.triggerClose();
                },
                { isPrimary: true }
            ),
        ];
    }
}

customElements.define("gs-agent-choice-dialog", AgentChoiceDialog);

/**
 * @param {{ title: string, message: string, options: Array<{ value: string, label: string }>, value?: string }} options
 * @returns {Promise<string | undefined>}
 */
export function showAgentChoiceDialog(options) {
    return showDialogAndMap(
        "gs-agent-choice-dialog",
        (/** @type {AgentChoiceDialog} */ el) => {
            el.dialogTitle = options.title;
            el.message = options.message;
            el.choiceLabel = options.choiceLabel ?? "Choice";
            el.options = options.options;
            el.value = options.value ?? options.options[0]?.value ?? "";
        },
        (detail) =>
            detail.ok
                ? /** @type {string | undefined} */ (detail.data)
                : undefined
    );
}
