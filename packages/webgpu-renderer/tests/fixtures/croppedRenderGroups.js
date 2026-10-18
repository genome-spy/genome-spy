/* global document, GPUBufferUsage, GPUMapMode, GPUTextureUsage */

import { createRenderer } from "../../src/index.js";
import { rectMark } from "../../src/marks/rect.js";
import { identityScale } from "../../src/scales/identity.js";

/**
 * Exercises cropped MSAA and single-sampled layers through the public renderer
 * API. Shared with native Safari verification, which Playwright cannot drive.
 *
 * @param {number} dpr
 */
export async function renderCroppedGroups(dpr) {
    const canvas = document.createElement("canvas");
    canvas.width = 64 * dpr;
    canvas.height = 64 * dpr;
    document.body.appendChild(canvas);
    const renderer = await createRenderer(canvas);
    renderer.context.configure({
        device: renderer.device,
        format: renderer.format,
        alphaMode: "premultiplied",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    renderer.updateGlobals({ width: 64, height: 64, dpr });

    /**
     * @param {number} id
     * @param {number[]} bounds
     * @param {number[]} fill
     * @param {boolean} [shaderAntialiasing]
     * @param {boolean} [placed]
     */
    const createRect = (
        id,
        bounds,
        fill,
        shaderAntialiasing = false,
        placed = false
    ) =>
        renderer.createMark(rectMark, {
            count: 1,
            ...(placed ? { placementIndex: { source: "draw" } } : {}),
            channels: {
                uniqueId: { value: id, type: "u32" },
                x: { value: bounds[0], scale: identityScale() },
                y: { value: bounds[1], scale: identityScale() },
                x2: { value: bounds[2], scale: identityScale() },
                y2: { value: bounds[3], scale: identityScale() },
                fill: { value: fill },
                strokeWidth: { value: 0, dynamic: shaderAntialiasing },
            },
        });
    const red = createRect(42, [-12, -12, 60, 60], [1, 0, 0, 1], false, true);
    const blue = createRect(43, [-8, -8, 20, 20], [0, 0, 1, 1], true);
    const green = createRect(44, [30, 30, 36, 36], [0, 1, 0, 1]);
    const placements = renderer.createPlacementSet({
        rectangles: new Float32Array([0.25, 0.25, 0.5, 0.5]),
    });
    const viewport = { x: 8, y: 8, width: 48, height: 48 };
    const frame = {
        clearColor: { r: 0, g: 0, b: 0, a: 0 },
        items: [
            {
                bounds: { x: 12.25, y: 10.5, width: 40, height: 42 },
                opacity: 0.5,
                items: [
                    {
                        mark: red,
                        viewport,
                        placement: {
                            set: placements,
                            index: 0,
                            clipToPlacement: /** @type {const} */ ("xy"),
                        },
                    },
                    {
                        // Geometry exceeds its viewport, which must still clip
                        // after moving the projection into the shader.
                        bounds: { x: 22, y: 22, width: 16, height: 16 },
                        opacity: 0.5,
                        items: [
                            {
                                mark: blue,
                                viewport: {
                                    x: 24.75,
                                    y: 24.75,
                                    width: 10.5,
                                    height: 10.5,
                                },
                            },
                        ],
                    },
                    { mark: green, viewport },
                ],
            },
        ],
    };

    renderer.device.pushErrorScope("validation");
    renderer.render(frame);
    const picks = await Promise.all([
        renderer.pick(22, 26),
        renderer.pick(30, 30),
        renderer.pick(40, 40),
        renderer.pick(18, 26),
        renderer.pick(23, 26),
        renderer.pick(37, 26),
    ]);
    // Picking rewrites draw globals for the full canvas; repaint must restore
    // each cropped target's transform while reusing retained resources.
    renderer.render(frame);
    const texture = renderer.context.getCurrentTexture();
    const bytesPerRow = Math.ceil((canvas.width * 4) / 256) * 256;
    const readback = renderer.device.createBuffer({
        size: bytesPerRow * canvas.height,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = renderer.device.createCommandEncoder();
    encoder.copyTextureToBuffer(
        { texture },
        { buffer: readback, bytesPerRow },
        { width: canvas.width, height: canvas.height }
    );
    renderer.device.queue.submit([encoder.finish()]);
    await renderer.device.queue.onSubmittedWorkDone();
    const error = await renderer.device.popErrorScope();
    if (error) {
        renderer.destroy();
        readback.destroy();
        canvas.remove();
        throw new Error(error.message);
    }

    await readback.mapAsync(GPUMapMode.READ);
    const bytes = new Uint8Array(readback.getMappedRange());
    /** @param {number} x @param {number} y */
    const pixel = (x, y) => {
        const offset =
            Math.floor(y * dpr) * bytesPerRow + Math.floor(x * dpr) * 4;
        const rgba = Array.from(bytes.subarray(offset, offset + 4));
        return renderer.format.startsWith("bgra")
            ? [rgba[2], rgba[1], rgba[0], rgba[3]]
            : rgba;
    };
    const result = {
        red: pixel(22, 26),
        overlap: pixel(30, 30),
        green: pixel(40, 40),
        clipped: pixel(18, 26),
        // Stay outside rasterization-boundary rounding at fractional viewports.
        viewportNearEdge: pixel(23, 26),
        viewportFarEdge: pixel(37, 26),
        empty: pixel(4, 4),
        picks,
    };
    readback.unmap();
    readback.destroy();
    renderer.destroy();
    canvas.remove();
    return result;
}
