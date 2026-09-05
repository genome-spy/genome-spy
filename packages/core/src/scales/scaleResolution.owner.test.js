import { readFileSync } from "node:fs";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import Animator from "../utils/animator.js";
import { getRequiredScaleResolution } from "./scaleResolutionTestUtils.js";

/** @type {(() => void)[]} */
let disposers = [];

afterEach(() => {
    for (const dispose of disposers.reverse()) {
        dispose();
    }
    disposers = [];
    vi.restoreAllMocks();
});

/** @param {import("../spec/root.js").RootSpec} spec */
async function createHarness(spec) {
    const animator = new Animator(() => undefined);
    // Keep the real transition implementation, advancing queued frames explicitly.
    const requestRender = vi
        .spyOn(animator, "requestRender")
        .mockImplementation(() => undefined);
    const { view } = await createHeadlessEngine(spec, {
        contextOptions: { animator },
    });
    disposers.push(() => {
        view.disposeSubtree();
        animator.finalize();
    });
    return { view, animator, requestRender };
}

/**
 * @param {Animator} animator
 * @param {number} timestamp
 */
function advanceFrame(animator, timestamp) {
    animator.transitions.splice(0).forEach((callback) => callback(timestamp));
}

describe("scale domain owner integration", () => {
    test.each(["direct", "reset", "supersede"])(
        "%s navigation invalidates queued frames and resolves the old promise",
        async (operation) => {
            const { view, animator } = await createHarness({
                data: { values: [{ x: 0 }] },
                scales: { x: { domain: [0, 10], zoom: true } },
                mark: "point",
                encoding: { x: { field: "x", type: "quantitative" } },
            });
            const x = getRequiredScaleResolution(view, "x");
            const first = x.zoomTo([2, 4], 500);
            let second = Promise.resolve();
            if (operation === "direct") {
                x.scale.domain([0, 10]);
            } else if (operation === "reset") {
                expect(x.resetZoom()).toBe(false);
            } else {
                second = x.zoomTo([6, 8], 500);
            }
            advanceFrame(animator, performance.now() + 1000);
            await Promise.all([first, second]);
            expect(x.getDomain()).toEqual(
                operation === "supersede" ? [6, 8] : [0, 10]
            );
            expect(x.scale.domain()).toEqual(x.getDomain());
        }
    );

    test("a range-only recreation preserves navigation while an authored domain edit replaces it", async () => {
        const { view } = await createHarness({
            data: { values: [{ x: 0 }] },
            scales: { size: { domain: [0, 10], zoom: true } },
            mark: "point",
            encoding: { size: { field: "x", type: "quantitative" } },
        });
        const x = getRequiredScaleResolution(view, "size");
        await x.zoomTo([2, 4]);
        x.attachViewLevelScaleProps(view, {
            domain: [0, 10],
            zoom: true,
            range: [0, 2],
        });
        expect(x.getDomain()).toEqual([2, 4]);
        expect(x.scale.range()).toEqual([0, 2]);
        x.attachViewLevelScaleProps(view, {
            domain: [0, 20],
            zoom: true,
            range: [0, 2],
        });
        expect(x.getDomain()).toEqual([0, 20]);
    });

    test("disposing an active animation cannot commit its target or request another render", async () => {
        const { view, animator, requestRender } = await createHarness({
            data: { values: [{ x: 0 }, { x: 10 }] },
            mark: "point",
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { zoom: true },
                },
            },
        });
        const resolution = getRequiredScaleResolution(view, "x");
        const scale = resolution.scale;
        const navigation = resolution.zoomTo([2, 4], 500);
        advanceFrame(animator, performance.now() + 125);
        const displayed = resolution.getDomain();
        expect(displayed).not.toEqual([0, 10]);
        expect(displayed).not.toEqual([2, 4]);

        view.disposeSubtree();
        requestRender.mockClear();
        // Cancellation resolves the real transition promise when its queued frame runs.
        advanceFrame(animator, performance.now() + 1000);
        await navigation;

        expect(scale.domain()).toEqual(displayed);
        expect(resolution.getDomain()).toEqual(displayed);
        expect(requestRender).not.toHaveBeenCalled();
    });

    test("a ready-empty domain acquires its first effective span immediately, then animates updates", async () => {
        const { view, animator } = await createHarness({
            data: { values: [] },
            mark: "point",
            encoding: { y: { field: "score", type: "quantitative" } },
        });
        const resolution = getRequiredScaleResolution(view, "y");
        const source =
            /** @type {import("../data/sources/inlineSource.js").default} */ (
                view.flowHandle.dataSource
            );
        view.onBeforeRender();
        expect(resolution.getDomain()).toEqual([0, 0]);

        source.updateDynamicData([{ score: 8 }]);
        expect(resolution.getDomain()).toEqual([0, 8]);
        expect(animator.transitions).toHaveLength(0);

        source.updateDynamicData([{ score: 12 }]);
        expect(resolution.getDomain()).toEqual([0, 8]);
        advanceFrame(animator, performance.now() + 250);
        expect(resolution.getDomain()[1]).toBeGreaterThan(8);
        expect(resolution.getDomain()[1]).toBeLessThan(12);
        advanceFrame(animator, performance.now() + 1000);
        await Promise.resolve();
        expect(resolution.getDomain()).toEqual([0, 12]);
    });

    test("reentrant authored configuration keeps the latest domain, range, and properties together", async () => {
        const { view } = await createHarness({
            data: { values: [{ x: 0 }, { x: 10 }] },
            scales: { size: { domain: [0, 10], range: [0, 1] } },
            mark: "point",
            encoding: { size: { field: "x", type: "quantitative" } },
        });
        const resolution = getRequiredScaleResolution(view, "size");
        let replaced = false;
        resolution.addEventListener("domain", () => {
            if (!replaced) {
                replaced = true;
                resolution.attachViewLevelScaleProps(view, {
                    domain: [0, 30],
                    range: [0, 3],
                });
            }
        });

        resolution.attachViewLevelScaleProps(view, {
            domain: [0, 20],
            range: [0, 2],
        });

        expect(replaced).toBe(true);
        expect(resolution.getDomain()).toEqual([0, 30]);
        expect(resolution.scale.domain()).toEqual([0, 30]);
        expect(resolution.scale.props.range).toEqual([0, 3]);
        expect(resolution.scale.range()).toEqual([0, 3]);
    });

    test("an undefined outer selection is an external clear, not an owner echo", async () => {
        const spec = /** @type {import("../spec/root.js").RootSpec} */ (
            JSON.parse(
                readFileSync(
                    new URL(
                        "../../../../examples/core/selection/interval_linked_domain_two_way.json",
                        import.meta.url
                    ),
                    "utf8"
                )
            )
        );
        spec.data = { values: [{ x: 0 }, { x: 50 }, { x: 100 }] };
        // Model a temporarily absent imported selection writer. A live brush's
        // generated mark requires an interval object even when the owner slot
        // permits undefined, so leave brush rendering out of this boundary test.
        const overviewSpec =
            /** @type {import("../spec/view.js").VConcatSpec} */ (spec)
                .vconcat[0];
        overviewSpec.params = undefined;
        spec.params = [
            {
                name: "brush",
                value: { type: "interval", intervals: { x: null } },
            },
        ];
        const { view } = await createHarness(spec);
        const detail = /** @type {import("../view/concatView.js").default} */ (
            view
        ).children[1];
        const resolution = getRequiredScaleResolution(detail, "x");
        await resolution.zoomTo([20, 40]);
        expect(view.paramRuntime.getValue("brush").intervals.x).toEqual([
            20, 40,
        ]);

        view.paramRuntime.setValue("brush", undefined);

        expect(view.paramRuntime.getValue("brush")).toBeUndefined();
        expect(resolution.getDomain()).toEqual([0, 100]);
        expect(resolution.scale.domain()).toEqual([0, 100]);
    });
});
