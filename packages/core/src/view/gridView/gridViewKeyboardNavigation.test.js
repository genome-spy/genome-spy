import { afterEach, describe, expect, onTestFinished, test, vi } from "vitest";

import ConcatView from "../concatView.js";
import FacetView from "../facetView.js";
import Point from "../layout/point.js";
import Rectangle from "../layout/rectangle.js";
import Interaction from "../../utils/interaction.js";
import {
    createHeadlessEngine,
    createTestViewContext,
    renderToLayout,
} from "../testUtils.js";

afterEach(() => {
    vi.restoreAllMocks();
});

/**
 * @param {object} [options]
 * @param {boolean} [options.eligible]
 */
function createKeyboardHarness({ eligible = true } = {}) {
    /** @type {Record<"keydown" | "keyup", ((event: KeyboardEvent) => void)[]>} */
    const listeners = {
        keydown: [],
        keyup: [],
    };

    /** @type {((timestamp: number) => void)[]} */
    const transitions = [];

    const context = createTestViewContext();

    context.addKeyboardListener = (type, listener) => {
        listeners[type].push(listener);
        return () =>
            listeners[type].splice(listeners[type].indexOf(listener), 1);
    };

    const requestTransition = vi.fn((callback) => transitions.push(callback));
    const requestRender = vi.fn();

    context.animator = /** @type {any} */ ({
        requestTransition,
        cancelTransition: (
            /** @type {(timestamp: number) => void} */ callback
        ) => {
            const index = transitions.indexOf(callback);
            if (index >= 0) transitions.splice(index, 1);
        },
        requestRender,
        transition: () => Promise.resolve(),
    });

    const view = new ConcatView({ hconcat: [] }, context, null, null, "root");

    /** @type {{ isZoomable: () => boolean, zoom: ReturnType<typeof vi.fn> } | undefined} */
    let resolution;

    if (eligible) {
        resolution = {
            isZoomable: () => true,
            zoom: vi.fn(() => true),
        };
        view.resolutions.scale.x = /** @type {any} */ (resolution);
    }

    return {
        listeners,
        transitions,
        requestTransition,
        requestRender,
        view,
        resolution,
    };
}

/**
 * @param {string} code
 * @param {Partial<KeyboardEvent> & { target?: EventTarget | null }} [options]
 */
function createKeyboardEvent(code, options = {}) {
    let prevented = false;

    /** @type {KeyboardEvent} */
    const event = /** @type {KeyboardEvent} */ (
        /** @type {unknown} */ ({
            code,
            altKey: false,
            ctrlKey: false,
            metaKey: false,
            target: null,
            preventDefault: () => {
                prevented = true;
            },
            ...options,
        })
    );

    return {
        event,

        isPrevented() {
            return prevented;
        },
    };
}

