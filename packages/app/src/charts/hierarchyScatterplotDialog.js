import { html, css } from "lit";
import BaseDialog, { showDialog } from "../components/generic/baseDialog.js";
import { embed } from "@genome-spy/core";
import { faDownload } from "@fortawesome/free-solid-svg-icons";
import { buildHierarchyScatterplotData } from "./hierarchyScatterplotData.js";
import { escapeFieldName, resolveGroupTitle } from "./chartDataUtils.js";
import { downloadChartPng } from "./chartDialogUtils.js";
import templateResultToString from "../utils/templateResultToString.js";

const DATA_NAME = "hierarchy_scatterplot_points";

export class HierarchyScatterplotDialog extends BaseDialog {
    static properties = {
        ...super.properties,
        xAttributeInfo: {},
        yAttributeInfo: {},
        sampleHierarchy: {},
        attributeInfoSource: {},
        colorScaleRange: {},
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

        /** @type {import("../sampleView/state/sampleState.js").SampleHierarchy | null} */
        this.sampleHierarchy = null;

        /** @type {import("../sampleView/compositeAttributeInfoSource.js").default | null} */
        this.attributeInfoSource = null;

        /** @type {string[] | null} */
        this.colorScaleRange = null;

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

    renderButtons() {
        return [
            this.makeButton(
                "Save PNG",
                () => {
                    downloadChartPng(
                        this.renderRoot,
                        this._api,
                        "genomespy-scatterplot.png"
                    );
                    return true;
                },
                faDownload
            ),
            this.makeCloseButton(),
        ];
    }

    async #initializeChart() {
        if (
            !this.xAttributeInfo ||
            !this.yAttributeInfo ||
            !this.sampleHierarchy ||
            !this.attributeInfoSource
        ) {
            throw new Error(
                "Scatterplot dialog requires x/y attributes, sample hierarchy, and attribute info source."
            );
        }

        const xInfo = this.attributeInfoSource.getAttributeInfo(
            this.xAttributeInfo.attribute
        );
        const yInfo = this.attributeInfoSource.getAttributeInfo(
            this.yAttributeInfo.attribute
        );

        const xFieldName = templateResultToString(xInfo.title);
        const yFieldName = templateResultToString(yInfo.title);
        const xAxisTitle = templateResultToString(xInfo.emphasizedName);
        const yAxisTitle = templateResultToString(yInfo.emphasizedName);
        const groupTitle = resolveGroupTitle(
            this.attributeInfoSource,
            this.sampleHierarchy.groupMetadata
        );
        const groupFieldName = groupTitle ?? "Group";

        const { rows, groupDomain } = buildHierarchyScatterplotData(
            this.sampleHierarchy,
            this.xAttributeInfo,
            this.yAttributeInfo,
            {
                groupField: groupFieldName,
                xField: xFieldName,
                yField: yFieldName,
                sampleField: "sample",
            }
        );

        /** @type {import("@genome-spy/core/spec/channel.js").Encoding} */
        const encoding = {
            x: {
                field: escapeFieldName(xFieldName),
                type: "quantitative",
                title: xAxisTitle,
            },
            y: {
                field: escapeFieldName(yFieldName),
                type: "quantitative",
                title: yAxisTitle,
            },
        };

        const colorEncoding = buildColorEncoding(
            groupDomain,
            groupFieldName,
            groupTitle ?? "Group",
            this.colorScaleRange
        );

        /** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
        const spec = {
            data: { name: DATA_NAME },
            mark: {
                type: "point",
                filled: false,
                size: 30,
                opacity: 0.7,
            },
            encoding: {
                ...encoding,
                ...(colorEncoding ? { color: colorEncoding } : {}),
            },
            height: 300,
        };

        const container = /** @type {HTMLElement} */ (
            this.renderRoot.querySelector(".chart-container")
        );
        if (!container) {
            throw new Error("Cannot find chart container.");
        }

        const api = await embed(container, spec);

        api.updateNamedData(DATA_NAME, rows);
        this._api = api;
    }
}

customElements.define(
    "gs-hierarchy-scatterplot-dialog",
    HierarchyScatterplotDialog
);

/**
 * @param {string[]} groupDomain
 * @param {string} groupField
 * @param {string} groupTitle
 * @param {string[] | null} colorScaleRange
 * @returns {import("@genome-spy/core/spec/channel.js").ColorDef | undefined}
 */
function buildColorEncoding(
    groupDomain,
    groupField,
    groupTitle,
    colorScaleRange
) {
    if (groupDomain.length === 0) {
        return undefined;
    } else {
        return {
            field: escapeFieldName(groupField),
            type: "nominal",
            title: groupTitle,
            scale: {
                domain: groupDomain,
                ...(colorScaleRange ? { range: colorScaleRange } : {}),
            },
        };
    }
}

/**
 * @param {import("../sampleView/types.js").AttributeInfo} xAttributeInfo
 * @param {import("../sampleView/types.js").AttributeInfo} yAttributeInfo
 * @param {import("../sampleView/state/sampleState.js").SampleHierarchy} sampleHierarchy
 * @param {import("../sampleView/compositeAttributeInfoSource.js").default} attributeInfoSource
 * @param {string[]} [colorScaleRange]
 * @returns {Promise<import("../components/generic/baseDialog.js").DialogFinishDetail>}
 */
export default function hierarchyScatterplotDialog(
    xAttributeInfo,
    yAttributeInfo,
    sampleHierarchy,
    attributeInfoSource,
    colorScaleRange
) {
    const xInfo = attributeInfoSource.getAttributeInfo(
        xAttributeInfo.attribute
    );
    const yInfo = attributeInfoSource.getAttributeInfo(
        yAttributeInfo.attribute
    );
    const dialogLabel = html`${xInfo.title} vs ${yInfo.title}`;

    return showDialog(
        "gs-hierarchy-scatterplot-dialog",
        (/** @type {HierarchyScatterplotDialog} */ el) => {
            el.xAttributeInfo = xAttributeInfo;
            el.yAttributeInfo = yAttributeInfo;
            el.sampleHierarchy = sampleHierarchy;
            el.attributeInfoSource = attributeInfoSource;
            el.colorScaleRange = colorScaleRange ?? null;
            el.dialogTitle = html`Scatterplot of ${dialogLabel}`;
        }
    );
}
