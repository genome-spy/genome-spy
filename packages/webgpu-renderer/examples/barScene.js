import { createExampleRenderer, setupResize } from "./utils.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<() => void>}
 */
export default async function runBarScene(canvas) {
    const renderer = await createExampleRenderer(canvas);

    const data = [1, 2, 3, 4];
    const count = data.length;
    const padding = 20;

    const x = new Uint32Array(count);
    const x2 = new Uint32Array(count);
    const y = new Float32Array(count);
    const xDomain = Array.from({ length: count }, (_, i) => i);

    for (let i = 0; i < count; i++) {
        x[i] = i;
        x2[i] = i;
        y[i] = data[i];
    }

    const { markId, scales } = renderer.createMark("rect", {
        count,
        channels: {
            x: {
                data: x,
                type: "u32",
                scale: {
                    type: "band",
                    domain: xDomain,
                    paddingInner: 0.3,
                    paddingOuter: 0.3,
                    align: 0.5,
                    band: 0.0,
                },
            },
            x2: {
                data: x2,
                type: "u32",
                scale: {
                    type: "band",
                    domain: xDomain,
                    paddingInner: 0.3,
                    paddingOuter: 0.3,
                    align: 0.5,
                    band: 1.0,
                },
            },
            y: {
                data: y,
                type: "f32",
                scale: {
                    type: "linear",
                    domain: [0, Math.max(...data)],
                },
            },
            y2: {
                value: 0,
                type: "f32",
                scale: {
                    type: "linear",
                    domain: [0, Math.max(...data)],
                },
            },
            fill: { value: [0.2, 0.45, 0.85, 1.0] },
            stroke: { value: [0.0, 0.0, 0.0, 1.0] },
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

    renderer.updateSeries(
        markId,
        {
            x,
            x2,
            y,
        },
        count
    );

    renderer.render();

    return () => {
        cleanupResize();
        renderer.destroyMark(markId);
    };
}
