import { css, html } from "lit";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import BaseDialog, { showDialog } from "../../components/generic/baseDialog.js";
import "./derivedMetadataConfigurator.js";

export class DerivedMetadataDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        attributeInfo: {},
        values: {},
        existingAttributeNames: {},
        attributeName: { state: true },
        _configHasErrors: { state: true },
    };

    static styles = [
        ...super.styles,
        css`
            dialog {
                width: 520px;
            }
        `,
    ];

    constructor() {
        super();

        /** @type {import("../types.js").AttributeInfo | null} */
        this.attributeInfo = null;

        /** @type {any[] | null} */
        this.values = null;

        /** @type {string[]} */
        this.existingAttributeNames = [];

        /** @type {string} */
        this.attributeName = "";

        /** @type {boolean} */
        this._configHasErrors = false;

        this.dialogTitle = "Add to metadata";
    }

    renderBody() {
        if (!this.attributeInfo || !this.values) {
            throw new Error(
                "Derived metadata dialog is missing required data."
            );
        }

        return html`
            <gs-derived-metadata-configurator
                .attributeInfo=${this.attributeInfo}
                .values=${this.values}
                .existingAttributeNames=${this.existingAttributeNames}
                .attributeName=${this.attributeName}
                @metadata-config-validity-change=${(
                    /** @type {CustomEvent<{ hasErrors: boolean }>} */ event
                ) => {
                    this._configHasErrors = event.detail.hasErrors;
                }}
            ></gs-derived-metadata-configurator>
        `;
    }

    renderButtons() {
        return [
            this.makeCloseButton(),
            this.makeButton("Add", () => this.#onAdd(), {
                iconDef: faPlus,
                disabled: this._configHasErrors,
                isPrimary: true,
            }),
        ];
    }

    #onAdd() {
        const config = this.#configurator()?.getConfig();
        if (!config) {
            return true;
        }

        this.finish({ ok: true, data: config });
        return false;
    }

    /**
     * @returns {import("./derivedMetadataConfigurator.js").default | null}
     */
    #configurator() {
        return this.renderRoot.querySelector(
            "gs-derived-metadata-configurator"
        );
    }
}

customElements.define("gs-derived-metadata-dialog", DerivedMetadataDialog);

/**
 * @param {{
 *  attributeInfo: import("../types.js").AttributeInfo,
 *  values: any[],
 *  existingAttributeNames: string[],
 *  defaultName: string,
 * }} params
 * @returns {Promise<import("../../components/generic/baseDialog.js").DialogFinishDetail>}
 */
export function showDerivedMetadataDialog({
    attributeInfo,
    values,
    existingAttributeNames,
    defaultName,
}) {
    return showDialog(
        "gs-derived-metadata-dialog",
        (/** @type {DerivedMetadataDialog} */ dialog) => {
            dialog.attributeInfo = attributeInfo;
            dialog.values = values;
            dialog.existingAttributeNames = existingAttributeNames;
            dialog.attributeName = defaultName;
            dialog._configHasErrors = false;
        }
    );
}
