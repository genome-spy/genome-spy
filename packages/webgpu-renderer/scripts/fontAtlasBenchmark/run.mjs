/* global console, process */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.."
);
const workspaceRoot = path.resolve(packageRoot, "../..");
const defaultOrigin = "http://127.0.0.1:4181";
const defaultOutput = path.join(
    workspaceRoot,
    "output",
    "webgpu-font-atlas-benchmark.json"
);

const helpText = `Usage:
  node scripts/fontAtlasBenchmark/run.mjs [options]

Options:
  --labels NUMBER          Labels per update (default: 10000).
  --unique-glyphs NUMBER   Distinct synthetic outlines (default: 256).
  --label-length NUMBER    Glyphs per label (default: 6).
  --growth-rounds NUMBER   Incremental atlas populations (default: 4).
  --steady-updates NUMBER  Same-atlas replacements per run (default: 5).
  --render-frames NUMBER   Static GPU-completed frames per run (default: 5).
  --runs NUMBER            Fresh-renderer repetitions (default: 3).
  --server-url URL         Reuse an existing renderer test server.
  --output PATH            JSON output path.
  --headless               Diagnostic only; headed Chrome is the default.
  --help                   Show this help.

The synthetic outline font isolates text layout, MSDF generation, atlas growth,
texture copying, rebinding, and glyph-buffer uploads from network and TTF parse
cost. No timing threshold is enforced because GPU results are machine-specific.`;

/** @param {string[]} args */
export function parseArgs(args) {
    const options = {
        labels: 10_000,
        uniqueGlyphs: 256,
        labelLength: 6,
        growthRounds: 4,
        steadyUpdates: 5,
        renderFrames: 5,
        runs: 3,
        serverUrl: undefined,
        output: defaultOutput,
        headless: false,
        help: false,
    };
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === "--headless") {
            options.headless = true;
        } else if (arg === "--help") {
            options.help = true;
        } else if (arg === "--labels") {
            options.labels = positiveInteger(arg, args[++index]);
        } else if (arg === "--unique-glyphs") {
            options.uniqueGlyphs = positiveInteger(arg, args[++index]);
        } else if (arg === "--label-length") {
            options.labelLength = positiveInteger(arg, args[++index]);
        } else if (arg === "--growth-rounds") {
            options.growthRounds = positiveInteger(arg, args[++index]);
        } else if (arg === "--steady-updates") {
            options.steadyUpdates = positiveInteger(arg, args[++index]);
        } else if (arg === "--render-frames") {
            options.renderFrames = positiveInteger(arg, args[++index]);
        } else if (arg === "--runs") {
            options.runs = positiveInteger(arg, args[++index]);
        } else if (arg === "--server-url") {
            options.serverUrl = requiredValue(arg, args[++index]);
        } else if (arg === "--output") {
            options.output = path.resolve(requiredValue(arg, args[++index]));
        } else {
            throw new Error(`Unknown option: ${arg}`);
        }
    }
    if (options.labels < options.uniqueGlyphs) {
        throw new Error("--labels must be at least --unique-glyphs.");
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
    const at = (fraction) =>
        sorted[
            Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
        ];
    return {
        median: at(0.5),
        p95: at(0.95),
        min: sorted[0],
        max: sorted.at(-1),
    };
}

