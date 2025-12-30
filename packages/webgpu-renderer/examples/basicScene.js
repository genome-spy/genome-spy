import { createRenderer } from "../src/index.js";
import { setupResize } from "./utils.js";

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<() => void>}
 */
export default async function runBasicScene(canvas) {
    const renderer = await createRenderer(canvas);

    const count = 200;
    const x = new Float32Array(count);
    const y = new Float32Array(count);
    const x2 = new Float32Array(count);
    const y2 = new Float32Array(count);

    for (let i = 0; i < count; i++) {
        x[i] = 20 + (i % 20) * 25;
        y[i] = 20 + Math.floor(i / 20) * 25;
        x2[i] = x[i] + 20;
        y2[i] = y[i] + 20;
    }

    const markId = renderer.createMark("rect", {
        count,
        channels: {
            x: { data: x, type: "f32", scale: { type: "identity" } },
            x2: { data: x2, type: "f32", scale: { type: "identity" } },
            y: { data: y, type: "f32", scale: { type: "identity" } },
            y2: { data: y2, type: "f32", scale: { type: "identity" } },
            fill: { value: [0.2, 0.5, 0.8, 1.0] },
            stroke: { value: [0.1, 0.1, 0.1, 1.0], dynamic: true },
            fillOpacity: { value: 1.0 },
            strokeOpacity: { value: 1.0 },
            strokeWidth: { value: 1.0, dynamic: true },
            cornerRadius: { value: 0.0, dynamic: true },
        },
    });

    const cleanupResize = setupResize(canvas, renderer);

    renderer.updateSeries(markId, { x, x2, y, y2 }, count);

    let start = performance.now();
    let dynamicCount = count;
    let nextDataUpdate = 0;
    let running = true;

    const rebuildData = (newCount) => {
        const nx = new Float32Array(newCount);
        const ny = new Float32Array(newCount);
        const nx2 = new Float32Array(newCount);
        const ny2 = new Float32Array(newCount);

        for (let i = 0; i < newCount; i++) {
            nx[i] = 20 + (i % 20) * 25;
            ny[i] = 20 + Math.floor(i / 20) * 25;
            nx2[i] = nx[i] + 20;
            ny2[i] = ny[i] + 20;
        }

        return { nx, ny, nx2, ny2 };
    };

    const animate = (now) => {
        if (!running) {
            return;
        }
        const t = (now - start) / 1000;
        const width = 1.0 + (Math.sin(t * 2.0) * 0.5 + 0.5) * 3.0;
        const corner = (Math.sin(t) * 0.5 + 0.5) * 8.0;
        renderer.updateValues(markId, {
            strokeWidth: width,
            cornerRadius: corner,
        });

        if (now >= nextDataUpdate) {
            dynamicCount = 80 + Math.floor(Math.random() * 240);
            const { nx, ny, nx2, ny2 } = rebuildData(dynamicCount);
            renderer.updateSeries(
                markId,
                { x: nx, x2: nx2, y: ny, y2: ny2 },
                dynamicCount
            );
            nextDataUpdate = now + 1500;
        }

        renderer.render();
        requestAnimationFrame(animate);
    };

    renderer.render();
    requestAnimationFrame(animate);

    return () => {
        running = false;
        cleanupResize();
        renderer.destroyMark(markId);
    };
}
