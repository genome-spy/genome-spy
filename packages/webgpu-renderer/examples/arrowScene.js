import { createExampleRenderer, setupResize } from "./utils.js";
import { ARROW_DIRECTIONS, arrowMark } from "../src/marks/arrow.js";
import { linearScale } from "../src/scales/linear.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<() => void>}
 */
export default async function runArrowScene(canvas) {
    const renderer = await createExampleRenderer(canvas);
    const count = 6;
    const x = new Float32Array([0.1, 0.1, 0.1, 0.15, 0.15, 0.15]);
    const x2 = new Float32Array([0.9, 0.9, 0.9, 0.85, 0.85, 0.85]);
    const y = new Float32Array([0.15, 0.3, 0.45, 0.65, 0.78, 0.91]);
    const y2 = new Float32Array([0.15, 0.3, 0.45, 0.73, 0.86, 0.99]);
    const direction = new Uint32Array([
        ARROW_DIRECTIONS.forward,
        ARROW_DIRECTIONS.reverse,
        ARROW_DIRECTIONS.both,
        ARROW_DIRECTIONS.forward,
        ARROW_DIRECTIONS.reverse,
        ARROW_DIRECTIONS.both,
    ]);

    const { series, scales } = renderer.createMark(arrowMark, {
        count,
        channels: {
            x: {
                data: x,
                type: "f32",
                scale: linearScale({ domain: [0, 1] }),
            },
            x2: {
                data: x2,
                type: "f32",
                scale: linearScale({ domain: [0, 1] }),
            },
            y: {
                data: y,
                type: "f32",
                scale: linearScale({ domain: [0, 1] }),
            },
            y2: {
                data: y2,
                type: "f32",
                scale: linearScale({ domain: [0, 1] }),
            },
            direction: { data: direction, type: "u32" },
            size: { value: 8 },
            fill: { value: [0.36, 0.56, 0.94, 1] },
            stroke: { value: [0.05, 0.08, 0.16, 1] },
            strokeWidth: { value: 1 },
        },
        headAngle: 45,
        headNotchAngle: 75,
        headShape: "triangle",
        headPlacement: "outside",
        headWidth: 3,
        headSpacing: 3,
        startNotch: true,
        stem: true,
    });

    const updateRanges = ({ width, height }) => {
        const padding = 40;
        const xRange = [padding, Math.max(padding, width - padding)];
        const yRange = [padding, Math.max(padding, height - padding)];
        scales.x.setRange(xRange);
        scales.x2.setRange(xRange);
        scales.y.setRange(yRange);
        scales.y2.setRange(yRange);
    };

    const cleanupResize = setupResize(canvas, renderer, updateRanges);
    series.replace({ x, x2, y, y2, direction }, count);
    renderer.render();

    return () => {
        cleanupResize();
        renderer.destroy();
    };
}
