import { createRenderer, setDebugResourcesEnabled } from "../src/index.js";

// Examples opt into resource debugging so buffer usage is visible in the console.
setDebugResourcesEnabled(true);

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<import("../src/renderer.js").Renderer>}
 */
export async function createExampleRenderer(canvas) {
    const renderer = await createRenderer(canvas);
    const labels = new Map();

    const createMark = renderer.createMark.bind(renderer);
    renderer.createMark = (type, config) => {
        const markId = createMark(type, config);
        labels.set(markId, type);
        return markId;
    };

    const updateSeries = renderer.updateSeries.bind(renderer);
    renderer.updateSeries = (markId, channels, count) => {
        updateSeries(markId, channels, count);
        const label = labels.get(markId) ?? `mark:${markId}`;
        renderer.debugResources(markId, `example:${label}`);
    };

    return renderer;
}

export function setupResize(canvas, renderer, onResize) {
    const resize = () => {
        const dpr = window.devicePixelRatio ?? 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));

        renderer.updateGlobals({
            width: canvas.width,
            height: canvas.height,
            dpr,
        });

        if (onResize) {
            onResize({ width: canvas.width, height: canvas.height, dpr });
        }

        renderer.render();
    };

    resize();
    window.addEventListener("resize", resize);

    return () => {
        window.removeEventListener("resize", resize);
    };
}
