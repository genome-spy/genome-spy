import { describe, expect, test } from "vitest";

import Rectangle from "../layout/rectangle.js";
import BufferedViewRenderingContext from "./bufferedViewRenderingContext.js";

describe("BufferedViewRenderingContext", () => {
    test("reuses viewport setup for value-equal mark clips", () => {
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
        let viewportSetups = 0;
        let draws = 0;

        /** @returns {void} */
        const onBeforeRender = () => undefined;

        /** @returns {boolean} */
        const isPickingParticipant = () => true;

        /** @returns {boolean} */
        const isReady = () => true;

        /** @returns {(() => void)[]} */
        const prepareRender = () => [];

        /** @returns {number} */
        const getEffectiveOpacity = () => 1;

        /**
         * @returns {boolean}
         */
        const setViewport = () => {
            viewportSetups++;
            return true;
        };

        /** @returns {() => void} */
        const render = () => () => {
            draws++;
        };

        const view = /** @type {import("../view.js").default} */ (
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
                    /** @type {import("../../gl/webGLHelper.js").default} */ (
                        /** @type {unknown} */ ({ gl })
                    ),
                canvasSize: { width: 100, height: 100 },
                devicePixelRatio: 1,
            }
        );

        // Each renderMark call prepares a fresh self-clip object. The buffered
        // batch should still recognize equal viewport state and reuse setup.
        context.pushView(view, coords);
        context.renderMark(mark, {});
        context.pushView(view, coords);
        context.renderMark(mark, {});
        context.render();

        expect(draws).toBe(2);
        expect(viewportSetups).toBe(1);
    });
});
