/* global console, process */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
);
const workspaceRoot = path.resolve(packageRoot, "../..");
const defaultOrigin = "http://127.0.0.1:4180";
const defaultOutput = path.join(
    workspaceRoot,
    "output",
    "webgpu-resource-sharing-benchmark.json"
);

const helpText = `Usage:
  node scripts/runResourceSharingBenchmark.mjs [options]

Options:
  --count NUMBER        Marks of each type (default: 500).
  --runs NUMBER         Fresh-renderer repetitions per mode (default: 3).
  --duration-ms NUMBER  Cadence measurement per draw order (default: 1500).
  --settled-frames N    Serial GPU-completed frames per draw order (default: 10).
  --server-url URL      Reuse an existing renderer test server.
  --output PATH         JSON output path.
  --headless            Diagnostic only; headed Chrome is the default.
  --help                Show this help.

The unshared mode bypasses the private program-template and font-resource
caches inside the benchmark page. It does not add a product feature flag.`;

/** @param {string[]} args */
export function parseArgs(args) {
    const options = {
        count: 500,
        runs: 3,
        durationMs: 1500,
        settledFrames: 10,
        serverUrl: undefined,
        output: defaultOutput,
        headless: false,
        help: false,
    };
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (arg === "--headless") {
            options.headless = true;
        } else if (arg === "--help") {
            options.help = true;
        } else if (arg === "--count") {
            options.count = positiveInteger(arg, args[++i]);
        } else if (arg === "--runs") {
            options.runs = positiveInteger(arg, args[++i]);
        } else if (arg === "--duration-ms") {
            options.durationMs = positiveInteger(arg, args[++i]);
        } else if (arg === "--settled-frames") {
            options.settledFrames = positiveInteger(arg, args[++i]);
        } else if (arg === "--server-url") {
            options.serverUrl = requiredValue(arg, args[++i]);
        } else if (arg === "--output") {
            options.output = path.resolve(requiredValue(arg, args[++i]));
        } else {
            throw new Error(`Unknown option: ${arg}`);
        }
    }
    return options;
}

/** @param {string} name @param {string | undefined} value */
function requiredValue(name, value) {
    if (!value) {
        throw new Error(`${name} requires a value.`);
    }
    return value;
}

/** @param {string} name @param {string | undefined} value */
function positiveInteger(name, value) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`${name} requires a positive integer.`);
    }
    return parsed;
}

/** @param {number[]} values */
export function summarize(values) {
    const sorted = values.toSorted((a, b) => a - b);
    const percentile = (fraction) => {
        const index = Math.min(
            sorted.length - 1,
            Math.floor(sorted.length * fraction)
        );
        return sorted[index];
    };
    return {
        median: percentile(0.5),
        p95: percentile(0.95),
        min: sorted[0],
        max: sorted.at(-1),
    };
}

/** @param {string[]} args */
export async function main(args = process.argv.slice(2)) {
    const options = parseArgs(args);
    if (options.help) {
        console.log(helpText);
        return;
    }

    const { chromium } = await import("playwright");
    const origin = options.serverUrl ?? defaultOrigin;
    const server = options.serverUrl ? undefined : startServer(origin);
    await waitForServer(origin, server);

    const launchArgs = [
        "--enable-unsafe-webgpu",
        "--enable-features=WebGPU",
        "--ignore-gpu-blocklist",
    ];
    if (process.platform === "darwin") {
        launchArgs.push("--use-angle=metal");
    }

    try {
        const samples = [];
        let environment;
        for (let run = 0; run < options.runs; run += 1) {
            const modes =
                run % 2
                    ? ["unshared", "shared"]
                    : ["shared", "unshared"];
            for (const mode of modes) {
                const orders =
                    run % 2
                        ? ["alternating", "grouped"]
                        : ["grouped", "alternating"];
                for (const order of orders) {
                    const browser = await chromium.launch({
                        channel: "chrome",
                        headless: options.headless,
                        args: launchArgs,
                    });
                    try {
                        const page = await browser.newPage({
                            viewport: { width: 1000, height: 700 },
                            deviceScaleFactor: 1,
                        });
                        try {
                            await page.goto(origin, {
                                waitUntil: "domcontentloaded",
                            });
                            const sample = await runBrowserSample(page, {
                                mode,
                                order,
                                run,
                                count: options.count,
                                durationMs: options.durationMs,
                                settledFrames: options.settledFrames,
                            });
                            environment ??= sample.environment;
                            samples.push(sample);
                            printSample(sample);
                        } finally {
                            await page.close();
                        }
                    } finally {
                        await browser.close();
                    }
                }
            }
        }

        const result = {
            generatedAt: new Date().toISOString(),
            authoritative: !options.headless,
            options: {
                countPerType: options.count,
                totalMarks: options.count * 2,
                runs: options.runs,
                durationMs: options.durationMs,
                settledFrames: options.settledFrames,
                headless: options.headless,
            },
            environment,
            samples,
            summary: summarizeSamples(samples),
        };
        fs.mkdirSync(path.dirname(options.output), { recursive: true });
        fs.writeFileSync(options.output, JSON.stringify(result, null, 2) + "\n");
        printSummary(result.summary);
        console.log(`\nWrote ${options.output}`);
    } finally {
        server?.kill();
    }
}

