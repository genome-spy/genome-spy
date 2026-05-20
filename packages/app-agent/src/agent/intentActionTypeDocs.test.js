import { describe, expect, it } from "vitest";
import generatedActionCatalog from "./generated/generatedActionCatalog.json" with { type: "json" };
import { getActionCatalogEntry } from "./actionCatalog.js";
import { getIntentActionTypeDocs } from "./intentActionTypeDocs.js";

describe("intentActionTypeDocs", () => {
    it("returns agent-facing docs for AttributeIdentifier", () => {
        const docs = getIntentActionTypeDocs({
            typeName: "AttributeIdentifier",
            referenceDepth: 1,
        });

        expect(docs.schema).toMatchObject({
            anyOf: [
                { $ref: "#/definitions/SampleAttributeIdentifier" },
                { $ref: "#/definitions/SelectionAggregationCandidate" },
            ],
        });
        expect(docs.definitions).toHaveProperty("SampleAttributeIdentifier");
        expect(docs.definitions).toHaveProperty(
            "SelectionAggregationCandidate"
        );
        expect(
            JSON.stringify(docs.definitions.SelectionAggregationCandidate)
        ).toContain("featureFilter");
        expect(docs.examples).toContainEqual({
            type: "SELECTION_AGGREGATION",
            candidateId: "brush@mutations:VAF",
            aggregation: "count",
            featureFilter: {
                field: "functionalCategory",
                operator: "eq",
                value: "stopgain",
            },
        });
        expect(docs.notes.join(" ")).toContain("selectionAggregation.fields");
        expect(docs.notes.join(" ")).toContain(
            "featureFilter is executable only through deriveMetadata"
        );
    });

    it("keeps deriveMetadata on the shared AttributeIdentifier docs", () => {
        const deriveMetadata = getActionCatalogEntry(
            "sampleView/deriveMetadata"
        );
        const attributeField = deriveMetadata.payloadFields.find(
            (field) => field.name === "attribute"
        );

        expect(attributeField.type).toBe("AttributeIdentifier");
    });

    it("returns enum docs for ComparisonOperatorType", () => {
        const docs = getIntentActionTypeDocs({
            typeName: "ComparisonOperatorType",
            referenceDepth: 0,
        });

        expect(docs.schema).toEqual({
            enum: ["lt", "lte", "eq", "gte", "gt"],
            type: "string",
        });
        expect(docs).not.toHaveProperty("definitions");
    });

    it("responds tersely for primitive and obvious container display types", () => {
        expect(getIntentActionTypeDocs({ typeName: "string" }).schema).toEqual({
            type: "string",
        });
        expect(
            getIntentActionTypeDocs({ typeName: "string[]" }).schema
        ).toEqual({
            items: { type: "string" },
            type: "array",
        });
        expect(getIntentActionTypeDocs({ typeName: "boolean" }).schema).toEqual(
            {
                type: "boolean",
            }
        );
        expect(getIntentActionTypeDocs({ typeName: "string" }).notes).toEqual([
            "Primitive type. Use the field description from action docs for semantics.",
        ]);
    });

    it("resolves non-empty Threshold tuple display type", () => {
        const docs = getIntentActionTypeDocs({
            typeName: "[Threshold, ...Threshold[]]",
            referenceDepth: 1,
        });

        expect(docs.schema).toEqual({
            items: { $ref: "#/definitions/Threshold" },
            minItems: 1,
            type: "array",
        });
        expect(docs.definitions).toHaveProperty("Threshold");
    });

    it("returns curated scale docs without expanding the full scale grammar", () => {
        const docs = getIntentActionTypeDocs({
            typeName: 'SampleAttributeDef["scale"] | null',
            referenceDepth: 1,
        });

        expect(docs.normalizedTypeName).toBe("Scale | null");
        expect(docs.schema).toEqual({
            anyOf: [{ $ref: "#/definitions/Scale" }, { type: "null" }],
        });
        expect(docs.definitions.Scale).toMatchObject({
            type: "object",
            properties: {
                type: { $ref: "#/definitions/ScaleType" },
                scheme: expect.any(Object),
            },
        });
        expect(docs.definitions.Scale.properties).not.toHaveProperty("align");
        expect(docs.definitions).not.toHaveProperty("InlineLocusAssembly");
        expect(docs.examples).toContainEqual({
            type: "linear",
            scheme: "viridis",
        });
        expect(docs.notes.join(" ")).toContain("construction guide");
    });

    it("summarizes metadata attribute definition maps", () => {
        const docs = getIntentActionTypeDocs({
            typeName: "Record<AttributeName, SampleAttributeDef>",
            referenceDepth: 1,
        });

        expect(docs.schema).toEqual({
            additionalProperties: {
                $ref: "#/definitions/SampleAttributeDef",
            },
            type: "object",
        });
        expect(docs.definitions.SampleAttributeDef).toMatchObject({
            type: "object",
        });
        expect(docs.definitions.SampleAttributeDef).not.toHaveProperty(
            "properties"
        );
    });

    it("resolves the named nominal filter value array type", () => {
        const docs = getIntentActionTypeDocs({
            typeName: "NominalFilterValue[]",
        });

        expect(docs.schema).toMatchObject({
            items: {
                anyOf: [{ $ref: "#/definitions/Scalar" }, { type: "null" }],
            },
            type: "array",
        });
        expect(docs.notes.join(" ")).toContain("exact category values");
    });

    it("resolves every type exposed by action payload fields", () => {
        const failures = [];

        for (const entry of generatedActionCatalog) {
            for (const field of entry.payloadFields) {
                try {
                    getIntentActionTypeDocs({
                        typeName: field.type,
                        referenceDepth: 1,
                    });
                } catch (error) {
                    failures.push(
                        entry.actionType +
                            "." +
                            field.name +
                            ": " +
                            field.type +
                            " -> " +
                            (error instanceof Error
                                ? error.message
                                : String(error))
                    );
                }
            }
        }

        expect(failures).toEqual([]);
    });

    it("resolves every generated action payload type ref", () => {
        const failures = [];

        for (const entry of generatedActionCatalog) {
            for (const field of entry.payloadFields) {
                for (const typeRef of field.typeRefs) {
                    try {
                        getIntentActionTypeDocs({
                            typeName: typeRef,
                            referenceDepth: 1,
                        });
                    } catch (error) {
                        failures.push(
                            entry.actionType +
                                "." +
                                field.name +
                                ": " +
                                typeRef +
                                " -> " +
                                (error instanceof Error
                                    ? error.message
                                    : String(error))
                        );
                    }
                }
            }
        }

        expect(failures).toEqual([]);
    });
});
