import { html, css } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faExclamationCircle,
    faPenToSquare,
    faPlus,
} from "@fortawesome/free-solid-svg-icons";
import BaseDialog, { showDialog } from "../../components/generic/baseDialog.js";
import { createInputListener } from "../../components/dialogs/saveImageDialog.js";
import { schemeToDataUrl } from "../../utils/ui/schemeToDataUrl.js";
import { preservesScaleDomainForAttribute } from "../attributeAggregation/aggregationOps.js";
import { computeObservedDomain } from "./scaleUtils.js";
import {
    applyGroupToAttributeDefs,
    applyGroupToColumnarMetadata,
    METADATA_PATH_SEPARATOR,
} from "./metadataUtils.js";
import "./configureScaleDialog.js";

/**
 * @typedef {import("@genome-spy/core/spec/sampleView.js").SampleAttributeType} SampleAttributeType
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
        _errors: { state: true },
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

        /** @type {Map<string, string>} */
        this._errors = new Map();

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
        const scaleSummary = this._scale
            ? describeScale(this._scale)
            : "Default";
        const nameError = this._errors.get("name") ?? null;
        const showNameError = Boolean(nameError);

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
                    class=${getInvalidClass(nameError, showNameError)}
                    aria-invalid=${nameError && showNameError
                        ? "true"
                        : "false"}
                    .value=${this.attributeName}
                    @input=${createInputListener((input) => {
                        this.attributeName = input.value;
                        if (this._errors.has("name")) {
                            this.#validateOnChange("name");
                        }
                    })}
                    @blur=${() => {
                        this.#handleBlur("name");
                    }}
                />
                ${renderInvalidFeedback(nameError, showNameError)}
                <small>Keep names concise (around 20 characters).</small>
            </div>

            <div class="gs-form-group">
                <label for="derivedAttributeGroup">Group (optional)</label>
                <input
                    id="derivedAttributeGroup"
                    type="text"
                    .value=${this.groupPath}
                    placeholder="A new or existing metadata group path"
                    @input=${createInputListener((input) => {
                        this.groupPath = input.value;
                        if (this._errors.has("name")) {
                            this.#validateOnChange("name");
                        }
                    })}
                    @blur=${() => {
                        this.#handleBlur("name");
                    }}
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
        const hasErrors = this.#hasErrors();
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
        }
    }

    #onAdd() {
        if (!this.attributeInfo || !this.sampleIds || !this.values) {
            throw new Error(
                "Derived metadata dialog is missing required data."
            );
        }

        if (this.#validateAll()) {
            return true;
        }

        const attributeName = this.attributeName.trim();
        const groupPath = this.groupPath.trim();
        const dataType = this.#getDataType();

        if (this.values.length !== this.sampleIds.length) {
            throw new Error(
                "Derived metadata values length does not match sample ids."
            );
        }

        /** @type {import("../state/payloadTypes.js").ColumnarMetadata} */
        const columnarMetadata = {
            sample: this.sampleIds,
            [attributeName]: this.values,
        };

        /** @type {Record<string, import("@genome-spy/core/spec/sampleView.js").SampleAttributeDef>} */
        const attributeDefs = {
            [attributeName]: {
                type: dataType,
                ...(this._scale ? { scale: this._scale } : {}),
            },
        };

        const payload = this.#buildPayload(
            columnarMetadata,
            attributeDefs,
            groupPath
        );

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
     * @param {string} field
     * @returns {string | null}
     */
    #validateField(field) {
        if (field === "name") {
            return this.#validateName();
        } else {
            throw new Error("Unknown field: " + field);
        }
    }

    /**
     * @param {string} field
     */
    #handleBlur(field) {
        const error = this.#validateField(field);
        this.#setFieldError(field, error);
    }

    /**
     * @param {string} field
     */
    #validateOnChange(field) {
        const error = this.#validateField(field);
        this.#setFieldError(field, error);
    }

    /**
     * @returns {boolean}
     */
    #hasErrors() {
        return this.#collectValidationErrors().size > 0;
    }

    /**
     * @returns {boolean}
     */
    #validateAll() {
        const errors = this.#collectValidationErrors();
        this._errors = errors;
        return errors.size > 0;
    }

    /**
     * @returns {Map<string, string>}
     */
    #collectValidationErrors() {
        /** @type {Map<string, string>} */
        const errors = new Map();
        for (const field of ["name"]) {
            const error = this.#validateField(field);
            if (error) {
                errors.set(field, error);
            }
        }
        return errors;
    }

    /**
     * @param {string} field
     * @param {string | null} error
     */
    #setFieldError(field, error) {
        const next = new Map(this._errors);
        if (error) {
            next.set(field, error);
        } else {
            next.delete(field);
        }
        this._errors = next;
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

    /**
     * @param {import("../state/payloadTypes.js").ColumnarMetadata} columnarMetadata
     * @param {Record<string, import("@genome-spy/core/spec/sampleView.js").SampleAttributeDef>} attributeDefs
     * @param {string} groupPath
     * @returns {import("../state/payloadTypes.js").SetMetadata}
     */
    #buildPayload(columnarMetadata, attributeDefs, groupPath) {
        if (groupPath.length === 0) {
            return {
                columnarMetadata,
                attributeDefs,
            };
        } else {
            return {
                columnarMetadata: applyGroupToColumnarMetadata(
                    columnarMetadata,
                    groupPath
                ),
                attributeDefs: applyGroupToAttributeDefs(
                    attributeDefs,
                    groupPath
                ),
            };
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
            dialog._errors = new Map();
            // Scale props are embedded in the d3 scale function
            dialog._scale =
                (preservesScaleDomainForAttribute(attributeInfo.attribute)
                    ? structuredClone(attributeInfo.scale?.props)
                    : null) ?? null;
        }
    );
}

/**
 * @param {string | null} error
 * @param {boolean} show
 * @returns {string}
 */
function getInvalidClass(error, show) {
    if (show && error) {
        return "is-invalid";
    } else {
        return "";
    }
}

/**
 * @param {string | null} error
 * @param {boolean} show
 * @returns {import("lit").TemplateResult<1> | null}
 */
function renderInvalidFeedback(error, show) {
    if (show && error) {
        return html`<div class="invalid-feedback">${error}</div>`;
    } else {
        return null;
    }
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
