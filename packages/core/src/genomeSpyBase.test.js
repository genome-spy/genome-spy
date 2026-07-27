import { describe, expect, test, vi } from "vitest";

import GenomeSpy from "./genomeSpyBase.js";

describe("GenomeSpy layout reflow", () => {
    test("requestLayoutReflow schedules layout as a render transition", () => {
        const layoutReflowTransition = vi.fn();
        const requestTransition = vi.fn();

        /** @type {any} */ (GenomeSpy.prototype.requestLayoutReflow).call({
            _layoutReflowTransition: layoutReflowTransition,
            animator: {
                requestTransition,
            },
        });

        expect(layoutReflowTransition).not.toHaveBeenCalled();
        expect(requestTransition).toHaveBeenCalledOnce();
        expect(requestTransition).toHaveBeenCalledWith(layoutReflowTransition);
    });
});

describe("GenomeSpy legacy named data updates", () => {
    test("warns when registering a named data provider", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const target = {
            namedDataProviders: /** @type {((name: string) => any[])[]} */ ([]),
        };
        const provider = () => /** @type {any[]} */ ([]);

        /** @type {any} */ (GenomeSpy.prototype.registerNamedDataProvider).call(
            target,
            provider
        );

        expect(warn).toHaveBeenCalledOnce();
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining("`namedDataProvider`")
        );
        warn.mockRestore();
    });

    test("updates an unambiguous named source", () => {
        const updateDynamicData = vi.fn();
        const requestRender = vi.fn();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const target = {
            viewRoot: {
                context: {
                    dataFlow: {
                        findNamedDataSource: () => ({
                            dataSource: { updateDynamicData },
                        }),
                    },
                },
            },
            animator: { requestRender },
        };

        /** @type {any} */ (GenomeSpy.prototype.updateNamedData).call(
            target,
            "results",
            [{ value: 1 }]
        );

        expect(updateDynamicData).toHaveBeenCalledWith([{ value: 1 }]);
        expect(requestRender).toHaveBeenCalledOnce();
        expect(warn).toHaveBeenCalledOnce();
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining("`updateNamedData()`")
        );
        warn.mockRestore();
    });
});
