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
        : scene === "path-points"
          ? "rgba8unorm"
          : "rgba16float";
const pointSizeArgument = process.argv.indexOf("--point-size");
const pointSize =
    pointSizeArgument >= 0 && process.argv[pointSizeArgument + 1]
        ? Number(process.argv[pointSizeArgument + 1])
        : 60;

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
            selectedAtlasOverrides,
            selectedPointAngles,
        }) => {
            const [{ createRenderer }, { pathPointMark }, { identityScale }] =
                await Promise.all([
                    import("/src/index.js"),
                    import("/src/marks/pathPoint.js"),
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
                    import("/src/fonts/trueTypeFont.js"),
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
                const rowAngles = selectedPointAngles;
                const cellWidth = 76;
                paths = PATHS;
                atlasOptions = Object.fromEntries(
                    Object.entries({
                        ...PATH_POINT_ATLAS_OPTIONS,
                        ...selectedAtlasOverrides,
                    }).filter(([, value]) => value !== undefined)
                );
                width = PATHS.length * cellWidth;
                height = rowAngles.length * 80 + 20;
                const instances = PATHS.flatMap((_, pathIndex) =>
                    rowAngles.map((rowAngle, row) => ({
                        x: (pathIndex + 0.5) * cellWidth,
                        y: 50 + row * 80,
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
                strokeWidth = new Float32Array(instances.length).fill(4);
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
            const handle = renderer.createMark(pathPointMark, {
                count,
                paths,
                atlasBackend: selectedBackend,
                atlasFormat:
                    selectedBackend === "gpu"
                        ? selectedWgslFormat
                        : "rgba8unorm",
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
            selectedAtlasOverrides: atlasOverrides,
            selectedPointAngles: pointAngles,
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
        async ({ wgslPng, wasmPng, differenceThreshold, selectedScene }) => {
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
                    ? Array.from({ length: 16 }, (_, pathIndex) => ({
                          pathIndex,
                          differingPixels: 0,
                          wgslOnlyPixels: 0,
                          wasmOnlyPixels: 0,
                          coverageMismatchPixels: 0,
                          wgslCoverageOnlyPixels: 0,
                          wasmCoverageOnlyPixels: 0,
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
    await mkdir(outputDirectory, { recursive: true });
    await Promise.all([
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
    ]);
    console.log(
        JSON.stringify(
            {
                outputDirectory,
                scene,
                threshold,
                dpr,
                wgslFormat,
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
            },
            null,
            2
        )
    );
} finally {
    await browser?.close();
    server.kill("SIGTERM");
}
