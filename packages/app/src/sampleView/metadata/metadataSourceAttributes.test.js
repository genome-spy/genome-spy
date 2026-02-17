import { describe, expect, it } from "vitest";
import { resolveMetadataSourceAttributes } from "./metadataSourceAttributes.js";

describe("resolveMetadataSourceAttributes", () => {
    it("treats slash-containing keys as flat ids when separator is not defined", () => {
        const source = {
            id: "clinical",
            attributes: {
                "A/B": {
                    type: "quantitative",
                },
            },
        };

        const resolved = resolveMetadataSourceAttributes(source, ["A/B"]);
        expect(resolved).toEqual({
            "A\\/B": {
                type: "quantitative",
            },
        });
    });

    it("applies separator-based hierarchy to attribute definitions", () => {
        const source = {
            id: "clinical",
            attributeGroupSeparator: ".",
            attributes: {
                clinical: {
                    type: "quantitative",
                },
                "clinical.OS": {
                    visible: false,
                },
                signature: {
                    type: "quantitative",
                },
            },
        };

        const resolved = resolveMetadataSourceAttributes(source, [
            "clinical.OS",
        ]);
        expect(resolved).toEqual({
            clinical: {
                type: "quantitative",
            },
            "clinical/OS": {
                visible: false,
            },
        });
    });
});
