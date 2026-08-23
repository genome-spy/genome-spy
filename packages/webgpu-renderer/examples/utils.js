/* global window */

import { createRenderer } from "../src/index.js";
import { setDebugResourcesEnabled } from "../src/debug.js";

// Examples opt into resource debugging so buffer usage is visible in the console.
setDebugResourcesEnabled(true);

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<import("../src/renderer.js").Renderer>}
 */
export async function createExampleRenderer(canvas) {
    /** @type {import("../src/renderer.js").Renderer} */
    let renderer;
    renderer = await createRenderer(canvas, {
        onInvalidate: () => renderer.render(),
    });

    const createMark = renderer.createMark.bind(renderer);
    renderer.createMark = (definition, config) => {
        const handle = createMark(definition, config);
        const replaceSeries = handle.series.replace;
        handle.series.replace = (series, count) => {
            replaceSeries(series, count);
            renderer.debugResources(
                handle.markId,
                `example:${definition.type}`
            );
        };
        return handle;
    };

    return renderer;
}

export function setupResize(canvas, renderer, onResize) {
    const resize = () => {
        const dpr = window.devicePixelRatio ?? 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;

        renderer.updateGlobals({
            width,
            height,
            dpr,
        });

        if (onResize) {
            onResize({ width, height, dpr });
        }

        renderer.render();
    };

    resize();
    window.addEventListener("resize", resize);

    return () => {
        window.removeEventListener("resize", resize);
    };
}
