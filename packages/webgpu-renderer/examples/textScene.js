import { createExampleRenderer, setupResize } from "./utils.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ size?: number, opacity?: number }} [options]
 * @returns {Promise<() => void | { cleanup: () => void, update?: (next: { size?: number, opacity?: number }) => void }>}
 */
export default async function runTextScene(canvas, options = {}) {
    const renderer = await createExampleRenderer(canvas);

    const strings = ["Genome", "Spy", "WebGPU", "Text"];
    const count = strings.length;
    const initialSize = typeof options.size === "number" ? options.size : 32;
    const initialOpacity =
        typeof options.opacity === "number" ? options.opacity : 0.85;

    const x = new Uint32Array(count);
    const y = new Uint32Array(count);

    for (let i = 0; i < count; i++) {
        x[i] = i;
        y[i] = 0;
    }

    const { markId, scales, values } = renderer.createMark("text", {
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
            size: { value: initialSize, type: "f32", dynamic: true },
            fill: { value: [0.1, 0.2, 0.9, 1.0] },
            opacity: { value: initialOpacity, dynamic: true },
        },
        font: "Lato",
        fontSize: 32,
    });

    const updateRanges = ({ width, height }) => {
        scales.x.setRange([0, width]);
        scales.y.setRange([0, height]);
    };

    const cleanupResize = setupResize(canvas, renderer, updateRanges);

    renderer.render();

    return {
        cleanup: () => {
            cleanupResize();
            renderer.destroyMark(markId);
        },
        update: (next) => {
            let hasUpdate = false;
            if (typeof next.size === "number") {
                values.size.set(next.size);
                hasUpdate = true;
            }
            if (typeof next.opacity === "number") {
                values.opacity.set(next.opacity);
                hasUpdate = true;
            }
            if (hasUpdate) {
                renderer.render();
            }
        },
    };
}
