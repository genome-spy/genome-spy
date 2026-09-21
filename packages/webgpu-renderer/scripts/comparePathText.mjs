/* global process, console, Buffer */

import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);
const sceneArgument = process.argv.indexOf("--scene");
const scene =
    sceneArgument >= 0 && process.argv[sceneArgument + 1]
        ? process.argv[sceneArgument + 1]
        : "path-text";
if (scene !== "path-text" && scene !== "path-points") {
    throw new Error('Comparison scene must be "path-text" or "path-points".');
}
const outputStem = scene;
const serverPort = 4181;
const serverUrl = `http://127.0.0.1:${serverPort}`;
const outputArgument = process.argv.indexOf("--output");
const outputDirectory = path.resolve(
    outputArgument >= 0 && process.argv[outputArgument + 1]
        ? process.argv[outputArgument + 1]
        : path.join(tmpdir(), `genome-spy-${outputStem}-comparison`)
);
const thresholdArgument = process.argv.indexOf("--threshold");
const threshold =
    thresholdArgument >= 0 && process.argv[thresholdArgument + 1]
        ? Number(process.argv[thresholdArgument + 1])
        : 8;
const dprArgument = process.argv.indexOf("--dpr");
const dpr =
    dprArgument >= 0 && process.argv[dprArgument + 1]
        ? Number(process.argv[dprArgument + 1])
        : 1;
const wgslFormatArgument = process.argv.indexOf("--wgsl-format");
const wgslFormat =
    wgslFormatArgument >= 0 && process.argv[wgslFormatArgument + 1]
        ? process.argv[wgslFormatArgument + 1]
        : "rgba16float";
const pointSizeArgument = process.argv.indexOf("--point-size");
const pointSize =
    pointSizeArgument >= 0 && process.argv[pointSizeArgument + 1]
        ? Number(process.argv[pointSizeArgument + 1])
        : 60;
const strokeWidthArgument = process.argv.indexOf("--stroke-width");
const pointStrokeWidth =
    strokeWidthArgument >= 0 && process.argv[strokeWidthArgument + 1]
        ? Number(process.argv[strokeWidthArgument + 1])
        : 4;
const pathIndicesArgument = process.argv.indexOf("--path-indices");
const selectedPathIndices =
    pathIndicesArgument >= 0 && process.argv[pathIndicesArgument + 1]
        ? process.argv[pathIndicesArgument + 1].split(",").map(Number)
        : null;

/** @param {string} name */
function numericArgument(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 && process.argv[index + 1]
        ? Number(process.argv[index + 1])
        : undefined;
}

const atlasOverrides = {
    tileSize: numericArgument("--tile-size"),
    spread: numericArgument("--spread"),
    shapePadding: numericArgument("--shape-padding"),
};
for (const [name, value] of Object.entries(atlasOverrides)) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
        throw new Error(`${name} must be greater than zero.`);
    }
}
const angleArgument = process.argv.indexOf("--angles");
const pointAngles =
    angleArgument >= 0 && process.argv[angleArgument + 1]
        ? process.argv[angleArgument + 1].split(",").map(Number)
        : [37, 45];
if (
    pointAngles.length === 0 ||
    pointAngles.some((angle) => !Number.isFinite(angle))
) {
    throw new Error("Angles must be a comma-separated list of numbers.");
}

if (!Number.isFinite(threshold) || threshold < 0 || threshold > 255) {
    throw new Error("Diff threshold must be between 0 and 255.");
}
if (!Number.isFinite(dpr) || dpr <= 0 || dpr > 4) {
    throw new Error(
        "Device pixel ratio must be greater than zero and at most 4."
    );
}
if (wgslFormat !== "rgba8unorm" && wgslFormat !== "rgba16float") {
    throw new Error('WGSL format must be "rgba8unorm" or "rgba16float".');
}
if (!Number.isFinite(pointSize) || pointSize <= 0) {
    throw new Error("Point size must be greater than zero.");
}
if (!Number.isFinite(pointStrokeWidth) || pointStrokeWidth < 0) {
    throw new Error("Stroke width must be non-negative.");
}
if (
    selectedPathIndices &&
    (selectedPathIndices.length === 0 ||
        selectedPathIndices.some(
            (index) => !Number.isSafeInteger(index) || index < 0
        ))
) {
    throw new Error(
        "Path indices must be comma-separated non-negative integers."
    );
}

