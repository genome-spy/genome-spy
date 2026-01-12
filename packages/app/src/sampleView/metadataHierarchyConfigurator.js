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
import { showDialog } from "../components/generic/baseDialog.js";
import "./configureScaleDialog.js";
import { schemeToDataUrl } from "../utils/ui/schemeToDataUrl.js";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { faPenToSquare } from "@fortawesome/free-solid-svg-icons";
import { formStyles } from "../components/generic/componentStyles.js";

/**
 * GsMetadataHierarchyConfigurator
 *
 * Rationale and usage:
 * This component is used in the metadata upload flow to help users
 * understand and configure how uploaded column names map to a
 * hierarchical attribute model. It shows inferred data types for
 * attributes (or groups of attributes) and lets users open a
 * scale configuration dialog to choose visual encoding defaults.
 *
 * Intended consumers: the upload/ingest UI and any workflow that needs
 * a compact, editable view of metadata columns before creating the
 * final dataset payload.
 *
 * Public surface:
 * - `.metadataRecords` (Array): array of row objects used to infer types.
 * - `.separator` (string): character used to split column names into a
 *   hierarchy (editable by the user in the UI).
 */
export default class GsMetadataHierarchyConfigurator extends LitElement {
    /***
     * @typedef {import("./metadataUtils.js").MetadataType} MetadataType
     * @typedef {import("./metadataUtils.js").PathTreeNode} PathTreeNode
     */

    /** */
    static properties = {
        _pathRoot: { state: true },
        metadataRecords: {},
        addUnderGroup: { state: true },
        separator: {},
    };

    constructor() {
        super();
        /** @type {Record<string, any>[]} */
        this.metadataRecords = [];
        this.addUnderGroup = "";
        // Default separator for hierarchical attribute names (e.g. '.')
        this.separator = "";

        /** @type {Map<string, import("@genome-spy/core/spec/scale.js").Scale>} */
        this._scales = new Map();
        /** @type {PathTreeNode | null} */
        this._pathRoot = null;
        /** @type {boolean} */
        this._separatorManuallySet = false;

        /** @type {string[]} */
        this._columns = [];

        /**
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

            table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 8px;
                font-size: 90%;

                .btn {
                    padding: 4px 8px;
                    margin-top: -2px;
                    margin-bottom: -2px;
                }
            }

            th,
            td {
                text-align: left;
                padding: 6px 8px;
                border-bottom: 1px solid var(--gs-border-color, #eee);
            }

            th {
                font-weight: 600;
            }

            .scheme-preview img {
                height: 16px;
                vertical-align: middle;
                margin-right: 6px;
            }

            .btn svg {
                width: 1em;
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
        this._columns = Array.from(cols);
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
        }
    }

    /** @param {Event & { target: HTMLInputElement }} e */
    _onGroupInput(e) {
        this.addUnderGroup = e.target.value;
    }

    /** @param {Event & { target: HTMLInputElement }} e */
    _onSeparatorInput(e) {
        this.separator = e.target.value;
        this._separatorManuallySet = true;
    }

    /** @param {PathTreeNode} node */
    async _configureScaleFor(node) {
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
        }
    }

    render() {
        /** @param {Event & { target: HTMLSelectElement }} e */
        const onTypeChange = (e) => {
            const el = e.target;
            const path = el.dataset.path;
            const type = /** @type {MetadataType} */ (el.value);
            this._metadataNodeTypes.set(path, type);
        };

        return html`
            <div class="gs-form-group">
                <label for="group-name">Group name</label>
                <input
                    id="group-name"
                    type="text"
                    .value=${this.addUnderGroup ?? ""}
                    placeholder="(optional) Group name under which to add new metadata"
                    @input=${this._onGroupInput}
                />
            </div>

            <div class="gs-form-group">
                <label for="separator">Separator</label>
                <input
                    id="separator"
                    type="text"
                    .value=${this.separator ?? ""}
                    placeholder="Separator character for possible groups (e.g. .)"
                    @input=${this._onSeparatorInput}
                />
            </div>

            <div>
                <label>Columns (hierarchy)</label>
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
                        ${map(pathTreeDfs(this._pathRoot), (node) => {
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

                            const scale = this._scales.get(path);

                            const scaleLabel = scale?.type ?? "";
                            const domainLabel = scale?.domain
                                ? JSON.stringify(scale.domain)
                                : "";
                            const rangeLabel = scale?.range
                                ? JSON.stringify(scale.range)
                                : "";
                            const schemeName =
                                /** @type {string}*/ (scale?.scheme) ?? null;

                            const selectedType =
                                this._metadataNodeTypes.get(node.path) ??
                                "unset";

                            return html`<tr>
                                <td
                                    style="padding-left: ${getDepth(node) *
                                    20}px"
                                >
                                    ${node.part}
                                </td>
                                <td>
                                    <select
                                        data-path="${node.path}"
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
                                                    ?selected=${selectedType ===
                                                    typeOption}
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
                                                    src="${schemeToDataUrl(
                                                        schemeName
                                                    )}"
                                                    alt="${schemeName}"
                                                    title="${schemeName}"
                                                />${schemeName}</span
                                            >`
                                          : ""}
                                </td>
                                <td style="text-align: right;">
                                    <button
                                        class="btn"
                                        @click=${() =>
                                            this._configureScaleFor(node)}
                                        title="Configure scale"
                                    >
                                        ${icon(faPenToSquare).node[0]}
                                    </button>
                                </td>
                            </tr>`;
                        })}
                    </tbody>
                </table>
            </div>
        `;
    }
}

customElements.define(
    "gs-metadata-hierarchy-configurator",
    GsMetadataHierarchyConfigurator
);
