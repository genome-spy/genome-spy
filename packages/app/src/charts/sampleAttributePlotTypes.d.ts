import type { RootSpec } from "@genome-spy/core/spec/root.js";
import type { AttributeIdentifier } from "../sampleView/types.d.ts";
import type { AttributeInfo } from "../sampleView/types.js";
import type { SampleHierarchy } from "../sampleView/state/sampleState.js";
import type CompositeAttributeInfoSource from "../sampleView/compositeAttributeInfoSource.js";

export type SampleAttributePlotType = "barplot" | "boxplot" | "scatterplot";

export interface RenderablePlotNamedData {
    name: string;
    rows: Record<string, any>[];
}

export interface SampleAttributePlotSummary {
    groupCount: number;
    sampleCount: number;
    plottedCount: number;
}

export interface CategoryCountsPlotCharacterization {
    kind: "category_counts";
    encoding: {
        x: {
            role: "current_sample_groups" | "plotted_attribute";
            title: string;
        };
        y: {
            role: "count";
            title: "count";
        };
        color?: {
            role: "plotted_attribute";
            title: string;
        };
    };
    nonMissingCount: number;
    missingCount: number;
    distinctCount: number;
    categories: Array<{ value: unknown; count: number; share: number }>;
    groups?: Array<{
        title: string;
        sampleCount: number;
        nonMissingCount: number;
        missingCount: number;
        topCategory?: { value: unknown; count: number; share: number };
    }>;
}

export interface AttributeDistributionPlotCharacterization {
    kind: "quantitative_distribution";
    groups: Array<{
        title: string;
        sampleCount: number;
        nonMissingCount: number;
        missingCount: number;
        min?: number;
        q1?: number;
        median?: number;
        q3?: number;
        max?: number;
        iqr?: number;
        outlierCount: number;
    }>;
    highestMedianGroup?: string;
    lowestMedianGroup?: string;
    largestMedianDifference?: number;
    cautions?: string[];
}

export interface AttributeRelationshipPlotCharacterization {
    kind: "quantitative_relationship";
    axisMapping: Array<{
        axis: "x" | "y";
        attributeIndex: number;
        title: string;
    }>;
    missingPairCount: number;
    x: { min?: number; max?: number };
    y: { min?: number; max?: number };
    correlation?: {
        method: "pearson";
        r: number;
    };
    groups?: Array<{ title: string; plottedPointCount: number }>;
    cautions?: string[];
}

export type SampleAttributePlotCharacterization =
    | CategoryCountsPlotCharacterization
    | AttributeDistributionPlotCharacterization
    | AttributeRelationshipPlotCharacterization;

export interface SampleAttributePlot {
    kind: "sample_attribute_plot";
    plotType: SampleAttributePlotType;
    title: string;
    spec: RootSpec;
    namedData: RenderablePlotNamedData[];
    filename: string;
    summary: SampleAttributePlotSummary;
    characterization: SampleAttributePlotCharacterization;
}

export interface HierarchyBarplotRequest {
    attributeInfo: AttributeInfo;
    sampleHierarchy: SampleHierarchy;
    attributeInfoSource: CompositeAttributeInfoSource;
}

export interface HierarchyBoxplotRequest {
    attributeInfo: AttributeInfo;
    sampleHierarchy: SampleHierarchy;
    attributeInfoSource: CompositeAttributeInfoSource;
}

export interface HierarchyScatterplotRequest {
    xAttributeInfo: AttributeInfo;
    yAttributeInfo: AttributeInfo;
    sampleHierarchy: SampleHierarchy;
    attributeInfoSource: CompositeAttributeInfoSource;
    colorScaleRange?: string[];
}

export type SampleAttributePlotRequest =
    | {
          plotType: "bar";
          attribute: AttributeIdentifier;
          attributeLabel?: string;
      }
    | {
          plotType: "boxplot";
          attribute: AttributeIdentifier;
          attributeLabel?: string;
      }
    | {
          plotType: "scatterplot";
          xAttribute: AttributeIdentifier;
          yAttribute: AttributeIdentifier;
          xAttributeLabel?: string;
          yAttributeLabel?: string;
      };