const server = spawn(
    process.execPath,
    [
        path.join(packageRoot, "tests/webgpuServer.js"),
        "--port",
        String(serverPort),
    ],
    { cwd: packageRoot, stdio: ["ignore", "pipe", "inherit"] }
);

/** @param {string} dataUrl */
function decodePng(dataUrl) {
    const prefix = "data:image/png;base64,";
    if (!dataUrl.startsWith(prefix)) {
        throw new Error("Browser did not return a PNG data URL.");
    }
    return Buffer.from(dataUrl.slice(prefix.length), "base64");
}

async function waitForServer() {
    for (let attempt = 0; attempt < 100; attempt++) {
        try {
            const response = await fetch(serverUrl);
            if (response.ok) {
                return;
            }
        } catch {
            // The server has not bound the port yet.
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Timed out waiting for the WebGPU comparison server.");
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {"gpu" | "wasm"} backend
 */
async function renderBackend(page, backend) {
    return page.evaluate(
        async ({
            selectedBackend,
            selectedScene,
            selectedWgslFormat,
            pixelRatio,
            selectedPointSize,
            selectedPointStrokeWidth,
            selectedAtlasOverrides,
            selectedPointAngles,
            requestedPathIndices,
        }) => {
            const [
                { createRenderer },
                { comparisonPathPointMark },
                { identityScale },
            ] = await Promise.all([
                import("/src/index.js"),
                import("/tests/oracles/msdfgen/pathPointMark.js"),
                import("/src/scales/identity.js"),
            ]);
            let paths;
            let atlasOptions;
            let width;
            let height;
            let x;
            let y;
            let size;
            let shape;
            let strokeWidth;
            let angle;
            if (selectedScene === "path-text") {
                const [
                    { createAsciiTrueTypeFont },
                    { getPathTextAtlasOptions, layoutPathTextLines },
                ] = await Promise.all([
                    import("/tests/oracles/createAsciiTrueTypeFont.js"),
                    import("/examples/pathTextScene.js"),
                ]);
                const response = await fetch("/src/fonts/DefaultFont.ttf");
                const font = createAsciiTrueTypeFont(
                    await response.arrayBuffer()
                );
                const instances = layoutPathTextLines(font);
                paths = font.paths;
                atlasOptions = getPathTextAtlasOptions(font);
                width = 960;
                height = 340;
                x = Float32Array.from(instances, (instance) => instance.x);
                y = Float32Array.from(instances, (instance) => instance.y);
                size = Float32Array.from(
                    instances,
                    (instance) => instance.size
                );
                shape = Uint32Array.from(
                    instances,
                    (instance) => instance.shape
                );
                strokeWidth = Float32Array.from(
                    instances,
                    (instance) => instance.strokeWidth
                );
                angle = new Float32Array(instances.length);
            } else {
                const { PATHS, PATH_POINT_ATLAS_OPTIONS } =
                    await import("/examples/pathPointScene.js");
                const pathIndices =
                    requestedPathIndices ?? PATHS.map((_, index) => index);
                if (pathIndices.some((index) => index >= PATHS.length)) {
                    throw new Error(
                        "Path index is outside the Path Points set."
                    );
                }
                const rowAngles = selectedPointAngles;
                const cellWidth = Math.max(76, selectedPointSize + 24);
                const cellHeight = Math.max(80, selectedPointSize + 24);
                paths = pathIndices.map((index) => PATHS[index]);
                atlasOptions = Object.fromEntries(
                    Object.entries({
                        ...PATH_POINT_ATLAS_OPTIONS,
                        ...selectedAtlasOverrides,
                    }).filter(([, value]) => value !== undefined)
                );
                width = paths.length * cellWidth;
                height = rowAngles.length * cellHeight + 20;
                const instances = paths.flatMap((_, pathIndex) =>
                    rowAngles.map((rowAngle, row) => ({
                        x: (pathIndex + 0.5) * cellWidth,
                        y: cellHeight * 0.5 + 10 + row * cellHeight,
                        shape: pathIndex,
                        angle: rowAngle,
                    }))
                );
                x = Float32Array.from(instances, (instance) => instance.x);
                y = Float32Array.from(instances, (instance) => instance.y);
                size = new Float32Array(instances.length).fill(
                    selectedPointSize ** 2
                );
                shape = Uint32Array.from(
                    instances,
                    (instance) => instance.shape
                );
                strokeWidth = new Float32Array(instances.length).fill(
                    selectedPointStrokeWidth
                );
                angle = Float32Array.from(
                    instances,
                    (instance) => instance.angle
                );
            }
            const count = x.length;
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(width * pixelRatio);
            canvas.height = Math.round(height * pixelRatio);
            document.body.replaceChildren(canvas);
            const renderer = await createRenderer(canvas);
            renderer.updateGlobals({
                width,
                height,
                dpr: pixelRatio,
            });
            const handle = renderer.createMark(comparisonPathPointMark, {
                count,
                paths,
                atlasBackend:
                    selectedBackend === "gpu" &&
                    selectedWgslFormat === "rgba8unorm"
                        ? "gpu-rgba8"
                        : selectedBackend,
                ...(atlasOptions ? { atlasOptions } : {}),
                channels: {
                    x: { data: x, type: "f32", scale: identityScale() },
                    y: { data: y, type: "f32", scale: identityScale() },
                    size: { data: size, type: "f32" },
                    shape: { data: shape, type: "u32" },
                    fill: { value: [0.12, 0.33, 0.75, 1] },
                    stroke: { value: [0.02, 0.03, 0.06, 1] },
                    strokeWidth: { data: strokeWidth, type: "f32" },
                    angle: { data: angle, type: "f32" },
                },
            });
            handle.series.replace(
                { x, y, size, shape, strokeWidth, angle },
                count
            );
            renderer.render({ draws: [{ mark: handle }] });
            await renderer.device.queue.onSubmittedWorkDone();
            const png = canvas.toDataURL("image/png");
            renderer.destroy();
            return png;
        },
        {
            selectedBackend: backend,
            selectedScene: scene,
            selectedWgslFormat: wgslFormat,
            pixelRatio: dpr,
            selectedPointSize: pointSize,
            selectedPointStrokeWidth: pointStrokeWidth,
            selectedAtlasOverrides: atlasOverrides,
            selectedPointAngles: pointAngles,
            requestedPathIndices: selectedPathIndices,
        }
    );
}

/**
 * Compare the generated RGBA8 atlas texels directly, before sampling and
 * mark shading can affect the result.
 *
 * @param {import("@playwright/test").Page} page
 */
async function comparePathPointAtlases(page) {
    return page.evaluate(
        async ({
            differenceThreshold,
            requestedPathIndices,
            atlasOverrides,
        }) => {
            const [
                { createRenderer },
                { MsdfAtlasGenerator },
                { buildPathAtlas },
                { PATHS, PATH_POINT_ATLAS_OPTIONS },
            ] = await Promise.all([
                import("/src/index.js"),
                import("/src/symbols/sparseGpuPathAtlas.js"),
                import("/tests/oracles/msdfgen/pathAtlas.js"),
                import("/examples/pathPointScene.js"),
            ]);
            const pathIndices =
                requestedPathIndices ?? PATHS.map((_, index) => index);
            if (pathIndices.some((index) => index >= PATHS.length)) {
                throw new Error("Path index is outside the Path Points set.");
            }
            const paths = pathIndices.map((index) => PATHS[index]);
            const options = {
                ...PATH_POINT_ATLAS_OPTIONS,
                ...Object.fromEntries(
                    Object.entries(atlasOverrides).filter(
                        ([, value]) => value !== undefined
                    )
                ),
            };
            const wasmAtlas = buildPathAtlas(paths, options);
            const canvas = document.createElement("canvas");
            canvas.width = 1;
            canvas.height = 1;
            const renderer = await createRenderer(canvas);
            const generator = new MsdfAtlasGenerator(renderer.device);
            const gpuAtlas = generator.createAtlas(
                paths,
                options,
                "path comparison atlas"
            );
            await gpuAtlas.completion;
            if (
                gpuAtlas.width !== wasmAtlas.width ||
                gpuAtlas.height !== wasmAtlas.height
            ) {
                throw new Error("WGSL and WASM atlas dimensions differ.");
            }

            const width = gpuAtlas.width;
            const height = gpuAtlas.height;
            const bytesPerRow = Math.ceil((width * 8) / 256) * 256;
            const readback = renderer.device.createBuffer({
                size: bytesPerRow * height,
                usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
            });
            const encoder = renderer.device.createCommandEncoder();
            encoder.copyTextureToBuffer(
                { texture: gpuAtlas.texture },
                { buffer: readback, bytesPerRow, rowsPerImage: height },
                [width, height]
            );
            renderer.device.queue.submit([encoder.finish()]);
            await readback.mapAsync(GPUMapMode.READ);
            const mapped = new Uint16Array(readback.getMappedRange());
            const gpu = new Uint8ClampedArray(width * height * 4);
            const halfToFloat = (value) => {
                const sign = value & 0x8000 ? -1 : 1;
                const exponent = (value >> 10) & 0x1f;
                const fraction = value & 0x03ff;
                if (exponent === 0) {
                    return sign * 2 ** -14 * (fraction / 1024);
                }
                if (exponent === 0x1f) {
                    return fraction
                        ? Number.NaN
                        : sign * Number.POSITIVE_INFINITY;
                }
                return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
            };
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const source = (y * bytesPerRow) / 2 + x * 4;
                    const target = (y * width + x) * 4;
                    for (let component = 0; component < 4; component++) {
                        const distance = halfToFloat(
                            mapped[source + component]
                        );
                        gpu[target + component] = Math.round(
                            Math.max(
                                0,
                                Math.min(
                                    1,
                                    0.5 + distance / (2 * options.spread)
                                )
                            ) * 255
                        );
                    }
                }
            }
            const wasm = new Uint8ClampedArray(wasmAtlas.data);
            readback.unmap();
            readback.destroy();

            const diff = new Uint8ClampedArray(gpu.length);
            const columns = Math.ceil(Math.sqrt(paths.length));
            const slotSize = wasmAtlas.tileSize + wasmAtlas.gutter * 2;
            const perPath = pathIndices.map((pathIndex) => ({
                pathIndex,
                rgbDifferingPixels: 0,
                medianDifferingPixels: 0,
                nearContourDifferingPixels: 0,
                nearContourPixels: 0,
                signMismatchPixels: 0,
                maximumRgbDelta: 0,
                maximumMedianDelta: 0,
                maximumNearContourMedianDelta: 0,
            }));
            let rgbDifferingPixels = 0;
            let medianDifferingPixels = 0;
            let signMismatchPixels = 0;
            let maximumRgbDelta = 0;
            let maximumMedianDelta = 0;
            let accumulatedRgbDelta = 0;
            let accumulatedMedianDelta = 0;
            let nearContourDifferingPixels = 0;
            let nearContourPixels = 0;
            let maximumNearContourMedianDelta = 0;
            let accumulatedNearContourMedianDelta = 0;
            const median = (r, g, b) =>
                Math.max(Math.min(r, g), Math.min(Math.max(r, g), b));
            const nearContourRadius = (8 * 127) / options.spread;
            for (let offset = 0; offset < gpu.length; offset += 4) {
                const pixel = offset / 4;
                const x = pixel % width;
                const y = Math.floor(pixel / width);
                const pathIndex =
                    Math.floor(y / slotSize) * columns +
                    Math.floor(x / slotSize);
                const path = perPath[pathIndex];
                const redDelta = Math.abs(gpu[offset] - wasm[offset]);
                const greenDelta = Math.abs(gpu[offset + 1] - wasm[offset + 1]);
                const blueDelta = Math.abs(gpu[offset + 2] - wasm[offset + 2]);
                const rgbDelta = Math.max(redDelta, greenDelta, blueDelta);
                const gpuMedian = median(
                    gpu[offset],
                    gpu[offset + 1],
                    gpu[offset + 2]
                );
                const wasmMedian = median(
                    wasm[offset],
                    wasm[offset + 1],
                    wasm[offset + 2]
                );
                const medianDelta = Math.abs(gpuMedian - wasmMedian);
                const signMismatch = gpuMedian >= 128 !== wasmMedian >= 128;
                // Restrict this metric to eight atlas pixels around the edge:
                // the part sampled by ordinary fills, outlines, and AA. Large
                // far-field differences do not affect their reconstruction.
                const nearContour =
                    Math.abs(wasmMedian - 128) <= nearContourRadius;
                if (rgbDelta > differenceThreshold) {
                    rgbDifferingPixels++;
                    if (path) {
                        path.rgbDifferingPixels++;
                    }
                }
                if (medianDelta > differenceThreshold) {
                    medianDifferingPixels++;
                    if (path) {
                        path.medianDifferingPixels++;
                    }
                }
                if (nearContour) {
                    nearContourPixels++;
                    accumulatedNearContourMedianDelta += medianDelta;
                    maximumNearContourMedianDelta = Math.max(
                        maximumNearContourMedianDelta,
                        medianDelta
                    );
                    if (path) {
                        path.nearContourPixels++;
                        path.maximumNearContourMedianDelta = Math.max(
                            path.maximumNearContourMedianDelta,
                            medianDelta
                        );
                    }
                    if (medianDelta > differenceThreshold) {
                        nearContourDifferingPixels++;
                        if (path) {
                            path.nearContourDifferingPixels++;
                        }
                    }
                }
                if (signMismatch) {
                    signMismatchPixels++;
                    if (path) {
                        path.signMismatchPixels++;
                    }
                }
                maximumRgbDelta = Math.max(maximumRgbDelta, rgbDelta);
                maximumMedianDelta = Math.max(maximumMedianDelta, medianDelta);
                accumulatedRgbDelta += rgbDelta;
                accumulatedMedianDelta += medianDelta;
                if (path) {
                    path.maximumRgbDelta = Math.max(
                        path.maximumRgbDelta,
                        rgbDelta
                    );
                    path.maximumMedianDelta = Math.max(
                        path.maximumMedianDelta,
                        medianDelta
                    );
                }
                diff[offset] = Math.min(255, medianDelta * 8);
                diff[offset + 1] = signMismatch ? 0 : diff[offset];
                diff[offset + 2] = signMismatch ? 255 : diff[offset];
                diff[offset + 3] = 255;
                gpu[offset + 3] = 255;
                wasm[offset + 3] = 255;
            }

            const toPng = async (pixels) => {
                const output = new OffscreenCanvas(width, height);
                output
                    .getContext("2d")
                    .putImageData(new ImageData(pixels, width, height), 0, 0);
                const blob = await output.convertToBlob({ type: "image/png" });
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.addEventListener("load", () =>
                        resolve(reader.result)
                    );
                    reader.readAsDataURL(blob);
                });
            };
            const [wgslPng, wasmPng, diffPng] = await Promise.all([
                toPng(gpu),
                toPng(wasm),
                toPng(diff),
            ]);
            generator.destroy();
            renderer.destroy();
            return {
                wgslPng,
                wasmPng,
                diffPng,
                width,
                height,
                rgbDifferingPixels,
                medianDifferingPixels,
                signMismatchPixels,
                maximumRgbDelta,
                maximumMedianDelta,
                nearContourDifferingPixels,
                nearContourPixels,
                maximumNearContourMedianDelta,
                meanMaximumRgbChannelDelta:
                    accumulatedRgbDelta / (width * height),
                meanMedianDelta: accumulatedMedianDelta / (width * height),
                meanNearContourMedianDelta:
                    accumulatedNearContourMedianDelta /
                    Math.max(1, nearContourPixels),
                perPath,
            };
        },
        {
            differenceThreshold: threshold,
            requestedPathIndices: selectedPathIndices,
            atlasOverrides,
        }
    );
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {string} wgsl
 * @param {string} wasm
 */
