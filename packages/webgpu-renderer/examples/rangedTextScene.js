import { createExampleRenderer, setupResize } from "./utils.js";

/**
 * Ranged text demo: each string is constrained by x/x2 and y/y2 extents.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<() => void>}
 */
export default async function runRangedTextScene(canvas) {
    const renderer = await createExampleRenderer(canvas);

    const cols = 3;
    const rows = 2;
    const count = cols * rows;
    const strings = new Array(count);
    const x = new Uint32Array(count);
    const x2 = new Uint32Array(count);
    const y = new Uint32Array(count);
    const y2 = new Uint32Array(count);
    const angles = new Float32Array(count);
    const xDomain = [0, cols];
    const yDomain = [0, rows];
    const paddingInner = 0.1;

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const i = row * cols + col;
            strings[i] = `Cell ${col + 1}, ${row + 1}`;
            x[i] = col;
            x2[i] = col;
            y[i] = row;
            y2[i] = row;
            angles[i] = (i % 2 === 0 ? 0 : -10) + row * 5;
        }
    }

    const markId = renderer.createMark("text", {
        channels: {
            x: {
                data: x,
                type: "u32",
                scale: {
                    type: "index",
                    domain: xDomain,
                    paddingInner,
                    paddingOuter: 0,
                    align: 0,
                    band: 0,
                },
            },
            x2: {
                data: x2,
                type: "u32",
                scale: {
                    type: "index",
                    domain: xDomain,
                    paddingInner,
                    paddingOuter: 0,
                    align: 0,
                    band: 1,
                },
            },
            y: {
                data: y,
                type: "u32",
                scale: {
                    type: "index",
                    domain: yDomain,
                    paddingInner,
                    paddingOuter: 0,
                    align: 0,
                    band: 0,
                },
            },
            y2: {
                data: y2,
                type: "u32",
                scale: {
                    type: "index",
                    domain: yDomain,
                    paddingInner,
                    paddingOuter: 0,
                    align: 0,
                    band: 1,
                },
            },
            text: { data: strings },
            angle: { data: angles, type: "f32" },
            size: { value: 250, type: "f32" },
            fill: { value: [0.15, 0.2, 0.9, 1.0] },
            opacity: { value: 0.9 },
        },
        font: "Lato",
        paddingX: 8,
        paddingY: 8,
        flushX: false,
        flushY: false,
        squeeze: true,
    });

    const updateRanges = ({ width, height }) => {
        renderer.updateScaleRanges(markId, {
            x: [0, width],
            x2: [0, width],
            y: [0, height],
            y2: [0, height],
        });
    };

    const cleanupResize = setupResize(canvas, renderer, updateRanges);

    renderer.render();

    return () => {
        cleanupResize();
        renderer.destroyMark(markId);
    };
}
