// @ts-check
import { describe, expect, it } from "vitest";
import { normalizeSampleViewSpec } from "./sampleViewSpecNormalizer.js";

describe("normalizeSampleViewSpec", () => {
    it("returns canonical metadata config unchanged", () => {
        const spec = {
            samples: {
                identity: {
                    data: { url: "samples.tsv" },
                    idField: "sample",
                    displayNameField: "displayName",
                },
                labelTitle: "Case",
            },
            metadata: {
                sources: [
                    {
                        id: "clinical",
                        backend: {
                            backend: "data",
                            data: { url: "samples.tsv" },
                        },
                    },
                ],
                attributeWidth: 12,
                spacing: 2,
                labelAngle: -45,
            },
            spec: { mark: "point" },
        };

        const normalized = normalizeSampleViewSpec(/** @type {any} */ (spec));

        expect(normalized.spec).toBe(spec);
        expect(normalized.warnings).toEqual([]);
    });

    it("maps legacy samples.data metadata fields to canonical metadata.sources", () => {
        const spec = {
            samples: {
                data: { url: "samples.tsv" },
                attributeGroupSeparator: ".",
                attributes: {
                    clinical: { type: "quantitative" },
                },
            },
            spec: { mark: "point" },
        };

        const normalized = normalizeSampleViewSpec(/** @type {any} */ (spec));

        expect(normalized.spec.samples.identity).toEqual({
            data: { url: "samples.tsv" },
            idField: "sample",
            displayNameField: "displayName",
        });
        expect(normalized.spec.metadata.sources).toEqual([
            {
                initialLoad: "*",
                excludeColumns: ["displayName"],
                attributeGroupSeparator: ".",
                attributes: {
                    clinical: { type: "quantitative" },
                },
                backend: {
                    backend: "data",
                    data: { url: "samples.tsv" },
                    sampleIdField: "sample",
                },
            },
        ]);
        expect(normalized.warnings).toHaveLength(1);
    });

    it("maps samples.metadataSources to canonical metadata.sources", () => {
        const spec = {
            samples: {
                metadataSources: [
                    {
                        id: "source",
                        backend: {
                            backend: "zarr",
                            url: "expression.zarr",
                        },
                    },
                ],
            },
            spec: { mark: "point" },
        };

        const normalized = normalizeSampleViewSpec(/** @type {any} */ (spec));

        expect(normalized.spec.metadata.sources).toEqual(
            spec.samples.metadataSources
        );
        expect(normalized.warnings).toHaveLength(1);
    });

    it("maps legacy metadata layout properties from samples to metadata", () => {
        const spec = {
            samples: {
                attributeSize: 14,
                attributeSpacing: 3,
                attributeLabelFont: "Lato",
                attributeLabelFontSize: 13,
                attributeLabelFontStyle: "italic",
                attributeLabelFontWeight: "bold",
                attributeLabelAngle: 15,
            },
            spec: { mark: "point" },
        };

        const normalized = normalizeSampleViewSpec(/** @type {any} */ (spec));

        expect(normalized.spec.metadata).toMatchObject({
            attributeWidth: 14,
            spacing: 3,
            labelFont: "Lato",
            labelFontSize: 13,
            labelFontStyle: "italic",
            labelFontWeight: "bold",
            labelAngle: -75,
        });
    });

    it("rejects metadata.sources mixed with samples.metadataSources", () => {
        const spec = {
            samples: {
                metadataSources: [
                    {
                        id: "old",
                        backend: {
                            backend: "data",
                            data: { url: "old.tsv" },
                        },
                    },
                ],
            },
            metadata: {
                sources: [
                    {
                        id: "new",
                        backend: {
                            backend: "data",
                            data: { url: "new.tsv" },
                        },
                    },
                ],
            },
            spec: { mark: "point" },
        };

        expect(() =>
            normalizeSampleViewSpec(/** @type {any} */ (spec))
        ).toThrow(
            "Cannot combine metadata.sources with samples.metadataSources"
        );
    });
});
