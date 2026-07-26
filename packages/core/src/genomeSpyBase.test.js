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
    test("updates an unambiguous named source", () => {
        const updateDynamicData = vi.fn();
        const requestRender = vi.fn();

        /** @type {any} */ (GenomeSpy.prototype.updateNamedData).call(
            {
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
            },
            "results",
            [{ value: 1 }]
        );

        expect(updateDynamicData).toHaveBeenCalledWith([{ value: 1 }]);
        expect(requestRender).toHaveBeenCalledOnce();
    });
});