/**
 * @param {import("playwright").Page} page
 * @param {{ mode: string, order: string, run: number, count: number, durationMs: number, settledFrames: number }} params
 */
async function runBrowserSample(page, params) {
    return page.evaluate(async (benchmark) => {
        const profilerSymbol = Symbol.for("genome-spy.performance-profiler");
        const counts = {};
        const phaseTotals = {};
        globalThis[profilerSymbol] = {
            enabled: true,
            addCount(name, value = 1) {
                counts[name] = (counts[name] ?? 0) + value;
            },
            addPhase(name, duration) {
                phaseTotals[name] = (phaseTotals[name] ?? 0) + duration;
            },
        };

        class UnsharedProgramTemplateCache {
            constructor() {
                this.nextId = 1;
            }

            getOrCreate(_shaderCode, _descriptorKey, create) {
                return create(this.nextId++);
            }
        }

        class UnsharedFontResourceCache {
            constructor() {
                this.resourceMaps = [];
            }

            get() {
                return undefined;
            }

            set(_metrics, resources) {
                this.resourceMaps.push(resources);
                return this;
            }

            values() {
                return this.resourceMaps.values();
            }

            clear() {
                this.resourceMaps.length = 0;
            }
        }

        const [
            { createRenderer },
            { rectMark },
            { textMark },
            { identityScale },
            { default: getMetrics },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/src/marks/rect.js"),
            import("/src/marks/text.js"),
            import("/src/scales/identity.js"),
            import("/src/fonts/bmFontMetrics.js"),
        ]);
        const fontJson = await fetch("/src/fonts/Lato-Regular.json").then(
            (response) => response.json()
        );
        const fontBitmap = await fetch("/src/fonts/Lato-Regular.png")
            .then((response) => response.blob())
            .then((blob) => createImageBitmap(blob));
        const fontResource = {
            metrics: getMetrics(fontJson),
            bitmap: fontBitmap,
        };

        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            throw new Error("WebGPU adapter not available.");
        }
        const environment = {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            adapter: adapter.info
                ? {
                      vendor: adapter.info.vendor,
                      architecture: adapter.info.architecture,
                      device: adapter.info.device,
                      description: adapter.info.description,
                  }
                : null,
        };

        const canvas = document.createElement("canvas");
        canvas.width = 1000;
        canvas.height = 700;
        document.body.append(canvas);
        const renderer = await createRenderer(canvas);
        renderer.updateGlobals({ width: 1000, height: 700, dpr: 1 });
        if (benchmark.mode === "unshared") {
            renderer._programTemplateCache =
                new UnsharedProgramTemplateCache();
            renderer._fontResourceCache = new UnsharedFontResourceCache();
        }

        const rectConfig = {
            count: 1,
            channels: {
                x: { value: 10, scale: identityScale() },
                x2: { value: 11, scale: identityScale() },
                y: { value: 10, scale: identityScale() },
                y2: { value: 11, scale: identityScale() },
                fill: { value: [0.2, 0.45, 0.85, 1] },
            },
        };
        const textConfig = {
            count: 1,
            fontResource,
            channels: {
                text: { value: "A" },
                x: { value: 20, scale: identityScale() },
                y: { value: 20, scale: identityScale() },
                fill: { value: [0.1, 0.1, 0.1, 1] },
            },
        };

        renderer.device.pushErrorScope("validation");
        const initStart = performance.now();
        const rects = Array.from({ length: benchmark.count }, () =>
            renderer.createMark(rectMark, rectConfig)
        );
        const texts = Array.from({ length: benchmark.count }, () =>
            renderer.createMark(textMark, textConfig)
        );
        const initJsMs = performance.now() - initStart;
        await Promise.resolve();
        await Promise.resolve();
        await renderer.device.queue.onSubmittedWorkDone();
        const initSettledMs = performance.now() - initStart;
        const initializationCounts = { ...counts };

        const grouped = [
            ...rects.map((mark) => ({ mark })),
            ...texts.map((mark) => ({ mark })),
        ];
        const alternating = rects.flatMap((rect, index) => [
            { mark: rect },
            { mark: texts[index] },
        ]);

        async function measureOrder(name, draws) {
            renderer.render({ draws });
            await renderer.device.queue.onSubmittedWorkDone();

            const settledDurations = [];
            for (let i = 0; i < benchmark.settledFrames; i += 1) {
                const start = performance.now();
                renderer.render({ draws });
                await renderer.device.queue.onSubmittedWorkDone();
                settledDurations.push(performance.now() - start);
            }

            const jsDurations = [];
            const frameTimestamps = [];
            let firstTimestamp;
            do {
                const timestamp = await new Promise(requestAnimationFrame);
                firstTimestamp ??= timestamp;
                frameTimestamps.push(timestamp);
                const start = performance.now();
                renderer.render({ draws });
                jsDurations.push(performance.now() - start);
            } while (
                frameTimestamps.at(-1) - firstTimestamp <
                benchmark.durationMs
            );
            await renderer.device.queue.onSubmittedWorkDone();

            const cadenceElapsed =
                frameTimestamps.at(-1) - frameTimestamps[0];
            return {
                order: name,
                frames: frameTimestamps.length,
                fps:
                    ((frameTimestamps.length - 1) * 1000) / cadenceElapsed,
                jsFrameMs: summarizeInPage(jsDurations),
                gpuSettledFrameMs: summarizeInPage(settledDurations),
            };
        }

        function summarizeInPage(values) {
            const sorted = values.toSorted((a, b) => a - b);
            const at = (fraction) =>
                sorted[
                    Math.min(
                        sorted.length - 1,
                        Math.floor(sorted.length * fraction)
                    )
                ];
            return {
                median: at(0.5),
                p95: at(0.95),
                min: sorted[0],
                max: sorted.at(-1),
            };
        }

        const render = await measureOrder(
            benchmark.order,
            benchmark.order === "grouped" ? grouped : alternating
        );

        const validationError = await renderer.device.popErrorScope();
        renderer.destroy();
        fontBitmap.close();
        canvas.remove();
        delete globalThis[profilerSymbol];
        if (validationError) {
            throw new Error(validationError.message);
        }

        return {
            mode: benchmark.mode,
            order: benchmark.order,
            run: benchmark.run + 1,
            initialization: {
                jsMs: initJsMs,
                gpuSettledMs: initSettledMs,
                counts: initializationCounts,
            },
            render,
            phaseTotals,
            environment,
        };
    }, params);
}

