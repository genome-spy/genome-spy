import { createExampleRenderer, setupResize } from "./utils.js";
import { rectMark } from "../src/marks/rect.js";
import { identityScale } from "../src/scales/identity.js";
import { linearScale } from "../src/scales/linear.js";

/**
 * Outlines clamp to an inset rectangle while retaining their full strokes.
 * Wheel zooms the data; the gray frame shows the clamping bounds.
 * @param {HTMLCanvasElement} canvas
 * @param {{clamp?: "none" | "x" | "y" | "both"}} [options]
 * @returns {Promise<() => void>}
 */
export default async function runRectClampingScene(
    canvas,
    { clamp = "both" } = {}
) {
    const renderer = await createExampleRenderer(canvas);
    const xRange = [30, 470];
    const yRange = [30, 270];
    const frame = renderer.createMark(rectMark, {
        count: 1,
        channels: {
            x: { value: 30, scale: identityScale() },
            x2: { value: 470, dynamic: true, scale: identityScale() },
            y: { value: 30, scale: identityScale() },
            y2: { value: 270, dynamic: true, scale: identityScale() },
            fillOpacity: { value: 0 },
            stroke: { value: [0.6, 0.6, 0.6, 1] },
            strokeWidth: { value: 1 },
        },
    });
    const outlines = renderer.createMark(rectMark, {
        count: 3,
        channels: {
            x: {
                data: new Float32Array([-0.2, 0.4, 0.7]),
                scale: linearScale({ domain: [0, 1], range: xRange }),
            },
            x2: {
                data: new Float32Array([0.3, 0.6, 1.2]),
                scale: linearScale({ domain: [0, 1], range: xRange }),
            },
            y: {
                value: -0.2,
                scale: linearScale({ domain: [0, 1], range: yRange }),
            },
            y2: {
                value: 1.2,
                scale: linearScale({ domain: [0, 1], range: yRange }),
            },
            ...(clamp === "both" || clamp === "x"
                ? { xClampRange: { value: xRange, dynamic: true } }
                : {}),
            ...(clamp === "both" || clamp === "y"
                ? { yClampRange: { value: yRange, dynamic: true } }
                : {}),
            fillOpacity: { value: 0 },
            stroke: { value: [0.12, 0.4, 0.75, 1] },
            strokeWidth: { value: 4 },
        },
    });
    const cleanupResize = setupResize(canvas, renderer, ({ width, height }) => {
        xRange[1] = width - 30;
        yRange[1] = height - 30;
        frame.batchUpdates(() => {
            frame.values.x2.set(xRange[1]);
            frame.values.y2.set(yRange[1]);
        });
        outlines.batchUpdates(() => {
            outlines.scales.x.setRange(xRange);
            outlines.scales.x2.setRange(xRange);
            outlines.scales.y.setRange(yRange);
            outlines.scales.y2.setRange(yRange);
            if (clamp === "both" || clamp === "x")
                outlines.values.xClampRange.set(xRange);
            if (clamp === "both" || clamp === "y")
                outlines.values.yClampRange.set(yRange);
        });
    });
    let span = 1;
    /** @param {WheelEvent} event */
    const zoom = (event) => {
        event.preventDefault();
        span = Math.max(
            0.1,
            Math.min(2, span * Math.exp(event.deltaY * 0.002))
        );
        outlines.batchUpdates(() => {
            outlines.scales.x.setDomain([0.5 - span / 2, 0.5 + span / 2]);
            outlines.scales.x2.setDomain([0.5 - span / 2, 0.5 + span / 2]);
        });
    };
    canvas.addEventListener("wheel", zoom, { passive: false });
    return () => {
        canvas.removeEventListener("wheel", zoom);
        cleanupResize();
        renderer.destroy();
    };
}