/** @param {number[]} values */
function sum(values) {
    return values.reduce((total, value) => total + value, 0);
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

    const browser = await chromium.launch({
        channel: "chrome",
        headless: options.headless,
        args: launchArgs,
    });
    try {
        const samples = [];
        let environment;
        for (let run = 0; run < options.runs; run++) {
            const page = await browser.newPage({
                viewport: { width: 1000, height: 700 },
                deviceScaleFactor: 1,
            });
            try {
                await page.goto(origin, { waitUntil: "domcontentloaded" });
                const sample = await runBrowserSample(page, options, run);
                environment ??= sample.environment;
                samples.push(sample);
                printSample(sample);
            } finally {
                await page.close();
            }
        }

        const result = {
            generatedAt: new Date().toISOString(),
            authoritative: !options.headless,
            options: {
                labels: options.labels,
                uniqueGlyphs: options.uniqueGlyphs,
                labelLength: options.labelLength,
                glyphInstancesPerUpdate: options.labels * options.labelLength,
                growthRounds: options.growthRounds,
                steadyUpdates: options.steadyUpdates,
                renderFrames: options.renderFrames,
                runs: options.runs,
                headless: options.headless,
            },
            environment,
            samples,
            summary: summarizeSamples(samples),
        };
        fs.mkdirSync(path.dirname(options.output), { recursive: true });
        fs.writeFileSync(
            options.output,
            JSON.stringify(result, null, 2) + "\n"
        );
        printSummary(result.summary);
        console.log(`\nWrote ${options.output}`);
    } finally {
        await browser.close();
        server?.kill();
    }
}

/**
 * @param {import("playwright").Page} page
 * @param {ReturnType<typeof parseArgs>} benchmark
 * @param {number} run
 */
async function runBrowserSample(page, benchmark, run) {
    return page.evaluate(
        async ({ benchmark, run }) => {
            const [
                { createRenderer },
                { textMark },
                { identityScale },
                {
                    createLabelPositions,
                    createSyntheticLabels,
                    createSyntheticOutlineFont,
                },
            ] = await Promise.all([
                import("/src/index.js"),
                import("/src/marks/text.js"),
                import("/src/scales/identity.js"),
                import("/tests/fixtures/syntheticOutlineFont.js"),
            ]);
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
            renderer.device.pushErrorScope("validation");
            const font = createSyntheticOutlineFont(benchmark.uniqueGlyphs);
            const positions = createLabelPositions(benchmark.labels, 1000, 700);
            const makeSeries = (uniqueGlyphs, phase) => ({
                text: createSyntheticLabels(
                    benchmark.labels,
                    uniqueGlyphs,
                    benchmark.labelLength,
                    phase
                ),
                x: positions.x,
                y: positions.y,
            });

            let mark;
            let atlas;
            const measureUpdate = async (uniqueGlyphs, phase) => {
                const series = makeSeries(uniqueGlyphs, phase);
                const start = performance.now();
                if (!mark) {
                    mark = renderer.createMark(textMark, {
                        font,
                        fontSize: 8,
                        channels: {
                            text: { data: series.text },
                            x: {
                                data: series.x,
                                type: "f32",
                                scale: identityScale(),
                            },
                            y: {
                                data: series.y,
                                type: "f32",
                                scale: identityScale(),
                            },
                            size: { value: 8 },
                        },
                    });
                    atlas = renderer._marks.get(mark.markId)._outlineAtlas;
                } else {
                    mark.series.replace(series, benchmark.labels);
                }
                const prepareJsMs = performance.now() - start;
                const renderStart = performance.now();
                renderer.render({ draws: [{ mark }] });
                const renderJsMs = performance.now() - renderStart;
                await renderer.device.queue.onSubmittedWorkDone();
                await Promise.resolve();
                return {
                    uniqueGlyphs,
                    prepareJsMs,
                    renderJsMs,
                    readyMs: performance.now() - start,
                    atlas: {
                        entries: atlas.entryCount,
                        version: atlas.version,
                        width: atlas.width,
                        height: atlas.height,
                        bytes: atlas.width * atlas.height * 8,
                    },
                };
            };

            const growth = [];
            for (let round = 0; round < benchmark.growthRounds; round++) {
                const uniqueGlyphs = Math.min(
                    benchmark.uniqueGlyphs,
                    Math.ceil(
                        (benchmark.uniqueGlyphs * (round + 1)) /
                            benchmark.growthRounds
                    )
                );
                growth.push(await measureUpdate(uniqueGlyphs, round));
            }

            const completedAtlas = growth.at(-1).atlas;
            const steady = [];
            for (let index = 0; index < benchmark.steadyUpdates; index++) {
                steady.push(
                    await measureUpdate(
                        benchmark.uniqueGlyphs,
                        benchmark.growthRounds + index
                    )
                );
            }
            if (
                steady.some(
                    (sample) =>
                        sample.atlas.version !== completedAtlas.version ||
                        sample.atlas.entries !== completedAtlas.entries
                )
            ) {
                throw new Error(
                    "Steady updates unexpectedly changed the atlas."
                );
            }

            const staticFrames = [];
            for (let index = 0; index < benchmark.renderFrames; index++) {
                const start = performance.now();
                renderer.render({ draws: [{ mark }] });
                const jsMs = performance.now() - start;
                await renderer.device.queue.onSubmittedWorkDone();
                staticFrames.push({
                    jsMs,
                    settledMs: performance.now() - start,
                });
            }
            const validationError = await renderer.device.popErrorScope();
            renderer.destroy();
            canvas.remove();
            if (validationError) {
                throw new Error(validationError.message);
            }
            return {
                run: run + 1,
                growth,
                steady,
                staticFrames,
                finalAtlas: completedAtlas,
                environment,
            };
        },
        { benchmark, run }
    );
}

