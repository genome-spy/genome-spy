// @ts-check
import { describe, expect, it, vi } from "vitest";
import { createIntervalSelection } from "@genome-spy/core/selection/selection.js";

const { resolveParamSelectorMock } = vi.hoisted(() => ({
    resolveParamSelectorMock: vi.fn(),
}));

vi.mock("@genome-spy/core/view/viewSelectors.js", () => ({
    resolveParamSelector: resolveParamSelectorMock,
}));

import { resolveIntervalReference } from "./intervalReferenceResolver.js";

describe("resolveIntervalReference", () => {
    it("returns literal intervals as-is", () => {
        expect(resolveIntervalReference(undefined, [1, 2])).toEqual([1, 2]);
    });

    it("resolves selection-backed intervals from param state", () => {
        const selection = createIntervalSelection(["x"]);
        selection.intervals.x = [10, 20];

        resolveParamSelectorMock.mockReturnValue({
            view: {
                paramRuntime: {
                    getValue: () => selection,
                },
            },
            param: { name: "brush" },
        });

        const resolved = resolveIntervalReference(/** @type {any} */ ({}), {
            type: "selection",
            selector: { scope: [], param: "brush" },
        });

        expect(resolved).toEqual([10, 20]);
    });

    it("throws when the selector cannot be resolved", () => {
        resolveParamSelectorMock.mockReturnValue(undefined);

        expect(() =>
            resolveIntervalReference(/** @type {any} */ ({}), {
                type: "selection",
                selector: { scope: [], param: "brush" },
            })
        ).toThrow('Cannot resolve interval source selection "brush"');
    });

    it("throws when selection-backed interval is empty", () => {
        const selection = createIntervalSelection(["x"]);

        resolveParamSelectorMock.mockReturnValue({
            view: {
                paramRuntime: {
                    getValue: () => selection,
                },
            },
            param: { name: "brush" },
        });

        expect(() =>
            resolveIntervalReference(/** @type {any} */ ({}), {
                type: "selection",
                selector: { scope: [], param: "brush" },
            })
        ).toThrow('Interval source selection "brush" is empty');
    });
});
