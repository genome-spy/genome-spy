import { createExampleRenderer, setupResize } from "./utils.js";
import { pointMark, createPointLassoSelection } from "../src/marks/point.js";
import { ruleMark } from "../src/marks/rule.js";
import { logScale } from "../src/scales/log.js";
import { sqrtScale } from "../src/scales/sqrt.js";
import { linearScale } from "../src/scales/linear.js";

/**
 * A slanted query over log/sqrt centers, captured directly from retained GPU inputs.
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<() => void>}
 */
export default async function runPointLassoScene(canvas) {
    const renderer = await createExampleRenderer(canvas);
    const count = 48;
    const mark = renderer.createMark(pointMark, {
        channels: {
            x: {
                data: Float32Array.from(
                    { length: count },
                    (_, i) => 10 ** ((((i % 8) + 0.5) / 8) * 3)
                ),
                type: "f32",
                scale: logScale({ domain: [1, 1000], range: [0, 1] }),
            },
            y: {
                data: Float32Array.from(
                    { length: count },
                    (_, i) => (((Math.floor(i / 8) + 0.5) / 6) * 10) ** 2
                ),
                type: "f32",
                scale: sqrtScale({ domain: [0, 100], range: [1, 0] }),
            },
            uniqueId: {
                data: Uint32Array.from({ length: count }, (_, i) => i + 1),
                type: "u32",
            },
            size: { value: 80 },
            strokeWidth: { value: 0 },
            fill: {
                value: [0.4, 0.46, 0.55, 1],
                conditions: [
                    {
                        when: {
                            selection: "lasso",
                            type: "multi",
                            empty: false,
                        },
                        value: [0.98, 0.45, 0.09, 1],
                    },
                ],
            },
        },
    });
    const outline = renderer.createMark(ruleMark, {
        channels: {
            x: {
                data: new Float32Array([0, 1, 0]),
                type: "f32",
                scale: linearScale({ domain: [0, 1], range: [0, 1] }),
            },
            y: {
                data: new Float32Array([1, 1, 0]),
                type: "f32",
                scale: linearScale({ domain: [0, 1], range: [0, 1] }),
            },
            x2: {
                data: new Float32Array([1, 0, 0]),
                type: "f32",
                scale: linearScale({ domain: [0, 1], range: [0, 1] }),
            },
            y2: {
                data: new Float32Array([1, 0, 1]),
                type: "f32",
                scale: linearScale({ domain: [0, 1], range: [0, 1] }),
            },
            color: { value: [0.98, 0.45, 0.09, 1] },
        },
    });
    /** @type {import("../src/utils/lassoSelection.js").LassoSelection | undefined} */
    let lasso;
    const cleanupResize = setupResize(canvas, renderer, ({ width, height }) => {
        mark.scales.x.setRange([20, width - 20]);
        mark.scales.y.setRange([height - 20, 20]);
        for (const name of ["x", "x2"])
            outline.scales[name].setRange([20, width - 20]);
        for (const name of ["y", "y2"])
            outline.scales[name].setRange([20, height - 20]);

        const previous = lasso;
        lasso = createPointLassoSelection(renderer, mark);
        lasso.update([
            [20, height - 20],
            [width - 20, height - 20],
            [20, 20],
        ]);
        mark.selections.lasso.setGpuTable(lasso.table, true);
        previous?.destroy();
    });
    return () => {
        cleanupResize();
        renderer.destroyMark(mark.markId);
        lasso?.destroy();
        renderer.destroy();
    };
}
