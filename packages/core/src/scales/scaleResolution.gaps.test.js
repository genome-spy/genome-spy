import { expect, onTestFinished, test, vi } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";

test("reactive gaps preserve domains and publish settled occurrence-sized navigation", async () => {
    const { view } = await createHeadlessEngine({
        params: [
            { name: "cuts", value: [10, 20] },
            { name: "width", value: 6 },
        ],
        data: { values: [{ x: 0 }, { x: 19 }] },
        mark: "point",
        scales: {
            x: {
                type: "index",
                domain: [9.9, 19.1],
                zoom: { extent: "unbounded" },
                gapPositions: { expr: "cuts" },
                gapWidth: { expr: "width" },
            },
        },
        encoding: { x: { field: "x", type: "index", axis: null } },
    });
    onTestFinished(() => view.disposeSubtree());
    const resolution = view.getScaleResolution("x");
    let scale = /** @type {import("../genome/scaleIndex.js").ScaleIndex} */ (
        resolution.getScale()
    );
    scale.axisLength(100);
    const domain = resolution.getDomain();
    const requestRender = vi.spyOn(view.context.animator, "requestRender");
    for (const [name, value] of [
        ["width", 12],
        ["width", 0],
        ["cuts", []],
        ["cuts", [10, 20]],
        ["width", 6],
    ]) {
        requestRender.mockClear();
        view.paramRuntime.setValue(/** @type {string} */ (name), value);
        view.paramRuntime.flushNow();
        expect(requestRender).toHaveBeenCalled();
        expect(resolution.getDomain()).toEqual(domain);
    }
    expect(scale(10) - scale.gapMapping().position(10, 0, true)).toBeCloseTo(
        0.06
    );

    const changed = vi.fn(() => scale.gapDomain());
    onTestFinished(resolution.observeMapping(changed));
    // Both edges stay at cuts while their fractional ranks change.
    resolution.zoom(0.95, 0.5, 0, 100);
    const ranks = scale.gapDomain();
    changed.mockClear();
    resolution.zoom(0.9 / 0.95, 0.5, 0, 100);
    expect(scale.domain()).toEqual([10, 20]);
    expect(scale.gapDomain()).not.toEqual(ranks);
    expect(changed).toHaveBeenCalledOnce();

    const currentRanks = scale.gapDomain();
    resolution.attachViewLevelScaleProps(view, {
        ...view.spec.scales.x,
        paddingInner: 0.1,
    });
    scale = /** @type {typeof scale} */ (resolution.getScale());
    scale.axisLength(100);
    expect(scale.gapDomain()).toEqual(currentRanks);

    for (const [name, value] of Object.entries({ width: 12, cuts: [] })) {
        resolution.zoom(1, 0.5, 0, 100);
        const domain = scale.domain();
        changed.mockClear();
        view.paramRuntime.setValue(name, value);
        view.paramRuntime.flushNow();
        expect(scale.domain()).toEqual(domain);
        expect(changed).toHaveBeenCalledOnce();
        expect(changed).toHaveLastReturnedWith(undefined);
    }

    // The input is read once; scale publication and navigation reuse its cuts.
    const cuts = [10, 5, 10];
    const iterate = vi.spyOn(cuts, Symbol.iterator);
    onTestFinished(() => iterate.mockRestore());
    view.paramRuntime.setValue("cuts", cuts);
    view.paramRuntime.flushNow();
    expect(scale.gapPositions()).toEqual([5, 10]);
    const coordinate = scale.gapMapping(200).invertPoint(0.25).value;
    resolution.zoom(0.5, 0.25, 0, 200);
    expect(scale.gapMapping(200).invertPoint(0.25).value).toBeCloseTo(
        coordinate
    );
    expect(iterate).toHaveBeenCalledOnce();
});

test.each([
    { gapPositions: [], gapWidth: { expr: "missing" } },
    { gapPositions: { expr: "missing" }, gapWidth: 0 },
])(
    "constant-disabled gaps do not evaluate the other property: %j",
    async (scale) => {
        const { view } = await createHeadlessEngine({
            data: { values: [{ x: 0 }] },
            mark: "point",
            encoding: { x: { field: "x", type: "index", scale } },
        });
        onTestFinished(() => view.disposeSubtree());
        expect(
            /** @type {import("../genome/scaleIndex.js").ScaleIndex} */ (
                view.getScaleResolution("x").getScale()
            ).gapMapping()
        ).toBeUndefined();
    }
);
