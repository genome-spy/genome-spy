// @ts-check
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import InteractionController from "@genome-spy/core/genomeSpy/interactionController.js";
import { initializeViewData } from "@genome-spy/core/genomeSpy/viewDataInit.js";
import Rectangle from "@genome-spy/core/view/layout/rectangle.js";
import ViewRenderingContext from "@genome-spy/core/view/renderingContext/viewRenderingContext.js";
import { createSampleViewForTest } from "../testUtils/appTestUtils.js";

class MouseEventStub extends Event {
    /**
     * @param {string} type
     * @param {MouseEventInit} [init]
     */
    constructor(type, init = {}) {
        super(type, { cancelable: true });
        Object.assign(this, {
            clientX: init.clientX ?? 0,
            clientY: init.clientY ?? 0,
            ctrlKey: init.ctrlKey ?? false,
            buttons: init.buttons ?? 0,
        });
    }
}

class WheelEventStub extends MouseEventStub {
    /** @param {WheelEventInit} [init] */
    constructor(type = "wheel", init = {}) {
        super(type, init);
        Object.assign(this, {
            deltaX: init.deltaX ?? 0,
            deltaY: init.deltaY ?? 0,
            deltaMode: init.deltaMode ?? 0,
        });
    }
}

class LayoutContext extends ViewRenderingContext {
    pushView() {}
    popView() {}
    renderMark() {}
}

/**
 * Exercise native cancellation, real sample layout, and x-scale domains together.
 * Transition callbacks are queued so scrolling cannot accidentally hide inertia.
 *
 * @param {"default" | "cooperative"} wheelBehavior
 * @param {boolean} [zoom]
 * @param {import("@genome-spy/core/spec/parameter.js").Parameter[]} [params]
 */
async function createWheelHarness(wheelBehavior, zoom = true, params = []) {
    const { view, context } = await createSampleViewForTest({
        spec: {
            data: {
                values: Array.from({ length: 20 }, (_, index) => ({
                    sample: "s" + index,
                    x: index,
                })),
            },
            samples: {},
            spec: {
                name: "signal",
                params,
                mark: "point",
                encoding: {
                    sample: { field: "sample" },
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: { domain: [0, 20], zoom },
                    },
                },
            },
        },
        initializeFlow: false,
    });
    const viewRoot =
        /** @type {import("@genome-spy/core/view/view.js").default} */ (
            /** @type {unknown} */ (view)
        );
    await initializeViewData(
        viewRoot,
        context.dataFlow,
        context.textMetrics,
        () => undefined
    );

    /** @type {Set<(timestamp: number) => void>} */
    const transitions = new Set();
    context.animator = /** @type {any} */ ({
        requestRender() {},
        requestTransition: (
            /** @type {(timestamp: number) => void} */ callback
        ) => transitions.add(callback),
        cancelTransition: (
            /** @type {(timestamp: number) => void} */ callback
        ) => transitions.delete(callback),
    });

    const arrange = () =>
        view.arrange(
            new LayoutContext({ picking: false }),
            Rectangle.create(0, 0, 400, 220),
            { firstFacet: true }
        );
    arrange();

    const signal =
        /** @type {import("@genome-spy/core/view/unitView.js").default} */ (
            view
                .getDescendants()
                .find((candidate) => candidate.spec.name === "signal")
        );
    const resolution = signal.getScaleResolution("x");
    class Canvas extends EventTarget {
        style = { cursor: "" };
        clientLeft = 0;
        clientTop = 0;
        clientWidth = 400;
        clientHeight = 220;
        getBoundingClientRect() {
            return { left: 0, top: 0 };
        }
    }
    const canvas = new Canvas();
    const controller = new InteractionController({
        viewRoot,
        canvas: /** @type {any} */ (canvas),
        tooltip: /** @type {any} */ ({ clear() {}, sticky: false }),
        animator: context.animator,
        wheelBehavior,
        emitEvent() {},
        tooltipHandlers: {},
    });
    const dispose = controller.registerInteractionEvents();
    let timestamp = performance.now();

    /** @param {number} elapsed */
    function advance(elapsed) {
        timestamp += elapsed;
        const callbacks = Array.from(transitions);
        transitions.clear();
        for (const callback of callbacks) callback(timestamp);
        arrange();
    }

    /**
     * @param {"main" | "sidebar"} surface
     * @param {WheelEventInit} init
     */
    function wheel(surface, init) {
        const coords =
            surface === "main" ? view.childCoords : view.sidebarCoords;
        const event = new WheelEventStub("wheel", {
            clientX: coords.x + coords.width / 2,
            clientY: coords.y + coords.height / 2,
            ...init,
        });
        canvas.dispatchEvent(event);
        return event;
    }

    const openCloseup = () => {
        view.makePeekMenuItem(40).callback();
        advance(1000);
        expect(view.locationManager.isCloseup()).toBe(true);
        view.locationManager.setScrollOffset(0);
        arrange();
    };

    return {
        view,
        signal,
        resolution,
        wheel,
        advance,
        openCloseup,
        dispose,
        transitions,
    };
}

