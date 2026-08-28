import { describe, expect, test } from "vitest";

import UnitView from "../../../view/unitView.js";
import { create } from "../../../view/testUtils.js";
import WebGLRectMark from "./rect.js";

describe("WebGL Rect opacity", () => {
    test("disables blending for a plain opaque rectangle", async () => {
        const { delegate } = await createDelegate();

        expect(delegate.opaque).toBe(true);
    });

    test.each([
        ["stroke", { stroke: "black" }],
        ["rounded corners", { cornerRadius: 2 }],
        ["shadow", { shadowOpacity: 0.5 }],
        ["fill opacity", { fillOpacity: 0.5 }],
        ["minimum opacity", { minOpacity: 0.5 }],
        ["dynamic corners", { cornerRadius: { expr: "radius" } }],
    ])("keeps blending for %s", async (_name, properties) => {
        const { delegate } = await createDelegate(properties);

        expect(delegate.opaque).toBe(false);
    });

    test("keeps blending for an effectively translucent view", async () => {
        const { delegate, view } = await createDelegate();
        view.getEffectiveOpacity = () => 0.5;

        expect(delegate.opaque).toBe(false);
    });
});

/**
 * @param {Partial<import("../../../spec/mark.js").RectProps>} [properties]
 */
async function createDelegate(properties = {}) {
    const view = await create(
        { mark: { type: "rect", ...properties } },
        UnitView
    );
    return {
        view,
        delegate: new WebGLRectMark(view.mark, /** @type {any} */ ({})),
    };
}
