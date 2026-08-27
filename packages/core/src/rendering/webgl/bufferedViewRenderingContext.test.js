import { describe, expect, test, vi } from "vitest";

import Rectangle from "../../view/layout/rectangle.js";
import BufferedViewRenderingContext from "./bufferedViewRenderingContext.js";

describe("BufferedViewRenderingContext", () => {
    test("does not render marks rejected by the mark predicate", () => {
        const markPredicate = vi.fn(() => false);
        const context = new BufferedViewRenderingContext(
            { picking: false },
            {
                webGLHelper:
                    /** @type {import("./gl/webGLHelper.js").default} */ (
                        /** @type {unknown} */ ({ gl: {} })
                    ),
                canvasSize: { width: 100, height: 100 },
                devicePixelRatio: 1,
                markPredicate,
            }
        );
        const mark = /** @type {import("../../marks/mark.js").default} */ (
            /** @type {unknown} */ ({})
        );

        context.renderMark(mark, {});
        context.render();

        expect(markPredicate).toHaveBeenCalledWith(mark);
    });

    test("forwards placement while reusing value-equal viewports", () => {
        const coords = Rectangle.create(0, 0, 20, 10);
        const gl = /** @type {WebGL2RenderingContext} */ (
            /** @type {unknown} */ ({
                COLOR_BUFFER_BIT: 0x4000,
                SCISSOR_TEST: 0x0c11,
                drawingBufferWidth: 100,
                drawingBufferHeight: 100,
                /** @returns {void} */
                viewport: () => undefined,
                /** @returns {void} */
                disable: () => undefined,
                /** @returns {void} */
                clearColor: () => undefined,
                /** @returns {void} */
                clear: () => undefined,
            })
        );
        const placement = {
            source: /** @type {import("../../view/layout/placementSource.js").default} */ (
                /** @type {unknown} */ ({})
            ),
        };
        let draws = 0;

        /** @returns {void} */
        const onBeforeRender = () => undefined;

        /** @returns {boolean} */
        const isPickingParticipant = () => true;

        /** @returns {boolean} */
        const isReady = () => true;

        const prepareRender = vi.fn(() => []);

        /** @returns {number} */
        const getEffectiveOpacity = () => 1;

        /**
         * @returns {boolean}
         */
        const setViewport = vi.fn(
            /** @type {import("../../marks/mark.js").default["setViewport"]} */ (
                () => true
            )
        );

        /** @returns {() => void} */
        const render = () => () => {
            draws++;
        };

        const view = /** @type {import("../../view/view.js").default} */ (
            /** @type {unknown} */ ({ onBeforeRender })
        );
        const mark = /** @type {import("../../marks/mark.js").default} */ (
            /** @type {unknown} */ ({
                properties: { clip: true },
                unitView: { getEffectiveOpacity },
                isPickingParticipant,
                isReady,
                prepareRender,
                setViewport,
                render,
            })
        );
        const context = new BufferedViewRenderingContext(
            { picking: false },
            {
                webGLHelper:
                    /** @type {import("./gl/webGLHelper.js").default} */ (
                        /** @type {unknown} */ ({ gl })
                    ),
                canvasSize: { width: 100, height: 100 },
                devicePixelRatio: 1,
                pixelOffset: 0,
            }
        );

        // Each renderMark call prepares a fresh self-clip object. The buffered
        // batch should still recognize equal viewport state and reuse setup.
        context.pushView(view, coords);
        context.renderMark(mark, { placement });
        context.pushView(view, coords);
        context.renderMark(mark, { placement });
        context.render();

        expect(draws).toBe(2);
        expect(prepareRender).toHaveBeenCalledWith({
            picking: false,
            placement,
        });
        expect(setViewport).toHaveBeenCalledOnce();
        expect(setViewport.mock.calls[0][5]).toBe(0);
    });
});