describe("GridView keyboard navigation", () => {
    test.each(["cell", "gap"])(
        "anchors facet keyboard zoom to the pointed %s",
        async (location) => {
            /** @type {Map<string, (event: KeyboardEvent) => void>} */
            const listeners = new Map();
            /** @type {((timestamp: number) => void)[]} */
            const transitions = [];
            const context = createTestViewContext(
                {},
                {
                    addKeyboardListener: (type, listener) => {
                        listeners.set(type, listener);
                        return () => listeners.delete(type);
                    },
                }
            );
            vi.spyOn(context.animator, "requestTransition").mockImplementation(
                (callback) => transitions.push(callback)
            );
            const { view: root } = await createHeadlessEngine(
                {
                    resolve: { scale: { x: "shared" } },
                    vconcat: [
                        {
                            data: {
                                values: [
                                    { g: "A", x: 2 },
                                    { g: "B", x: 8 },
                                ],
                            },
                            facet: { field: "g", title: null, header: null },
                            columns: 2,
                            spacing: 20,
                            spec: {
                                width: 100,
                                height: 60,
                                mark: "point",
                                encoding: {
                                    x: {
                                        field: "x",
                                        type: "quantitative",
                                        axis: null,
                                        scale: { domain: [0, 10], zoom: true },
                                    },
                                },
                            },
                        },
                    ],
                },
                { context }
            );
            onTestFinished(() => root.disposeSubtree());
            renderToLayout(root);
            const facet = /** @type {FacetView} */ (
                root.getDescendants().find((view) => view instanceof FacetView)
            );
            const cell = facet.child.facetCoords.get(["B"]);
            const point = new Point(
                location === "cell" ? cell.x + cell.width / 4 : cell.x - 10,
                cell.y + cell.height / 2
            );
            root.propagateInteraction(
                new Interaction(
                    point,
                    /** @type {MouseEvent} */ ({ type: "mousemove" })
                )
            );
            const zoom = vi.spyOn(root.getScaleResolution("x"), "zoom");
            listeners.get("keydown")(createKeyboardEvent("KeyW").event);
            transitions.shift()(performance.now() + 16);

            expect(zoom.mock.calls[0][1]).toBeCloseTo(
                location === "cell" ? 0.25 : 1
            );
        }
    );

    test("starts a transition and applies pan when an eligible target exists", () => {
        const harness = createKeyboardHarness();
        const keydown = createKeyboardEvent("KeyD");

        harness.listeners.keydown[0](keydown.event);

        expect(keydown.isPrevented()).toBe(true);
        expect(harness.requestTransition).toHaveBeenCalledTimes(1);

        const callback = harness.transitions.shift();
        // Non-obvious: call one animation frame manually because animator is mocked.
        callback(performance.now() + 16);

        expect(harness.resolution.zoom).toHaveBeenCalledTimes(1);

        const [scaleFactor, anchor, pan] =
            harness.resolution.zoom.mock.calls[0];
        expect(scaleFactor).toBe(1);
        expect(anchor).toBe(0.5);
        expect(pan).toBeLessThan(0);
        expect(harness.requestRender).toHaveBeenCalledTimes(1);
    });

    test("disposal removes keyboard listeners and stops pending navigation", () => {
        const harness = createKeyboardHarness();
        harness.listeners.keydown[0](createKeyboardEvent("KeyD").event);
        const pendingFrame = harness.transitions[0];

        harness.view.dispose();

        expect(harness.listeners).toEqual({ keydown: [], keyup: [] });
        expect(harness.transitions).toEqual([]);
        // A frame already taken by the animator must also become inert.
        pendingFrame(performance.now() + 16);
        expect(harness.resolution.zoom).not.toHaveBeenCalled();
    });

    test("ignores keydown when target is editable", () => {
        const harness = createKeyboardHarness();
        const keydown = createKeyboardEvent("KeyW", {
            target: /** @type {EventTarget} */ (
                /** @type {unknown} */ ({ nodeName: "INPUT" })
            ),
        });

        harness.listeners.keydown[0](keydown.event);

        expect(keydown.isPrevented()).toBe(false);
        expect(harness.requestTransition).not.toHaveBeenCalled();
        expect(harness.resolution.zoom).not.toHaveBeenCalled();
    });

    test("ignores keydown when modifier keys are pressed", () => {
        const harness = createKeyboardHarness();
        const keydown = createKeyboardEvent("KeyA", { ctrlKey: true });

        harness.listeners.keydown[0](keydown.event);

        expect(keydown.isPrevented()).toBe(false);
        expect(harness.requestTransition).not.toHaveBeenCalled();
        expect(harness.resolution.zoom).not.toHaveBeenCalled();
    });

    test("stays inactive when keyboard zoom target is not eligible", () => {
        const harness = createKeyboardHarness({ eligible: false });
        const keydown = createKeyboardEvent("KeyW");

        harness.listeners.keydown[0](keydown.event);

        expect(keydown.isPrevented()).toBe(false);
        expect(harness.requestTransition).not.toHaveBeenCalled();
    });

    test("uses per-view keyboard anchor override when provided", () => {
        const harness = createKeyboardHarness();
        const nowSpy = vi.spyOn(performance, "now").mockReturnValue(0);

        const getKeyboardZoomAnchorX = vi.fn(() => 0.25);

        const childView = /** @type {any} */ ({
            needsAxes: { x: false, y: false },
            spec: {},
            paramRuntime: { paramConfigs: new Map() },
            registerDisposer: vi.fn(),
            context: /** @type {any} */ ({}),
            isConfiguredVisible: () => true,
            getParentGridChromePolicy: () => ({
                axes: true,
                background: true,
            }),
            getDataAncestors: () => [childView],
            getLayoutAncestors: () => [childView],
            getKeyboardZoomAnchorX,
            getScaleResolution: /** @returns {undefined} */ () => undefined,
            propagateInteraction: /** @returns {void} */ () => undefined,
            visit: /** @param {(view: any) => void} visitor */ (visitor) =>
                visitor(childView),
        });

        // Non-obvious: we use a lightweight child mock and set coords manually
        // so GridView can resolve a pointed child without rendering.
        const gridChild = harness.view.appendChildView(childView);
        gridChild.coords = Rectangle.create(0, 0, 200, 100);

        harness.view.propagateInteraction(
            /** @type {any} */ ({
                type: "mousemove",
                point: { x: 150, y: 50 },
                stopped: false,
                pointedViews: new Map(),
                stopPropagation: /** @returns {void} */ () => undefined,
            })
        );

        const keydown = createKeyboardEvent("KeyD");
        harness.listeners.keydown[0](keydown.event);

        nowSpy.mockReturnValue(5000);

        const callback = harness.transitions.shift();
        callback(5000);

        const [, anchor] = harness.resolution.zoom.mock.calls[0];
        expect(anchor).toBeCloseTo(0.25, 6);
        expect(getKeyboardZoomAnchorX).toHaveBeenCalledTimes(1);
    });
});
