/* global Buffer, console, document, fetch, getComputedStyle, process, setTimeout, URL, window */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { inflateSync } from "node:zlib";

const scriptPath = fileURLToPath(import.meta.url);
const packageDir = path.resolve(path.dirname(scriptPath), "..");
const appPackageDir = path.resolve(packageDir, "..", "app");
const repoRoot = path.resolve(packageDir, "..", "..");
const examplesDir = path.join(repoRoot, "examples");
const defaultServerOrigin = "http://127.0.0.1:4173";
const harnessPath = "/screenshot.html";
const healthCheckPath = "/__health";
const defaultCoreOutputDir = path.join(repoRoot, "output", "webgpu-core");
const defaultAppOutputDir = path.join(repoRoot, "output", "webgpu-app");
const defaultTimeoutMs = 30_000;
const harnessTimeoutPaddingMs = 60_000;
const maxMeanAbsoluteError = 0.06;
const maxChangedPixelRatio = 0.15;

const helpText = `Usage:
  node packages/core/scripts/runWebGpuExamples.mjs [options] [examples/...json ...]

Options:
  --all                 Run every JSON example in the selected scope.
  --scope NAME          Example scope: core (default) or app.
  --match REGEXP        Run discovered examples whose path matches REGEXP.
  --renderer NAME       Renderer to test: webgpu (default) or webgl.
  --compare-webgl       Run a WebGL pass and pixel-stat comparison for each selection.
  --check-picking       Require a datum-backed hover hit (App only).
  --server-url URL      Use an already running dev server for the selected scope.
  --output-dir DIR      Store screenshots and reports in DIR.
  --dpr NUMBER          Browser device pixel ratio (default: 1).
  --width NUMBER        App frame width in CSS pixels (default: 1200).
  --height NUMBER       App frame height in CSS pixels (default: 700).
  --timeout-ms NUMBER   Wait limit for example initialization and visible lazy data.
  --fail-on-warning     Treat browser console warnings as failures.
  --help                Show this help text.

The default output directory is output/webgpu-core or output/webgpu-app and is
ignored by Git. App comparisons fail when mean RGB error exceeds 6% or more
than 15% of pixels differ by over 32/255 in any channel. Positional paths may
be full examples/... paths, the private MCCA spec, or paths relative to examples/.`;

/**
 * @typedef {object} RunnerOptions
 * @property {boolean} help
 * @property {string[]} examplePaths
 * @property {RegExp | undefined} match
 * @property {"core" | "app"} scope
 * @property {"webgpu" | "webgl"} renderer
 * @property {boolean} compareWebgl
 * @property {boolean} checkPicking
 * @property {string | undefined} serverUrl
 * @property {string} outputDir
 * @property {number} dpr
 * @property {number} width
 * @property {number} height
 * @property {number} timeoutMs
 * @property {boolean} failOnWarning
 */

