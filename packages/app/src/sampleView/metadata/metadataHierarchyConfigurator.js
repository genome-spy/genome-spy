import { LitElement, html, css } from "lit";
import { map } from "lit/directives/map.js";
import {
    buildPathTree,
    inferMetadataFieldType,
    inferColumnSeparator,
    pathTreeDfs,
    inferMetadataTypesForNodes,
    pathTreeParents,
} from "./metadataUtils.js";
import { showDialog } from "../../components/generic/baseDialog.js";
import "./configureScaleDialog.js";
import { schemeToDataUrl } from "../../utils/ui/schemeToDataUrl.js";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { faPenToSquare } from "@fortawesome/free-solid-svg-icons";
import { formStyles } from "../../components/generic/componentStyles.js";
import { styleMap } from "lit/directives/style-map.js";
import { classMap } from "lit/directives/class-map.js";

// TODO: Validate scale configured without an effective type, and warn.
// TODO: Warn when root type/scale is set but no inherit leaves and no group target.
// TODO: Warn if addUnderGroup contains the separator (splits into multiple segments).
// TODO: Warn if separator length is greater than 1.
// TODO: Show manual color ranges as color swatches in the table.

// Should be skipped altogether, as it's not a metadata attribute
const SAMPLE_COLUMN = "sample";

/**
 * MetadataHierarchyConfigurator
 *
 * Rationale and usage:
 * This component is used in the metadata upload flow to help users
 * understand and configure how uploaded column names map to a
 * hierarchical attribute model. It shows inferred data types for
 * attributes (or groups of attributes) and lets user do further
 * configuration for data types and scales.
 *
 * Intended consumers: the upload/ingest UI and any workflow that needs
 * a compact, editable view of metadata columns before creating the
 * final dataset payload.
 */
export default class MetadataHierarchyConfigurator extends LitElement {
    /***
     * @typedef {import("./metadataUtils.js").MetadataType} MetadataType
     * @typedef {import("./metadataUtils.js").PathTreeNode} PathTreeNode
     */

    /** */
    static properties = {
        _pathRoot: { state: true },
        metadataRecords: {},
        addUnderGroup: { state: true },
        separator: { type: String },
    };

    constructor() {
        super();

        /**
         * Example data records used to extract column names and infer column types.
         * @type {Record<string, any>[]}
         */
        this.metadataRecords = [];

        this.addUnderGroup = "";

        /** Separator for hierarchical attribute names (e.g. '.') */
        this.separator = "";

        /** @type {PathTreeNode | null} */
        this._pathRoot = null;
        /** @type {boolean} */
        this._separatorManuallySet = false;

        /** @type {string[]} */
        this._columns = [];

        /**
         * Map path strings (using the internal separator) to configured scales defs.
         * @type {Map<string, import("@genome-spy/core/spec/scale.js").Scale>}
         */
        this._scales = new Map();

        /**
         * Map path strings (using the internal separator) to inferred or configured data types.
         * @type {Map<string, MetadataType>}
         */
        this._metadataNodeTypes = new Map();
    }

    static styles = [
        formStyles,
        css`
            :host {
                display: block;
            }

            .gs-form-group {
                margin-bottom: 12px;
            }

            .table-wrapper {
                border: 1px solid var(--form-control-border-color, #ccc);
                border-radius: var(--form-control-border-radius, 4px);
                overflow: hidden;
                margin-top: 0.5em;
            }

            table {
                width: 100%;
                border-collapse: collapse;

                .btn {
                    padding: 4px 8px;
                    margin-top: -2px;
                    margin-bottom: -2px;
                }
            }

            th,
            td {
                text-align: left;
                padding: 0.4em 0.6em;
                box-sizing: border-box;
                border-bottom: 1px solid rgba(0, 0, 0, 0.03);
            }

            th {
                font-weight: 600;
                border-bottom-color: var(--form-control-border-color, #ccc);
            }

            td {
                font-size: 90%;
            }

            .scheme-preview img {
                height: 16px;
                vertical-align: middle;
                margin-right: 6px;
            }

            .btn svg {
                width: 1em;
            }

            span.unset {
                text-decoration: line-through;
            }

            select.invalid {
                color: var(--danger-color, #dc3545);
                border-color: var(--danger-color, #dc3545);
            }
        `,
    ];