/** @param {ReturnType<typeof startServer> | undefined} server */
async function waitForServer(origin, server) {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        if (server && server.exitCode !== null) {
            throw new Error(`Benchmark server exited with ${server.exitCode}.`);
        }
        try {
            const response = await fetch(origin);
            if (response.ok) {
                return;
            }
        } catch {
            // The server is still starting.
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${origin}.`);
}

/** @param {string} origin */
function startServer(origin) {
    const port = new URL(origin).port;
    return spawn(process.execPath, ["tests/webgpuServer.js", "--port", port], {
        cwd: packageRoot,
        stdio: ["ignore", "pipe", "pipe"],
    });
}

/** @param {any[]} samples */
export function summarizeSamples(samples) {
    const result = {};
    for (const mode of ["shared", "unshared"]) {
        const modeSamples = samples.filter((sample) => sample.mode === mode);
        result[mode] = {
            initialization: {
                jsMs: summarize(
                    modeSamples.map((sample) => sample.initialization.jsMs)
                ),
                gpuSettledMs: summarize(
                    modeSamples.map(
                        (sample) => sample.initialization.gpuSettledMs
                    )
                ),
            },
            render: {},
        };
        for (const order of ["grouped", "alternating"]) {
            const orderSamples = modeSamples.filter(
                (sample) => sample.order === order
            );
            result[mode].render[order] = {
                fps: summarize(
                    orderSamples.map((sample) => sample.render.fps)
                ),
                jsFrameMs: summarize(
                    orderSamples.map(
                        (sample) => sample.render.jsFrameMs.median
                    )
                ),
                gpuSettledFrameMs: summarize(
                    orderSamples.map(
                        (sample) => sample.render.gpuSettledFrameMs.median
                    )
                ),
            };
        }
    }
    return result;
}

/** @param {any} sample */
function printSample(sample) {
    console.log(
        `${sample.mode} ${sample.order} run ${sample.run}: ` +
            `init ${sample.initialization.jsMs.toFixed(1)} ms JS, ` +
            `${sample.initialization.gpuSettledMs.toFixed(1)} ms settled; ` +
            `${sample.render.fps.toFixed(1)} fps / ` +
            `${sample.render.jsFrameMs.median.toFixed(2)} ms JS / ` +
            `${sample.render.gpuSettledFrameMs.median.toFixed(2)} ms GPU-settled`
    );
}

/** @param {any} summary */
function printSummary(summary) {
    console.log("\nMedian of run medians:");
    for (const mode of ["shared", "unshared"]) {
        const value = summary[mode];
        console.log(
            `${mode}: init ${value.initialization.jsMs.median.toFixed(1)} ms JS, ` +
                `${value.initialization.gpuSettledMs.median.toFixed(1)} ms settled`
        );
        for (const order of ["grouped", "alternating"]) {
            const frame = value.render[order];
            console.log(
                `  ${order}: ${frame.fps.median.toFixed(1)} fps, ` +
                    `${frame.jsFrameMs.median.toFixed(2)} ms JS, ` +
                    `${frame.gpuSettledFrameMs.median.toFixed(2)} ms GPU-settled`
            );
        }
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await main();
}