export async function main(args = process.argv.slice(2)) {
    const options = parseArgs(args);
    if (options.help) {
        console.log(helpText);
        return;
    }

    const examplePaths = selectExamples(options);
    if (!examplePaths.length) {
        throw new Error("No examples selected.");
    }

    fs.mkdirSync(options.outputDir, { recursive: true });
    const playwright = await loadPlaywright();
    const server =
        options.serverUrl === undefined
            ? await startDevServer(
                  defaultServerOrigin,
                  options.scope === "app" ? appPackageDir : packageDir
              )
            : undefined;
    const serverOrigin = options.serverUrl ?? defaultServerOrigin;

    try {
        await waitForServer(serverOrigin, server);
        const browser = await playwright.chromium.launch({
            args: getBrowserArgs(),
        });
        try {
            const results = [];
            for (const examplePath of examplePaths) {
                results.push(
                    await runExample(
                        browser,
                        serverOrigin,
                        examplePath,
                        options.renderer,
                        options.outputDir,
                        options.timeoutMs,
                        options.failOnWarning,
                        options.dpr,
                        options.width,
                        options.height,
                        options.checkPicking
                    )
                );
            }

            const comparisons = [];
            if (options.compareWebgl) {
                for (const webgpu of results) {
                    const webgl = await runExample(
                        browser,
                        serverOrigin,
                        webgpu.examplePath,
                        "webgl",
                        options.outputDir,
                        options.timeoutMs,
                        options.failOnWarning,
                        options.dpr,
                        options.width,
                        options.height,
                        options.checkPicking
                    );
                    comparisons.push({
                        examplePath: webgpu.examplePath,
                        webgpu,
                        webgl,
                        comparison: compareScreenshots(
                            webgpu,
                            webgl,
                            options.scope
                        ),
                    });
                }
            }

            const summary = {
                generatedAt: new Date().toISOString(),
                serverOrigin,
                scope: options.scope,
                selectedCount: examplePaths.length,
                renderer: options.renderer,
                compareWebgl: options.compareWebgl,
                dpr: options.dpr,
                width: options.width,
                height: options.height,
                results,
                comparisons,
            };
            const summaryPath = path.join(options.outputDir, "summary.json");
            const reportPath = path.join(
                options.outputDir,
                "failure-report.md"
            );
            fs.writeFileSync(
                summaryPath,
                `${JSON.stringify(summary, null, 2)}\n`
            );
            fs.writeFileSync(reportPath, createFailureReport(summary));

            const failed = results.filter(
                (result) => result.status === "failed"
            );
            const failedComparisons = comparisons.filter(
                ({ comparison }) => comparison.status === "failed"
            );
            console.log(
                `Checked ${results.length} ${options.renderer} example${results.length === 1 ? "" : "s"}: ` +
                    `${results.length - failed.length} passed, ${failed.length} failed.`
            );
            console.log(`Machine summary: ${summaryPath}`);
            console.log(`Failure report: ${reportPath}`);
            if (
                failed.length ||
                comparisons.some(({ webgl }) => webgl.status === "failed") ||
                failedComparisons.length
            ) {
                process.exitCode = 1;
            }
        } finally {
            await browser.close();
        }
    } finally {
        await stopServer(server);
    }
}

/**
 * @param {import("playwright").Browser} browser
 * @param {string} serverOrigin
 * @param {string} examplePath
 * @param {"webgpu" | "webgl"} renderer
 * @param {string} outputDir
 * @param {number} timeoutMs
 * @param {boolean} failOnWarning
 * @param {number} dpr
 * @param {number} width
 * @param {number} height
 * @param {boolean} checkPicking
 */
