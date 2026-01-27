import { html, css } from "lit";
import BaseDialog, { showDialog } from "../components/generic/baseDialog.js";
import { embed } from "@genome-spy/core";
import { faDownload } from "@fortawesome/free-solid-svg-icons";
import { buildHierarchyBarplotData } from "./hierarchyBarplotData.js";
import { escapeFieldName, resolveGroupTitle } from "./chartDataUtils.js";
import { downloadChartPng } from "./chartDialogUtils.js";
import templateResultToString from "../utils/templateResultToString.js";

const DATA_NAME = "hierarchy_barplot";

export class HierarchyBarplotDialog extends BaseDialog {
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

    renderButtons() {
        return [
            this.makeButton(
                "Save PNG",
                () => {
                    downloadChartPng(
                        this.renderRoot,
                        this._api,
                        "genomespy-barplot.png"
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
            !this.attributeInfo ||
            !this.sampleHierarchy ||
            !this.attributeInfoSource
        ) {
            throw new Error(
                "Bar plot dialog requires attribute, sample hierarchy, and attribute info source."
            );
        }

        const info = this.attributeInfoSource.getAttributeInfo(
            this.attributeInfo.attribute
        );
        const categoryFieldName = templateResultToString(info.title);
        const categoryTitle = templateResultToString(info.emphasizedName);
        const categoryType =
            /** @type {import("@genome-spy/core/spec/channel.js").Type} */ (
                info.type
            );
        const groupTitle = resolveGroupTitle(
            this.attributeInfoSource,
            this.sampleHierarchy.groupMetadata
        );
        const groupFieldName = groupTitle ?? "Group";
        const countFieldName = "Count";
        const stackStartField = "y0";
        const stackEndField = "y1";

        const { rows, categoryDomain, groupDomain, grouped } =
            buildHierarchyBarplotData(
                this.sampleHierarchy,
                this.attributeInfo,
                {
                    categoryField: categoryFieldName,
                    groupField: groupFieldName,
                    countField: countFieldName,
                }
            );

        const colorScale = resolveCategoryScale(info, categoryDomain);

        const xField = grouped ? groupFieldName : categoryFieldName;
        const xTitle = grouped ? groupFieldName : categoryTitle;
        const xDomain = grouped ? groupDomain : categoryDomain;
        const xType = grouped
            ? /** @type {import("@genome-spy/core/spec/channel.js").Type} */ (
                  "nominal"
              )
            : categoryType;

        /** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
        const spec = {
            data: { name: DATA_NAME },
            mark: {
                type: "rect",
            },
            encoding: {
                x: {
                    field: escapeFieldName(xField),
                    type: xType,
                    band: 0.8,
                    title: xTitle,
                    axis: { labelAngle: 0 },
                },
                y: grouped
                    ? {
                          field: stackStartField,
                          type: "quantitative",
                          title: "Count",
                      }
                    : {
                          field: escapeFieldName(countFieldName),
                          type: "quantitative",
                          title: "Count",
                      },
                ...(grouped
                    ? {
                          y2: {
                              field: stackEndField,
                          },
                      }
                    : {}),
                color: {
                    field: escapeFieldName(categoryFieldName),
                    type: categoryType,
                    title: categoryTitle,
                    scale: colorScale,
                },
            },
            ...(grouped
                ? {
                      transform: [
                          {
                              type: "stack",
                              field: escapeFieldName(countFieldName),
                              groupby: [escapeFieldName(xField)],
                              as: [stackStartField, stackEndField],
                          },
                      ],
                  }
                : {}),
        };

        const xEncoding = /** @type {any} */ (spec.encoding.x);
        xEncoding.scale = { ...(xEncoding.scale ?? {}), domain: xDomain };

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

customElements.define("gs-hierarchy-barplot-dialog", HierarchyBarplotDialog);

/**
 * @param {import("../sampleView/types.js").AttributeInfo} attributeInfo
 * @param {import("@genome-spy/core/spec/channel.js").Scalar[]} categoryDomain
 * @returns {import("@genome-spy/core/spec/scale.js").Scale}
 */
function resolveCategoryScale(attributeInfo, categoryDomain) {
    const scale = attributeInfo.scale;
    const domain =
        scale && typeof scale.domain === "function"
            ? scale.domain()
            : categoryDomain;
    const range =
        scale && typeof scale.range === "function" ? scale.range() : undefined;

    return {
        domain,
        ...(range ? { range } : {}),
    };
}

/**
 * @param {import("../sampleView/types.js").AttributeInfo} attributeInfo
 * @param {import("../sampleView/state/sampleState.js").SampleHierarchy} sampleHierarchy
 * @param {import("../sampleView/compositeAttributeInfoSource.js").default} attributeInfoSource
 * @returns {Promise<import("../components/generic/baseDialog.js").DialogFinishDetail>}
 */
export default function hierarchyBarplotDialog(
    attributeInfo,
    sampleHierarchy,
    attributeInfoSource
) {
    const info = attributeInfoSource.getAttributeInfo(attributeInfo.attribute);

    return showDialog(
        "gs-hierarchy-barplot-dialog",
        (/** @type {HierarchyBarplotDialog} */ el) => {
            el.attributeInfo = attributeInfo;
            el.sampleHierarchy = sampleHierarchy;
            el.attributeInfoSource = attributeInfoSource;
            el.dialogTitle = html`Bar plot of ${info.title}`;
        }
    );
}
