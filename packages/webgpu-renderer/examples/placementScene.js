import { createExampleRenderer, setupResize } from "./utils.js";
import { pointMark } from "../src/marks/point.js";
import { linearScale } from "../src/scales/linear.js";

/**
 * One retained point mark renders into an unequal two-dimensional placement
 * table. The zero-area entry demonstrates that empty panels are data, not
 * renderer resources.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<() => void>}
 */
export async function runIndexedPlacementScene(canvas) {
    const renderer = await createExampleRenderer(canvas);
    const count = 6;
    const x = new Float32Array([0.2, 0.8, 0.5, 0.3, 0.7, 0.5]);
    const y = new Float32Array([0.25, 0.7, 0.5, 0.75, 0.25, 0.5]);
    const placementIndex = new Uint32Array([0, 1, 2, 3, 4, 5]);
    const rectangles = new Float32Array([
        0, 0, 0.48, 0.3, 0.52, 0, 0.48, 0.42, 0, 0.36, 0.42, 0.28, 0.48, 0.5,
        0.52, 0.5, 0, 0.68, 0.38, 0.32, 0.5, 0.55, 0, 0,
    ]);
    const placementSet = renderer.createPlacementSet({ rectangles });
    const { mark, scales } = createPointMark(renderer, {
        x,
        y,
        placementIndex: { data: placementIndex, type: "u32" },
        count,
    });

    const getFrame = () => ({
        draws: [
            {
                mark,
                placement: { set: placementSet, clipToPlacement: "xy" },
            },
        ],
    });
    const cleanupResize = setupResize(
        canvas,
        renderer,
        ({ width, height }) => {
            scales.x.setRange([0, width]);
            scales.y.setRange([0, height]);
        },
        getFrame
    );

    return () => {
        cleanupResize();
        placementSet.destroy();
        renderer.destroy();
    };
}

/**
 * One retained mark is submitted as ordered draw-level placement occurrences.
 * This scene intentionally knows nothing about facets or sample data.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<() => void>}
 */
export async function runRepeatedPlacementScene(canvas) {
    const renderer = await createExampleRenderer(canvas);
    const x = new Float32Array([0.3, 0.7]);
    const y = new Float32Array([0.35, 0.65]);
    const placementSet = renderer.createPlacementSet({
        rectangles: new Float32Array([
            0.02, 0.05, 0.44, 0.4, 0.54, 0.05, 0.44, 0.4, 0.1, 0.55, 0.8, 0.4,
        ]),
    });
    const { mark, scales } = createPointMark(renderer, {
        x,
        y,
        count: 2,
        placementIndex: { source: "draw" },
    });

    const getFrame = () => ({
        draws: [
            { mark, placement: { set: placementSet, index: 0 } },
            { mark, placement: { set: placementSet, index: 1 } },
            { mark, placement: { set: placementSet, index: 2 } },
        ],
    });
    const cleanupResize = setupResize(
        canvas,
        renderer,
        ({ width, height }) => {
            scales.x.setRange([0, width]);
            scales.y.setRange([0, height]);
        },
        getFrame
    );

    return () => {
        cleanupResize();
        placementSet.destroy();
        renderer.destroy();
    };
}

function createPointMark(renderer, { x, y, placementIndex, count }) {
    const result = renderer.createMark(pointMark, {
        count,
        placementIndex,
        channels: {
            x: { data: x, type: "f32", scale: linearScale({ domain: [0, 1] }) },
            y: { data: y, type: "f32", scale: linearScale({ domain: [0, 1] }) },
            size: { value: 500 },
            fill: { value: [0.12, 0.34, 0.78, 1] },
            stroke: { value: [0.05, 0.08, 0.15, 1] },
            strokeWidth: { value: 2 },
        },
    });
    return { mark: result, scales: result.scales };
}