async function runExample(
    browser,
    serverOrigin,
    examplePath,
    renderer,
    outputDir,
    timeoutMs,
    failOnWarning,
    dpr,
    width,
    height,
    checkPicking
) {
    const startedAt = Date.now();
    const result = {
        examplePath,
        renderer,
        status: "passed",
        durationMs: 0,
        screenshot: undefined,
        consoleErrors: [],
        consoleWarnings: [],
        pageErrors: [],
        requestFailures: [],
        renderingFailures: [],
        canvas: undefined,
        picking: undefined,
        detail: undefined,
    };
    const page = await browser.newPage({
        deviceScaleFactor: dpr,
        viewport: { width, height },
    });
    const prefix = `${renderer}-${examplePath
        .replaceAll("/", "__")
        .replace(/\.json$/, "")}${dpr === 1 ? "" : `-dpr${dpr}`}`;
    const screenshotPath = path.join(outputDir, `${prefix}.png`);
    result.screenshot = path
        .relative(repoRoot, screenshotPath)
        .replaceAll(path.sep, "/");

    page.on("console", (message) => {
        const detail = `[${message.type()}] ${message.text()}`;
        if (message.type() === "error") {
            result.consoleErrors.push(detail);
        } else if (message.type() === "warning") {
            result.consoleWarnings.push(detail);
            if (isWebGpuValidationWarning(message.text())) {
                result.renderingFailures.push(detail);
            }
        }
    });
    page.on("pageerror", (error) => result.pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
        result.requestFailures.push(
            `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "request failed"}`
        );
    });
    page.on("response", (response) => {
        if (response.status() >= 400) {
            result.requestFailures.push(
                `${response.status()} ${response.url()}`
            );
        }
    });

    try {
        const url = new URL(harnessPath, serverOrigin);
        url.searchParams.set("spec", `/${examplePath}`);
        url.searchParams.set("renderer", renderer);
        url.searchParams.set("lazy-timeout-ms", String(timeoutMs));
        url.searchParams.set("width", String(width));
        url.searchParams.set("height", String(height));
        await page.goto(url.toString(), {
            waitUntil: "load",
            timeout: timeoutMs,
        });
        await page.waitForFunction(
            () =>
                window.__genomeSpyScreenshot?.status === "ready" ||
                window.__genomeSpyScreenshot?.status === "error",
            { timeout: timeoutMs + harnessTimeoutPaddingMs }
        );

        const state = await page.evaluate(() => ({
            status: window.__genomeSpyScreenshot?.status,
            detail: window.__genomeSpyScreenshot?.detail,
            error: window.__genomeSpyScreenshot?.error,
        }));
        if (state.status !== "ready") {
            result.renderingFailures.push(
                state.error ||
                    state.detail ||
                    "Screenshot harness did not become ready."
            );
        }

        if (state.status === "ready") {
            const canvas = await inspectCanvas(page, screenshotPath);
            result.canvas = canvas.metrics;
            result.renderingFailures.push(...canvas.failures);
            if (checkPicking) {
                result.picking = await inspectPicking(page);
                result.renderingFailures.push(...result.picking.failures);
            }
        }
    } catch (error) {
        result.renderingFailures.push(
            error instanceof Error ? error.message : String(error)
        );
    } finally {
        await page.close();
    }

    if (
        result.consoleErrors.length ||
        result.pageErrors.length ||
        result.requestFailures.length ||
        (failOnWarning && result.consoleWarnings.length) ||
        result.renderingFailures.length
    ) {
        result.status = "failed";
    }
    result.durationMs = Date.now() - startedAt;
    console.log(
        `${result.status === "passed" ? "PASS" : "FAIL"} ${renderer} ${examplePath}`
    );
    return result;
}

async function inspectPicking(page) {
    const canvas = page.locator("#frame canvas");
    const box = await canvas.boundingBox();
    if (!box) {
        return {
            failures: ["Cannot check picking without a visible canvas."],
        };
    }

    const probeFractions = [
        [0.5, 0.25],
        [0.35, 0.25],
        [0.65, 0.25],
        [0.5, 0.4],
        [0.35, 0.4],
        [0.65, 0.4],
    ];
    const probes = [];
    for (const [xFraction, yFraction] of probeFractions) {
        const x = box.x + box.width * xFraction;
        const y = box.y + box.height * yFraction;
        await page.mouse.move(x, y);
        // SwiftShader readback can take noticeably longer than hardware WebGPU.
        await page.waitForTimeout(3_000);
        probes.push(await readPickingState(page, xFraction, yFraction));
    }

    const hit = probes.find((probe) => probe.hasHover && probe.datum);
    if (hit) {
        return { ...hit, probes, failures: [] };
    }
    return {
        probes,
        failures: ["Picking probes did not resolve a datum-backed hover."],
    };
}

async function readPickingState(page, xFraction, yFraction) {
    return page.evaluate(
        ([probeX, probeY]) => {
            const root = window.__genomeSpyAppHarness?.api.debug.getViewRoot();
            const hover = root?.context.getCurrentHover();
            const tooltip = document.querySelector(".gs-tooltip");
            const style = tooltip ? getComputedStyle(tooltip) : undefined;
            return {
                xFraction: probeX,
                yFraction: probeY,
                hasHover: !!hover,
                uniqueId: hover?.uniqueId,
                datum: hover?.datum,
                tooltipProperty: hover?.mark?.properties?.tooltip,
                tooltipEncoding: hover?.mark?.encoding?.tooltip,
                tooltipText: tooltip?.textContent.trim(),
                tooltipDisplay: style?.display,
                tooltipVisible:
                    !!tooltip &&
                    style.display !== "none" &&
                    style.visibility !== "hidden" &&
                    tooltip.textContent.trim().length > 0,
            };
        },
        [xFraction, yFraction]
    );
}

