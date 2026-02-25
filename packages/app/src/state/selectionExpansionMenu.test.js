// @ts-check
import { describe, expect, test, vi } from "vitest";
import {
    createSelectionExpansionMenuItem,
    createSelectionExpansionSubmenu,
} from "./selectionExpansionMenu.js";
import { paramProvenanceSlice } from "./paramProvenanceSlice.js";

/**
 * @param {{
 *   encoding: any,
 *   params: [string, any][]
 * }} config
 */
function createMockUnitView(config) {
    const { encoding, params } = config;

    /** @type {any} */
    const view = {
        explicitName: "variants",
        paramRuntime: {
            paramConfigs: new Map(params),
        },
        getEncoding: () => encoding,
    };

    return view;
}

describe("selectionExpansionMenu", () => {
    test("builds expansion menu and dispatches expansion intent from callbacks", () => {
        const hoveredView = createMockUnitView({
            encoding: {
                key: [{ field: "id" }],
                sample: { field: "sample" },
                color: { field: "Func", type: "nominal" },
            },
            params: [
                [
                    "variantClick",
                    {
                        select: { type: "point" },
                    },
                ],
            ],
        });

        /** @type {import("./selectionExpansionContext.js").SelectionExpansionContext} */
        const context = {
            hoveredView,
            hoveredDatum: {
                id: "v1",
                sample: "S1",
                Func: "genic_other",
            },
            selector: { scope: [], param: "variantClick" },
            originViewSelector: { scope: [], view: "variants" },
            originKeyFields: ["id"],
            originKeyTuple: ["v1"],
            defaultPartitionBy: ["sample"],
            defaultScopeLabel: "this sample",
        };

        const dispatchAction = vi.fn();
        const item = createSelectionExpansionMenuItem(context, dispatchAction);
        expect(item.label).toBe("Expand point selection");
        expect(typeof item.submenu).toBe("function");

        const submenu = /** @type {() => any[]} */ (item.submenu)();
        expect(submenu[0]).toEqual({
            type: "header",
            label: "Choose a field",
        });

        const fieldItem = submenu.find((entry) => entry.label === "Func");
        expect(fieldItem).toBeDefined();

        const operations = /** @type {() => any[]} */ (fieldItem.submenu)();
        const matchThisSample = operations.find(
            (entry) => entry.label === "Match in this sample"
        );
        expect(matchThisSample).toBeDefined();

        matchThisSample.callback();
        expect(dispatchAction).toHaveBeenCalledTimes(1);

        const dispatchedAction = dispatchAction.mock.calls[0][0];
        expect(dispatchedAction.type).toBe(
            paramProvenanceSlice.actions.expandPointSelection.type
        );
        expect(dispatchedAction.payload.selector).toEqual({
            scope: [],
            param: "variantClick",
        });
    });

    test("returns a placeholder when no field can be expanded", () => {
        const hoveredView = createMockUnitView({
            encoding: {
                key: [{ field: "id" }],
            },
            params: [
                [
                    "variantClick",
                    {
                        select: { type: "point" },
                    },
                ],
            ],
        });

        /** @type {import("./selectionExpansionContext.js").SelectionExpansionContext} */
        const context = {
            hoveredView,
            hoveredDatum: {
                id: "v1",
            },
            selector: { scope: [], param: "variantClick" },
            originViewSelector: { scope: [], view: "variants" },
            originKeyFields: ["id"],
            originKeyTuple: ["v1"],
            defaultPartitionBy: undefined,
            defaultScopeLabel: "this scope",
        };

        const submenu = createSelectionExpansionSubmenu(
            context,
            () => undefined
        );
        expect(submenu).toEqual([{ label: "No expansion fields available." }]);
    });
});
