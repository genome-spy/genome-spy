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
const categoryCollator = new Intl.Collator("en", {
    numeric: true,
    sensitivity: "base",
});

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

    const {
        rows,
        categoryDomain,
        groupDomain,
        grouped,
        sampleCount,
        nonMissingCount,
        missingCount,
        groupSummaries,
    } = buildHierarchyBarplotData(
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
            sampleCount,
            plottedCount: nonMissingCount,
        },
        characterization: buildCategoryCountsCharacterization({
            rows,
            categoryFieldName,
            xTitle,
            colorTitle: grouped ? categoryTitle : undefined,
            countFieldName,
            categoryDomain,
            nonMissingCount,
            missingCount,
            groupSummaries,
            grouped,
        }),
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

    const {
        statsRows,
        outlierRows,
        groupDomain,
        sampleCount,
        nonMissingCount,
        groupSummaries,
    } = buildHierarchyBoxplotData(
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
            sampleCount,
            plottedCount: nonMissingCount,
        },
        characterization:
            buildAttributeDistributionCharacterization(groupSummaries),
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

    const { rows, groupDomain, sampleCount, missingPairCount, groupSummaries } =
        buildHierarchyScatterplotData(
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
            sampleCount,
            plottedCount: rows.length,
        },
        characterization: buildAttributeRelationshipCharacterization({
            rows,
            xFieldName,
            yFieldName,
            xAxisTitle,
            yAxisTitle,
            missingPairCount,
            groupSummaries,
        }),
    };
}

/**
 * @param {object} params
 * @param {Record<string, import("@genome-spy/core/spec/channel.js").Scalar | number>[]} params.rows
 * @param {string} params.categoryFieldName
 * @param {string} params.xTitle
 * @param {string | undefined} params.colorTitle
 * @param {string} params.countFieldName
 * @param {import("@genome-spy/core/spec/channel.js").Scalar[]} params.categoryDomain
 * @param {number} params.nonMissingCount
 * @param {number} params.missingCount
 * @param {Array<{
 *     title: string,
 *     sampleCount: number,
 *     nonMissingCount: number,
 *     missingCount: number,
 *     counts: Map<import("@genome-spy/core/spec/channel.js").Scalar, number>
 * }>} params.groupSummaries
 * @param {boolean} params.grouped
 * @returns {import("./sampleAttributePlotTypes.d.ts").CategoryCountsPlotCharacterization}
 */
function buildCategoryCountsCharacterization(params) {
    const categoryCounts = new Map();
    for (const row of params.rows) {
        const category = row[params.categoryFieldName];
        const count = Number(row[params.countFieldName]);
        categoryCounts.set(
            category,
            (categoryCounts.get(category) ?? 0) + count
        );
    }

    return {
        kind: "category_counts",
        encoding: {
            x: {
                role: params.grouped
                    ? "current_sample_groups"
                    : "plotted_attribute",
                title: params.xTitle,
            },
            y: {
                role: "count",
                title: "count",
            },
            ...(params.colorTitle
                ? {
                      color: {
                          role: "plotted_attribute",
                          title: params.colorTitle,
                      },
                  }
                : {}),
        },
        nonMissingCount: params.nonMissingCount,
        missingCount: params.missingCount,
        distinctCount: params.categoryDomain.length,
        categories: Array.from(categoryCounts.entries())
            .map(([value, count]) => ({
                value,
                count,
                share:
                    params.nonMissingCount > 0
                        ? count / params.nonMissingCount
                        : 0,
            }))
            .sort(compareCategoryRows),
        ...(params.grouped
            ? {
                  groups: params.groupSummaries.map((group) => ({
                      title: group.title,
                      sampleCount: group.sampleCount,
                      nonMissingCount: group.nonMissingCount,
                      missingCount: group.missingCount,
                      ...buildTopCategory(group.counts, group.nonMissingCount),
                  })),
              }
            : {}),
    };
}

/**
 * @param {Array<{
 *     title: string,
 *     sampleCount: number,
 *     nonMissingCount: number,
 *     missingCount: number,
 *     min: number,
 *     q1: number,
 *     median: number,
 *     q3: number,
 *     max: number,
 *     iqr: number,
 *     outlierCount: number
 * }>} groupSummaries
 * @returns {import("./sampleAttributePlotTypes.d.ts").AttributeDistributionPlotCharacterization}
 */
