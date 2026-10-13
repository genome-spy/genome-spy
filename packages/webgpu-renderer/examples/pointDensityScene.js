import { createRenderer } from "../src/index.js";
import { pointMark, createPointDensityPreview } from "../src/marks/point.js";
import { linearScale } from "../src/scales/linear.js";

/** Point-backed density with GPU membership and selected-row readback.
 * @param {HTMLCanvasElement} canvas */
export default async function runPointDensityScene(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const renderer = await createRenderer(canvas);
    renderer.updateGlobals({ width, height, dpr });
    const count = 100000;
    const x = Float32Array.from(
        { length: count },
        (_, i) => 0.5 + 0.3 * Math.sin(i * 2.399) * Math.sqrt((i % 997) / 997)
    );
    const y = Float32Array.from(
        { length: count },
        (_, i) => 0.5 + 0.3 * Math.cos(i * 2.399) * Math.sqrt((i % 997) / 997)
    );
    const ids = Uint32Array.from({ length: count }, (_, i) => i + 1);
    const neutral = [0.4, 0.46, 0.55, 1];
    const highlight = [1, 0.35, 0.05, 1];
    const mark = renderer.createMark(pointMark, {
        channels: {
            x: {
                data: x,
                type: "f32",
                scale: linearScale({ domain: [0, 1], range: [0, width] }),
            },
            y: {
                data: y,
                type: "f32",
                scale: linearScale({ domain: [0, 1], range: [height, 0] }),
            },
            uniqueId: { data: ids, type: "u32" },
            size: { value: 2 },
            strokeWidth: { value: 0 },
            fillOpacity: { value: 0.15 },
            fill: {
                value: neutral,
                conditions: [
                    {
                        when: {
                            selection: "lasso",
                            type: "multi",
                            empty: false,
                        },
                        channel: { value: highlight, dynamic: true },
                    },
                ],
            },
        },
    });
    /** @type {ReturnType<typeof createPointDensityPreview>} */
    let preview;
    /** @type {GPUBuffer | undefined} */
    let table;
    try {
        preview = createPointDensityPreview(renderer, mark, {
            neutral,
            highlight,
            view: [0, height, width, 0],
            viewport: [0, 0, canvas.width, canvas.height],
            draw: () => renderer.render(),
        });
        await preview.update([
            [0, 0],
            [width, 0],
            [0, height],
        ]);
        const snapshot = await preview.readIds();
        if (!snapshot.ids.length)
            throw new Error("The triangle must select points.");
        table = preview.takeTable();
        mark.selections.lasso.setGpuTable(table, true);
        preview.render();
    } catch (error) {
        preview?.destroy();
        renderer.destroy();
        table?.destroy();
        throw error;
    }
    return () => {
        preview.destroy();
        renderer.destroy();
        table.destroy();
    };
}
