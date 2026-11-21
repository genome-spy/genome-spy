import { rgba8Unorm } from "../src/index.js";
import { rasterMark } from "../src/marks/raster.js";
import { linearScale } from "../src/scales/linear.js";
import { createExampleRenderer, setupResize } from "./utils.js";

async function loadBowtie() {
    // Rasterized from https://genomespy.app/img/genomespy-bowtie.svg.
    const image = new Image();
    image.src = new URL("./assets/genomeSpyBowtie.png", import.meta.url).href;
    await image.decode();
    const size = image.naturalWidth;
    const context = new OffscreenCanvas(size, size).getContext("2d");
    if (!context) throw new Error("Unable to read the bowtie bitmap.");
    context.drawImage(image, 0, 0);
    const pixels = new Uint32Array(
        context.getImageData(0, 0, size, size).data.buffer
    );
    return { size, pixels };
}

/** @param {HTMLCanvasElement} canvas */
export default async function runRasterImagesScene(canvas) {
    const { size, pixels } = await loadBowtie();
    const spacing = size + 16;
    const sceneWidth = 2 * spacing + size;
    const sceneHeight = spacing + size;
    const x0 = new Float32Array([
        0,
        spacing,
        2 * spacing,
        0,
        spacing,
        2 * spacing,
    ]);
    const y0 = new Float32Array([0, 0, 0, spacing, spacing, spacing]);
    const dimensions = new Uint32Array(x0.length).fill(size);
    const renderer = await createExampleRenderer(canvas);
    const mark = renderer.createMark(rasterMark, {
        data: {
            tiles: {
                x0,
                x1: x0.map((x) => x + size),
                y0,
                y1: y0.map((y) => y + size),
                columns: dimensions,
                rows: dimensions,
                // All six tiles use the same pixel data.
                offsets: new Uint32Array(x0.length),
            },
            cells: { pixels },
        },
        position: {
            x: { scale: linearScale({ domain: [0, sceneWidth] }) },
            y: { scale: linearScale({ domain: [0, sceneHeight] }) },
        },
        channels: { fill: { input: "pixels", scale: rgba8Unorm } },
    });

    const cleanupResize = setupResize(
        canvas,
        renderer,
        ({ width, height }) => {
            const fit = Math.min(
                1,
                width / (sceneWidth + 32),
                height / (sceneHeight + 32)
            );
            const left = (width - sceneWidth * fit) / 2;
            const top = (height - sceneHeight * fit) / 2;
            mark.batchUpdates(() => {
                mark.scales.x.setRange([left, width - left]);
                mark.scales.x2.setRange([left, width - left]);
                mark.scales.y.setRange([top, height - top]);
                mark.scales.y2.setRange([top, height - top]);
            });
        },
        () => ({ draws: [{ mark }] })
    );

    return () => {
        cleanupResize();
        renderer.destroy();
    };
}

/** @param {HTMLCanvasElement} canvas */
export async function runRasterIconsScene(canvas) {
    const { size, pixels } = await loadBowtie();
    const renderer = await createExampleRenderer(canvas);
    const dimensions = new Uint32Array(3).fill(size);
    const mark = renderer.createMark(rasterMark, {
        data: {
            tiles: {
                x0: new Float32Array([0, 0.5, 1]),
                size: new Float32Array([0.25, 1, 2.25]),
                columns: dimensions,
                rows: dimensions,
                offsets: new Uint32Array(dimensions.length),
            },
            cells: { pixels },
        },
        position: {
            x: { scale: linearScale({ domain: [0, 1] }) },
            y: { value: 0.5, dynamic: true },
        },
        channels: { fill: { input: "pixels", scale: rgba8Unorm } },
    });
    const cleanupResize = setupResize(
        canvas,
        renderer,
        ({ width, height }) => {
            const span = Math.min(240, Math.max(0, width - 112));
            mark.batchUpdates(() => {
                mark.scales.x.setRange([
                    (width - span) / 2,
                    (width + span) / 2,
                ]);
                mark.values.y.set(height / 2);
            });
        },
        () => ({ draws: [{ mark }] })
    );

    return () => {
        cleanupResize();
        renderer.destroy();
    };
}
