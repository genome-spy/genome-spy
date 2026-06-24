import { describe, expect, test } from "vitest";

import RenderCoordinator from "./renderCoordinator.js";

/**
 * @param {object} options
 * @param {() => { width: number, height: number }} options.getLogicalCanvasSize
 * @param {() => boolean} options.invalidateSize
 * @param {(pass: number) => void} [options.onRender]
 */
function createCoordinator({ getLogicalCanvasSize, invalidateSize, onRender }) {
    /** @type {{ width: number, height: number }[]} */
    const renderedSizes = [];

    const root = {
        /**
         * @param {import("../view/renderingContext/viewRenderingContext.js").default} _context
         * @param {import("../view/layout/rectangle.js").default} coords
         */
        render(_context, coords) {
            renderedSizes.push({
                width: coords.width,
                height: coords.height,
            });
            onRender?.(renderedSizes.length);
        },
    };

    const coordinator = new RenderCoordinator({
        viewRoot: /** @type {any} */ (root),
        glHelper: /** @type {any} */ ({
            _pickingBufferInfo: undefined,
            getLogicalCanvasSize,
            getDevicePixelRatio: () => 1,
            invalidateSize,
        }),
        getBackground: () => "white",
        broadcast: () => undefined,
        onLayoutComputed: () => undefined,
    });

    return { coordinator, renderedSizes };
}

describe("RenderCoordinator", () => {
    test("invalidates canvas size before buffering layout", () => {
        let canvasSize = { width: 100, height: 50 };
        let invalidated = false;
        const { coordinator, renderedSizes } = createCoordinator({
            getLogicalCanvasSize: () => canvasSize,
            invalidateSize: () => {
                if (invalidated) {
                    return false;
                }

                canvasSize = { width: 200, height: 50 };
                invalidated = true;
                return true;
            },
        });

        coordinator.computeLayout();

        expect(renderedSizes[0]).toEqual({ width: 200, height: 50 });
    });

    test("rebuilds buffered layout when layout changes canvas size", () => {
        let canvasSize = { width: 100, height: 50 };
        let nextCanvasSize = canvasSize;
        const { coordinator, renderedSizes } = createCoordinator({
            getLogicalCanvasSize: () => canvasSize,
            invalidateSize: () => {
                const changed =
                    canvasSize.width != nextCanvasSize.width ||
                    canvasSize.height != nextCanvasSize.height;
                canvasSize = nextCanvasSize;
                return changed;
            },
            onRender: (pass) => {
                if (pass == 1) {
                    nextCanvasSize = { width: 200, height: 50 };
                }
            },
        });

        coordinator.computeLayout();

        expect(renderedSizes).toEqual([
            { width: 100, height: 50 },
            { width: 200, height: 50 },
        ]);
    });
});
