// @ts-check
import { describe, expect, it } from "vitest";
import generateAttributeContextMenu from "./attributeContextMenu.js";
import templateResultToString from "../utils/templateResultToString.js";

/**
 * @param {import("@genome-spy/core/spec/channel.js").Type} type
 * @returns {import("./types.js").AttributeInfo}
 */
function createAttributeInfo(type = "quantitative") {
    return {
        name: "age",
        title: "Age",
        emphasizedName: "Age",
        attribute: {
            type: "SAMPLE_ATTRIBUTE",
            specifier: "age",
        },
        accessor: () => undefined,
        valuesProvider: () => [],
        type,
    };
}

/**
 * @returns {{ sampleView: any, dispatchedActions: any[] }}
 */
function createSampleViewStub() {
    const dispatchedActions = [];
    const conditionAttributeInfo = {
        name: "diagnosis",
        title: "Diagnosis",
        emphasizedName: "Diagnosis",
        attribute: {
            type: "SAMPLE_ATTRIBUTE",
            specifier: "diagnosis",
        },
        accessor: () => undefined,
        valuesProvider: () => [],
        type: "nominal",
    };

    return {
        dispatchedActions,
        sampleView: {
            sampleHierarchy: {
                sampleData: {
                    ids: [],
                    entities: {},
                },
                sampleMetadata: {
                    entities: {},
                    attributeNames: ["age", "diagnosis"],
                },
                groupMetadata: [],
                rootGroup: {
                    name: "ROOT",
                    title: "Root",
                    samples: [],
                },
            },
            provenance: {
                getActionInfo: (action) => ({
                    title:
                        action.payload.order === "ascending"
                            ? "Ascending"
                            : "Descending",
                }),
            },
            dispatchAttributeAction: (action) => {
                dispatchedActions.push(action);
            },
            compositeAttributeInfoSource: {
                getAttributeInfo: () => conditionAttributeInfo,
            },
            leafSamples: [],
        },
    };
}

describe("generateAttributeContextMenu", () => {
    /**
     * @param {import("../utils/ui/contextMenu.js").MenuItem[]} items
     * @param {string} label
     * @returns {import("../utils/ui/contextMenu.js").MenuItem}
     */
    function findItem(items, label) {
        const item = items.find(
            (candidate) =>
                templateResultToString(candidate.label).trim() === label
        );
        if (!item) {
            throw new Error("No menu item found: " + label);
        }
        return item;
    }

    /**
     * @param {import("../utils/ui/contextMenu.js").MenuItem} item
     * @returns {import("../utils/ui/contextMenu.js").MenuItem[]}
     */
    function getSubmenu(item) {
        if (!Array.isArray(item.submenu)) {
            throw new Error("Expected static submenu.");
        }
        return item.submenu;
    }

    /**
     * @param {import("../utils/ui/contextMenu.js").MenuItem[]} items
     * @returns {string[]}
     */
    function getLabels(items) {
        return items.map((item) => templateResultToString(item.label).trim());
    }

    it("offers ascending and descending sort actions in a submenu", () => {
        const attributeInfo = createAttributeInfo();
        const { sampleView, dispatchedActions } = createSampleViewStub();

        const items = generateAttributeContextMenu(
            "",
            attributeInfo,
            42,
            sampleView
        );

        expect(items[0].label).toBe("Sort");
        expect(templateResultToString(items[1].label).trim()).toBe(
            "Filter by Age"
        );
        expect(items[0].submenu).toBeDefined();
        const sortItems =
            /** @type {import("../utils/ui/contextMenu.js").MenuItem[]} */ (
                items[0].submenu
            );

        expect(sortItems[0].label).toBe("Ascending");
        expect(sortItems[1].label).toBe("Descending");

        sortItems[0].callback();
        sortItems[1].callback();

        expect(dispatchedActions.map((action) => action.payload.order)).toEqual(
            ["ascending", "descending"]
        );
    });

    it("groups categorical filter shortcuts in a submenu", () => {
        const attributeInfo = createAttributeInfo("nominal");
        const { sampleView, dispatchedActions } = createSampleViewStub();

        const items = generateAttributeContextMenu(
            "",
            attributeInfo,
            "AML",
            sampleView
        );
        const filterItems = getSubmenu(findItem(items, "Filter by Age"));

        expect(getLabels(filterItems)).toEqual([
            "Retain AML",
            "Remove AML",
            "Remove missing values",
            "Retain values based on another attribute",
            "Advanced filter...",
        ]);
        expect(getLabels(getSubmenu(filterItems[3]))[0]).toBe(
            "Select Age using..."
        );

        filterItems[0].callback();
        filterItems[1].callback();
        filterItems[2].callback();

        expect(
            dispatchedActions.map((action) => ({
                type: action.type,
                payload: action.payload,
            }))
        ).toEqual([
            {
                type: "sampleView/filterByNominal",
                payload: {
                    attribute: attributeInfo.attribute,
                    values: ["AML"],
                },
            },
            {
                type: "sampleView/filterByNominal",
                payload: {
                    attribute: attributeInfo.attribute,
                    remove: true,
                    values: ["AML"],
                },
            },
            {
                type: "sampleView/removeUndefined",
                payload: {
                    attribute: attributeInfo.attribute,
                },
            },
        ]);
    });

    it("groups quantitative comparison shortcuts in a submenu", () => {
        const attributeInfo = createAttributeInfo("quantitative");
        const { sampleView, dispatchedActions } = createSampleViewStub();

        const items = generateAttributeContextMenu(
            "",
            attributeInfo,
            42,
            sampleView
        );
        const filterItems = getSubmenu(findItem(items, "Filter by Age"));

        expect(getLabels(filterItems)).toEqual([
            "< 42",
            "\u2264 42",
            "= 42",
            "\u2265 42",
            "> 42",
            "Remove missing values",
            "Retain values based on another attribute",
            "Advanced filter...",
        ]);

        for (const item of filterItems.slice(0, 6)) {
            item.callback();
        }

        expect(
            dispatchedActions.map((action) => ({
                type: action.type,
                payload: action.payload,
            }))
        ).toEqual([
            {
                type: "sampleView/filterByQuantitative",
                payload: {
                    attribute: attributeInfo.attribute,
                    operator: "lt",
                    operand: 42,
                },
            },
            {
                type: "sampleView/filterByQuantitative",
                payload: {
                    attribute: attributeInfo.attribute,
                    operator: "lte",
                    operand: 42,
                },
            },
            {
                type: "sampleView/filterByQuantitative",
                payload: {
                    attribute: attributeInfo.attribute,
                    operator: "eq",
                    operand: 42,
                },
            },
            {
                type: "sampleView/filterByQuantitative",
                payload: {
                    attribute: attributeInfo.attribute,
                    operator: "gte",
                    operand: 42,
                },
            },
            {
                type: "sampleView/filterByQuantitative",
                payload: {
                    attribute: attributeInfo.attribute,
                    operator: "gt",
                    operand: 42,
                },
            },
            {
                type: "sampleView/removeUndefined",
                payload: {
                    attribute: attributeInfo.attribute,
                },
            },
        ]);
    });
});
