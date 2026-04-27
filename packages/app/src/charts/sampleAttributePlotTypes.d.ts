import type { RootSpec } from "@genome-spy/core/spec/root.js";
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
    rowCount: number;
}

export interface SampleAttributePlot {
    kind: "sample_attribute_plot";
    plotType: SampleAttributePlotType;
    title: string;
    spec: RootSpec;
    namedData: RenderablePlotNamedData[];
    filename: string;
    summary: SampleAttributePlotSummary;
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
