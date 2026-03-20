import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import UnitView from "../view/unitView.js";
import InteractionController from "./interactionController.js";

const readPickingPixel = vi.fn();
const OriginalMouseEvent = globalThis.MouseEvent;
const OriginalWindow = globalThis.window;

vi.mock("../gl/webGLHelper.js", () => ({
    readPickingPixel: (/** @type {any[]} */ ...args) =>
        readPickingPixel(...args),
}));

describe("InteractionController", () => {
    beforeEach(() => {
        readPickingPixel.mockReset();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        if (OriginalMouseEvent === undefined) {
            delete globalThis.MouseEvent;
        } else {
            globalThis.MouseEvent = OriginalMouseEvent;
        }

        if (OriginalWindow === undefined) {
            delete globalThis.window;
        } else {
            globalThis.window = OriginalWindow;
        }
    });

    it("refreshes the cursor after dblclick changes the hovered mark", () => {
        vi.spyOn(performance, "now")
            .mockReturnValueOnce(0)
            .mockReturnValue(1_000);

        /** @type {FrameRequestCallback[]} */
        const animationFrameQueue = [];
        globalThis.window = /** @type {any} */ ({
            requestAnimationFrame: (
                /** @type {FrameRequestCallback} */ callback
            ) => {
                animationFrameQueue.push(callback);
                return animationFrameQueue.length;
            },
        });

        globalThis.MouseEvent = /** @type {typeof MouseEvent} */ (
            /** @type {any} */ (
                class MouseEvent extends Event {
                    constructor(
                        /** @type {string} */ type,
                        /** @type {Record<string, any>} */ init = {}
                    ) {
                        super(type);
                        Object.assign(
                            this,
                            {
                                button: 0,
                                buttons: 0,
                                clientX: 0,
                                clientY: 0,
                                ctrlKey: false,
                            },
                            init
                        );
                    }
                }
            )
        );

        class CanvasStub extends EventTarget {
            constructor() {
                super();
                this.style = { cursor: "" };
                this.clientLeft = 0;
                this.clientTop = 0;
                this.clientWidth = 100;
                this.clientHeight = 100;
            }

            getBoundingClientRect() {
                return {
                    left: 0,
                    top: 0,
                };
            }
        }

        const canvas = new CanvasStub();

        const mark = /** @type {{
            isPickingParticipant: () => boolean,
            properties: { tooltip: null },
            getCursorSpec: () => string,
            getCursor: () => string,
            watchCursor: () => void,
        }} */ ({
            isPickingParticipant: () => true,
            properties: { tooltip: null },
            getCursorSpec: () => "move",
            getCursor: () => "move",
            watchCursor: () => undefined,
        });

        const pickerUnitView = Object.create(UnitView.prototype);
        pickerUnitView.mark = mark;
        pickerUnitView.facetCoords = new Map([
            [
                "facet",
                /** @type {{ containsPoint: () => boolean }} */ ({
                    containsPoint: () => true,
                }),
            ],
        ]);
        pickerUnitView.getCollector = () => ({
            findDatumByUniqueId: (/** @type {number} */ uniqueId) =>
                uniqueId === 1 ? { id: "datum-1" } : undefined,
        });
        pickerUnitView.getLayoutAncestors = () => [pickerUnitView];
        pickerUnitView.getCursorSpec = /** @returns {undefined} */ () =>
            undefined;

        const targetView = /** @type {{
            getLayoutAncestors: () => any[],
            handleInteractionEvent: () => void,
            getCursorSpec: () => undefined,
        }} */ ({
            getLayoutAncestors: () => [targetView],
            handleInteractionEvent: () => undefined,
            getCursorSpec: () => undefined,
        });

        const viewRoot = {
            propagateInteractionEvent(
                /** @type {import("../utils/interaction.js").default} */ event
            ) {
                event.target = /** @type {any} */ (targetView);
            },
            visit(/** @type {(view: UnitView) => any} */ visitor) {
                return visitor(pickerUnitView);
            },
        };

        const controller = new InteractionController({
            viewRoot: /** @type {any} */ (viewRoot),
            glHelper: /** @type {any} */ ({
                canvas,
                gl: {},
                _pickingBufferInfo: {},
            }),
            tooltip: /** @type {any} */ ({
                /** @returns {void} */
                clear() {
                    return undefined;
                },
                /** @returns {void} */
                handleMouseMove() {
                    return undefined;
                },
                /** @returns {void} */
                push() {
                    return undefined;
                },
                /** @returns {void} */
                updateWithDatum() {
                    return undefined;
                },
            }),
            animator: /** @type {any} */ ({
                requestRender: () => {
                    window.requestAnimationFrame(() => {
                        pickingUniqueId = 0;
                    });
                },
            }),
            emitEvent: /** @returns {void} */ () => undefined,
            tooltipHandlers: /** @type {Record<string, any>} */ ({}),
            renderPickingFramebuffer: /** @returns {void} */ () => undefined,
            getDevicePixelRatio: () => 1,
        });

        controller.registerInteractionEvents();

        let pickingUniqueId = 1;
        readPickingPixel.mockImplementation(() => [pickingUniqueId, 0, 0, 0]);

        canvas.dispatchEvent(
            new MouseEvent("mousemove", { clientX: 20, clientY: 30 })
        );
        expect(canvas.style.cursor).toBe("move");

        canvas.dispatchEvent(
            new MouseEvent("dblclick", { clientX: 20, clientY: 30 })
        );
        expect(canvas.style.cursor).toBe("move");

        while (animationFrameQueue.length) {
            const callback = animationFrameQueue.shift();
            if (!callback) {
                throw new Error("Missing animation frame callback!");
            }
            callback(0);
        }

        expect(canvas.style.cursor).toBe("");
    });
});
