import { createExampleRenderer, setupResize } from "./utils.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<() => void>}
 */
export default async function runTextScene(canvas) {
    const renderer = await createExampleRenderer(canvas);

    const strings = ["Genome", "Spy", "WebGPU", "Text"];
    const count = strings.length;

    const x = new Uint32Array(count);
    const y = new Uint32Array(count);

    for (let i = 0; i < count; i++) {
        x[i] = i;
        y[i] = 0;
    }

    const markId = renderer.createMark("text", {
        count,
        channels: {
            x: {
                data: x,
                type: "u32",
                scale: {
                    type: "index",
                    domain: [0, count],
                    paddingInner: 0.2,
                    paddingOuter: 0.2,
                    align: 0.5,
                    band: 0.6,
                },
            },
            y: {
                data: y,
                type: "u32",
                scale: {
                    type: "index",
                    domain: [0, 1],
                    paddingInner: 0.2,
                    paddingOuter: 0.2,
                    align: 0.5,
                    band: 0.6,
                },
            },
            text: { data: strings },
            size: { value: 32, type: "f32" },
            fill: { value: [0.1, 0.2, 0.9, 1.0] },
            opacity: { value: 0.85 },
        },
        font: "Lato",
        fontSize: 32,
    });

    const updateRanges = ({ width, height }) => {
        renderer.updateScaleRanges(markId, {
            x: [0, width],
            y: [0, height],
        });
    };

    const cleanupResize = setupResize(canvas, renderer, updateRanges);

    renderer.updateSeries(
        markId,
        {
            x,
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
