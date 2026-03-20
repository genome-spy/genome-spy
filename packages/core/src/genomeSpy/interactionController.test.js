import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import UnitView from "../view/unitView.js";
import InteractionController from "./interactionController.js";

const readPickingPixel = vi.fn();
const OriginalMouseEvent = globalThis.MouseEvent;

vi.mock("../gl/webGLHelper.js", () => ({
    readPickingPixel: (...args) => readPickingPixel(...args),
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
    });

    it("refreshes the cursor after dblclick changes the hovered mark", () => {
        vi.spyOn(performance, "now")
            .mockReturnValueOnce(0)
            .mockReturnValue(1_000);

        globalThis.MouseEvent = class MouseEvent extends Event {
            constructor(type, init = {}) {
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
        };

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

        const mark = {
            isPickingParticipant: () => true,
            properties: { tooltip: null },
            getCursorSpec: () => "move",
            getCursor: () => "move",
            watchCursor: () => undefined,
        };

        const pickerUnitView = Object.create(UnitView.prototype);
        pickerUnitView.mark = mark;
        pickerUnitView.facetCoords = new Map([
            [
                "facet",
                {
                    containsPoint: () => true,
                },
            ],
        ]);
        pickerUnitView.getCollector = () => ({
            findDatumByUniqueId: (uniqueId) =>
                uniqueId === 1 ? { id: "datum-1" } : undefined,
        });
        pickerUnitView.getLayoutAncestors = () => [pickerUnitView];
        pickerUnitView.getCursorSpec = () => undefined;

        const targetView = {
            getLayoutAncestors: () => [targetView],
            handleInteractionEvent: () => undefined,
            getCursorSpec: () => undefined,
        };

        const viewRoot = {
            propagateInteractionEvent(event) {
                event.target = targetView;
            },
            visit(visitor) {
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
                clear: () => undefined,
                handleMouseMove: () => undefined,
                push: () => undefined,
                updateWithDatum: () => undefined,
            }),
            animator: /** @type {any} */ ({
                requestRender: () => undefined,
            }),
            emitEvent: () => undefined,
            tooltipHandlers: {},
            renderPickingFramebuffer: () => undefined,
            getDevicePixelRatio: () => 1,
        });

        controller.registerInteractionEvents();

        readPickingPixel
            .mockReturnValueOnce([1, 0, 0, 0])
            .mockReturnValueOnce([0, 0, 0, 0]);

        canvas.dispatchEvent(
            new MouseEvent("mousemove", { clientX: 20, clientY: 30 })
        );
        expect(canvas.style.cursor).toBe("move");

        canvas.dispatchEvent(
            new MouseEvent("dblclick", { clientX: 20, clientY: 30 })
        );
        expect(canvas.style.cursor).toBe("");
    });
});
