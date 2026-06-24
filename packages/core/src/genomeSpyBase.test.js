import { describe, expect, test, vi } from "vitest";

import GenomeSpy from "./genomeSpyBase.js";

describe("GenomeSpy layout reflow", () => {
    test("requestLayoutReflow recomputes layout and schedules rendering", () => {
        const computeLayout = vi.fn();
        const requestRender = vi.fn();

        /** @type {any} */ (GenomeSpy.prototype.requestLayoutReflow).call({
            computeLayout,
            animator: {
                requestRender,
            },
        });

        expect(computeLayout).toHaveBeenCalledTimes(1);
        expect(requestRender).toHaveBeenCalledTimes(1);
    });
});
