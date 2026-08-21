/* global Buffer, console, document, fetch, process, setTimeout, URL, window */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { inflateSync } from "node:zlib";

const scriptPath = fileURLToPath(import.meta.url);
const packageDir = path.resolve(path.dirname(scriptPath), "..");
const repoRoot = path.resolve(packageDir, "..", "..");
const examplesDir = path.join(repoRoot, "examples");
const defaultServerOrigin = "http://127.0.0.1:4173";
const harnessPath = "/screenshot.html";
const healthCheckPath = "/__health";
const defaultOutputDir = path.join(repoRoot, "output", "webgpu-core");
const defaultTimeoutMs = 30_000;
const harnessTimeoutPaddingMs = 60_000;

const helpText = `Usage:
  node packages/core/scripts/runWebGpuExamples.mjs [options] [examples/...json ...]

Options:
  --all                 Run every JSON example under examples/core and examples/docs.
  --match REGEXP        Run discovered examples whose path matches REGEXP.
  --renderer NAME       Renderer to test: webgpu (default) or webgl.
  --compare-webgl       Run a WebGL pass and pixel-stat comparison for each selection.
  --server-url URL      Use an already running Core dev server.
  --output-dir DIR      Store screenshots and reports in DIR (default: output/webgpu-core).
  --timeout-ms NUMBER   Wait limit for example initialization and visible lazy data.
  --fail-on-warning     Treat browser console warnings as failures.
  --help                Show this help text.

The default output directory is ignored by Git. Positional paths may be full
examples/... paths or paths relative to examples/.`;

/**
 * @typedef {object} RunnerOptions
 * @property {boolean} help
 * @property {string[]} examplePaths
 * @property {RegExp | undefined} match
 * @property {"webgpu" | "webgl"} renderer
 * @property {boolean} compareWebgl
 * @property {string | undefined} serverUrl
 * @property {string} outputDir
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
            ? await startDevServer(defaultServerOrigin)
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
                        options.failOnWarning
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
                        options.failOnWarning
                    );
                    comparisons.push({
                        examplePath: webgpu.examplePath,
                        webgpu,
                        webgl,
                        comparison: compareScreenshots(webgpu, webgl),
                    });
                }
            }

            const summary = {
                generatedAt: new Date().toISOString(),
                serverOrigin,
                selectedCount: examplePaths.length,
                renderer: options.renderer,
                compareWebgl: options.compareWebgl,
                results,
                comparisons,
            };
            const summaryPath = path.join(options.outputDir, "summary.json");
            const reportPath = path.join(options.outputDir, "failure-report.md");
            fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
            fs.writeFileSync(reportPath, createFailureReport(summary));

            const failed = results.filter((result) => result.status === "failed");
            console.log(
                `Checked ${results.length} ${options.renderer} example${results.length === 1 ? "" : "s"}: ` +
                    `${results.length - failed.length} passed, ${failed.length} failed.`
            );
            console.log(`Machine summary: ${summaryPath}`);
            console.log(`Failure report: ${reportPath}`);
            if (failed.length || comparisons.some(({ webgl }) => webgl.status === "failed")) {
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
 */
async function runExample(
    browser,
    serverOrigin,
    examplePath,
    renderer,
    outputDir,
    timeoutMs,
    failOnWarning
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
        detail: undefined,
    };
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const prefix = `${renderer}-${examplePath
        .replaceAll("/", "__")
        .replace(/\.json$/, "")}`;
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
            result.requestFailures.push(`${response.status()} ${response.url()}`);
        }
    });

    try {
        const url = new URL(harnessPath, serverOrigin);
        url.searchParams.set("spec", `/${examplePath}`);
        url.searchParams.set("renderer", renderer);
        url.searchParams.set("lazy-timeout-ms", String(timeoutMs));
        await page.goto(url.toString(), { waitUntil: "load", timeout: timeoutMs });
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
                state.error || state.detail || "Screenshot harness did not become ready."
            );
        }

        if (state.status === "ready") {
            const canvas = await inspectCanvas(page, screenshotPath);
            result.canvas = canvas.metrics;
            result.renderingFailures.push(...canvas.failures);
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
    console.log(`${result.status === "passed" ? "PASS" : "FAIL"} ${renderer} ${examplePath}`);
    return result;
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
        failures.push(`Canvas has no visible size: ${JSON.stringify(first ?? null)}.`);
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
        throw new Error("Only non-interlaced 8-bit RGB/RGBA PNGs are supported.");
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
            pixels[rowStart + x] = unfilter(filter, raw, left, above, upperLeft);
        }
    }

    const buckets = new Map();
    for (let index = 0; index < pixels.length; index += bytesPerPixel) {
        const bucket = `${pixels[index] >> 4},${pixels[index + 1] >> 4},${pixels[index + 2] >> 4}`;
        buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }
    const dominant = Math.max(...buckets.values());
    return {
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
            raw +
            (pa <= pb && pa <= pc ? left : pb <= pc ? above : upperLeft)
        ) & 255;
    }
    throw new Error(`Unsupported PNG filter ${filter}.`);
}

