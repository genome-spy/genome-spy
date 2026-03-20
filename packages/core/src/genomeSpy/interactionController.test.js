import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FREEZE_INTERACTION_CLASS_NAME } from "../utils/ui/tooltip.js";
import UnitView from "../view/unitView.js";
import InteractionController from "./interactionController.js";

const readPickingPixel = vi.fn();
const OriginalDocument = globalThis.document;
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

        if (OriginalDocument === undefined) {
            delete globalThis.document;
        } else {
            globalThis.document = OriginalDocument;
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
            handleInteraction: () => void,
            getCursorSpec: () => undefined,
        }} */ ({
            getLayoutAncestors: () => [targetView],
            handleInteraction: () => undefined,
            getCursorSpec: () => undefined,
        });

        const viewRoot = {
            propagateInteraction(
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

    it("freezes hover-derived cursor state while interactions are frozen", () => {
        const frozenInteractionClasses = new Set();
        globalThis.document = /** @type {Document} */ (
            /** @type {any} */ ({
                body: {
                    classList: {
                        add(/** @type {string} */ className) {
                            frozenInteractionClasses.add(className);
                        },
                        remove(/** @type {string} */ className) {
                            frozenInteractionClasses.delete(className);
                        },
                        contains(/** @type {string} */ className) {
                            return frozenInteractionClasses.has(className);
                        },
                    },
                },
            })
        );

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

        const firstTarget = /** @type {any} */ ({
            getLayoutAncestors: /** @returns {any[]} */ () => [firstTarget],
            handleInteraction: /** @returns {void} */ () => undefined,
            getCursorSpec: /** @returns {string} */ () => "move",
            getCursor: /** @returns {string} */ () => "move",
            watchCursor: /** @returns {void} */ () => undefined,
        });
        const secondTarget = /** @type {any} */ ({
            getLayoutAncestors: /** @returns {any[]} */ () => [secondTarget],
            handleInteraction: /** @returns {void} */ () => undefined,
            getCursorSpec: /** @returns {string} */ () => "crosshair",
            getCursor: /** @returns {string} */ () => "crosshair",
            watchCursor: /** @returns {void} */ () => undefined,
        });

        /** @type {any} */
        let currentTarget = firstTarget;

        const controller = new InteractionController({
            viewRoot: /** @type {any} */ ({
                propagateInteraction(
                    /** @type {import("../utils/interaction.js").default} */ event
                ) {
                    event.target = currentTarget;
                },
                visit: /** @returns {void} */ () => undefined,
            }),
            glHelper: /** @type {any} */ ({
                canvas,
                gl: {},
                _pickingBufferInfo: {},
            }),
            tooltip: /** @type {any} */ ({
                clear: /** @returns {void} */ () => undefined,
                handleMouseMove: /** @returns {void} */ () => undefined,
                pushEnabledState: /** @returns {void} */ () => undefined,
                popEnabledState: /** @returns {void} */ () => undefined,
                updateWithDatum: /** @returns {void} */ () => undefined,
                visible: false,
                sticky: false,
            }),
            animator: /** @type {any} */ ({
                requestRender: /** @returns {void} */ () => undefined,
            }),
            emitEvent: /** @returns {void} */ () => undefined,
            tooltipHandlers: /** @type {Record<string, any>} */ ({}),
            renderPickingFramebuffer: /** @returns {void} */ () => undefined,
            getDevicePixelRatio: () => 1,
        });

        controller.registerInteractionEvents();

        canvas.dispatchEvent(
            new MouseEvent("mousemove", { clientX: 20, clientY: 30 })
        );
        expect(canvas.style.cursor).toBe("move");

        document.body.classList.add(FREEZE_INTERACTION_CLASS_NAME);
        currentTarget = secondTarget;

        canvas.dispatchEvent(
            new MouseEvent("mousemove", { clientX: 25, clientY: 35 })
        );
        expect(canvas.style.cursor).toBe("move");

        canvas.dispatchEvent(
            new MouseEvent("mouseout", { clientX: 25, clientY: 35 })
        );
        expect(canvas.style.cursor).toBe("move");
    });

    it("preserves the active cursor when hover tracking is suspended", () => {
        vi.spyOn(performance, "now")
            .mockReturnValueOnce(0)
            .mockReturnValue(1_000);

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
            getCursorSpec: () => "grabbing",
            getCursor: () => "grabbing",
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
            handleInteraction: () => void,
            getCursorSpec: () => undefined,
        }} */ ({
            getLayoutAncestors: () => [targetView],
            handleInteraction: () => undefined,
            getCursorSpec: () => undefined,
        });

        const controller = new InteractionController({
            viewRoot: /** @type {any} */ ({
                propagateInteraction(
                    /** @type {import("../utils/interaction.js").default} */ event
                ) {
                    event.target = /** @type {any} */ (targetView);
                },
                visit(/** @type {(view: UnitView) => any} */ visitor) {
                    return visitor(pickerUnitView);
                },
            }),
            glHelper: /** @type {any} */ ({
                canvas,
                gl: {},
                _pickingBufferInfo: {},
            }),
            tooltip: /** @type {any} */ ({
                clear: /** @returns {void} */ () => undefined,
                handleMouseMove: /** @returns {void} */ () => undefined,
                pushEnabledState: /** @returns {void} */ () => undefined,
                popEnabledState: /** @returns {void} */ () => undefined,
                updateWithDatum: /** @returns {void} */ () => undefined,
                visible: false,
                sticky: false,
            }),
            animator: /** @type {any} */ ({
                requestRender: /** @returns {void} */ () => undefined,
            }),
            emitEvent: /** @returns {void} */ () => undefined,
            tooltipHandlers: /** @type {Record<string, any>} */ ({}),
            renderPickingFramebuffer: /** @returns {void} */ () => undefined,
            getDevicePixelRatio: () => 1,
        });

        controller.registerInteractionEvents();
        readPickingPixel.mockImplementation(() => [1, 0, 0, 0]);

        canvas.dispatchEvent(
            new MouseEvent("mousemove", { clientX: 20, clientY: 30 })
        );
        expect(canvas.style.cursor).toBe("grabbing");

        controller.suspendHoverTracking();

        canvas.dispatchEvent(
            new MouseEvent("mouseout", { clientX: 20, clientY: 30 })
        );
        expect(canvas.style.cursor).toBe("grabbing");

        canvas.dispatchEvent(
            new MouseEvent("mousemove", {
                clientX: 21,
                clientY: 31,
                buttons: 1,
            })
        );
        expect(canvas.style.cursor).toBe("grabbing");
    });
});
