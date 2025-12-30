import { createRenderer } from "../src/index.js";
import { setupResize } from "./utils.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<() => void>}
 */
export default async function runPointScene(canvas) {
    const renderer = await createRenderer(canvas);

    const count = 160;
    const cols = 20;
    const rows = Math.ceil(count / cols);
    const cellSize = 40;
    const origin = { x: 40, y: 40 };

    const x = new Float32Array(count);
    const y = new Float32Array(count);
    const size = new Float32Array(count);
    const strokeWidth = new Float32Array(count);
    const angle = new Float32Array(count);
    const shape = new Uint32Array(count);
    const fill = new Float32Array(count * 4);

    const palette = [
        [0.2, 0.45, 0.85, 1.0],
        [0.95, 0.55, 0.2, 1.0],
        [0.25, 0.75, 0.4, 1.0],
        [0.85, 0.25, 0.5, 1.0],
        [0.65, 0.6, 0.2, 1.0],
    ];

    for (let i = 0; i < count; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const px = origin.x + col * cellSize;
        const py = origin.y + row * cellSize;

        const xField = col;
        const yField = row;

        x[i] = px;
        y[i] = py;

        const t = xField / (cols - 1);
        size[i] = Math.pow(t, 2) * 900;
        strokeWidth[i] = (yField / Math.max(1, rows - 1)) * 4;
        angle[i] = (yField / Math.max(1, rows - 1)) * 45;
        shape[i] = xField % 12;

        const color = palette[xField % palette.length];
        const base = i * 4;
        fill[base] = color[0];
        fill[base + 1] = color[1];
        fill[base + 2] = color[2];
        fill[base + 3] = color[3];
    }

    const markId = renderer.createMark("point", {
        count,
        channels: {
            x: { data: x, type: "f32", scale: { type: "identity" } },
            y: { data: y, type: "f32", scale: { type: "identity" } },
            size: { data: size, type: "f32" },
            shape: { data: shape, type: "u32" },
            fill: { data: fill, type: "f32", components: 4 },
            stroke: { value: [0.0, 0.0, 0.0, 1.0] },
            strokeWidth: { data: strokeWidth, type: "f32" },
            angle: { data: angle, type: "f32" },
        },
    });

    const cleanupResize = setupResize(canvas, renderer);

    renderer.updateInstances(
        markId,
        {
            x,
            y,
            size,
            shape,
            fill,
            strokeWidth,
            angle,
        },
        count
    );

    renderer.render();

    return () => {
        cleanupResize();
        renderer.destroyMark(markId);
    };
}
