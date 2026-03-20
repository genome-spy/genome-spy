import { afterEach, describe, expect, test, vi } from "vitest";

import ConcatView from "../concatView.js";
import Rectangle from "../layout/rectangle.js";
import { createTestViewContext } from "../testUtils.js";

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
    };

    const requestTransition = vi.fn((callback) => transitions.push(callback));
    const requestRender = vi.fn();

    context.animator = /** @type {any} */ ({
        requestTransition,
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
            context: /** @type {any} */ ({
                glHelper: { canvas: { style: {} } },
            }),
            isConfiguredVisible: () => true,
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