async function createDiff(page, wgsl, wasm) {
    return page.evaluate(
        async ({
            wgslPng,
            wasmPng,
            differenceThreshold,
            selectedScene,
            requestedPathIndices,
        }) => {
            const load = async (source) => {
                const image = new Image();
                image.src = source;
                await image.decode();
                return image;
            };
            const [wgslImage, wasmImage] = await Promise.all([
                load(wgslPng),
                load(wasmPng),
            ]);
            const width = wgslImage.width;
            const height = wgslImage.height;
            const sourceCanvas = new OffscreenCanvas(width, height);
            const sourceContext = sourceCanvas.getContext("2d");
            sourceContext.drawImage(wgslImage, 0, 0);
            const wgslPixels = sourceContext.getImageData(0, 0, width, height);
            sourceContext.clearRect(0, 0, width, height);
            sourceContext.drawImage(wasmImage, 0, 0);
            const wasmPixels = sourceContext.getImageData(0, 0, width, height);
            const diff = new ImageData(width, height);
            let differingPixels = 0;
            let wgslOnlyPixels = 0;
            let wasmOnlyPixels = 0;
            let coverageMismatchPixels = 0;
            let wgslCoverageOnlyPixels = 0;
            let wasmCoverageOnlyPixels = 0;
            let maximumDelta = 0;
            let accumulatedDelta = 0;
            const symbolStats =
                selectedScene === "path-points"
                    ? (
                          requestedPathIndices ??
                          Array.from({ length: 16 }, (_, index) => index)
                      ).map((pathIndex) => ({
                          differingPixels: 0,
                          wgslOnlyPixels: 0,
                          wasmOnlyPixels: 0,
                          coverageMismatchPixels: 0,
                          wgslCoverageOnlyPixels: 0,
                          wasmCoverageOnlyPixels: 0,
                          pathIndex,
                      }))
                    : [];
            for (let offset = 0; offset < diff.data.length; offset += 4) {
                const redDelta = Math.abs(
                    wgslPixels.data[offset] - wasmPixels.data[offset]
                );
                const greenDelta = Math.abs(
                    wgslPixels.data[offset + 1] - wasmPixels.data[offset + 1]
                );
                const blueDelta = Math.abs(
                    wgslPixels.data[offset + 2] - wasmPixels.data[offset + 2]
                );
                const alphaDelta = Math.abs(
                    wgslPixels.data[offset + 3] - wasmPixels.data[offset + 3]
                );
                const delta = Math.max(
                    redDelta,
                    greenDelta,
                    blueDelta,
                    alphaDelta
                );
                const pixelIndex = offset / 4;
                const x = pixelIndex % width;
                const symbol = symbolStats.length
                    ? symbolStats[
                          Math.min(
                              symbolStats.length - 1,
                              Math.floor((x / width) * symbolStats.length)
                          )
                      ]
                    : null;
                const wgslInk =
                    255 -
                    Math.min(
                        wgslPixels.data[offset],
                        wgslPixels.data[offset + 1],
                        wgslPixels.data[offset + 2]
                    );
                const wasmInk =
                    255 -
                    Math.min(
                        wasmPixels.data[offset],
                        wasmPixels.data[offset + 1],
                        wasmPixels.data[offset + 2]
                    );
                const wgslCoverage = wgslInk >= 128;
                const wasmCoverage = wasmInk >= 128;
                if (wgslCoverage !== wasmCoverage) {
                    coverageMismatchPixels++;
                    if (symbol) {
                        symbol.coverageMismatchPixels++;
                    }
                    if (wgslCoverage) {
                        wgslCoverageOnlyPixels++;
                        if (symbol) {
                            symbol.wgslCoverageOnlyPixels++;
                        }
                    } else {
                        wasmCoverageOnlyPixels++;
                        if (symbol) {
                            symbol.wasmCoverageOnlyPixels++;
                        }
                    }
                }
                maximumDelta = Math.max(maximumDelta, delta);
                accumulatedDelta += delta;
                if (delta > differenceThreshold) {
                    differingPixels++;
                    if (symbol) {
                        symbol.differingPixels++;
                    }
                    const isWgslOnly =
                        wgslInk > differenceThreshold && wasmInk <= 2;
                    const isWasmOnly =
                        wasmInk > differenceThreshold && wgslInk <= 2;
                    if (isWgslOnly) {
                        wgslOnlyPixels++;
                        if (symbol) {
                            symbol.wgslOnlyPixels++;
                        }
                    }
                    if (isWasmOnly) {
                        wasmOnlyPixels++;
                        if (symbol) {
                            symbol.wasmOnlyPixels++;
                        }
                    }
                    if (isWgslOnly) {
                        diff.data[offset] = 255;
                        diff.data[offset + 1] = 0;
                        diff.data[offset + 2] = 255;
                    } else if (isWasmOnly) {
                        diff.data[offset] = 0;
                        diff.data[offset + 1] = 180;
                        diff.data[offset + 2] = 255;
                    } else {
                        diff.data[offset] = 255;
                        diff.data[offset + 1] = Math.max(0, 255 - delta * 2);
                        diff.data[offset + 2] = 0;
                    }
                } else {
                    const luminance = Math.round(
                        wgslPixels.data[offset] * 0.2126 +
                            wgslPixels.data[offset + 1] * 0.7152 +
                            wgslPixels.data[offset + 2] * 0.0722
                    );
                    const faded = 235 + Math.round((luminance / 255) * 20);
                    diff.data[offset] = faded;
                    diff.data[offset + 1] = faded;
                    diff.data[offset + 2] = faded;
                }
                diff.data[offset + 3] = 255;
            }
            sourceContext.putImageData(diff, 0, 0);
            const diffBlob = await sourceCanvas.convertToBlob({
                type: "image/png",
            });
            const diffPng = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.addEventListener("load", () => resolve(reader.result));
                reader.readAsDataURL(diffBlob);
            });
            return {
                diffPng,
                width,
                height,
                differingPixels,
                wgslOnlyPixels,
                wasmOnlyPixels,
                coverageMismatchPixels,
                wgslCoverageOnlyPixels,
                wasmCoverageOnlyPixels,
                differingFraction: differingPixels / (width * height),
                maximumDelta,
                meanMaximumChannelDelta: accumulatedDelta / (width * height),
                symbolStats,
            };
        },
        {
            wgslPng: wgsl,
            wasmPng: wasm,
            differenceThreshold: threshold,
            selectedScene: scene,
            requestedPathIndices: selectedPathIndices,
        }
    );
}

