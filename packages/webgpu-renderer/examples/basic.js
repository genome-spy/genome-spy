import { createRenderer } from "../src/index.js";

const canvas = document.querySelector("canvas");

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
        x: { source: "buffer", data: x, type: "f32" },
        x2: { source: "buffer", data: x2, type: "f32" },
        y: { source: "buffer", data: y, type: "f32" },
        y2: { source: "buffer", data: y2, type: "f32" },
        fill: { source: "uniform", value: [0.2, 0.5, 0.8, 1.0] },
        stroke: { source: "uniform", value: [0.1, 0.1, 0.1, 1.0] },
        fillOpacity: { source: "uniform", value: 1.0 },
        strokeOpacity: { source: "uniform", value: 1.0 },
        strokeWidth: { source: "uniform", value: 1.0 },
    },
});

const resize = () => {
    const dpr = window.devicePixelRatio ?? 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));

    renderer.updateGlobals({
        width: canvas.width,
        height: canvas.height,
        dpr,
    });
};

resize();
window.addEventListener("resize", resize);

renderer.updateInstances(markId, { x, x2, y, y2 }, count);
renderer.render();
