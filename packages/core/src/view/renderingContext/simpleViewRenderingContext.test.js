import { describe, expect, test } from "vitest";

import Rectangle from "../layout/rectangle.js";
import SimpleViewRenderingContext from "./simpleViewRenderingContext.js";

describe("SimpleViewRenderingContext", () => {
    test("passes structured clip options to mark viewport setup", () => {
        const context = new SimpleViewRenderingContext({ picking: false });
        const coords = Rectangle.create(0, 0, 20, 10);
        const clip = {
            rect: Rectangle.create(5, 0, 10, 10),
            clipX: true,
            clipY: false,
        };
        /** @type {unknown} */
        let viewportClip;

        /** @returns {void} */
        const onBeforeRender = () => undefined;

        /** @returns {boolean} */
        const isPickingParticipant = () => true;

        /** @returns {(() => void)[]} */
        const prepareRender = () => [];

        /**
         * @param {{width: number, height: number}} canvasSize
         * @param {number} dpr
         * @param {Rectangle} markCoords
         * @param {Rectangle | import("../../types/rendering.js").ClipOptions | undefined} markClip
         * @returns {boolean}
         */
        const setViewport = (canvasSize, dpr, markCoords, markClip) => {
            viewportClip = markClip;
            return true;
        };

        /** @returns {() => void} */
        const render = () => () => undefined;

        const view = /** @type {import("../view.js").default} */ (
            /** @type {unknown} */ ({ onBeforeRender })
        );
        const mark = /** @type {import("../../marks/mark.js").default} */ (
            /** @type {unknown} */ ({
                isPickingParticipant,
                prepareRender,
                setViewport,
                render,
            })
        );

        context.pushView(view, coords);
        context.renderMark(mark, { clip });

        expect(viewportClip).toBe(clip);
    });
});
