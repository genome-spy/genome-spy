import { html, css } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faExclamationCircle,
    faPenToSquare,
    faPlus,
} from "@fortawesome/free-solid-svg-icons";
import BaseDialog, { showDialog } from "../../components/generic/baseDialog.js";
import { FormController } from "../../components/forms/formController.js";
import { formField } from "../../components/forms/formField.js";
import { schemeToDataUrl } from "../../utils/ui/schemeToDataUrl.js";
import { preservesScaleDomainForAttribute } from "../attributeAggregation/aggregationOps.js";
import { computeObservedDomain } from "./scaleUtils.js";
import { color as d3color } from "d3-color";
import {
    applyGroupToAttributeDefs,
    METADATA_PATH_SEPARATOR,
} from "./metadataUtils.js";
import "./configureScaleDialog.js";

/**
 * @typedef {import("@genome-spy/core/spec/sampleView.js").SampleAttributeType} SampleAttributeType
 */
/**
 * @typedef {object} DerivedMetadataConfig
 * @property {string} name
 * @property {string} groupPath
 * @property {import("@genome-spy/core/spec/scale.js").Scale} [scale]
 */

export class DerivedMetadataDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        attributeInfo: {},
        sampleIds: {},
        values: {},
        existingAttributeNames: {},
        attributeName: { state: true },
        groupPath: { state: true },
        _scale: { state: true },
        _scaleConfigured: { state: true },
    };

    static styles = [
        ...super.styles,
        css`
            dialog {
                width: 520px;
            }

            .scale-summary {
                display: flex;
                gap: var(--gs-basic-spacing);
                color: var(--gs-muted-color, #666);

                img {
                    display: block;
                }
            }
        `,
    ];

    constructor() {
        super();

        /** @type {import("../types.js").AttributeInfo | null} */
        this.attributeInfo = null;

        /** @type {string[] | null} */
        this.sampleIds = null;

        /** @type {any[] | null} */
        this.values = null;

        /** @type {string[]} */
        this.existingAttributeNames = [];

        /** @type {string} */
        this.attributeName = "";

        /** @type {string} */
        this.groupPath = "";

        /** @type {import("@genome-spy/core/spec/scale.js").Scale | null} */
        this._scale = null;

        /** @type {boolean} */
        this._scaleConfigured = false;

        /** @type {FormController} */
        this._form = new FormController(this);
        this._form.defineField("name", {
            valueKey: "attributeName",
            validate: () => this.#validateName(),
        });
        this._form.defineField("group", {
            valueKey: "groupPath",
            validate: () => null,
            affects: ["name"],
        });

        this.dialogTitle = "Add to metadata";

        /** @type {(string | number)[] | null} */
        this._observedDomain = null;
    }

    renderBody() {
        if (!this.attributeInfo || !this.sampleIds || !this.values) {
            throw new Error(
                "Derived metadata dialog is missing required data."
            );
        }

        const dataType = this.#getDataType();
        const scaleSummary =
            this._scaleConfigured && this._scale
                ? describeScale(this._scale)
                : "Default";

        return html`
            <div class="gs-alert info">
                ${icon(faExclamationCircle).node[0]}
                <div>
                    <p>
                        You are creating a new metadata attribute derived
                        from:<br />
                        ${this.attributeInfo.title}.
                    </p>
                    <p>Data type: ${dataType}</p>
                </div>
            </div>

            <div class="gs-form-group">
                <label for="derivedAttributeName">Attribute name</label>
                <input
                    id="derivedAttributeName"
                    type="text"
                    ${formField(this._form, "name")}
                />
                ${this._form.feedback("name")}
                <small>Keep names concise (around 20 characters).</small>
            </div>

            <div class="gs-form-group">
                <label for="derivedAttributeGroup">Group (optional)</label>
                <input
                    id="derivedAttributeGroup"
                    type="text"
                    placeholder="A new or existing metadata group path"
                    ${formField(this._form, "group")}
                />
                <small
                    >Use ${METADATA_PATH_SEPARATOR} to create hierarchy
                    levels.</small
                >
            </div>

            <div class="gs-form-group">
                <label>Scale</label>
                <div class="input-group">
                    <div class="fake-input">${scaleSummary}</div>
                    <button
                        class="btn"
                        type="button"
                        title="Configure scale"
                        @click=${() => this.#configureScale()}
                    >
                        ${icon(faPenToSquare).node[0]} Configure
                    </button>
                </div>
            </div>
        `;
    }

    renderButtons() {
        const hasErrors = this._form.hasErrors();
        return [
            this.makeButton("Cancel", () => this.finish({ ok: false })),
            this.makeButton("Add", () => this.#onAdd(), faPlus, hasErrors),
        ];
    }

    async #configureScale() {
        if (!this.attributeInfo || !this.sampleIds || !this.values) {
            throw new Error("Scale configuration requires attribute data.");
        }

        const dataType = this.#getDataType();
        const observedDomain = this.#getObservedDomain();

        const result = await showDialog(
            "gs-configure-scale-dialog",
            (
                /** @type {import("./configureScaleDialog.js").default} */ dialog
            ) => {
                dialog.dataType = dataType;
                dialog.observedDomain = observedDomain;
                if (this._scale) {
                    dialog.scale = this._scale;
                }
            }
        );

        if (result.ok) {
            this._scale =
                /** @type {import("@genome-spy/core/spec/scale.js").Scale} */ (
                    result.data
                );
            this._scaleConfigured = true;
        }
    }

    #onAdd() {
        if (!this.attributeInfo || !this.sampleIds || !this.values) {
            throw new Error(
                "Derived metadata dialog is missing required data."
            );
        }

        if (this._form.validateAll()) {
            return true;
        }

        const attributeName = this.attributeName.trim();
        const groupPath = this.groupPath.trim();
        /** @type {DerivedMetadataConfig} */
        const payload = {
            name: attributeName,
            groupPath,
            ...(this._scaleConfigured && this._scale
                ? { scale: this._scale }
                : {}),
        };

        this.finish({ ok: true, data: payload });
        return false;
    }

    /**
     * @returns {SampleAttributeType}
     */
    #getDataType() {
        if (!this.attributeInfo) {
            throw new Error("Attribute info is missing.");
        }

        const dataType = /** @type {SampleAttributeType} */ (
            this.attributeInfo.type
        );

        if (
            dataType === "nominal" ||
            dataType === "ordinal" ||
            dataType === "quantitative"
        ) {
            return dataType;
        } else {
            throw new Error("Unsupported data type: " + dataType);
        }
    }

    /**
     * @returns {(string | number)[]}
     */
    #getObservedDomain() {
        if (!this.attributeInfo || !this.values) {
            throw new Error("Observed domain requires attribute values.");
        }

        if (!this._observedDomain) {
            this._observedDomain = computeObservedDomain(
                this.#getDataType(),
                this.values
            );
        }

        return this._observedDomain;
    }

    /**
     * @returns {string | null}
     */
    #validateName() {
        const attributeName = this.attributeName.trim();
        if (attributeName.length === 0) {
            return "Attribute name is required.";
        } else {
            const groupPath = this.groupPath.trim();
            const derivedName = this.#getDerivedAttributeName(
                attributeName,
                groupPath
            );
            if (this.existingAttributeNames.includes(derivedName)) {
                return "Name already exists. Choose another name or group.";
            } else {
                return null;
            }
        }
    }

    /**
     * @param {string} attributeName
     * @param {string} groupPath
     * @returns {string}
     */
    #getDerivedAttributeName(attributeName, groupPath) {
        /** @type {Record<string, import("@genome-spy/core/spec/sampleView.js").SampleAttributeDef>} */
        const attributeDefs = {
            [attributeName]: {
                type: this.#getDataType(),
            },
        };

        if (groupPath.length === 0) {
            return Object.keys(attributeDefs)[0];
        } else {
            const groupedDefs = applyGroupToAttributeDefs(
                attributeDefs,
                groupPath
            );
            return Object.keys(groupedDefs)[0];
        }
    }
}

