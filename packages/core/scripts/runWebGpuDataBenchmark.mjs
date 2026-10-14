/* global AbortSignal, console, devicePixelRatio, document, GPUQueue, navigator, performance, process, requestAnimationFrame, URL, window */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { installWebGpuLimitAudit } from "./webGpuLimitAudit.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const { values } = parseArgs({
    options: {
        rows: { type: "string", default: "1500000" },
        runs: { type: "string", default: "5" },
        server: { type: "string", default: "http://127.0.0.1:8080" },
        output: {
            type: "string",
            default: "output/webgpu-data-benchmark/summary.json",
        },
        headless: { type: "boolean", default: false },
    },
});
const rows = Number(values.rows);
const runs = Number(values.runs);
if (
    !Number.isSafeInteger(rows) ||
    rows < 1 ||
    !Number.isSafeInteger(runs) ||
    runs < 1
) {
    throw new Error("rows and runs must be positive integers.");
}

const browser = await chromium.launch({
    channel: "chrome",
    headless: values.headless,
    args: [
        "--enable-unsafe-webgpu",
        "--ignore-gpu-blocklist",
        ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
    ],
});
try {
    /** @type {string[]} */
    const errors = [];
    const page = await browser.newPage({
        viewport: { width: 1200, height: 700 },
        deviceScaleFactor: 1,
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(installWebGpuLimitAudit);
    await page.goto(values.server);
    const result = await page.evaluate(
        async ({ count, runs, moduleRoot }) => {
            const [
                { embed },
                { startPerformanceProfiler },
                { default: PointMark },
            ] = await Promise.all([
                import(moduleRoot + "/packages/core/src/index.js"),
                import(
                    moduleRoot +
                        "/packages/core/src/debug/performanceProfiler.js"
                ),
                import(
                    moduleRoot +
                        "/packages/core/src/rendering/webgl/marks/point.js"
                ),
            ]);
            const data = new Array(count);
            const replacement = new Array(count);
            for (let i = 0; i < count; i++) {
                const bits = Math.imul(i, 2654435761) >>> 0;
                const x = (bits & 65535) / 32768 - 1;
                const y = (bits >>> 16) / 32768 - 1;
                const category = ["A", "B", "C"][i % 3];
                data[i] = { x, y, category };
                replacement[i] = { x: x * 0.9, y: y * 0.9, category };
            }

            let pointPreparation = 0;
            /** @type {GPUQueue | undefined} */
            let queue;
            const update = PointMark.prototype.updateGraphicsData;
            PointMark.prototype.updateGraphicsData = function (...args) {
                const start = performance.now();
                try {
                    return update.apply(this, args);
                } finally {
                    pointPreparation += performance.now() - start;
                }
            };
            const submit = GPUQueue.prototype.submit;
            GPUQueue.prototype.submit = function (...args) {
                queue = this;
                return submit.apply(this, args);
            };
            const samples = [];
            const environment = {
                userAgent: navigator.userAgent,
                dpr: devicePixelRatio,
            };
            const adapter = await navigator.gpu.requestAdapter();
            environment.adapter = {
                vendor: adapter.info.vendor,
                architecture: adapter.info.architecture,
                description: adapter.info.description,
            };

            // Two complete A/B warmups precede counterbalanced recorded runs.
            for (let run = -2; run < runs; run++) {
                const order =
                    run % 2 ? ["webgpu", "webgl"] : ["webgl", "webgpu"];
                for (const renderer of order) {
                    const container = document.createElement("div");
                    container.style.cssText = "width:1200px;height:700px";
                    document.body.replaceChildren(container);
                    const profiler = startPerformanceProfiler();
                    queue = undefined;
                    const bootStart = performance.now();
                    const api = await embed(
                        container,
                        {
                            width: 1100,
                            height: 600,
                            datasets: { points: [] },
                            data: { name: "points" },
                            mark: { type: "point", size: 0.1 },
                            encoding: {
                                x: {
                                    field: "x",
                                    type: "quantitative",
                                    axis: null,
                                    scale: {
                                        name: "xScale",
                                        domain: [-1, 1],
                                        zoom: true,
                                    },
                                },
                                y: {
                                    field: "y",
                                    type: "quantitative",
                                    axis: null,
                                    scale: { domain: [-1, 1], zoom: true },
                                },
                                color: {
                                    field: "category",
                                    type: "nominal",
                                    legend: null,
                                    scale: { domain: ["A", "B", "C"] },
                                },
                                opacity: { value: 0.7 },
                            },
                        },
                        {
                            renderer,
                            onError: (error) => {
                                throw error;
                            },
                        }
                    );
                    const boot = performance.now() - bootStart;
                    const gl =
                        renderer === "webgl"
                            ? container
                                  .querySelector("canvas")
                                  .getContext("webgl2")
                            : undefined;
                    if (gl) {
                        const debug = gl.getExtension(
                            "WEBGL_debug_renderer_info"
                        );
                        environment.webgl = gl.getParameter(
                            debug.UNMASKED_RENDERER_WEBGL
                        );
                    }
                    const finish = async () => {
                        await new Promise((resolve) =>
                            requestAnimationFrame(resolve)
                        );
                        await new Promise((resolve) =>
                            requestAnimationFrame(resolve)
                        );
                        if (renderer === "webgpu") {
                            await queue.onSubmittedWorkDone();
                        } else {
                            gl.finish();
                        }
                    };
                    for (const phase of [
                        "initial",
                        "replacement",
                        "navigation",
                    ]) {
                        profiler.reset();
                        pointPreparation = 0;
                        const start = performance.now();
                        if (phase === "navigation") {
                            api.getScaleResolutionByName("xScale").zoom(
                                0.9,
                                0,
                                0,
                                1100
                            );
                        } else {
                            api.datasets.set(
                                "points",
                                phase === "initial" ? data : replacement
                            );
                        }
                        const propagation = performance.now() - start;
                        await finish();
                        const duration = performance.now() - start;
                        const profile = profiler.snapshot();
                        if (!profile.frames.length) {
                            throw new Error(
                                "Benchmark did not render a frame."
                            );
                        }
                        if (
                            renderer === "webgpu" &&
                            phase === "navigation" &&
                            (profile.countTotals.webgpuXIndexBuilds ||
                                profile.phaseTotals.markConfiguration ||
                                profile.countTotals.writeBufferBytes > 4096)
                        ) {
                            throw new Error(
                                "Navigation rebuilt or uploaded series data."
                            );
                        }
                        if (run >= 0)
                            samples.push({
                                renderer,
                                run,
                                phase,
                                boot,
                                propagation,
                                duration,
                                preparation:
                                    renderer === "webgl"
                                        ? pointPreparation
                                        : (profile.phaseTotals
                                              .markTranslation ?? 0),
                                configuration:
                                    profile.phaseTotals.markConfiguration ?? 0,
                                resources:
                                    profile.phaseTotals
                                        .retainedResourceSynchronization ?? 0,
                                profile,
                            });
                    }
                    await api.awaitVisibleLazyData(AbortSignal.timeout(10000));
                    if (
                        api.dataLoading
                            .getSnapshot()
                            .some((entry) => entry.status === "error")
                    ) {
                        throw new Error("Benchmark data loading failed.");
                    }
                    api.finalize();
                }
            }
            PointMark.prototype.updateGraphicsData = update;
            GPUQueue.prototype.submit = submit;
            const audit = window.__webGpuLimitAudit;
            const errors = audit.devices.flatMap(
                (device) => device.validationErrors
            );
            if (audit.violations.length || errors.length) {
                throw new Error([...audit.violations, ...errors].join("\n"));
            }
            return { environment, samples, audit };
        },
        { count: rows, runs, moduleRoot: "/@fs" + repoRoot.replace(/\/$/, "") }
    );
    if (errors.length) throw new Error(errors.join("\n"));
    const summary = {
        revision: execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: repoRoot,
            encoding: "utf8",
        }).trim(),
        rows,
        runs,
        headed: !values.headless,
        ...result,
    };
    const output = path.resolve(repoRoot, values.output);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(summary, null, 2) + "\n");
    for (const phase of ["initial", "replacement", "navigation"]) {
        for (const renderer of ["webgl", "webgpu"]) {
            const group = summary.samples.filter(
                (sample) =>
                    sample.renderer === renderer && sample.phase === phase
            );
            const median = (/** @type {number[]} */ numbers) =>
                numbers.toSorted((a, b) => a - b)[
                    Math.floor(numbers.length / 2)
                ];
            console.log(
                JSON.stringify({
                    phase,
                    renderer,
                    preparation: median(group.map((s) => s.preparation)),
                    configuration: median(group.map((s) => s.configuration)),
                    resources: median(group.map((s) => s.resources)),
                    completed: median(group.map((s) => s.duration)),
                })
            );
        }
    }
    console.log("Summary: " + output);
} finally {
    await browser.close();
}