function compareScreenshots(webgpu, webgl) {
    if (webgpu.status === "failed" || webgl.status === "failed") {
        return { status: "unavailable", reason: "One renderer failed." };
    }
    if (!webgpu.screenshot || !webgl.screenshot) {
        return { status: "unavailable", reason: "A screenshot is missing." };
    }
    return {
        status: "available",
        webgpu: inspectPng(fs.readFileSync(path.join(repoRoot, webgpu.screenshot))),
        webgl: inspectPng(fs.readFileSync(path.join(repoRoot, webgl.screenshot))),
        note: "Pixel statistics are diagnostic only; backend antialiasing can differ.",
    };
}

function createFailureReport(summary) {
    const failed = summary.results.filter((result) => result.status === "failed");
    const lines = [
        "# WebGPU Core example runner report",
        "",
        `Generated: ${summary.generatedAt}`,
        `Renderer: ${summary.renderer}`,
        `Selected examples: ${summary.selectedCount}`,
        `Passed: ${summary.results.length - failed.length}`,
        `Failed: ${failed.length}`,
        "",
        failed.length ? "## Failures" : "## Failures\n\nNo failures detected.",
        "",
    ];
    for (const result of failed) {
        lines.push(`### ${result.examplePath}`, "", `- Renderer: ${result.renderer}`);
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
            "Pixel statistics are diagnostic only; backend antialiasing can differ.",
            ""
        );
        for (const comparison of summary.comparisons) {
            lines.push(`- ${comparison.examplePath}: ${comparison.comparison.status}`);
        }
        lines.push("");
    }
    return `${lines.join("\n")}\n`;
}

function addReportItems(lines, title, items) {
    if (items.length) lines.push(`- ${title}:`, ...items.map((item) => `  - ${item}`));
}

function selectExamples(options) {
    const discovered = collectExamples();
    const requested = options.examplePaths.length
        ? options.examplePaths.map(normalizeExamplePath)
        : discovered;
    const selected = requested.filter(
        (examplePath) => !options.match || options.match.test(examplePath)
    );
    for (const examplePath of selected) {
        if (!discovered.includes(examplePath)) {
            throw new Error(
                `No example spec under examples/core or examples/docs: ${examplePath}`
            );
        }
    }
    return selected;
}

function collectExamples() {
    const paths = [];
    for (const group of ["core", "docs"]) {
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
        else if (entry.isFile() && entry.name.endsWith(".json")) visitor(absolutePath);
    }
}

function normalizeExamplePath(examplePath) {
    const normalized = examplePath.replaceAll("\\", "/");
    return normalized.startsWith("examples/")
        ? normalized
        : `examples/${normalized}`;
}

function parseArgs(args) {
    const options = {
        help: false,
        examplePaths: [],
        match: undefined,
        renderer: "webgpu",
        compareWebgl: false,
        serverUrl: undefined,
        outputDir: defaultOutputDir,
        timeoutMs: defaultTimeoutMs,
        failOnWarning: false,
    };
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === "--help" || arg === "-h") options.help = true;
        else if (arg === "--all") continue;
        else if (arg === "--compare-webgl") options.compareWebgl = true;
        else if (arg === "--fail-on-warning") options.failOnWarning = true;
        else if (arg === "--match") options.match = new RegExp(requireValue(args, ++index, arg));
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

async function startDevServer(serverOrigin) {
    const port = String(new URL(serverOrigin).port || "4173");
    const child = spawn("node", ["dev-server.mjs"], {
        cwd: packageDir,
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
        if (child?.exitCode !== null) {
            throw new Error(`Core dev server exited with code ${child.exitCode}.`);
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
        throw new Error('The WebGPU example runner requires the "playwright" package.');
    }
}

if (path.resolve(process.argv[1] ?? "") === scriptPath) {
    await main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