/** @param {ReturnType<typeof startServer> | undefined} server @param {string} origin */
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
    const growth = samples.map((sample) => ({
        prepareJsMs: sum(sample.growth.map((phase) => phase.prepareJsMs)),
        readyMs: sum(sample.growth.map((phase) => phase.readyMs)),
    }));
    const steady = samples.flatMap((sample) => sample.steady);
    const staticFrames = samples.flatMap((sample) => sample.staticFrames);
    return {
        growth: {
            prepareJsMs: summarize(growth.map((sample) => sample.prepareJsMs)),
            readyMs: summarize(growth.map((sample) => sample.readyMs)),
        },
        steadyUpdate: {
            prepareJsMs: summarize(steady.map((sample) => sample.prepareJsMs)),
            readyMs: summarize(steady.map((sample) => sample.readyMs)),
        },
        staticRender: {
            jsMs: summarize(staticFrames.map((sample) => sample.jsMs)),
            settledMs: summarize(
                staticFrames.map((sample) => sample.settledMs)
            ),
        },
        finalAtlas: samples[0].finalAtlas,
    };
}

/** @param {any} sample */
function printSample(sample) {
    const growthPrepare = sum(sample.growth.map((phase) => phase.prepareJsMs));
    const growthReady = sum(sample.growth.map((phase) => phase.readyMs));
    const steadyReady = summarize(
        sample.steady.map((phase) => phase.readyMs)
    ).median;
    console.log(
        `run ${sample.run}: growth ${growthPrepare.toFixed(1)} ms JS / ` +
            `${growthReady.toFixed(1)} ms ready; steady ${steadyReady.toFixed(1)} ms; ` +
            `atlas ${sample.finalAtlas.width}x${sample.finalAtlas.height}`
    );
}

/** @param {ReturnType<typeof summarizeSamples>} summary */
function printSummary(summary) {
    console.log("\nMedian measurements:");
    console.log(
        `growth: ${summary.growth.prepareJsMs.median.toFixed(1)} ms JS / ` +
            `${summary.growth.readyMs.median.toFixed(1)} ms ready`
    );
    console.log(
        `steady update: ${summary.steadyUpdate.prepareJsMs.median.toFixed(1)} ms JS / ` +
            `${summary.steadyUpdate.readyMs.median.toFixed(1)} ms ready`
    );
    console.log(
        `static render: ${summary.staticRender.jsMs.median.toFixed(2)} ms JS / ` +
            `${summary.staticRender.settledMs.median.toFixed(2)} ms settled`
    );
    console.log(
        `final atlas: ${summary.finalAtlas.width}x${summary.finalAtlas.height}, ` +
            `${(summary.finalAtlas.bytes / 1024 / 1024).toFixed(1)} MiB, ` +
            `${summary.finalAtlas.entries} glyphs`
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await main();
}