describe("sample wheel ownership", () => {
    beforeEach(() => {
        vi.stubGlobal("MouseEvent", MouseEventStub);
        vi.stubGlobal("WheelEvent", WheelEventStub);
    });

    afterEach(() => vi.unstubAllGlobals());

    test("cooperative overview leaves ordinary input and sidebar Ctrl input to the page", async () => {
        const h = await createWheelHarness("cooperative");
        try {
            const domain = h.resolution.getDomain();
            for (const surface of /** @type {const} */ (["main", "sidebar"])) {
                expect(h.wheel(surface, { deltaY: 40 }).defaultPrevented).toBe(
                    false
                );
                expect(h.wheel(surface, { deltaX: 40 }).defaultPrevented).toBe(
                    false
                );
            }
            expect(
                h.wheel("sidebar", { deltaY: -60, ctrlKey: true })
                    .defaultPrevented
            ).toBe(false);
            expect(h.resolution.getDomain()).toEqual(domain);
            expect(h.view.locationManager.getScrollOffset()).toBe(0);

            expect(
                h.wheel("main", { deltaY: -60, ctrlKey: true }).defaultPrevented
            ).toBe(true);
            h.advance(32);
            expect(h.resolution.getDomain()).not.toEqual(domain);
        } finally {
            h.dispose();
        }
    });

    test.each(/** @type {const} */ (["default", "cooperative"]))(
        "%s close-up scrolls main and sidebar directly, even without a zoomable x scale",
        async (mode) => {
            const h = await createWheelHarness(mode, false);
            try {
                h.openCloseup();
                const domain = h.resolution.getDomain();
                for (const surface of /** @type {const} */ ([
                    "main",
                    "sidebar",
                ])) {
                    const before = h.view.locationManager.getScrollOffset();
                    expect(
                        h.wheel(surface, { deltaY: 32 }).defaultPrevented
                    ).toBe(true);
                    expect(h.view.locationManager.getScrollOffset()).toBe(
                        before + 32
                    );
                    expect(h.transitions.size).toBe(0);
                    h.advance(1000);
                    expect(h.view.locationManager.getScrollOffset()).toBe(
                        before + 32
                    );
                }
                expect(h.resolution.getDomain()).toEqual(domain);
            } finally {
                h.dispose();
            }
        }
    );

    test("cooperative close-up normalizes wheel units and chains outward at both boundaries", async () => {
        const h = await createWheelHarness("cooperative");
        try {
            h.openCloseup();
            const domain = h.resolution.getDomain();
            expect(h.wheel("main", { deltaY: -1 }).defaultPrevented).toBe(
                false
            );
            expect(h.wheel("sidebar", { deltaY: -1 }).defaultPrevented).toBe(
                false
            );
            expect(
                h.wheel("sidebar", { deltaY: 2, deltaMode: 1 }).defaultPrevented
            ).toBe(true);
            expect(h.view.locationManager.getScrollOffset()).toBe(32);

            expect(
                h.wheel("main", { deltaY: 1, deltaMode: 2 }).defaultPrevented
            ).toBe(true);
            expect(h.view.locationManager.getScrollOffset()).toBe(
                32 + h.view.childCoords.height
            );
            expect(h.wheel("main", { deltaY: 10000 }).defaultPrevented).toBe(
                true
            );
            const bottom = h.view.locationManager.getScrollOffset();
            expect(bottom).toBeGreaterThan(32);
            expect(h.wheel("main", { deltaY: 1 }).defaultPrevented).toBe(false);
            expect(h.wheel("sidebar", { deltaY: 1 }).defaultPrevented).toBe(
                false
            );
            expect(h.view.locationManager.getScrollOffset()).toBe(bottom);
            expect(
                h.wheel("main", { deltaX: 30, deltaY: -1 }).defaultPrevented
            ).toBe(false);
            expect(h.view.locationManager.getScrollOffset()).toBe(bottom);
            expect(h.resolution.getDomain()).toEqual(domain);

            expect(
                h.wheel("main", { deltaY: -60, ctrlKey: true }).defaultPrevented
            ).toBe(true);
            h.advance(32);
            expect(h.resolution.getDomain()).not.toEqual(domain);
            expect(h.view.locationManager.getScrollOffset()).toBe(bottom);
        } finally {
            h.dispose();
        }
    });

    test("default close-up retains horizontal pan and consumes vertical scrolling at its boundaries", async () => {
        const h = await createWheelHarness("default");
        try {
            h.openCloseup();
            // Give horizontal pan room to move inside the allowed domain.
            h.resolution.zoomTo([5, 15]);
            const domain = h.resolution.getDomain();
            expect(
                h.wheel("main", { deltaX: 20, deltaY: 8 }).defaultPrevented
            ).toBe(true);
            expect(h.view.locationManager.getScrollOffset()).toBe(8);
            expect(h.resolution.getDomain()).not.toEqual(domain);
            expect(h.transitions.size).toBe(0);

            h.view.locationManager.setScrollOffset(0);
            expect(h.wheel("sidebar", { deltaY: -40 }).defaultPrevented).toBe(
                true
            );
            expect(h.view.locationManager.getScrollOffset()).toBe(0);
            h.wheel("main", { deltaY: 10000 });
            const bottom = h.view.locationManager.getScrollOffset();
            expect(h.wheel("main", { deltaY: 40 }).defaultPrevented).toBe(true);
            expect(h.view.locationManager.getScrollOffset()).toBe(bottom);
        } finally {
            h.dispose();
        }
    });

    test.each(/** @type {const} */ (["default", "cooperative"]))(
        "%s close-up preserves its authored wheel-selection policy",
        async (mode) => {
            const h = await createWheelHarness(mode, false, [
                { name: "picked", select: { type: "point", on: "wheel" } },
            ]);
            try {
                h.openCloseup();
                const datum = Array.from(h.signal.getCollector().getData())[0];
                h.signal.context.getCurrentHover = () => ({
                    mark: h.signal.mark,
                    datum,
                });
                const before = h.signal.paramRuntime.getValue("picked");
                expect(h.wheel("main", { deltaY: 32 }).defaultPrevented).toBe(
                    true
                );
                expect(h.view.locationManager.getScrollOffset()).toBe(32);
                const selected = h.signal.paramRuntime.getValue("picked");
                if (mode === "default") {
                    expect(selected.datum).toBe(datum);
                } else {
                    expect(selected).toBe(before);
                }
            } finally {
                h.dispose();
            }
        }
    );

    test.each(/** @type {const} */ (["default", "cooperative"]))(
        "%s stops an overview zoom tail when close-up opens",
        async (mode) => {
            const h = await createWheelHarness(mode);
            try {
                h.wheel("main", {
                    deltaY: -120,
                    ctrlKey: mode === "cooperative",
                });
                h.advance(16);
                const domain = h.resolution.getDomain();
                expect(h.transitions.size).toBeGreaterThan(0);

                h.view.makePeekMenuItem(40).callback();
                h.advance(1000);
                expect(h.view.locationManager.isCloseup()).toBe(true);
                const offset = h.view.locationManager.getScrollOffset();
                h.advance(1000);
                expect(h.resolution.getDomain()).toEqual(domain);
                expect(h.view.locationManager.getScrollOffset()).toBe(offset);
                expect(h.transitions.size).toBe(0);
            } finally {
                h.dispose();
            }
        }
    );
});
