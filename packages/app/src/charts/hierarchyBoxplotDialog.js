import { html, css } from "lit";
import BaseDialog, { showDialog } from "../components/generic/baseDialog.js";
import { embed } from "@genome-spy/core";
import { createBoxplotSpec } from "./boxplotChart.js";
import { buildHierarchyBoxplotData } from "./hierarchyBoxplotData.js";
import templateResultToString from "../utils/templateResultToString.js";

const STATS_NAME = "hierarchy_boxplot_stats";
const OUTLIERS_NAME = "hierarchy_boxplot_outliers";
const GROUP_FIELD = "group";
const VALUE_FIELD = "value";

export class HierarchyBoxplotDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        attributeInfo: {},
        sampleHierarchy: {},
        attributeInfoSource: {},
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

        /** @type {import("../sampleView/state/sampleState.js").SampleHierarchy | null} */
        this.sampleHierarchy = null;

        /** @type {import("../sampleView/compositeAttributeInfoSource.js").default | null} */
        this.attributeInfoSource = null;

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
        if (
            !this.attributeInfo ||
            !this.sampleHierarchy ||
            !this.attributeInfoSource
        ) {
            throw new Error(
                "Boxplot dialog requires attribute, sample hierarchy, and attribute info source."
            );
        }

        const info = this.attributeInfoSource.getAttributeInfo(
            this.attributeInfo.attribute
        );
        const groupTitle = resolveGroupTitle(
            this.attributeInfoSource,
            this.sampleHierarchy.groupMetadata
        );

        const axisTitle = templateResultToString(info.emphasizedName);

        const { statsRows, outlierRows, groupDomain } =
            buildHierarchyBoxplotData(
                this.sampleHierarchy,
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
            groupTitle: groupTitle ?? "Group",
            valueTitle: axisTitle,
            height: 260,
        });

        const xEncoding = /** @type {any} */ (spec.encoding.x);
        xEncoding.scale = { ...(xEncoding.scale ?? {}), domain: groupDomain };

        const container = /** @type {HTMLElement} */ (
            this.renderRoot.querySelector(".chart-container")
        );
        if (!container) {
            throw new Error("Cannot find chart container.");
        }

        const api = await embed(container, spec);

        api.updateNamedData(STATS_NAME, statsRows);
        api.updateNamedData(OUTLIERS_NAME, outlierRows);

        this._api = api;
    }
}

customElements.define("gs-hierarchy-boxplot-dialog", HierarchyBoxplotDialog);

/**
 * @param {import("../sampleView/compositeAttributeInfoSource.js").default} attributeInfoSource
 * @param {import("../sampleView/state/sampleState.js").GroupMetadata[]} groupMetadata
 * @returns {string | null}
 */
function resolveGroupTitle(attributeInfoSource, groupMetadata) {
    if (groupMetadata.length === 0) {
        return null;
    }

    const labels = groupMetadata.map((entry) => {
        const info = attributeInfoSource.getAttributeInfo(entry.attribute);
        return templateResultToString(info.title);
    });

    return labels.join(" / ");
}

/**
 * @param {import("../sampleView/types.js").AttributeInfo} attributeInfo
 * @param {import("../sampleView/state/sampleState.js").SampleHierarchy} sampleHierarchy
 * @param {import("../sampleView/compositeAttributeInfoSource.js").default} attributeInfoSource
 * @returns {Promise<import("../components/generic/baseDialog.js").DialogFinishDetail>}
 */
export default function hierarchyBoxplotDialog(
    attributeInfo,
    sampleHierarchy,
    attributeInfoSource
) {
    const info = attributeInfoSource.getAttributeInfo(attributeInfo.attribute);

    return showDialog(
        "gs-hierarchy-boxplot-dialog",
        (/** @type {HierarchyBoxplotDialog} */ el) => {
            el.attributeInfo = attributeInfo;
            el.sampleHierarchy = sampleHierarchy;
            el.attributeInfoSource = attributeInfoSource;
            el.dialogTitle = html`Boxplot of ${info.title}`;
        }
    );
}
