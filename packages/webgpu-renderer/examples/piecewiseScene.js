import { interpolateHcl } from "d3-interpolate";
import { createExampleRenderer, setupResize } from "./utils.js";
import { pointMark } from "../src/marks/point.js";
import { identityScale } from "../src/scales/identity.js";
import { linearScale } from "../src/scales/linear.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<() => void>}
 */
export default async function runPiecewiseScene(canvas) {
    const renderer = await createExampleRenderer(canvas);

    const count = 40;
    const padding = 20;

    const x = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        x[i] = i;
    }

    const { series, scales, values } = renderer.createMark(pointMark, {
        count,
        channels: {
            x: {
                data: x,
                type: "f32",
                scale: linearScale({
                    domain: [0, count - 1],
                }),
            },
            y: {
                value: 0,
                type: "f32",
                dynamic: true,
                scale: identityScale(),
            },
            size: { value: 500 },
            fill: {
                data: x,
                type: "f32",
                inputComponents: 1,
                components: 4,
                scale: linearScale({
                    domain: [5, 10, 20, 30],
                    range: ["green", "#0050f8", "#f6f6f6", "#ff3000"],
                    interpolate: interpolateHcl,
                    clamp: true,
                }),
            },
            stroke: { value: [0.1, 0.1, 0.1, 1.0] },
            strokeWidth: { value: 1.0 },
        },
    });

    const updateRanges = ({ width, height }) => {
        scales.x.setRange([padding, Math.max(padding, width - padding)]);
        values.y.set(height * 0.5);
    };

    const cleanupResize = setupResize(canvas, renderer, updateRanges);

    series.replace({ x, fill: x }, count);

    renderer.render();

    return () => {
        cleanupResize();
        renderer.destroy();
    };
}
