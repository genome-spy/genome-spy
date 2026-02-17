// @ts-check
import { describe, expect, it } from "vitest";
import { html } from "lit";
import {
    faCheck,
    faCircle,
    faSortAmountDown,
    faTable,
} from "@fortawesome/free-solid-svg-icons";
import { getActionInfo } from "./actionInfo.js";
import { SAMPLE_SLICE_NAME } from "./sampleSlice.js";
import templateResultToString from "../../utils/templateResultToString.js";

/**
 * @returns {import("../types.js").AttributeInfo}
 */
function makeAttributeInfo() {
    return {
        name: "age",
        title: "Age",
        emphasizedName: "Age",
        attribute: { type: "SAMPLE_ATTRIBUTE", specifier: "age" },
        accessor: () => undefined,
        valuesProvider: () => [],
        type: "nominal",
    };
}

describe("getActionInfo", () => {
    it("returns info for known sample actions", () => {
        const action = {
            type: `${SAMPLE_SLICE_NAME}/setSamples`,
            payload: { samples: [] },
        };

        const info = getActionInfo(
            /** @type {any} */ (action),
            () => undefined
        );

        expect(info.title).toBe("Set samples");
        expect(info.icon).toBe(faCheck);
    });

    it("maps attribute actions to provenance titles", () => {
        const action = {
            type: `${SAMPLE_SLICE_NAME}/sortBy`,
            payload: { attribute: "age" },
        };

        const info = getActionInfo(action, () => makeAttributeInfo());

        expect(info.title).toBe("Sort by");
        expect(info.provenanceTitle).toBeDefined();
        expect(info.icon).toBe(faSortAmountDown);
    });

    it("describes source metadata import actions", () => {
        const action = {
            type: `${SAMPLE_SLICE_NAME}/addMetadataFromSource`,
            payload: {
                sourceId: "rna_expression",
                columnIds: ["TP53", "MYC"],
            },
        };

        const info = getActionInfo(
            /** @type {any} */ (action),
            () => undefined
        );
        const provenanceTitle = templateResultToString(info.provenanceTitle);

        expect(info.title).toBe("Import metadata from source");
        expect(provenanceTitle).toContain("TP53");
        expect(provenanceTitle).toContain("MYC");
        expect(provenanceTitle).toContain("from rna_expression source");
        expect(info.icon).toBe(faTable);
    });

    it("uses count-based wording for larger source metadata imports", () => {
        const action = {
            type: `${SAMPLE_SLICE_NAME}/addMetadataFromSource`,
            payload: {
                sourceId: "rna_expression",
                columnIds: ["TP53", "MYC", "EGFR", "KRAS"],
            },
        };

        const info = getActionInfo(action, () => undefined);
        const provenanceTitle = templateResultToString(info.provenanceTitle);

        expect(provenanceTitle).toContain("4 attributes");
        expect(provenanceTitle).toContain("from rna_expression source");
    });

    it("keeps selection-source wording in sort provenance titles", () => {
        const action = {
            type: `${SAMPLE_SLICE_NAME}/sortBy`,
            payload: {
                attribute: {
                    type: "VALUE_AT_LOCUS",
                    specifier: {
                        view: "track",
                        field: "value",
                        aggregation: { op: "count" },
                        interval: {
                            type: "selection",
                            selector: { scope: [], param: "brush" },
                        },
                    },
                },
            },
        };

        const info = getActionInfo(action, () => ({
            ...makeAttributeInfo(),
            name: "count(value)",
            title: html`count(value) in selection <strong>brush</strong>`,
            emphasizedName: "count(value)",
        }));

        const provenanceTitle = templateResultToString(info.provenanceTitle);
        expect(provenanceTitle).toContain("selection brush");
        expect(provenanceTitle).not.toContain("chr");
    });

    it("returns undefined for non-sample actions", () => {
        const info = getActionInfo(
            { type: "other/action", payload: {} },
            () => undefined
        );

        expect(info).toBeUndefined();
    });

    it("falls back to a generic info entry for unknown actions", () => {
        const action = {
            type: `${SAMPLE_SLICE_NAME}/unknownAction`,
            payload: { value: 1 },
        };

        const info = getActionInfo(action, () => undefined);

        expect(info.icon).toBe(faCircle);
        expect(info.title).toContain("unknownAction");
    });

    it("handles unknown actions with cyclic payloads", () => {
        /** @type {{self?: any}} */
        const cyclicPayload = {};
        cyclicPayload.self = cyclicPayload;

        const action = {
            type: `${SAMPLE_SLICE_NAME}/unknownAction`,
            payload: cyclicPayload,
        };

        const info = getActionInfo(action, () => undefined);

        expect(info.icon).toBe(faCircle);
        expect(info.title).toBe("unknownAction");
    });

    it("handles sample actions without payload", () => {
        const action = {
            type: `${SAMPLE_SLICE_NAME}/__baseline__`,
        };

        const info = getActionInfo(
            /** @type {any} */ (action),
            () => undefined
        );

        expect(info.icon).toBe(faCircle);
        expect(info.title).toContain("__baseline__");
    });
});
