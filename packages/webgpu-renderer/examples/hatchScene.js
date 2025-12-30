import { createRenderer } from "../src/index.js";
import { setupResize } from "./utils.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<() => void>}
 */
export default async function runHatchScene(canvas) {
    const renderer = await createRenderer(canvas);

    const hatchCols = 5;
    const hatchRows = 4;
    const hatchCount = hatchCols * hatchRows;
    const hatchSize = 50;
    const hatchGap = 12;
    const hatchOrigin = { x: 20, y: 20 };
    const hx = new Float32Array(hatchCount);
    const hy = new Float32Array(hatchCount);
    const hx2 = new Float32Array(hatchCount);
    const hy2 = new Float32Array(hatchCount);
    const hatchPattern = new Uint32Array(hatchCount);
    const hatchStroke = new Float32Array(hatchCount);

    for (let row = 0; row < hatchRows; row++) {
        for (let col = 0; col < hatchCols; col++) {
            const i = row * hatchCols + col;
            const px = hatchOrigin.x + col * (hatchSize + hatchGap);
            const py = hatchOrigin.y + row * (hatchSize + hatchGap);
            hx[i] = px;
            hy[i] = py;
            hx2[i] = px + hatchSize;
            hy2[i] = py + hatchSize;
            hatchPattern[i] = (i % 10) + 0;
            hatchStroke[i] = 1 + (i % 4);
        }
    }

    const hatchMarkId = renderer.createMark("rect", {
        count: hatchCount,
        channels: {
            x: { data: hx, type: "f32", scale: { type: "identity" } },
            x2: { data: hx2, type: "f32", scale: { type: "identity" } },
            y: { data: hy, type: "f32", scale: { type: "identity" } },
            y2: { data: hy2, type: "f32", scale: { type: "identity" } },
            fill: { value: [0.98, 0.98, 0.98, 1.0] },
            stroke: { value: [0.1, 0.1, 0.1, 1.0] },
            strokeOpacity: { value: 1.0 },
            strokeWidth: { data: hatchStroke, type: "f32" },
            hatchPattern: { data: hatchPattern, type: "u32" },
        },
    });

    const cleanupResize = setupResize(canvas, renderer);

    renderer.updateInstances(
        hatchMarkId,
        {
            x: hx,
            x2: hx2,
            y: hy,
            y2: hy2,
            hatchPattern,
            strokeWidth: hatchStroke,
        },
        hatchCount
    );

    renderer.render();

    return () => {
        cleanupResize();
        renderer.destroyMark(hatchMarkId);
    };
}