function buildAttributeDistributionCharacterization(groupSummaries) {
    const groups = groupSummaries.map((group) => ({ ...group }));
    const groupsWithValues = groups.filter(
        (group) => group.nonMissingCount > 0
    );
    const orderedByMedian = groupsWithValues
        .slice()
        .sort((a, b) => a.median - b.median);
    const lowestMedianGroup = orderedByMedian[0];
    const highestMedianGroup = orderedByMedian[orderedByMedian.length - 1];
    const cautions = [];

    if (groups.some((group) => group.nonMissingCount < 3)) {
        cautions.push("Some groups have fewer than 3 non-missing values.");
    }
    if (groups.some((group) => group.missingCount > 0)) {
        cautions.push("Some visible samples have missing plotted values.");
    }

    return {
        kind: "quantitative_distribution",
        groups,
        ...(highestMedianGroup
            ? { highestMedianGroup: highestMedianGroup.title }
            : {}),
        ...(lowestMedianGroup
            ? { lowestMedianGroup: lowestMedianGroup.title }
            : {}),
        ...(highestMedianGroup && lowestMedianGroup
            ? {
                  largestMedianDifference:
                      highestMedianGroup.median - lowestMedianGroup.median,
              }
            : {}),
        ...(cautions.length > 0 ? { cautions } : {}),
    };
}

/**
 * @param {object} params
 * @param {Record<string, import("@genome-spy/core/spec/channel.js").Scalar | number>[]} params.rows
 * @param {string} params.xFieldName
 * @param {string} params.yFieldName
 * @param {string} params.xAxisTitle
 * @param {string} params.yAxisTitle
 * @param {number} params.missingPairCount
 * @param {Array<{ title: string, plottedPointCount: number }>} params.groupSummaries
 * @returns {import("./sampleAttributePlotTypes.d.ts").AttributeRelationshipPlotCharacterization}
 */
function buildAttributeRelationshipCharacterization(params) {
    const xValues = params.rows.map((row) => Number(row[params.xFieldName]));
    const yValues = params.rows.map((row) => Number(row[params.yFieldName]));
    const correlation = pearsonCorrelation(xValues, yValues);
    const cautions = [];

    if (params.rows.length < 3) {
        cautions.push("Fewer than 3 plotted points.");
    }
    if (params.missingPairCount > 0) {
        cautions.push("Some visible samples have missing plotted pairs.");
    }

    return {
        kind: "quantitative_relationship",
        axisMapping: [
            { axis: "x", attributeIndex: 0, title: params.xAxisTitle },
            { axis: "y", attributeIndex: 1, title: params.yAxisTitle },
        ],
        missingPairCount: params.missingPairCount,
        x: buildRange(xValues),
        y: buildRange(yValues),
        ...(correlation !== undefined
            ? { correlation: buildCorrelationSummary(correlation) }
            : {}),
        ...(params.groupSummaries.length > 1
            ? { groups: params.groupSummaries }
            : {}),
        ...(cautions.length > 0 ? { cautions } : {}),
    };
}

/**
 * @param {{ value: unknown, count: number }} a
 * @param {{ value: unknown, count: number }} b
 * @returns {number}
 */
function compareCategoryRows(a, b) {
    if (b.count !== a.count) {
        return b.count - a.count;
    }

    return categoryCollator.compare(String(a.value), String(b.value));
}

/**
 * @param {Map<unknown, number>} counts
 * @param {number} nonMissingCount
 * @returns {{ topCategory?: { value: unknown, count: number, share: number } }}
 */
function buildTopCategory(counts, nonMissingCount) {
    const topEntry = Array.from(counts.entries())
        .map(([value, count]) => ({
            value,
            count,
        }))
        .sort(compareCategoryRows)[0];

    return topEntry
        ? {
              topCategory: {
                  value: topEntry.value,
                  count: topEntry.count,
                  share:
                      nonMissingCount > 0
                          ? topEntry.count / nonMissingCount
                          : 0,
              },
          }
        : {};
}

/**
 * @param {number[]} values
 * @returns {{ min?: number, max?: number }}
 */
function buildRange(values) {
    const finiteValues = values.filter((value) => Number.isFinite(value));
    if (finiteValues.length === 0) {
        return {};
    }

    return {
        min: Math.min(...finiteValues),
        max: Math.max(...finiteValues),
    };
}

/**
 * @param {number[]} xValues
 * @param {number[]} yValues
 * @returns {number | undefined}
 */
function pearsonCorrelation(xValues, yValues) {
    if (xValues.length !== yValues.length || xValues.length < 3) {
        return undefined;
    }

    const xMean =
        xValues.reduce((sum, value) => sum + value, 0) / xValues.length;
    const yMean =
        yValues.reduce((sum, value) => sum + value, 0) / yValues.length;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;

    for (let i = 0; i < xValues.length; i += 1) {
        const dx = xValues[i] - xMean;
        const dy = yValues[i] - yMean;
        sxx += dx * dx;
        syy += dy * dy;
        sxy += dx * dy;
    }

    if (sxx === 0 || syy === 0) {
        return undefined;
    }

    return sxy / Math.sqrt(sxx * syy);
}

/**
 * @param {number} r
 * @returns {import("./sampleAttributePlotTypes.d.ts").AttributeRelationshipPlotCharacterization["correlation"]}
 */
function buildCorrelationSummary(r) {
    return {
        method: "pearson",
        r,
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
