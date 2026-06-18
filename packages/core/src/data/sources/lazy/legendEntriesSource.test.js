import { expect, test } from "vitest";

import { markViewAsChrome } from "../../../view/viewSelectors.js";
import { findLegendScaleResolution } from "./legendEntriesSource.js";

test("findLegendScaleResolution skips generated chrome parents", () => {
    const plottedScaleResolution = { name: "plotColor" };
    const legendScaleResolution = { name: "legendColor" };
    const plottedView = /** @type {any} */ ({
        dataParent: null,
        getScaleResolution: () => plottedScaleResolution,
    });
    const legendView = /** @type {any} */ ({
        dataParent: plottedView,
        getScaleResolution: () => legendScaleResolution,
    });
    const labelView = /** @type {any} */ ({
        dataParent: legendView,
        getScaleResolution: () => legendScaleResolution,
    });

    markViewAsChrome(legendView, { skipSubtree: true });

    expect(findLegendScaleResolution(labelView, "color")).toBe(
        plottedScaleResolution
    );
});
