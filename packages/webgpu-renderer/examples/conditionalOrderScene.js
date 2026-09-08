import { createExampleRenderer, setupResize } from "./utils.js";
import { pointMark } from "../src/marks/point.js";
import { linearScale } from "../src/scales/linear.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<() => void>}
 */
export default async function runConditionalOrderScene(canvas) {
    const renderer = await createExampleRenderer(canvas);
    let ordered = true;
    const mark = renderer.createMark(pointMark, {
        count: 2,
        channels: {
            uniqueId: { data: new Uint32Array([40, 41]), type: "u32" },
            x: {
                data: new Float32Array([0.47, 0.53]),
                type: "f32",
                scale: linearScale({ domain: [0, 1], range: [0, 1] }),
            },
            y: {
                value: 0.5,
                scale: linearScale({ domain: [0, 1], range: [0, 1] }),
            },
            size: { value: 1800 },
            fill: {
                data: new Float32Array([0.1, 0.35, 0.9, 1, 0.95, 0.25, 0.2, 1]),
                type: "f32",
                components: 4,
            },
            fillOpacity: { value: 0.65 },
            strokeWidth: { value: 0 },
        },
        orderWhen: { selection: "picked", type: "single", empty: false },
    });
    const { scales } = mark;

    // The selected first point is painted after the other point.
    mark.selections.picked.set(40);

    const updateRanges = ({ width, height }) => {
        scales.x.setRange([0, width]);
        scales.y.setRange([0, height]);
    };

    const getFrame = () => ({
        draws: ordered
            ? [
                  { mark, orderPass: "nonmatching" },
                  { mark, orderPass: "matching" },
              ]
            : [{ mark, orderPass: "all" }],
    });

    const toggleOrder = () => {
        ordered = !ordered;
        mark.selections.picked.set(ordered ? 40 : 0);
        renderer.render(getFrame());
    };

    const cleanupResize = setupResize(canvas, renderer, updateRanges, getFrame);
    renderer.render(getFrame());
    canvas.addEventListener("click", toggleOrder);

    return () => {
        canvas.removeEventListener("click", toggleOrder);
        cleanupResize();
        renderer.destroy();
    };
}