    #extractCols() {
        const cols = new Set();
        for (const rec of this.metadataRecords || []) {
            for (const k of Object.keys(rec)) {
                cols.add(k);
            }
        }
        this._columns = Array.from(cols).filter((c) => c !== SAMPLE_COLUMN);
    }

    #inferRawTypes() {
        /** @type {Map<string, import("@genome-spy/core/spec/sampleView.js").SampleAttributeType>} */
        this._rawTypes = new Map();
        for (const node of pathTreeDfs(this._pathRoot)) {
            if (node.path) {
                const vals = this.metadataRecords
                    .map((r) => r[node.attribute])
                    .filter((v) => v != null);
                const inferred = inferMetadataFieldType(vals);
                this._rawTypes.set(node.attribute, inferred);
            }
        }
    }

    #updateMetadataNodeTypes() {
        const types = inferMetadataTypesForNodes(
            this._rawTypes,
            this._pathRoot
        );

        for (const [path, type] of types.entries()) {
            if (!this._metadataNodeTypes.has(path)) {
                this._metadataNodeTypes.set(path, type);
            }
        }
    }

    firstUpdated() {
        this.#extractCols();

        // One-time inference of separator on component initialization.
        // If no grouping is detected and user hasn't manually set a separator,
        // infer it from column names.
        const cols = this._columns;
        if (cols.length > 0 && !this._separatorManuallySet) {
            const detectedSeparator = inferColumnSeparator(cols);
            if (detectedSeparator && detectedSeparator !== this.separator) {
                this.separator = detectedSeparator;
            }
        }

        this._pathRoot = buildPathTree(cols, this.separator);
        this.#inferRawTypes();
        this.#updateMetadataNodeTypes();
        this.#emitConfig();
    }

    /**
     * @param {Map<PropertyKey, unknown>} changed
     */
    updated(changed) {
        super.updated(changed);

        if (changed.has("metadataRecords")) {
            this.#extractCols();
            this.#inferRawTypes();
        }

        if (changed.has("separator")) {
            this._pathRoot = buildPathTree(this._columns, this.separator);
            this.#updateMetadataNodeTypes();
            this.#emitConfig();
        }
    }

    /** @param {Event & { target: HTMLInputElement }} e */
    #onGroupInput(e) {
        this.addUnderGroup = e.target.value.trim();
        this.#emitConfig();
    }

    /** @param {Event & { target: HTMLInputElement }} e */
    #onSeparatorInput(e) {
        this.separator = e.target.value;
        this._separatorManuallySet = true;
        this.#emitConfig();
    }

    /** @param {PathTreeNode} node */
    async #configureScaleFor(node) {
        const getDataType = (/** @type {PathTreeNode} */ node) => {
            for (const ancestor of [node, ...pathTreeParents(node)]) {
                const t = this._metadataNodeTypes.get(ancestor.path);
                if (t && t !== "unset" && t !== "inherit") {
                    return t;
                }
            }
            return "nominal";
        };

        const dataType = getDataType(node);

        // Gather observed domain from values under the path (works for groups and leaves)
        const vals = [];
        for (const d of pathTreeDfs(node)) {
            if (d.attribute) {
                for (const rec of this.metadataRecords) {
                    const v = rec[d.attribute];
                    if (v != null) {
                        vals.push(v);
                    }
                }
            }
        }

        /** @type {any[]} */
        let observed = [];
        if (vals.length > 0) {
            if (dataType === "quantitative") {
                const nums = vals
                    .map((v) => Number(v))
                    .filter((n) => Number.isFinite(n));
                if (nums.length > 0) {
                    observed = [Math.min(...nums), Math.max(...nums)];
                }
            } else {
                observed = Array.from(new Set(vals.map((v) => String(v))));
            }
        }

        const existing = this._scales.get(node.path);

        const result = await showDialog(
            "gs-configure-scale-dialog",
            (
                /** @type {import("./configureScaleDialog.js").default} */ scaleDialog
            ) => {
                scaleDialog.observedDomain = observed;
                scaleDialog.dataType = dataType;

                if (existing) {
                    scaleDialog.scale = existing;
                }
            }
        );

        if (result.ok) {
            const scale =
                /** @type {import("@genome-spy/core/spec/scale.js").Scale} */ (
                    result.data
                );
            this._scales.set(node.path, scale);

            this.requestUpdate();
            this.#emitConfig();
        }
    }

    #renderTableRows() {
        /** @param {Event & { target: HTMLSelectElement }} e */
        const onTypeChange = (e) => {
            const el = e.target;
            const path = el.dataset.path;
            const type = /** @type {MetadataType} */ (el.value);
            this._metadataNodeTypes.set(path, type);
            this.requestUpdate();
            this.#emitConfig();
        };

        const invalidInheritNodes = this.#collectInvalidInheritNodes();

        return map(pathTreeDfs(this._pathRoot), (node) => {
            const getDepth = (
                /** @type {import("./metadataUtils.js").PathTreeNode} */ node
            ) => {
                let depth = 0;
                let cur = node.parent;
                while (cur) {
                    depth++;
                    cur = cur.parent;
                }
                return depth;
            };

            const path = node.path;
            const isLeaf = node.children.size === 0;

            const scale = this._scales.get(path);

            const scaleLabel = scale?.type ?? "";
            const domainLabel = scale?.domain
                ? JSON.stringify(scale.domain)
                : "";
            const rangeLabel = scale?.range ? JSON.stringify(scale.range) : "";
            const schemeName = /** @type {string}*/ (scale?.scheme) ?? null;

            const selectedType =
                this._metadataNodeTypes.get(node.path) ?? "unset";

            const isRootNode = node.parent === null;

            const displayPart =
                isRootNode && this.addUnderGroup
                    ? this.addUnderGroup
                    : node.part;

            /** @type {Record<string, string>} */
            const partStyles = {
                marginLeft: `${getDepth(node) * 20}px`,
            };
            if (isRootNode && !this.addUnderGroup) {
                partStyles.color = "gray";
            }

            const partClasses = {
                unset: isLeaf && selectedType === "unset",
            };

            const selectClasses = {
                invalid: invalidInheritNodes.has(node.path),
            };

            return html`<tr>
                <td>
                    <span
                        style=${styleMap(partStyles)}
                        class=${classMap(partClasses)}
                        >${displayPart}</span
                    >
                </td>
                <td>
                    <select
                        data-path="${node.path}"
                        class=${classMap(selectClasses)}
                        @change=${onTypeChange}
                    >
                        ${[
                            "nominal",
                            "ordinal",
                            "quantitative",
                            "unset",
                            "inherit",
                        ].map(
                            (typeOption) =>
                                html`<option
                                    value="${typeOption}"
                                    ?selected=${selectedType === typeOption}
                                >
                                    ${typeOption}
                                </option>`
                        )}
                    </select>
                </td>
                <td>${scaleLabel}</td>
                <td>${domainLabel}</td>
                <td>
                    ${rangeLabel
                        ? rangeLabel
                        : schemeName
                          ? html`<span class="scheme-preview"
                                ><img
                                    src="${schemeToDataUrl(schemeName)}"
                                    alt="${schemeName}"
                                    title="${schemeName}"
                                />${schemeName}</span
                            >`
                          : ""}
                </td>
                <td style="text-align: right;">
                    <button
                        class="btn"
                        @click=${() => this.#configureScaleFor(node)}
                        title="Configure scale"
                        ?disabled=${selectedType === "unset" ||
                        selectedType === "inherit"}
                    >
                        ${icon(faPenToSquare).node[0]}
                    </button>
                </td>
            </tr>`;
        });
    }

    /**
     * @returns {Set<string>}
     */
    #collectInvalidInheritNodes() {
        const invalid = new Set();

        const isConcrete = (/** @type {MetadataType | undefined} */ type) =>
            type === "nominal" || type === "ordinal" || type === "quantitative";

        const rootType = this._metadataNodeTypes.get("");
        const rootEffective = isConcrete(rootType) ? rootType : null;

        /**
         * @param {PathTreeNode} node
         * @param {MetadataType | null} inherited
         */
        const visit = (node, inherited) => {
            const nodeType = this._metadataNodeTypes.get(node.path);
            let effective = inherited;
            if (isConcrete(nodeType)) {
                effective = nodeType;
            } else if (
                nodeType === "inherit" &&
                !effective &&
                node.children.size === 0
            ) {
                invalid.add(node.path);
            }

            for (const child of node.children.values()) {
                visit(child, effective);
            }
        };

        if (this._pathRoot) {
            visit(this._pathRoot, rootEffective);
        }

        return invalid;
    }

    render() {
        return html`
            <div class="gs-form-group">
                <label for="group-name">Group name</label>
                <input
                    id="group-name"
                    type="text"
                    .value=${this.addUnderGroup ?? ""}
                    placeholder="(optional) Group name under which to add new metadata"
                    @input=${this.#onGroupInput}
                />
            </div>

            <div class="gs-form-group">
                <label for="separator">Separator</label>
                <input
                    id="separator"
                    type="text"
                    .value=${this.separator ?? ""}
                    placeholder="(optional) Separator character for possible hierarchical groups (e.g. .)"
                    @input=${this.#onSeparatorInput}
                />
            </div>

            <div>
                <label>Columns (hierarchy)</label>
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Data type</th>
                                <th>Scale</th>
                                <th>Domain</th>
                                <th>Range</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.#renderTableRows()}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    /**
     * @returns {import("./metadataUtils.js").MetadataConfig}
     */
    getConfig() {
        const invalidInheritLeafNodes = [...this.#collectInvalidInheritNodes()];
        return {
            separator: this.separator ? this.separator : null,
            addUnderGroup: this.addUnderGroup ? this.addUnderGroup : null,
            scales: new Map(
                this._scales
                    .entries()
                    .map(([path, scale]) => [path, structuredClone(scale)])
            ),
            metadataNodeTypes: new Map(this._metadataNodeTypes),
            invalidInheritLeafNodes,
        };
    }

    #emitConfig() {
        this.dispatchEvent(
            new CustomEvent("metadata-config-change", {
                detail: this.getConfig(),
                bubbles: true,
                composed: true,
            })
        );
    }
}

customElements.define(
    "gs-metadata-hierarchy-configurator",
    MetadataHierarchyConfigurator
);
