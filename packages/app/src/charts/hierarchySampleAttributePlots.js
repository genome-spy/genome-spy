import { createBoxplotSpec } from "./boxplotChart.js";
import { buildHierarchyBarplotData } from "./hierarchyBarplotData.js";
import { buildHierarchyBoxplotData } from "./hierarchyBoxplotData.js";
import { buildHierarchyScatterplotData } from "./hierarchyScatterplotData.js";
import { escapeFieldName, resolveGroupTitle } from "./chartDataUtils.js";
import templateResultToString from "../utils/templateResultToString.js";

const BARPLOT_DATA_NAME = "hierarchy_barplot";
const BOXPLOT_STATS_NAME = "hierarchy_boxplot_stats";
const BOXPLOT_OUTLIERS_NAME = "hierarchy_boxplot_outliers";
const SCATTERPLOT_DATA_NAME = "hierarchy_scatterplot_points";
/**
 * @param {import("./sampleAttributePlotTypes.d.ts").HierarchyBarplotRequest} request
 * @returns {import("./sampleAttributePlotTypes.d.ts").SampleAttributePlot}
 */
export function buildHierarchyBarplot(request) {
    const info = request.attributeInfoSource.getAttributeInfo(
        request.attributeInfo.attribute
    );
    const categoryFieldName = templateResultToString(info.title);
    const categoryTitle = templateResultToString(info.emphasizedName);
    const categoryType =
        /** @type {import("@genome-spy/core/spec/channel.js").Type} */ (
            info.type
        );
    const groupTitle = resolveGroupTitle(
        request.attributeInfoSource,
        request.sampleHierarchy.groupMetadata
    );
    const groupFieldName = groupTitle ?? "Group";
    const countFieldName = "Count";
    const stackStartField = "y0";
    const stackEndField = "y1";

    const { rows, categoryDomain, groupDomain, grouped } =
        buildHierarchyBarplotData(
            request.sampleHierarchy,
            request.attributeInfo,
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
        data: { name: BARPLOT_DATA_NAME },
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

    return {
        kind: "sample_attribute_plot",
        plotType: "barplot",
        title: `Bar plot of ${templateResultToString(info.title)}`,
        spec,
        namedData: [{ name: BARPLOT_DATA_NAME, rows }],
        filename: "genomespy-barplot.png",
        summary: {
            groupCount: groupDomain.length > 0 ? groupDomain.length : 1,
            rowCount: rows.length,
        },
    };
}

/**
 * @param {import("./sampleAttributePlotTypes.d.ts").HierarchyBoxplotRequest} request
 * @returns {import("./sampleAttributePlotTypes.d.ts").SampleAttributePlot}
 */
export function buildHierarchyBoxplot(request) {
    const info = request.attributeInfoSource.getAttributeInfo(
        request.attributeInfo.attribute
    );
    const groupTitle = resolveGroupTitle(
        request.attributeInfoSource,
        request.sampleHierarchy.groupMetadata
    );
    const axisTitle = templateResultToString(info.emphasizedName);
    const groupFieldName = groupTitle ?? "Group";
    const valueFieldName = templateResultToString(info.title);

    const { statsRows, outlierRows, groupDomain } = buildHierarchyBoxplotData(
        request.sampleHierarchy,
        request.attributeInfo,
        {
            groupField: groupFieldName,
            valueField: valueFieldName,
            sampleField: "sample",
        }
    );

    const spec = createBoxplotSpec({
        statsName: BOXPLOT_STATS_NAME,
        outliersName: BOXPLOT_OUTLIERS_NAME,
        groupField: escapeFieldName(groupFieldName),
        valueField: escapeFieldName(valueFieldName),
        sampleField: "sample",
        groupTitle: groupTitle ?? "Group",
        valueTitle: axisTitle,
    });

    const xEncoding = /** @type {any} */ (spec.encoding.x);
    xEncoding.scale = {
        ...(xEncoding.scale ?? {}),
        domain: groupDomain.slice().reverse(),
    };

    return {
        kind: "sample_attribute_plot",
        plotType: "boxplot",
        title: `Boxplot of ${templateResultToString(info.title)}`,
        spec,
        namedData: [
            { name: BOXPLOT_STATS_NAME, rows: statsRows },
            { name: BOXPLOT_OUTLIERS_NAME, rows: outlierRows },
        ],
        filename: "genomespy-boxplot.png",
        summary: {
            groupCount: groupDomain.length > 0 ? groupDomain.length : 1,
            rowCount: statsRows.length + outlierRows.length,
        },
    };
}

/**
 * @param {import("./sampleAttributePlotTypes.d.ts").HierarchyScatterplotRequest} request
 * @returns {import("./sampleAttributePlotTypes.d.ts").SampleAttributePlot}
 */
export function buildHierarchyScatterplot(request) {
    const xInfo = request.attributeInfoSource.getAttributeInfo(
        request.xAttributeInfo.attribute
    );
    const yInfo = request.attributeInfoSource.getAttributeInfo(
        request.yAttributeInfo.attribute
    );

    const xFieldName = templateResultToString(xInfo.title);
    const yFieldName = templateResultToString(yInfo.title);
    const xAxisTitle = templateResultToString(xInfo.emphasizedName);
    const yAxisTitle = templateResultToString(yInfo.emphasizedName);
    const groupTitle = resolveGroupTitle(
        request.attributeInfoSource,
        request.sampleHierarchy.groupMetadata
    );
    const groupFieldName = groupTitle ?? "Group";

    const { rows, groupDomain } = buildHierarchyScatterplotData(
        request.sampleHierarchy,
        request.xAttributeInfo,
        request.yAttributeInfo,
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
        request.colorScaleRange
    );

    /** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
    const spec = {
        data: { name: SCATTERPLOT_DATA_NAME },
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
    };

    return {
        kind: "sample_attribute_plot",
        plotType: "scatterplot",
        title: `Scatterplot of ${xFieldName} vs ${yFieldName}`,
        spec,
        namedData: [{ name: SCATTERPLOT_DATA_NAME, rows }],
        filename: "genomespy-scatterplot.png",
        summary: {
            groupCount: groupDomain.length > 0 ? groupDomain.length : 1,
            rowCount: rows.length,
        },
    };
}

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
 * @param {string[]} groupDomain
 * @param {string} groupField
 * @param {string} groupTitle
 * @param {string[] | undefined} colorScaleRange
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
    }

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