customElements.define("gs-derived-metadata-dialog", DerivedMetadataDialog);

/**
 * @param {{
 *  attributeInfo: import("../types.js").AttributeInfo,
 *  sampleIds: string[],
 *  values: any[],
 *  existingAttributeNames: string[],
 *  defaultName: string,
 * }} params
 * @returns {Promise<import("../../components/generic/baseDialog.js").DialogFinishDetail>}
 */
export function showDerivedMetadataDialog({
    attributeInfo,
    sampleIds,
    values,
    existingAttributeNames,
    defaultName,
}) {
    return showDialog(
        "gs-derived-metadata-dialog",
        (/** @type {DerivedMetadataDialog} */ dialog) => {
            dialog.attributeInfo = attributeInfo;
            dialog.sampleIds = sampleIds;
            dialog.values = values;
            dialog.existingAttributeNames = existingAttributeNames;
            dialog.attributeName = defaultName;
            dialog._form.reset();
            dialog._scaleConfigured = false;
            // Scale props are embedded in the d3 scale function
            dialog._scale = preservesScaleDomainForAttribute(
                attributeInfo.attribute
            )
                ? sanitizeScaleForDerivedMetadata(attributeInfo.scale?.props)
                : null;
        }
    );
}

/**
 * @param {import("@genome-spy/core/spec/scale.js").Scale} scale
 */
function describeScale(scale) {
    if (!scale) {
        return html`Default`;
    }

    /** @type {import("lit").TemplateResult<1>[]} */
    const parts = [];

    if (scale.scheme) {
        const schemeName =
            typeof scale.scheme === "string" ? scale.scheme : scale.scheme.name;
        parts.push(
            html`<img
                src=${schemeToDataUrl(schemeName)}
                alt=${schemeName}
                title=${schemeName}
            />`
        );
    }

    if (scale.type) {
        parts.push(html`<div class="badge">${scale.type}</div>`);
    }

    if (parts.length === 0) {
        parts.push(html`Default`);
    }

    return html`<div class="scale-summary">${parts}</div>`;
}

/**
 * @param {import("@genome-spy/core/spec/scale.js").Scale | null | undefined} scale
 * @returns {import("@genome-spy/core/spec/scale.js").Scale | null}
 */
function sanitizeScaleForDerivedMetadata(scale) {
    if (!scale) {
        return null;
    }

    const clone = structuredClone(scale);
    const range = clone.range;
    if (!range) {
        return clone;
    }

    if (!Array.isArray(range) || !range.every((value) => isCssColor(value))) {
        delete clone.range;
    }

    return clone;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isCssColor(value) {
    if (typeof value !== "string") {
        return false;
    }

    return d3color(value) != null;
}