let browser;
try {
    await waitForServer();
    const angleBackend =
        process.platform === "darwin" ? "metal" : "swiftshader";
    browser = await chromium.launch({
        channel: "chrome",
        args: [
            "--enable-unsafe-webgpu",
            "--enable-features=WebGPU",
            "--ignore-gpu-blocklist",
            `--use-angle=${angleBackend}`,
        ],
    });
    const page = await browser.newPage({
        viewport: { width: 960, height: 340 },
    });
    await page.goto(serverUrl);
    const wgsl = await renderBackend(page, "gpu");
    const wasm = await renderBackend(page, "wasm");
    const comparison = await createDiff(page, wgsl, wasm);
    const atlasComparison =
        scene === "path-points" ? await comparePathPointAtlases(page) : null;
    await mkdir(outputDirectory, { recursive: true });
    const writes = [
        writeFile(
            path.join(outputDirectory, `${outputStem}-wgsl.png`),
            decodePng(wgsl)
        ),
        writeFile(
            path.join(outputDirectory, `${outputStem}-wasm.png`),
            decodePng(wasm)
        ),
        writeFile(
            path.join(outputDirectory, `${outputStem}-diff.png`),
            decodePng(comparison.diffPng)
        ),
    ];
    if (atlasComparison) {
        writes.push(
            writeFile(
                path.join(outputDirectory, `${outputStem}-atlas-wgsl.png`),
                decodePng(atlasComparison.wgslPng)
            ),
            writeFile(
                path.join(outputDirectory, `${outputStem}-atlas-wasm.png`),
                decodePng(atlasComparison.wasmPng)
            ),
            writeFile(
                path.join(outputDirectory, `${outputStem}-atlas-diff.png`),
                decodePng(atlasComparison.diffPng)
            )
        );
    }
    await Promise.all(writes);
    console.log(
        JSON.stringify(
            {
                outputDirectory,
                scene,
                threshold,
                dpr,
                wgslFormat,
                pointSize,
                pointStrokeWidth,
                pathIndices: selectedPathIndices,
                width: comparison.width,
                height: comparison.height,
                differingPixels: comparison.differingPixels,
                wgslOnlyPixels: comparison.wgslOnlyPixels,
                wasmOnlyPixels: comparison.wasmOnlyPixels,
                coverageMismatchPixels: comparison.coverageMismatchPixels,
                wgslCoverageOnlyPixels: comparison.wgslCoverageOnlyPixels,
                wasmCoverageOnlyPixels: comparison.wasmCoverageOnlyPixels,
                differingFraction: comparison.differingFraction,
                maximumDelta: comparison.maximumDelta,
                meanMaximumChannelDelta: comparison.meanMaximumChannelDelta,
                symbolStats: comparison.symbolStats,
                ...(atlasComparison
                    ? {
                          atlas: {
                              width: atlasComparison.width,
                              height: atlasComparison.height,
                              rgbDifferingPixels:
                                  atlasComparison.rgbDifferingPixels,
                              medianDifferingPixels:
                                  atlasComparison.medianDifferingPixels,
                              signMismatchPixels:
                                  atlasComparison.signMismatchPixels,
                              maximumRgbDelta: atlasComparison.maximumRgbDelta,
                              maximumMedianDelta:
                                  atlasComparison.maximumMedianDelta,
                              nearContourDifferingPixels:
                                  atlasComparison.nearContourDifferingPixels,
                              nearContourPixels:
                                  atlasComparison.nearContourPixels,
                              maximumNearContourMedianDelta:
                                  atlasComparison.maximumNearContourMedianDelta,
                              meanMaximumRgbChannelDelta:
                                  atlasComparison.meanMaximumRgbChannelDelta,
                              meanMedianDelta: atlasComparison.meanMedianDelta,
                              meanNearContourMedianDelta:
                                  atlasComparison.meanNearContourMedianDelta,
                              perPath: atlasComparison.perPath,
                          },
                      }
                    : {}),
            },
            null,
            2
        )
    );
} finally {
    await browser?.close();
    server.kill("SIGTERM");
}