function isWebGpuValidationWarning(message) {
    return /WebGPU|WGSL|Invalid Shader|Invalid Render|Invalid Command|validation/i.test(
        message
    );
}

async function inspectCanvas(page, screenshotPath) {
    const canvasElements = page.locator("#frame canvas");
    const canvasCount = await canvasElements.count();
    const geometry = await page.evaluate(() =>
        Array.from(document.querySelectorAll("#frame canvas"), (canvas) => {
            const rect = canvas.getBoundingClientRect();
            return {
                width: rect.width,
                height: rect.height,
                backingWidth: canvas.width,
                backingHeight: canvas.height,
            };
        })
    );
    const failures = [];
    if (canvasCount !== 1) {
        failures.push(`Expected one rendered canvas, found ${canvasCount}.`);
    }

    const first = geometry[0];
    if (
        !first ||
        first.width <= 0 ||
        first.height <= 0 ||
        first.backingWidth <= 0 ||
        first.backingHeight <= 0
    ) {
        failures.push(
            `Canvas has no visible size: ${JSON.stringify(first ?? null)}.`
        );
    }

    let metrics;
    if (canvasCount === 1 && first?.width > 0 && first?.height > 0) {
        await canvasElements.screenshot({ path: screenshotPath });
        try {
            const image = inspectPng(fs.readFileSync(screenshotPath));
            metrics = { ...first, canvasCount, ...image };
            if (image.nonDominantRatio < 0.002 || image.distinctColors < 3) {
                failures.push(
                    `Canvas appears empty: ${image.distinctColors} quantized colors and ` +
                        `${(image.nonDominantRatio * 100).toFixed(3)}% non-dominant pixels.`
                );
            }
        } catch (error) {
            failures.push(
                `Could not inspect canvas screenshot: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }
    return { metrics, failures };
}

function inspectPng(data) {
    const decoded = decodePng(data);
    return {
        distinctColors: decoded.distinctColors,
        nonDominantRatio: decoded.nonDominantRatio,
    };
}

function decodePng(data) {
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (!data.subarray(0, 8).equals(signature)) {
        throw new Error("Screenshot is not a PNG.");
    }
    let width;
    let height;
    let colorType;
    let bitDepth;
    let interlace;
    const compressed = [];
    let offset = 8;
    while (offset < data.length) {
        const length = data.readUInt32BE(offset);
        const type = data.toString("ascii", offset + 4, offset + 8);
        const body = data.subarray(offset + 8, offset + 8 + length);
        if (type === "IHDR") {
            width = body.readUInt32BE(0);
            height = body.readUInt32BE(4);
            bitDepth = body[8];
            colorType = body[9];
            interlace = body[12];
        } else if (type === "IDAT") {
            compressed.push(body);
        } else if (type === "IEND") {
            break;
        }
        offset += length + 12;
    }
    if (
        bitDepth !== 8 ||
        (colorType !== 2 && colorType !== 6) ||
        interlace !== 0
    ) {
        throw new Error(
            "Only non-interlaced 8-bit RGB/RGBA PNGs are supported."
        );
    }
    const bytesPerPixel = colorType === 6 ? 4 : 3;
    const rowBytes = width * bytesPerPixel;
    const filtered = inflateSync(Buffer.concat(compressed));
    const pixels = Buffer.alloc(height * rowBytes);
    let sourceOffset = 0;
    for (let y = 0; y < height; y += 1) {
        const filter = filtered[sourceOffset++];
        const rowStart = y * rowBytes;
        for (let x = 0; x < rowBytes; x += 1) {
            const raw = filtered[sourceOffset++];
            const left =
                x >= bytesPerPixel ? pixels[rowStart + x - bytesPerPixel] : 0;
            const above = y > 0 ? pixels[rowStart - rowBytes + x] : 0;
            const upperLeft =
                y > 0 && x >= bytesPerPixel
                    ? pixels[rowStart - rowBytes + x - bytesPerPixel]
                    : 0;
            pixels[rowStart + x] = unfilter(
                filter,
                raw,
                left,
                above,
                upperLeft
            );
        }
    }

    const buckets = new Map();
    for (let index = 0; index < pixels.length; index += bytesPerPixel) {
        const bucket = `${pixels[index] >> 4},${pixels[index + 1] >> 4},${pixels[index + 2] >> 4}`;
        buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
    const dominant = Math.max(...buckets.values());
    return {
        width,
        height,
        bytesPerPixel,
        pixels,
        distinctColors: buckets.size,
        nonDominantRatio: 1 - dominant / (width * height),
    };
}

function unfilter(filter, raw, left, above, upperLeft) {
    if (filter === 0) return raw;
    if (filter === 1) return (raw + left) & 255;
    if (filter === 2) return (raw + above) & 255;
    if (filter === 3) return (raw + Math.floor((left + above) / 2)) & 255;
    if (filter === 4) {
        const predictor = left + above - upperLeft;
        const pa = Math.abs(predictor - left);
        const pb = Math.abs(predictor - above);
        const pc = Math.abs(predictor - upperLeft);
        return (
            (raw +
                (pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft)) &
            255
        );
    }
    throw new Error(`Unsupported PNG filter ${filter}.`);
}

function compareScreenshots(webgpu, webgl, scope) {
    if (webgpu.status === "failed" || webgl.status === "failed") {
        return { status: "unavailable", reason: "One renderer failed." };
    }
    if (!webgpu.screenshot || !webgl.screenshot) {
        return { status: "unavailable", reason: "A screenshot is missing." };
    }
    const gpu = decodePng(
        fs.readFileSync(path.join(repoRoot, webgpu.screenshot))
    );
    const gl = decodePng(
        fs.readFileSync(path.join(repoRoot, webgl.screenshot))
    );
    if (gpu.width !== gl.width || gpu.height !== gl.height) {
        return {
            status: "failed",
            reason: `Screenshot dimensions differ: ${gpu.width}x${gpu.height} vs ${gl.width}x${gl.height}.`,
        };
    }

    let absoluteError = 0;
    let changedPixels = 0;
    const pixelCount = gpu.width * gpu.height;
    for (let pixel = 0; pixel < pixelCount; pixel++) {
        const gpuOffset = pixel * gpu.bytesPerPixel;
        const glOffset = pixel * gl.bytesPerPixel;
        let maximumDifference = 0;
        for (let channel = 0; channel < 3; channel++) {
            const difference = Math.abs(
                gpu.pixels[gpuOffset + channel] - gl.pixels[glOffset + channel]
            );
            absoluteError += difference;
            maximumDifference = Math.max(maximumDifference, difference);
        }
        if (maximumDifference > 32) {
            changedPixels++;
        }
    }
    const meanAbsoluteError = absoluteError / (pixelCount * 3 * 255);
    const changedPixelRatio = changedPixels / pixelCount;
    const picking = comparePicking(webgpu.picking, webgl.picking);
    const materialDifference =
        meanAbsoluteError > maxMeanAbsoluteError ||
        changedPixelRatio > maxChangedPixelRatio ||
        picking.status === "failed";
    return {
        status:
            scope === "app"
                ? materialDifference
                    ? "failed"
                    : "passed"
                : "available",
        meanAbsoluteError,
        changedPixelRatio,
        picking,
        thresholds: {
            maxMeanAbsoluteError,
            maxChangedPixelRatio,
            changedPixelChannelDifference: 32 / 255,
        },
        webgpu: {
            distinctColors: gpu.distinctColors,
            nonDominantRatio: gpu.nonDominantRatio,
        },
        webgl: {
            distinctColors: gl.distinctColors,
            nonDominantRatio: gl.nonDominantRatio,
        },
    };
}

function comparePicking(webgpu, webgl) {
    if (!webgpu && !webgl) {
        return { status: "not-checked" };
    }
    if (!webgpu?.probes || !webgl?.probes) {
        return { status: "failed", reason: "One picking result is missing." };
    }

    for (const gpuProbe of webgpu.probes) {
        const glProbe = webgl.probes.find(
            (probe) =>
                probe.xFraction === gpuProbe.xFraction &&
                probe.yFraction === gpuProbe.yFraction
        );
        if (
            gpuProbe.datum &&
            glProbe?.datum &&
            JSON.stringify(gpuProbe.datum) === JSON.stringify(glProbe.datum)
        ) {
            return {
                status: "passed",
                xFraction: gpuProbe.xFraction,
                yFraction: gpuProbe.yFraction,
                datum: gpuProbe.datum,
            };
        }
    }
    return {
        status: "failed",
        reason: "No picking probe resolved the same datum under both renderers.",
    };
}

function createFailureReport(summary) {
    const failed = summary.results.filter(
        (result) => result.status === "failed"
    );
    const lines = [
        `# WebGPU ${summary.scope === "app" ? "App" : "Core"} example runner report`,
        "",
        `Generated: ${summary.generatedAt}`,
        `Renderer: ${summary.renderer}`,
        `DPR: ${summary.dpr}`,
        `Frame: ${summary.width} x ${summary.height}`,
        `Selected examples: ${summary.selectedCount}`,
        `Passed: ${summary.results.length - failed.length}`,
        `Failed: ${failed.length}`,
        "",
        failed.length ? "## Failures" : "## Failures\n\nNo failures detected.",
        "",
    ];
    for (const result of failed) {
        lines.push(
            `### ${result.examplePath}`,
            "",
            `- Renderer: ${result.renderer}`
        );
        addReportItems(lines, "Rendering failures", result.renderingFailures);
        addReportItems(lines, "Console errors", result.consoleErrors);
        addReportItems(lines, "Uncaught exceptions", result.pageErrors);
        addReportItems(lines, "Failed requests", result.requestFailures);
        addReportItems(lines, "Console warnings", result.consoleWarnings);
        lines.push(`- Screenshot: ${result.screenshot ?? "not captured"}`, "");
    }
    if (summary.comparisons.length) {
        lines.push(
            "## WebGL comparisons",
            "",
            summary.scope === "app"
                ? "App comparisons enforce the documented material-difference thresholds."
                : "Core pixel statistics are diagnostic only; backend antialiasing can differ.",
            ""
        );
        for (const comparison of summary.comparisons) {
            lines.push(
                `- ${comparison.examplePath}: ${comparison.comparison.status}`
            );
        }
        lines.push("");
    }
    return `${lines.join("\n")}\n`;
}

function addReportItems(lines, title, items) {
    if (items.length)
        lines.push(`- ${title}:`, ...items.map((item) => `  - ${item}`));
}

function selectExamples(options) {
    const discovered = collectExamples(options.scope);
    const requested = options.examplePaths.length
        ? options.examplePaths.map(normalizeExamplePath)
        : discovered;
    const selected = requested.filter(
        (examplePath) => !options.match || options.match.test(examplePath)
    );
    for (const examplePath of selected) {
        if (
            !discovered.includes(examplePath) &&
            !(
                options.scope === "app" &&
                examplePath.startsWith("private/") &&
                fs.existsSync(path.join(repoRoot, examplePath))
            )
        ) {
            throw new Error(`No ${options.scope} example spec: ${examplePath}`);
        }
    }
    return selected;
}

/** @param {"core" | "app"} scope */
function collectExamples(scope) {
    const paths = [];
    const groups = scope === "app" ? ["app"] : ["core", "docs"];
    for (const group of groups) {
        visit(path.join(examplesDir, group), (absolutePath) => {
            paths.push(
                path.relative(repoRoot, absolutePath).replaceAll(path.sep, "/")
            );
        });
    }
    return paths.sort();
}

function visit(dir, visitor) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const absolutePath = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(absolutePath, visitor);
        else if (entry.isFile() && entry.name.endsWith(".json"))
            visitor(absolutePath);
    }
}

