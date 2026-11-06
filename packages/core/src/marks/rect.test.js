import { expect, test } from "vitest";
import UnitView from "../view/unitView.js";
import { createAndInitialize } from "../view/testUtils.js";

test("rectangle common opacity owns its scale independently of paint opacity", async () => {
    const datum = { alpha: 5 };
    const view = await createAndInitialize(
        {
            data: { values: [datum] },
            mark: { type: "rect", fillOpacity: 0.6, stroke: "blue" },
            encoding: {
                opacity: {
                    field: "alpha",
                    type: "quantitative",
                    scale: { domain: [0, 10], range: [0.2, 0.8] },
                },
            },
        },
        UnitView
    );
    const { encoders } = view.mark;
    expect(encoders.opacity.scale).toBe(
        view.getScaleResolution("opacity").getScale()
    );
    expect(encoders.opacity(datum)).toBeCloseTo(0.5);
    expect(encoders.fillOpacity(datum)).toBe(0.6);
    expect(encoders.strokeOpacity(datum)).toBe(1);
});

test("unfilled rectangles keep their fill hidden while common opacity stays independent", async () => {
    const view = await createAndInitialize(
        {
            data: { values: [{}] },
            mark: { type: "rect", filled: false, opacity: 0.4 },
        },
        UnitView
    );
    expect(view.mark.encoders.fillOpacity({})).toBe(0);
    expect(view.mark.encoders.strokeOpacity({})).toBe(1);
    expect(view.mark.encoders.opacity({})).toBe(0.4);
});

test("filled rectangles keep missing paint opacities independent of common opacity", async () => {
    const view = await createAndInitialize(
        {
            data: { values: [{}] },
            mark: { type: "rect", opacity: 0.4, stroke: "blue" },
        },
        UnitView
    );
    expect(view.mark.encoders.fillOpacity({})).toBe(1);
    expect(view.mark.encoders.strokeOpacity({})).toBe(1);
    expect(view.mark.encoders.opacity({})).toBe(0.4);
});
