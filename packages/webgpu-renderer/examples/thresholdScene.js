import { cssColorToArray } from "../src/utils/colorUtils.js";
import { createExampleRenderer, setupResize } from "./utils.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<() => void>}
 */
export default async function runThresholdScene(canvas) {
    const renderer = await createExampleRenderer(canvas);

    const count = 60;
    const padding = 20;

    const x = new Uint32Array(count);
    const x2 = new Uint32Array(count);
    const y = new Float32Array(count);
    const xDomain = [0, count];

    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < count; i++) {
        const value = Math.sin((i - 30) / 4) + (i - 30) / 30;
        x[i] = i;
        x2[i] = i;
        y[i] = value;
        minY = Math.min(minY, value);
        maxY = Math.max(maxY, value);
    }

    const yDomain = [Math.min(minY, 0), Math.max(maxY, 0)];

    const belowZero = [...cssColorToArray("#ed553b"), 1];
    const aboveZero = [...cssColorToArray("#20639b"), 1];

    const { markId, scales } = renderer.createMark("rect", {
        count,
        channels: {
            x: {
                data: x,
                type: "u32",
                scale: {
                    type: "index",
                    domain: xDomain,
                    paddingInner: 0.1,
                    paddingOuter: 0.1,
                    align: 0.5,
                    band: 0.0,
                },
            },
            x2: {
                data: x2,
                type: "u32",
                scale: {
                    type: "index",
                    domain: xDomain,
                    paddingInner: 0.1,
                    paddingOuter: 0.1,
                    align: 0.5,
                    band: 1.0,
                },
            },
            y: {
                data: y,
                type: "f32",
                scale: {
                    type: "linear",
                    domain: yDomain,
                },
            },
            y2: {
                value: 0,
                type: "f32",
                scale: {
                    type: "linear",
                    domain: yDomain,
                },
            },
            fill: {
                data: y,
                type: "f32",
                inputComponents: 1,
                scale: {
                    type: "threshold",
                    domain: [0],
                    range: [belowZero, aboveZero],
                },
            },
            stroke: { value: [0.1, 0.1, 0.1, 1.0] },
            strokeWidth: { value: 1.0 },
        },
    });

    const updateRanges = ({ width, height }) => {
        const xRange = [padding, Math.max(padding, width - padding)];
        const yRange = [Math.max(padding, height - padding), padding];
        scales.x.setRange(xRange);
        scales.x2.setRange(xRange);
        scales.y.setRange(yRange);
        scales.y2.setRange(yRange);
    };

    const cleanupResize = setupResize(canvas, renderer, updateRanges);

    renderer.updateSeries(markId, { x, x2, y }, count);

    renderer.render();

    return () => {
        cleanupResize();
        renderer.destroyMark(markId);
    };
}
