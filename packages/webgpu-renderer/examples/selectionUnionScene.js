import { createExampleRenderer, setupResize } from "./utils.js";
import { pointMark } from "../src/marks/point.js";
import { linearScale } from "../src/scales/linear.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<() => void>}
 */
export default async function runSelectionUnionScene(canvas) {
    const renderer = await createExampleRenderer(canvas);
    const x = new Float32Array([1, 2, 3, 4, 5]);
    const y = new Float32Array([2, 5, 3, 7, 4]);
    const ids = new Uint32Array([10, 11, 12, 13, 14]);

    const mark = renderer.createMark(pointMark, {
        channels: {
            uniqueId: { data: ids, type: "u32" },
            x: {
                data: x,
                type: "f32",
                scale: linearScale({ domain: [1, 5], range: [40, 600] }),
            },
            y: {
                data: y,
                type: "f32",
                scale: linearScale({ domain: [0, 8], range: [400, 40] }),
            },
            fill: {
                value: [0.72, 0.75, 0.78, 1],
                conditions: [
                    {
                        when: {
                            selectionUnion: [
                                { selection: "picked", type: "single" },
                                { selection: "focused", type: "single" },
                            ],
                            empty: false,
                        },
                        value: [0.1, 0.5, 0.9, 1],
                    },
                ],
            },
            size: { value: 120 },
        },
    });

    mark.selections.picked.set(11);
    mark.selections.focused.set(14);

    const updateRanges = ({ width, height }) => {
        mark.scales.x.setRange([40, width - 40]);
        mark.scales.y.setRange([height - 40, 40]);
    };
    const cleanupResize = setupResize(canvas, renderer, updateRanges);
    renderer.render();

    return () => {
        cleanupResize();
        renderer.destroy();
    };
}