function normalizeExamplePath(examplePath) {
    const normalized = examplePath.replaceAll("\\", "/");
    return normalized.startsWith("examples/") ||
        normalized.startsWith("private/")
        ? normalized
        : `examples/${normalized}`;
}

function parseArgs(args) {
    const options = {
        help: false,
        examplePaths: [],
        match: undefined,
        scope: "core",
        renderer: "webgpu",
        compareWebgl: false,
        checkPicking: false,
        serverUrl: undefined,
        outputDir: undefined,
        dpr: 1,
        width: 1200,
        height: 700,
        timeoutMs: defaultTimeoutMs,
        failOnWarning: false,
    };
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === "--help" || arg === "-h") options.help = true;
        else if (arg === "--all") continue;
        else if (arg === "--scope") {
            const scope = requireValue(args, ++index, arg);
            if (scope !== "core" && scope !== "app") {
                throw new Error(`Unknown scope: ${scope}`);
            }
            options.scope = scope;
        } else if (arg === "--compare-webgl") options.compareWebgl = true;
        else if (arg === "--check-picking") options.checkPicking = true;
        else if (arg === "--fail-on-warning") options.failOnWarning = true;
        else if (arg === "--match")
            options.match = new RegExp(requireValue(args, ++index, arg));
        else if (arg === "--renderer") {
            const renderer = requireValue(args, ++index, arg);
            if (renderer !== "webgpu" && renderer !== "webgl") {
                throw new Error(`Unknown renderer: ${renderer}`);
            }
            options.renderer = renderer;
        } else if (arg === "--server-url") {
            options.serverUrl = requireValue(args, ++index, arg);
        } else if (arg === "--output-dir") {
            options.outputDir = path.resolve(requireValue(args, ++index, arg));
        } else if (arg === "--dpr") {
            options.dpr = Number(requireValue(args, ++index, arg));
            if (!Number.isFinite(options.dpr) || options.dpr <= 0) {
                throw new Error("--dpr must be positive.");
            }
        } else if (arg === "--width" || arg === "--height") {
            const value = Number(requireValue(args, ++index, arg));
            if (!Number.isInteger(value) || value <= 0) {
                throw new Error(`${arg} must be a positive integer.`);
            }
            if (arg === "--width") options.width = value;
            else options.height = value;
        } else if (arg === "--timeout-ms") {
            options.timeoutMs = Number(requireValue(args, ++index, arg));
            if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
                throw new Error("--timeout-ms must be positive.");
            }
        } else if (arg.startsWith("--")) {
            throw new Error(`Unknown option: ${arg}`);
        } else {
            options.examplePaths.push(arg);
        }
    }
    options.outputDir ??=
        options.scope === "app" ? defaultAppOutputDir : defaultCoreOutputDir;
    if (options.checkPicking && options.scope !== "app") {
        throw new Error("--check-picking is only available with --scope app.");
    }
    return options;
}

