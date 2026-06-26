// @ts-check
import { describe, expect, it } from "vitest";
import generateAttributeContextMenu from "./attributeContextMenu.js";

/**
 * @returns {import("./types.js").AttributeInfo}
 */
function createAttributeInfo() {
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
        type: "quantitative",
    };
}

/**
 * @returns {{ sampleView: any, dispatchedActions: any[] }}
 */
function createSampleViewStub() {
    const dispatchedActions = [];

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
                    attributeNames: [],
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
        },
    };
}

describe("generateAttributeContextMenu", () => {
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
});
