import { LitElement, css, html } from "lit";
import { icon } from "@fortawesome/fontawesome-svg-core";
import {
    faExclamationCircle,
    faPenToSquare,
} from "@fortawesome/free-solid-svg-icons";
import { showDialog } from "../../components/generic/baseDialog.js";
import { FormController } from "../../components/forms/formController.js";
import { formField } from "../../components/forms/formField.js";
import {
    faStyles,
    formStyles,
} from "../../components/generic/componentStyles.js";
import { schemeToDataUrl } from "../../utils/ui/schemeToDataUrl.js";
import { computeObservedDomain } from "./scaleUtils.js";
import {
    getDefaultDerivedMetadataScale,
    resolveDataType,
    sanitizeScaleForDerivedMetadata,
    validateDerivedMetadataName,
} from "./deriveMetadataUtils.js";
import { METADATA_PATH_SEPARATOR } from "./metadataUtils.js";
import "./configureScaleDialog.js";

/**
 * @typedef {object} DerivedMetadataConfig
 * @property {string} name
 * @property {string} groupPath
 * @property {import("@genome-spy/core/spec/scale.js").Scale | null} [scale]
 */

export default class DerivedMetadataConfigurator extends LitElement {
    static properties = {
        attributeInfo: { attribute: false },
        sampleIds: { attribute: false },
        values: { attribute: false },
        existingAttributeNames: { attribute: false },
        attributeName: { state: true },
        groupPath: { state: true },
        _scale: { state: true },
        _scaleConfigured: { state: true },
    };

    static styles = [
        faStyles,
        formStyles,
        css`
            :host {
                display: block;
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

        /** @type {(string | number)[] | null} */
        this._observedDomain = null;
    }

    /**
     * @param {{
     *  attributeInfo: import("../types.js").AttributeInfo,
     *  sampleIds: string[],
     *  values: any[],
     *  existingAttributeNames: string[],
     *  defaultName: string,
     * }} params
     */
    configure({
        attributeInfo,
        sampleIds,
        values,
        existingAttributeNames,
        defaultName,
    }) {
        this.attributeInfo = attributeInfo;
        this.sampleIds = sampleIds;
        this.values = values;
        this.existingAttributeNames = existingAttributeNames;
        this.attributeName = defaultName;
        this.groupPath = "";
        this._scale = getDefaultDerivedMetadataScale(attributeInfo) ?? null;
        this._scaleConfigured = false;
        this._observedDomain = null;
        this._form.reset();
    }

    /**
     * @param {Map<string, unknown>} changed
     */
    willUpdate(changed) {
        if (changed.has("attributeInfo") && this.attributeInfo) {
            this._scale =
                getDefaultDerivedMetadataScale(this.attributeInfo) ?? null;
            this._scaleConfigured = false;
            this._observedDomain = null;
            this._form.reset();
        }
    }

    /**
     * @param {Map<string, unknown>} changed
     */
    updated(changed) {
        if (
            changed.has("attributeInfo") ||
            changed.has("attributeName") ||
            changed.has("groupPath") ||
            changed.has("_scale") ||
            changed.has("_scaleConfigured")
        ) {
            this.dispatchEvent(
                new CustomEvent("metadata-config-validity-change", {
                    detail: { hasErrors: this.hasErrors() },
                    bubbles: true,
                    composed: true,
                })
            );
        }
    }

    render() {
        if (!this.attributeInfo || !this.sampleIds || !this.values) {
            throw new Error("Derived metadata configurator is missing data.");
        }

        const dataType = resolveDataType(this.attributeInfo);
        const scaleSummary =
            this._scaleConfigured && this._scale
                ? describeScale(this._scale)
                : "Auto";

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
                <label for="derivedAttributeName">Derived attribute name</label>
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

    /**
     * @returns {boolean}
     */
    hasErrors() {
        return this._form.hasErrors();
    }

    /**
     * @returns {DerivedMetadataConfig | null}
     */
    getConfig() {
        if (this._form.validateAll()) {
            return null;
        }

        const attributeName = this.attributeName.trim();
        const groupPath = this.groupPath.trim();
        return {
            name: attributeName,
            groupPath,
            ...(this._scaleConfigured
                ? this._scale && hasScaleProperties(this._scale)
                    ? { scale: this._scale }
                    : { scale: null }
                : {}),
        };
    }

    async #configureScale() {
        if (!this.attributeInfo || !this.sampleIds || !this.values) {
            throw new Error("Scale configuration requires attribute data.");
        }

        const dataType = resolveDataType(this.attributeInfo);
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
            const scale = sanitizeScaleForDerivedMetadata(
                /** @type {import("@genome-spy/core/spec/scale.js").Scale | undefined} */ (
                    result.data
                )
            );
            this._scale = scale ?? null;
            this._scaleConfigured = true;
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
                resolveDataType(this.attributeInfo),
                this.values
            );
        }

        return this._observedDomain;
    }

    /**
     * @returns {string | null}
     */
    #validateName() {
        return validateDerivedMetadataName(
            this.attributeName,
            this.groupPath,
            this.existingAttributeNames,
            this.attributeInfo
        );
    }
}

customElements.define(
    "gs-derived-metadata-configurator",
    DerivedMetadataConfigurator
);

/**
 * @param {import("@genome-spy/core/spec/scale.js").Scale} scale
 */
function describeScale(scale) {
    if (!scale) {
        return html`Auto`;
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
        parts.push(html`Auto`);
    }

    return html`<div class="scale-summary">${parts}</div>`;
}

/**
 * @param {import("@genome-spy/core/spec/scale.js").Scale} scale
 * @returns {boolean}
 */
function hasScaleProperties(scale) {
    return Object.keys(scale).length > 0;
}
