import { html, css } from "lit";
import BaseDialog, { showDialog } from "../components/generic/baseDialog.js";
import { embed } from "@genome-spy/core";
import { createBoxplotSpec } from "./boxplotChart.js";
import { buildHierarchyBoxplotData } from "./hierarchyBoxplotData.js";

const STATS_NAME = "hierarchy_boxplot_stats";
const OUTLIERS_NAME = "hierarchy_boxplot_outliers";
const GROUP_FIELD = "group";
const VALUE_FIELD = "value";

export class HierarchyBoxplotDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        attributeInfo: {},
        sampleView: {},
    };

    static styles = [
        ...super.styles,
        css`
            .chart-container {
                width: 640px;
                height: 320px;
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
        this.attributeInfo = null;
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
        if (!this.attributeInfo || !this.sampleView) {
            throw new Error(
                "Boxplot dialog requires attribute and sample view."
            );
        }

        const attributeLabel =
            typeof this.attributeInfo.name == "string"
                ? this.attributeInfo.name
                : String(this.attributeInfo.attribute.specifier);
        const axisTitle =
            typeof this.attributeInfo.title == "string"
                ? this.attributeInfo.title
                : attributeLabel;

        const dialogLabel =
            this.attributeInfo.title ?? html`<em>${attributeLabel}</em>`;
        this.dialogTitle = html`Boxplot of ${dialogLabel}`;

        const { statsRows, outlierRows, groupDomain } =
            buildHierarchyBoxplotData(
                this.sampleView.sampleHierarchy,
                this.attributeInfo,
                {
                    groupField: GROUP_FIELD,
                    valueField: VALUE_FIELD,
                }
            );

        const spec = createBoxplotSpec({
            statsName: STATS_NAME,
            outliersName: OUTLIERS_NAME,
            groupField: GROUP_FIELD,
            valueField: VALUE_FIELD,
            groupTitle: "Group",
            valueTitle: axisTitle,
            height: 260,
        });

        const scale = spec.encoding.x.scale;
        scale.domain = groupDomain;

        const container = /** @type {HTMLElement} */ (
            this.renderRoot.querySelector(".chart-container")
        );
        if (!container) {
            throw new Error("Cannot find chart container.");
        }

        const api = await embed(container, spec, {
            powerPreference: "high-performance",
        });

        api.updateNamedData(STATS_NAME, statsRows);
        api.updateNamedData(OUTLIERS_NAME, outlierRows);

        this._api = api;
    }
}

customElements.define("gs-hierarchy-boxplot-dialog", HierarchyBoxplotDialog);

/**
 * @param {import("../sampleView/types.js").AttributeInfo} attributeInfo
 * @param {import("../sampleView/sampleView.js").default} sampleView
 * @returns {Promise<import("../components/generic/baseDialog.js").DialogFinishDetail>}
 */
export default function hierarchyBoxplotDialog(attributeInfo, sampleView) {
    return showDialog(
        "gs-hierarchy-boxplot-dialog",
        (/** @type {HierarchyBoxplotDialog} */ el) => {
            el.attributeInfo = attributeInfo;
            el.sampleView = sampleView;
        }
    );
}
