import { createExampleRenderer, setupResize } from "./utils.js";
import { pointMark } from "../src/marks/point.js";
import { indexScale } from "../src/scales/index.js";
import { ordinalScale } from "../src/scales/ordinal.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ opacity?: number, strokeAlign?: number, strokeOpacity?: number }} [options]
 * @returns {Promise<{cleanup: () => void, update: (options: {opacity?: number, strokeAlign?: number, strokeOpacity?: number}) => void}>}
 */
export default async function runPointScene(canvas, options = {}) {
    const renderer = await createExampleRenderer(canvas);

    const count = 160;
    const cols = 20;
    const rows = Math.ceil(count / cols);

    const x = new Uint32Array(count);
    const y = new Uint32Array(count);
    const size = new Float32Array(count);
    const angle = new Float32Array(count);
    const shape = new Uint32Array(count);
    const fill = new Uint32Array(count);

    const palette = [
        [0.2, 0.45, 0.85, 1.0],
        [0.95, 0.55, 0.2, 1.0],
        [0.25, 0.75, 0.4, 1.0],
        [0.85, 0.25, 0.5, 1.0],
        [0.65, 0.6, 0.2, 1.0],
    ];
    const fillDomain = Array.from({ length: palette.length }, (_, i) => i);

    for (let i = 0; i < count; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);

        const xField = col;
        const yField = row;

        x[i] = xField;
        y[i] = yField;

        const t = xField / (cols - 1);
        size[i] = Math.pow(t, 2) * 900;
        angle[i] = (yField / Math.max(1, rows - 1)) * 45;
        shape[i] = xField % 12;

        fill[i] = xField % palette.length;
    }

    const mark = renderer.createMark(pointMark, {
        count,
        channels: {
            opacity: { value: options.opacity ?? 1, dynamic: true },
            x: {
                data: x,
                type: "u32",
                scale: indexScale({
                    domain: [0, cols],
                    paddingInner: 0.1,
                    paddingOuter: 0.2,
                    align: 0.5,
                    band: 0.5,
                }),
            },
            y: {
                data: y,
                type: "u32",
                scale: indexScale({
                    domain: [0, rows],
                    paddingInner: 0.1,
                    paddingOuter: 0.2,
                    align: 0.5,
                    band: 0.5,
                }),
            },
            size: { data: size, type: "f32" },
            shape: { data: shape, type: "u32" },
            fill: {
                data: fill,
                type: "u32",
                inputComponents: 1,
                scale: ordinalScale({
                    domain: fillDomain,
                    range: palette,
                }),
            },
            stroke: { value: [0.0, 0.0, 0.0, 1.0] },
            strokeWidth: { value: 1.0 },
            strokeOpacity: { value: 1, dynamic: true },
            strokeAlign: { value: 1, type: "u32", dynamic: true },
            angle: { data: angle, type: "f32" },
        },
    });

    const { series, scales, values } = mark;

    const updateRanges = ({ width, height }) => {
        scales.x.setRange([0, width]);
        scales.y.setRange([0, height]);
    };

    const cleanupResize = setupResize(canvas, renderer, updateRanges);

    series.replace(
        {
            x,
            y,
            size,
            shape,
            fill,
            angle,
        },
        count
    );

    /** @param {{opacity?: number, strokeAlign?: number, strokeOpacity?: number}} next */
    const update = (next) => {
        mark.batchUpdates(() => {
            values.opacity.set(next.opacity ?? 1);
            values.strokeAlign.set(next.strokeAlign ?? 1);
            values.strokeOpacity.set(next.strokeOpacity ?? 1);
        });
        renderer.render();
    };
    update(options);

    return {
        update,
        cleanup() {
            cleanupResize();
            renderer.destroy();
        },
    };
}
