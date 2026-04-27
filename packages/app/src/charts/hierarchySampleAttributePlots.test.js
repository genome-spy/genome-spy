// @ts-check
import { describe, expect, it } from "vitest";
import {
    buildHierarchyBarplot,
    buildHierarchyBoxplot,
    buildHierarchyScatterplot,
} from "./hierarchySampleAttributePlots.js";
import { createDefaultValuesProvider } from "../sampleView/attributeValues.js";

/**
 * @returns {import("../sampleView/state/sampleState.js").SampleHierarchy}
 */
function createSampleHierarchy() {
    return {
        sampleData: {
            ids: ["s1", "s2", "s3", "s4"],
            entities: {
                s1: { id: "s1", displayName: "S1", indexNumber: 0 },
                s2: { id: "s2", displayName: "S2", indexNumber: 1 },
                s3: { id: "s3", displayName: "S3", indexNumber: 2 },
                s4: { id: "s4", displayName: "S4", indexNumber: 3 },
            },
        },
        sampleMetadata: {
            entities: {
                s1: { status: "A", score: 1, size: 10 },
                s2: { status: "B", score: 2, size: 11 },
                s3: { status: "A", score: 3, size: 12 },
                s4: { status: "C", score: 4, size: 13 },
            },
            attributeNames: ["status", "score", "size"],
        },
        groupMetadata: [
            {
                attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "group" },
            },
        ],
        rootGroup: {
            name: "ROOT",
            title: "Root",
            groups: [
                {
                    name: "G1",
                    title: "Group 1",
                    samples: ["s1", "s2"],
                },
                {
                    name: "G2",
                    title: "Group 2",
                    samples: ["s3", "s4"],
                },
            ],
        },
    };
}

/**
 * @param {string} name
 * @returns {import("../sampleView/types.js").AttributeInfo}
 */
function createAttributeInfo(name) {
    return /** @type {any} */ ({
        name,
        title: name,
        emphasizedName: name,
        attribute: { type: "SAMPLE_ATTRIBUTE", specifier: name },
        accessor: (sampleId, hierarchy) =>
            hierarchy.sampleMetadata.entities[sampleId]?.[name],
        valuesProvider: createDefaultValuesProvider(
            (sampleId, hierarchy) =>
                hierarchy.sampleMetadata.entities[sampleId]?.[name]
        ),
        type: name === "status" ? "nominal" : "quantitative",
        scale:
            name === "status"
                ? {
                      domain: () => ["A", "B", "C"],
                      range: () => ["#111111", "#222222", "#333333"],
                  }
                : undefined,
    });
}

/**
 * @returns {import("../sampleView/compositeAttributeInfoSource.js").default}
 */
function createAttributeInfoSource() {
    const attributeInfos = {
        status: createAttributeInfo("status"),
        score: createAttributeInfo("score"),
        size: createAttributeInfo("size"),
        group: {
            name: "group",
            title: "Group",
            emphasizedName: "Group",
            attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "group" },
            accessor: () => undefined,
            valuesProvider: () => [],
            type: "nominal",
        },
    };

    return /** @type {any} */ ({
        getAttributeInfo(attribute) {
            const info = attributeInfos[attribute.specifier];
            if (!info) {
                throw new Error(
                    "Missing attribute info: " + attribute.specifier
                );
            }

            return info;
        },
    });
}

describe("sample attribute plot builders", () => {
    it("builds a barplot renderable plot", () => {
        const sampleHierarchy = createSampleHierarchy();
        const attributeInfoSource = createAttributeInfoSource();
        const plot = buildHierarchyBarplot({
            attributeInfo: createAttributeInfo("status"),
            sampleHierarchy,
            attributeInfoSource,
        });

        expect(plot.kind).toBe("sample_attribute_plot");
        expect(plot.plotType).toBe("barplot");
        expect(plot.title).toBe("Bar plot of status");
        expect(plot.filename).toBe("genomespy-barplot.png");
        expect(plot.summary).toEqual({ groupCount: 2, rowCount: 4 });
        expect(plot.spec.width).toBeUndefined();
        expect(plot.spec.height).toBeUndefined();
        expect(plot.namedData).toEqual([
            {
                name: "hierarchy_barplot",
                rows: [
                    { status: "A", Count: 1, Group: "Group 1" },
                    { status: "B", Count: 1, Group: "Group 1" },
                    { status: "A", Count: 1, Group: "Group 2" },
                    { status: "C", Count: 1, Group: "Group 2" },
                ],
            },
        ]);
        expect(plot.spec.data).toEqual({ name: "hierarchy_barplot" });
    });

    it("builds a boxplot renderable plot", () => {
        const sampleHierarchy = createSampleHierarchy();
        const attributeInfoSource = createAttributeInfoSource();
        const plot = buildHierarchyBoxplot({
            attributeInfo: createAttributeInfo("score"),
            sampleHierarchy,
            attributeInfoSource,
        });

        expect(plot.plotType).toBe("boxplot");
        expect(plot.title).toBe("Boxplot of score");
        expect(plot.namedData).toHaveLength(2);
        expect(plot.summary).toEqual({ groupCount: 2, rowCount: 2 });
        expect(plot.spec.width).toBeUndefined();
        expect(plot.spec.height).toBeUndefined();
    });

    it("builds a scatterplot renderable plot", () => {
        const sampleHierarchy = createSampleHierarchy();
        const attributeInfoSource = createAttributeInfoSource();
        const plot = buildHierarchyScatterplot({
            xAttributeInfo: createAttributeInfo("score"),
            yAttributeInfo: createAttributeInfo("size"),
            sampleHierarchy,
            attributeInfoSource,
            colorScaleRange: ["#f00", "#0f0", "#00f"],
        });

        expect(plot.plotType).toBe("scatterplot");
        expect(plot.title).toBe("Scatterplot of score vs size");
        expect(plot.summary).toEqual({ groupCount: 2, rowCount: 4 });
        expect(plot.spec.width).toBeUndefined();
        expect(plot.spec.height).toBeUndefined();
        expect(plot.namedData).toEqual([
            {
                name: "hierarchy_scatterplot_points",
                rows: [
                    { sample: "s1", score: 1, size: 10, Group: "Group 1" },
                    { sample: "s2", score: 2, size: 11, Group: "Group 1" },
                    { sample: "s3", score: 3, size: 12, Group: "Group 2" },
                    { sample: "s4", score: 4, size: 13, Group: "Group 2" },
                ],
            },
        ]);
        expect(plot.spec.encoding.color).toEqual({
            field: "Group",
            type: "nominal",
            title: "Group",
            scale: {
                domain: ["Group 1", "Group 2"],
                range: ["#f00", "#0f0", "#00f"],
            },
        });
    });
});
