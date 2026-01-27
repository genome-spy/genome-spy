import { html, css } from "lit";
import BaseDialog, { showDialog } from "../components/generic/baseDialog.js";
import { embed } from "@genome-spy/core";
import { buildHierarchyScatterplotData } from "./hierarchyScatterplotData.js";
import templateResultToString from "../utils/templateResultToString.js";

const DATA_NAME = "hierarchy_scatterplot_points";
const GROUP_FIELD = "group";
const X_FIELD = "x";
const Y_FIELD = "y";

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

        const dialogLabel = html`${xInfo.title} vs ${yInfo.title}`;
        this.dialogTitle = html`Scatterplot of ${dialogLabel}`;

        const { rows, groupDomain } = buildHierarchyScatterplotData(
            this.sampleHierarchy,
            this.xAttributeInfo,
            this.yAttributeInfo,
            {
                groupField: GROUP_FIELD,
                xField: X_FIELD,
                yField: Y_FIELD,
            }
        );

        /** @type {import("@genome-spy/core/spec/channel.js").Encoding} */
        const encoding = {
            x: {
                field: X_FIELD,
                type: "quantitative",
                title: templateResultToString(xInfo.emphasizedName),
            },
            y: {
                field: Y_FIELD,
                type: "quantitative",
                title: templateResultToString(yInfo.emphasizedName),
            },
        };

        const colorEncoding = buildColorEncoding(
            groupDomain,
            this.colorScaleRange
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
 * @param {string[] | null} colorScaleRange
 * @returns {import("@genome-spy/core/spec/channel.js").ColorDef | undefined}
 */
function buildColorEncoding(groupDomain, colorScaleRange) {
    if (groupDomain.length === 0) {
        return undefined;
    } else {
        return {
            field: GROUP_FIELD,
            type: "nominal",
            title: "Group",
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
    return showDialog(
        "gs-hierarchy-scatterplot-dialog",
        (/** @type {HierarchyScatterplotDialog} */ el) => {
            el.xAttributeInfo = xAttributeInfo;
            el.yAttributeInfo = yAttributeInfo;
            el.sampleHierarchy = sampleHierarchy;
            el.attributeInfoSource = attributeInfoSource;
            el.colorScaleRange = colorScaleRange ?? null;
        }
    );
}
