import { html, css } from "lit";
import BaseDialog, { showDialog } from "../components/generic/baseDialog.js";
import { embed } from "@genome-spy/core";
import { buildHierarchyScatterplotData } from "./hierarchyScatterplotData.js";

const DATA_NAME = "hierarchy_scatterplot_points";
const GROUP_FIELD = "group";
const X_FIELD = "x";
const Y_FIELD = "y";

export class HierarchyScatterplotDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        xAttributeInfo: {},
        yAttributeInfo: {},
        sampleView: {},
    };

    static styles = [
        ...super.styles,
        css`
            .chart-container {
                width: 640px;
                height: 360px;
                max-width: 80vw;
                max-height: 60vh;
                min-width: 360px;
                min-height: 240px;
            }
        `,
    ];

    constructor() {
        super();

        /** @type {import("../sampleView/types.js").AttributeInfo | null} */
        this.xAttributeInfo = null;
        /** @type {import("../sampleView/types.js").AttributeInfo | null} */
        this.yAttributeInfo = null;
        /** @type {import("../sampleView/sampleView.js").default | null} */
        this.sampleView = null;

        /** @type {import("@genome-spy/core/types/embedApi.js").EmbedResult | null} */
        this._api = null;
    }

    connectedCallback() {
        super.connectedCallback();

        this.addEventListener(
            "gs-dialog-closed",
            () => {
                this._api?.finalize();
                this._api = null;
            },
            { once: true }
        );
    }

    firstUpdated() {
        super.firstUpdated?.();
        this.#initializeChart();
    }

    renderBody() {
        return html`<div class="chart-container"></div>`;
    }

    async #initializeChart() {
        if (!this.xAttributeInfo || !this.yAttributeInfo || !this.sampleView) {
            throw new Error(
                "Scatterplot dialog requires x/y attributes and sample view."
            );
        }

        const xLabel =
            typeof this.xAttributeInfo.name == "string"
                ? this.xAttributeInfo.name
                : String(this.xAttributeInfo.attribute.specifier);
        const yLabel =
            typeof this.yAttributeInfo.name == "string"
                ? this.yAttributeInfo.name
                : String(this.yAttributeInfo.attribute.specifier);
        const xTitle =
            typeof this.xAttributeInfo.title == "string"
                ? this.xAttributeInfo.title
                : xLabel;
        const yTitle =
            typeof this.yAttributeInfo.title == "string"
                ? this.yAttributeInfo.title
                : yLabel;

        const dialogLabel = html`<em>${xLabel}</em> vs <em>${yLabel}</em>`;
        this.dialogTitle = html`Scatterplot of ${dialogLabel}`;

        const { rows } = buildHierarchyScatterplotData(
            this.sampleView.sampleHierarchy,
            this.xAttributeInfo,
            this.yAttributeInfo,
            {
                groupField: GROUP_FIELD,
                xField: X_FIELD,
                yField: Y_FIELD,
            }
        );

        /** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
        const spec = {
            data: { name: DATA_NAME },
            mark: {
                type: "point",
                filled: true,
                size: 40,
                opacity: 0.8,
                tooltip: null,
            },
            encoding: {
                x: {
                    field: X_FIELD,
                    type: "quantitative",
                    title: xTitle,
                },
                y: {
                    field: Y_FIELD,
                    type: "quantitative",
                    title: yTitle,
                },
                color: {
                    field: GROUP_FIELD,
                    type: "nominal",
                    title: "Group",
                },
            },
            height: 300,
        };

        const container = /** @type {HTMLElement} */ (
            this.renderRoot.querySelector(".chart-container")
        );
        if (!container) {
            throw new Error("Cannot find chart container.");
        }

        const api = await embed(container, spec, {
            powerPreference: "high-performance",
        });

        api.updateNamedData(DATA_NAME, rows);
        this._api = api;
    }
}

customElements.define(
    "gs-hierarchy-scatterplot-dialog",
    HierarchyScatterplotDialog
);

/**
 * @param {import("../sampleView/types.js").AttributeInfo} xAttributeInfo
 * @param {import("../sampleView/types.js").AttributeInfo} yAttributeInfo
 * @param {import("../sampleView/sampleView.js").default} sampleView
 * @returns {Promise<import("../components/generic/baseDialog.js").DialogFinishDetail>}
 */
export default function hierarchyScatterplotDialog(
    xAttributeInfo,
    yAttributeInfo,
    sampleView
) {
    return showDialog(
        "gs-hierarchy-scatterplot-dialog",
        (/** @type {HierarchyScatterplotDialog} */ el) => {
            el.xAttributeInfo = xAttributeInfo;
            el.yAttributeInfo = yAttributeInfo;
            el.sampleView = sampleView;
        }
    );
}
