import { createExampleRenderer, setupResize } from "./utils.js";
import { pointMark } from "../src/marks/point.js";
import { linearScale } from "../src/scales/linear.js";

/**
 * @typedef {object} SelectionPredicateOptions
 * @prop {boolean} [pickEnabled]
 * @prop {number} [pickedX]
 * @prop {number} [pickedY]
 * @prop {boolean} [useXRange]
 * @prop {number} [xFrom]
 * @prop {number} [xTo]
 * @prop {boolean} [useYRange]
 * @prop {number} [yFrom]
 * @prop {number} [yTo]
 */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {SelectionPredicateOptions} [options]
 * @returns {Promise<{cleanup: () => void, update: (next: SelectionPredicateOptions) => void}>}
 */
export default async function runSelectionPredicateScene(canvas, options = {}) {
    const renderer = await createExampleRenderer(canvas);
    const count = 100;
    const x = Float32Array.from({ length: count }, (_, i) => i % 10);
    const y = Float32Array.from({ length: count }, (_, i) =>
        Math.floor(i / 10)
    );
    const ids = Uint32Array.from({ length: count }, (_, i) => i + 1);

    const mark = renderer.createMark(pointMark, {
        channels: {
            uniqueId: { data: ids, type: "u32" },
            x: {
                data: x,
                type: "f32",
                scale: linearScale({ domain: [0, 9], range: [40, 600] }),
            },
            y: {
                data: y,
                type: "f32",
                scale: linearScale({ domain: [0, 9], range: [400, 40] }),
            },
            fill: {
                value: [0.72, 0.75, 0.78, 1],
                conditions: [
                    {
                        when: {
                            any: [
                                {
                                    selection: "picked",
                                    type: "single",
                                    empty: false,
                                },
                                {
                                    selection: "brushed",
                                    type: "multi",
                                    empty: false,
                                },
                            ],
                        },
                        value: [0.1, 0.5, 0.9, 1],
                    },
                ],
            },
            size: {
                value: 100,
                conditions: [
                    {
                        when: {
                            selection: "picked",
                            type: "single",
                            empty: false,
                        },
                        value: 280,
                    },
                ],
            },
        },
    });

    /** @param {SelectionPredicateOptions} next */
    const setSelections = (next) => {
        mark.selections.picked.set(
            next.pickEnabled === false
                ? 0
                : (next.pickedY ?? 8) * 10 + (next.pickedX ?? 1) + 1
        );
        const useXRange = next.useXRange !== false;
        const useYRange = next.useYRange !== false;
        const xMin = Math.min(next.xFrom ?? 3, next.xTo ?? 6);
        const xMax = Math.max(next.xFrom ?? 3, next.xTo ?? 6);
        const yMin = Math.min(next.yFrom ?? 3, next.yTo ?? 6);
        const yMax = Math.max(next.yFrom ?? 3, next.yTo ?? 6);
        mark.selections.brushed.set(
            ids.filter(
                (_, i) =>
                    (useXRange || useYRange) &&
                    (!useXRange || (x[i] >= xMin && x[i] <= xMax)) &&
                    (!useYRange || (y[i] >= yMin && y[i] <= yMax))
            )
        );
    };
    setSelections(options);

    const updateRanges = ({ width, height }) => {
        mark.scales.x.setRange([40, width - 40]);
        mark.scales.y.setRange([height - 40, 40]);
    };
    const cleanupResize = setupResize(canvas, renderer, updateRanges);
    return {
        update(next) {
            setSelections(next);
            renderer.render();
        },
        cleanup() {
            cleanupResize();
            renderer.destroy();
        },
    };
}
