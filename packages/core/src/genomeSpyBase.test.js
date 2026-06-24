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
