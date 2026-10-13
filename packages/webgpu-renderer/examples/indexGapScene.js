import { createExampleRenderer, setupResize } from "./utils.js";
import { rectMark } from "../src/marks/rect.js";
import { indexScale } from "../src/scales/index.js";
import { identityScale } from "../src/scales/identity.js";

/**
 * Two half-open ranges share a cut. Wheel changes the displayed domain while
 * the cut stays the same logical-pixel width. One retained mark is reused.
 * @param {HTMLCanvasElement} canvas
 * @param {{gapWidth?: number}} [options]
 * @returns {Promise<() => void>}
 */
export default async function runIndexGapScene(canvas, { gapWidth = 10 } = {}) {
    const renderer = await createExampleRenderer(canvas);
    const handle = renderer.createMark(rectMark, {
        count: 2,
        channels: {
            x: {
                data: new Uint32Array([0, 10]),
                type: "u32",
                scale: indexScale({
                    domain: [0, 20],
                    range: [0, 500],
                    band: 0,
                    gapEnabled: true,
                    gapPositions: [10],
                    gapWidth,
                }),
            },
            x2: {
                data: new Uint32Array([10, 20]),
                type: "u32",
                scale: indexScale({
                    domain: [0, 20],
                    range: [0, 500],
                    band: 0,
                    gapEnabled: true,
                    gapPositions: [10],
                    gapWidth,
                    gapBefore: true,
                }),
            },
            y: { value: 40, dynamic: true, scale: identityScale() },
            y2: { value: 160, dynamic: true, scale: identityScale() },
            fill: { value: [0.12, 0.4, 0.75, 1] },
            strokeOpacity: { value: 0 },
        },
    });
    const cleanupResize = setupResize(canvas, renderer, ({ width, height }) => {
        handle.batchUpdates(() => {
            handle.scales.x.setRange([20, width - 20]);
            handle.scales.x2.setRange([20, width - 20]);
            handle.values.y.set(height * 0.25);
            handle.values.y2.set(height * 0.75);
        });
    });
    let span = 20;
    /** @param {WheelEvent} event */
    const zoom = (event) => {
        event.preventDefault();
        span = Math.max(1, Math.min(20, span * Math.exp(event.deltaY * 0.002)));
        handle.batchUpdates(() => {
            handle.scales.x.setDomain([10 - span / 2, 10 + span / 2]);
            handle.scales.x2.setDomain([10 - span / 2, 10 + span / 2]);
        });
        renderer.render();
    };
    canvas.addEventListener("wheel", zoom, { passive: false });
    return () => {
        canvas.removeEventListener("wheel", zoom);
        cleanupResize();
        renderer.destroy();
    };
}
