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

    it("describes category retention by another attribute", () => {
        const action = {
            type: `${SAMPLE_SLICE_NAME}/retainCategoriesByAttribute`,
            payload: {
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "patient",
                },
                condition: {
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "TP53_mutation_count",
                    },
                    operator: "gt",
                    operand: 0,
                },
            },
        };

        const info = getActionInfo(action, (attribute) => ({
            ...makeAttributeInfo(),
            name: /** @type {string} */ (attribute.specifier),
            title: /** @type {string} */ (attribute.specifier),
            emphasizedName: /** @type {string} */ (attribute.specifier),
        }));

        const provenanceTitle = templateResultToString(info.provenanceTitle);
        expect(provenanceTitle).toContain("patient");
        expect(provenanceTitle).toContain("TP53_mutation_count");
        expect(provenanceTitle).toContain(">");
        expect(provenanceTitle).toContain("0");
    });

    it("uses short titles for menu labels and full titles for provenance", () => {
        const action = {
            type: `${SAMPLE_SLICE_NAME}/filterByNominal`,
            payload: {
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "Annotations/CellLineDistributor",
                },
                values: ["Sebastian"],
            },
        };

        const info = getActionInfo(action, () => ({
            ...makeAttributeInfo(),
            name: "Annotations/CellLineDistributor",
            title: "Annotations/CellLineDistributor",
            shortTitle: "CellLineDistributor",
            emphasizedName: "Annotations/CellLineDistributor",
        }));
        const menuTitle = templateResultToString(info.title);
        const provenanceTitle = templateResultToString(info.provenanceTitle);

        expect(menuTitle).toContain("CellLineDistributor");
        expect(menuTitle).not.toContain("Annotations/");
        expect(provenanceTitle).toContain("Annotations/CellLineDistributor");
    });

    it("uses short titles for retain-categories menu labels", () => {
        const action = {
            type: `${SAMPLE_SLICE_NAME}/retainCategoriesByAttribute`,
            payload: {
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "Annotations/CellLineDistributor",
                },
                condition: {
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "Annotations/PublicationStatus",
                    },
                    operator: "in",
                    values: ["Published"],
                },
            },
        };

        const info = getActionInfo(action, (attribute) => ({
            ...makeAttributeInfo(),
            name: /** @type {string} */ (attribute.specifier),
            title: /** @type {string} */ (attribute.specifier),
            shortTitle:
                attribute.specifier === "Annotations/CellLineDistributor"
                    ? "CellLineDistributor"
                    : "PublicationStatus",
            emphasizedName: /** @type {string} */ (attribute.specifier),
        }));
        const menuTitle = templateResultToString(info.title);
        const provenanceTitle = templateResultToString(info.provenanceTitle);

        expect(menuTitle).toContain("CellLineDistributor");
        expect(menuTitle).toContain("PublicationStatus");
        expect(menuTitle).not.toContain("Annotations/");
        expect(provenanceTitle).toContain("Annotations/CellLineDistributor");
        expect(provenanceTitle).toContain("Annotations/PublicationStatus");
    });

    it("describes category retention by categorical condition", () => {
        const action = {
            type: `${SAMPLE_SLICE_NAME}/retainCategoriesByAttribute`,
            payload: {
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "patient",
                },
                condition: {
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "diagnosis",
                    },
                    operator: "in",
                    values: ["AML", "MDS"],
                },
            },
        };

        const info = getActionInfo(action, (attribute) => ({
            ...makeAttributeInfo(),
            name: /** @type {string} */ (attribute.specifier),
            title: /** @type {string} */ (attribute.specifier),
            emphasizedName: /** @type {string} */ (attribute.specifier),
        }));

        const provenanceTitle = templateResultToString(info.provenanceTitle);
        expect(provenanceTitle).toContain("patient");
        expect(provenanceTitle).toContain("diagnosis");
        expect(provenanceTitle).toContain("AML");
        expect(provenanceTitle).toContain("MDS");
    });

    it("describes category retention requiring all categorical condition values", () => {
        const action = {
            type: `${SAMPLE_SLICE_NAME}/retainCategoriesByAttribute`,
            payload: {
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "patient",
                },
                condition: {
                    attribute: {
                        type: "SAMPLE_ATTRIBUTE",
                        specifier: "diagnosis",
                    },
                    operator: "in",
                    values: ["AML", "MDS"],
                    required: "all",
                },
            },
        };

        const info = getActionInfo(action, (attribute) => ({
            ...makeAttributeInfo(),
            name: /** @type {string} */ (attribute.specifier),
            title: /** @type {string} */ (attribute.specifier),
            emphasizedName: /** @type {string} */ (attribute.specifier),
        }));

        const provenanceTitle = templateResultToString(info.provenanceTitle);
        expect(provenanceTitle).toContain("patient");
        expect(provenanceTitle).toContain("diagnosis");
        expect(provenanceTitle).toContain("all");
        expect(provenanceTitle).toContain("AML");
        expect(provenanceTitle).toContain("MDS");
    });

    it("includes explicitly provided threshold group titles in provenance titles", () => {
        const action = {
            type: `${SAMPLE_SLICE_NAME}/groupByThresholds`,
            payload: {
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "age",
                },
                thresholds: [{ operator: "lt", operand: 2 }],
                groupTitles: ["Low", "High"],
            },
        };

        const info = getActionInfo(action, () => makeAttributeInfo());
        const provenanceTitle = templateResultToString(info.provenanceTitle);

        expect(provenanceTitle).toContain("Low");
        expect(provenanceTitle).toContain("High");
    });

    it("omits threshold group titles from provenance titles when none are provided", () => {
        const action = {
            type: `${SAMPLE_SLICE_NAME}/groupByThresholds`,
            payload: {
                attribute: {
                    type: "SAMPLE_ATTRIBUTE",
                    specifier: "age",
                },
                thresholds: [{ operator: "lt", operand: 2 }],
            },
        };

        const info = getActionInfo(action, () => makeAttributeInfo());
        const provenanceTitle = templateResultToString(info.provenanceTitle);

        expect(provenanceTitle).not.toContain(" as ");
    });

    it("describes ranked group retention", () => {
        const action = {
            type: `${SAMPLE_SLICE_NAME}/retainGroupsByRank`,
            payload: {
                level: 1,
                measure: "size",
                limit: 5,
                order: "descending",
            },
        };

        const info = getActionInfo(action, () => undefined);
        const title = templateResultToString(info.title);
        const provenanceTitle = templateResultToString(info.provenanceTitle);

        expect(title).toContain("Retain top/bottom-k groups by size");
        expect(provenanceTitle).toContain("5 largest");
        expect(provenanceTitle).toContain("level 1");
    });

    it("describes group retention by size threshold", () => {
        const action = {
            type: `${SAMPLE_SLICE_NAME}/retainGroupsBySize`,
            payload: {
                level: 1,
                measure: "size",
                operator: "gte",
                operand: 10,
            },
        };

        const info = getActionInfo(action, () => undefined);
        const title = templateResultToString(info.title);
        const provenanceTitle = templateResultToString(info.provenanceTitle);

        expect(title).toContain("Retain groups by size threshold");
        expect(provenanceTitle).toContain("level 1");
        expect(provenanceTitle).toContain("\u2265");
        expect(provenanceTitle).toContain("10");
    });

    it("describes ungrouping", () => {
        const action = {
            type: `${SAMPLE_SLICE_NAME}/ungroup`,
            payload: {
                level: 2,
            },
        };

        const info = getActionInfo(action, () => undefined);
        const title = templateResultToString(info.title);
        const provenanceTitle = templateResultToString(info.provenanceTitle);

        expect(title).toContain("Ungroup");
        expect(provenanceTitle).toContain("level 2");
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
