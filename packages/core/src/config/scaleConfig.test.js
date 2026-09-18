import { expect, test } from "vitest";

import { getConfiguredScaleDefaults } from "./scaleConfig.js";

test("keeps bidirectional arrows opt-in in the automatic direction range", () => {
    expect(
        getConfiguredScaleDefaults([{}], {
            channel: "direction",
            dataType: "nominal",
            isExplicitDomain: false,
        }).range
    ).toEqual(["forward", "reverse"]);
});