function requireValue(args, index, option) {
    const value = args[index];
    if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${option}.`);
    }
    return value;
}

function getBrowserArgs() {
    const args = [
        "--enable-unsafe-webgpu",
        "--enable-features=WebGPU",
        "--ignore-gpu-blocklist",
    ];
    if (process.platform === "darwin") args.push("--use-angle=metal");
    else args.push("--use-angle=swiftshader");
    return args;
}

async function startDevServer(serverOrigin, serverPackageDir) {
    const port = String(new URL(serverOrigin).port || "4173");
    const child = spawn("node", ["dev-server.mjs"], {
        cwd: serverPackageDir,
        env: { ...process.env, PORT: port },
        stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    return child;
}

async function stopServer(child) {
    if (!child || child.exitCode !== null) return;
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
}

async function waitForServer(serverOrigin, child) {
    const url = new URL(healthCheckPath, serverOrigin);
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
        if (child && child.exitCode !== null && child.exitCode !== undefined) {
            throw new Error(
                `Core dev server exited with code ${child.exitCode}.`
            );
        }
        try {
            if ((await fetch(url)).ok) return;
        } catch {
            // The server may still be starting.
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out while waiting for ${url}.`);
}

async function loadPlaywright() {
    try {
        return await import("playwright");
    } catch {
        throw new Error(
            'The WebGPU example runner requires the "playwright" package.'
        );
    }
}

if (path.resolve(process.argv[1] ?? "") === scriptPath) {
    await main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
