/* global console, process */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const scriptPath = fileURLToPath(import.meta.url);
const packageDir = path.resolve(path.dirname(scriptPath), "..");
const appPackageDir = path.resolve(packageDir, "..", "app");
const repoRoot = path.resolve(packageDir, "..", "..");
const defaultServerOrigin = "http://127.0.0.1:4173";
const harnessPath = "/screenshot.html";
const healthCheckPath = "/__health";
const defaultOutputDir = path.join(
    repoRoot,
    "output",
    "webgpu-interaction-benchmark"
);
const defaultTimeoutMs = 60_000;
const defaultDurationMs = 1_500;
const defaultWarmupMs = 500;
const defaultRuns = 5;
const defaultViewport = { width: 1200, height: 700 };
const minimumNormalRenderFrames = 3;
const allCases = [
    "horizontal-drag",
    "horizontal-wasd",
    "wheel-zoom",
    "wasd-zoom",
    "open-closeup",
    "closeup-wheel",
];

const helpText = `Usage:
  node packages/core/scripts/runWebGpuInteractionBenchmark.mjs --spec PATH [options]

Options:
  --spec PATH             Generic App spec path or URL (required).
  --control-spec PATH     Optional small control spec, measured with the same cases.
  --renderer NAME         webgl, webgpu, or both (default: both).
  --cases LIST            Comma-separated case names (default: all six).
  --runs NUMBER           Runs per renderer and case (default: 5).
  --duration-ms NUMBER   Active interaction duration (default: 1500).
  --warmup-ms NUMBER     Settling delay before each recorded run (default: 500).
  --dpr NUMBER            Main device-pixel ratio (default: 1).
  --sensitivity-dpr N     Add a second matrix at DPR N (default: 2).
  --viewport WxH          Browser viewport (default: 1200x700).
  --server-url URL        Use an already running App dev server.
  --output-dir DIR        Ignored directory for JSON, traces, and report.
  --filter-selector CSS   Optional correctness-control filter target.
  --sort-selector CSS     Optional correctness-control sort target.
  --headed                Run Chromium with a visible window (recommended).
  --headless              Run Chromium headlessly; results are non-authoritative.
  --no-trace              Skip browser traces.
  --help                  Show this help text.

Hardware-backed GPU rendering on a physical display is authoritative. Headless
and software-adapter runs are retained for diagnostics and explicitly marked.`;

/** @typedef {"webgl" | "webgpu"} RendererName */

/**
 * @typedef {object} BenchmarkOptions
 * @property {string} spec
 * @property {string | undefined} controlSpec
 * @property {RendererName[]} renderers
 * @property {string[]} cases
 * @property {number} runs
 * @property {number} durationMs
 * @property {number} warmupMs
 * @property {number[]} dprs
 * @property {{width: number, height: number}} viewport
 * @property {string | undefined} serverUrl
 * @property {string} outputDir
 * @property {string | undefined} filterSelector
 * @property {string | undefined} sortSelector
 * @property {boolean} headed
 * @property {boolean} traces
 */

export async function main(args = process.argv.slice(2)) {
    const options = parseArgs(args);
    if (options.help) {
        console.log(helpText);
        return;
    }

    fs.mkdirSync(options.outputDir, { recursive: true });
    const playwright = await import("playwright");
    const server =
        options.serverUrl === undefined
            ? await startDevServer(defaultServerOrigin)
            : undefined;
    const serverOrigin = options.serverUrl ?? defaultServerOrigin;

    try {
        await waitForServer(serverOrigin, server);
        const browser = await playwright.chromium.launch({
            headless: !options.headed,
            args: getBrowserArgs(),
        });
        try {
            const samples = [];
            for (const dpr of options.dprs) {
                for (const subject of getSubjects(options)) {
                    for (let run = 0; run < options.runs; run += 1) {
                        const order = counterbalancedOrder(
                            options.renderers,
                            run
                        );
                        for (const renderer of order) {
                            for (const caseName of options.cases) {
                                const sample = await runSample({
                                    browser,
                                    serverOrigin,
                                    options,
                                    subject,
                                    renderer,
                                    caseName,
                                    run,
                                    dpr,
                                });
                                samples.push(sample);
                                console.log(
                                    `${sample.status.toUpperCase()} ${renderer} ` +
                                        `${subject.name} ${caseName} run ${run + 1} ` +
                                        `DPR ${dpr}`
                                );
                            }
                        }
                    }
                }
            }

            const report = createReport({ options, samples });
            const summaryPath = path.join(options.outputDir, "summary.json");
            const reportPath = path.join(options.outputDir, "baseline.md");
            fs.writeFileSync(
                summaryPath,
                `${JSON.stringify(report, null, 2)}\n`
            );
            fs.writeFileSync(reportPath, renderReport(report));
            console.log(`Summary: ${summaryPath}`);
            console.log(`Baseline report: ${reportPath}`);
        } finally {
            await browser.close();
        }
    } finally {
        await stopServer(server);
    }
}

/**
 * @param {BenchmarkOptions} options
 * @returns {{name: string, spec: string, control: boolean}[]}
 */
function getSubjects(options) {
    const subjects = [{ name: "main", spec: options.spec, control: false }];
    if (options.controlSpec) {
        subjects.push({
            name: "control",
            spec: options.controlSpec,
            control: true,
        });
    }
    return subjects;
}

/** @param {RendererName[]} renderers @param {number} run */
function counterbalancedOrder(renderers, run) {
    return run % 2 === 0 ? [...renderers] : [...renderers].reverse();
}

/**
 * @param {{browser: import("playwright").Browser, serverOrigin: string, options: BenchmarkOptions, subject: {name: string, spec: string, control: boolean}, renderer: RendererName, caseName: string, run: number, dpr: number}} input
 */
async function runSample({
    browser,
    serverOrigin,
    options,
    subject,
    renderer,
    caseName,
    run,
    dpr,
}) {
    const context = await browser.newContext({
        viewport: options.viewport,
        deviceScaleFactor: dpr,
    });
    const page = await context.newPage();
    const tracePath = path.join(
        options.outputDir,
        `${subject.name}-${renderer}-${caseName}-run${run + 1}-dpr${dpr}.json`
    );
    /** @type {import("playwright").CDPSession | undefined} */
    let tracingSession;
    let tracingStarted = false;
    const result = {
        status: "passed",
        subject: subject.name,
        control: subject.control,
        renderer,
        case: caseName,
        run: run + 1,
        dpr,
        trace: options.traces ? path.basename(tracePath) : undefined,
        errors: [],
        cadence: undefined,
        profile: undefined,
        environment: undefined,
    };

    try {
        const url = new URL(harnessPath, serverOrigin);
        url.searchParams.set("spec", toSpecUrl(subject.spec));
        url.searchParams.set("renderer", renderer);
        url.searchParams.set("profile", "1");
        url.searchParams.set("lazy-timeout-ms", String(defaultTimeoutMs));

        page.on("pageerror", (error) => result.errors.push(error.message));
        page.on("console", (message) => {
            if (message.type() === "error") {
                result.errors.push(message.text());
            }
        });
        await page.goto(url.toString(), {
            waitUntil: "load",
            timeout: defaultTimeoutMs,
        });
        await page.waitForFunction(
            () =>
                window.__genomeSpyScreenshot?.status === "ready" ||
                window.__genomeSpyScreenshot?.status === "error",
            { timeout: defaultTimeoutMs + 60_000 }
        );
        const state = await page.evaluate(() => window.__genomeSpyScreenshot);
        if (state?.status !== "ready") {
            throw new Error(state?.error || state?.detail || "Harness failed.");
        }

        await page.evaluate(() => {
            const state = { active: true, timestamps: [] };
            window.__genomeSpyBenchmarkCadence = state;
            const longTasks = [];
            window.__genomeSpyBenchmarkLongTasks = longTasks;
            if ("PerformanceObserver" in window) {
                const observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        longTasks.push(entry.duration);
                    }
                });
                observer.observe({ type: "longtask", buffered: true });
                state.longTaskObserver = observer;
            }
            const tick = (timestamp) => {
                if (!state.active) return;
                state.timestamps.push(timestamp);
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });
        await page.waitForTimeout(options.warmupMs);
        const initialState = await captureInteractionState(page);
        const applicability = getCaseApplicability(caseName, initialState);
        if (!applicability.applicable) {
            result.status = "inapplicable";
            result.inapplicability = applicability.reason;
            result.environment = await readEnvironment(page, renderer, dpr);
            return result;
        }

        await prepareCase(page, caseName);
        await page.evaluate(() => {
            window.__genomeSpyBenchmarkCadence.timestamps.length = 0;
            window.__genomeSpyBenchmarkLongTasks.length = 0;
            window.__genomeSpyPerformance?.reset();
        });
        await installKeyboardProbe(page);
        if (options.traces) {
            tracingSession = await context.newCDPSession(page);
            await startChromiumTrace(tracingSession);
            tracingStarted = true;
        }
        const interaction = await performCase(page, caseName, options);
        await page.waitForTimeout(100);
        const data = await page.evaluate(() => {
            const cadence = window.__genomeSpyBenchmarkCadence;
            cadence.active = false;
            cadence.longTaskObserver?.disconnect();
            return {
                cadence: cadence.timestamps,
                longTasks: window.__genomeSpyBenchmarkLongTasks ?? [],
                profile: window.__genomeSpyPerformance?.snapshot(),
            };
        });
        result.cadence = summarizeCadence(data.cadence);
        result.mainThread = summarizeNumbers(data.longTasks);
        result.profile = data.profile;
        result.environment = await readEnvironment(page, renderer, dpr);
        result.interaction = {
            ...interaction,
            keyboardEvents: await readKeyboardEvents(page),
        };
        const validation = validateInteractionResult({
            caseName,
            before: interaction.before,
            after: interaction.after,
            observations: interaction.observations,
            inputActivation: interaction.inputActivation,
            keyboardEvents: result.interaction.keyboardEvents,
            profile: result.profile,
        });
        if (!validation.passed) {
            result.status = "failed";
            result.errors.push(...validation.errors);
        }
        if (options.traces) {
            await stopChromiumTrace(tracingSession, tracePath);
            tracingStarted = false;
        }
        result.correctness = await runCorrectnessControls(page, options);
        if (result.correctness.errors.length) {
            result.status = "failed";
            result.errors.push(...result.correctness.errors);
        }
    } catch (error) {
        result.status = "failed";
        result.errors.push(
            error instanceof Error ? error.message : String(error)
        );
        if (tracingStarted) {
            try {
                await stopChromiumTrace(tracingSession, tracePath);
            } catch {
                // There may not be an active Chromium trace when setup failed.
            }
        }
    } finally {
        await context.close();
    }
    return result;
}

/** @param {import("playwright").CDPSession} session */
async function startChromiumTrace(session) {
    await session.send("Tracing.start", {
        categories:
            "devtools.timeline,v8,gpu,cc,blink.user_timing,disabled-by-default-v8.gc,disabled-by-default-v8.cpu_profiler",
        transferMode: "ReturnAsStream",
    });
}

/** @param {import("playwright").CDPSession | undefined} session @param {string} tracePath */
async function stopChromiumTrace(session, tracePath) {
    if (!session) return;
    const complete = new Promise((resolve) => {
        session.once("Tracing.tracingComplete", resolve);
    });
    await session.send("Tracing.end");
    const event = /** @type {{stream: string}} */ (await complete);
    let trace = "";
    let eof = false;
    while (!eof) {
        const chunk = await session.send("IO.read", { handle: event.stream });
        trace += chunk.data ?? "";
        eof = Boolean(chunk.eof);
    }
    await session.send("IO.close", { handle: event.stream });
    fs.writeFileSync(tracePath, trace);
}

/** @param {import("playwright").Page} page @param {string} caseName @param {BenchmarkOptions} options */
async function performCase(page, caseName, options) {
    const canvas = page.locator("#frame canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Benchmark canvas is not visible.");
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const duration = options.durationMs;
    const before = await captureInteractionState(page);
    const observations = [];
    let inputActivation;

    if (caseName === "horizontal-drag") {
        await drag(
            page,
            center,
            { x: center.x + box.width * 0.45, y: center.y },
            duration
        );
    } else if (caseName === "horizontal-wasd") {
        inputActivation = await activateKeyboardInput(page, center);
        await holdKey(page, "KeyD", duration, observations);
    } else if (caseName === "wheel-zoom") {
        await page.mouse.move(center.x, center.y);
        await wheel(page, center, -120, 0, duration);
    } else if (caseName === "wasd-zoom") {
        inputActivation = await activateKeyboardInput(page, center);
        await holdKey(page, "KeyW", duration, observations);
    } else if (caseName === "open-closeup") {
        inputActivation = await activateKeyboardInput(page, center);
        await toggleCloseup(page, duration, observations);
    } else if (caseName === "closeup-wheel") {
        inputActivation = await activateKeyboardInput(page, center);
        await page.keyboard.down("KeyE");
        await page.waitForTimeout(duration);
        observations.push(await captureInteractionState(page));
        await wheel(page, center, 80, 0, duration);
        observations.push(await captureInteractionState(page));
        await page.keyboard.up("KeyE");
        await page.waitForTimeout(duration);
    } else {
        throw new Error(`Unknown benchmark case: ${caseName}`);
    }

    return {
        before,
        after: await captureInteractionState(page),
        observations,
        inputActivation,
    };
}

/**
 * @typedef {object} InteractionState
 * @property {unknown[][]} domains
 * @property {number | undefined} peekState
 * @property {number | undefined} scrollOffset
 * @property {boolean} sampleView
 * @property {boolean} closeupSupported
 */

/**
 * @param {string} caseName
 * @param {InteractionState} state
 */
export function getCaseApplicability(caseName, state) {
    if (
        (caseName === "open-closeup" || caseName === "closeup-wheel") &&
        !state.closeupSupported
    ) {
        return {
            applicable: false,
            reason: "The subject does not expose a scrollable SampleView closeup state.",
        };
    }

    return { applicable: true };
}

/**
 * @param {object} input
 * @param {string} input.caseName
 * @param {InteractionState} input.before
 * @param {InteractionState} input.after
 * @param {InteractionState[]} input.observations
 * @param {{focused: boolean, hovered: boolean} | undefined} input.inputActivation
 * @param {{type: string, code: string}[]} input.keyboardEvents
 * @param {{frames?: {kind?: string}[], phaseTotals?: Record<string, number>} | undefined} input.profile
 */
export function validateInteractionResult({
    caseName,
    before,
    after,
    observations,
    inputActivation,
    keyboardEvents,
    profile,
}) {
    const errors = [];
    const normalRenderFrames = (profile?.frames ?? []).filter(
        (frame) => frame.kind === "render"
    ).length;

    if (normalRenderFrames < minimumNormalRenderFrames) {
        errors.push(
            `${caseName} captured ${normalRenderFrames} normal render frames; ` +
                `at least ${minimumNormalRenderFrames} are required.`
        );
    }

    const expectedKey = {
        "horizontal-wasd": "KeyD",
        "wasd-zoom": "KeyW",
        "open-closeup": "KeyE",
        "closeup-wheel": "KeyE",
    }[caseName];
    if (expectedKey) {
        if (!inputActivation?.focused && !inputActivation?.hovered) {
            errors.push(
                `${caseName} did not establish a focused or hovered embed.`
            );
        }
        if (
            !keyboardEvents.some(
                (event) =>
                    event.type === "keydown" && event.code === expectedKey
            ) ||
            !keyboardEvents.some(
                (event) => event.type === "keyup" && event.code === expectedKey
            )
        ) {
            errors.push(
                `${caseName} did not receive the expected ${expectedKey} ` +
                    "KeyboardEvent mapping."
            );
        }
    }

    if (
        caseName === "horizontal-drag" ||
        caseName === "horizontal-wasd" ||
        caseName === "wheel-zoom" ||
        caseName === "wasd-zoom"
    ) {
        if (!domainsChanged(before.domains, after.domains)) {
            errors.push(`${caseName} did not change an x-scale domain.`);
        }
    } else if (caseName === "open-closeup") {
        if (
            !observations.some((state) => state.peekState !== before.peekState)
        ) {
            errors.push(`${caseName} did not change the closeup/peek state.`);
        }
    } else if (caseName === "closeup-wheel") {
        if (!observations.some((state) => state.peekState === 1)) {
            errors.push(`${caseName} did not reach closeup state.`);
        }
        if (after.scrollOffset === before.scrollOffset) {
            errors.push(
                `${caseName} did not change the SampleView scroll offset.`
            );
        }
    }

    if (
        (caseName === "horizontal-wasd" ||
            caseName === "wasd-zoom" ||
            caseName === "open-closeup" ||
            caseName === "closeup-wheel") &&
        (profile?.phaseTotals?.layout ?? 0) > 0
    ) {
        errors.push(
            `${caseName} invoked layout computation; keyboard and closeup ` +
                "interactions must remain layout-free."
        );
    }

    return { passed: errors.length === 0, errors };
}

/** @param {unknown[][]} before @param {unknown[][]} after */
function domainsChanged(before, after) {
    if (before.length !== after.length) return true;
    return before.some(
        (domain, index) =>
            JSON.stringify(domain) !== JSON.stringify(after[index])
    );
}

/** @param {import("playwright").Page} page */
async function captureInteractionState(page) {
    return page.evaluate(() => {
        const root = window.__genomeSpyAppHarness?.api.debug.getViewRoot();
        const domains = [];
        const resolutions = new Set();
        let sampleView;

        root?.visit((view) => {
            const resolution = view.getScaleResolution?.("x");
            if (resolution && !resolutions.has(resolution)) {
                resolutions.add(resolution);
                const scale = resolution.getScale?.();
                if (typeof scale?.domain === "function") {
                    const domain = scale.domain();
                    domains.push(
                        Array.from(domain, (value) =>
                            value instanceof Date ? value.toISOString() : value
                        )
                    );
                }
            }

            if (
                typeof view.locationManager?.getPeekState === "function" &&
                typeof view.locationManager?.getScrollOffset === "function"
            ) {
                sampleView = view;
            }
        });

        return {
            domains,
            peekState: sampleView?.locationManager.getPeekState(),
            scrollOffset: sampleView?.locationManager.getScrollOffset(),
            sampleView: Boolean(sampleView),
            closeupSupported:
                Boolean(sampleView) &&
                typeof sampleView.locationManager.getScrollableHeight ===
                    "function" &&
                Number.isFinite(sampleView.childCoords?.height) &&
                sampleView.locationManager.getScrollableHeight() >
                    sampleView.childCoords.height,
        };
    });
}

/** @param {import("playwright").Page} page @param {string} caseName */
async function prepareCase(page, caseName) {
    if (caseName !== "horizontal-drag" && caseName !== "horizontal-wasd") {
        return;
    }

    const canvas = page.locator("#frame canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Benchmark canvas is not visible.");
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const before = await captureInteractionState(page);
    await activateKeyboardInput(page, point);
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(250);
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(250);
    const after = await captureInteractionState(page);
    if (!domainsChanged(before.domains, after.domains)) {
        throw new Error(`Could not establish a zoomed domain for ${caseName}.`);
    }
}

/** @param {import("playwright").Page} page */
async function installKeyboardProbe(page) {
    await page.evaluate(() => {
        const events = [];
        const record = (event) =>
            events.push({
                type: event.type,
                code: event.code,
                target: event.target?.nodeName,
            });
        document.addEventListener("keydown", record, true);
        document.addEventListener("keyup", record, true);
        window.__genomeSpyBenchmarkKeyboard = { events };
    });
}

/** @param {import("playwright").Page} page */
async function readKeyboardEvents(page) {
    return page.evaluate(
        () => window.__genomeSpyBenchmarkKeyboard?.events ?? []
    );
}

/** @param {import("playwright").Page} page @param {{x: number, y: number}} point */
async function activateKeyboardInput(page, point) {
    const canvas = page.locator("#frame canvas");
    await page.mouse.move(point.x, point.y);
    await canvas.focus();
    return page.evaluate(() => {
        const canvas = document.querySelector("#frame canvas");
        return {
            focused: document.activeElement === canvas,
            hovered: canvas?.matches(":hover") ?? false,
        };
    });
}

/**
 * Correctness checks deliberately run after the timed sample has been
 * collected. Their work is reported separately and never enters cadence or
 * CPU comparisons.
 *
 * @param {import("playwright").Page} page
 * @param {BenchmarkOptions} options
 */
async function runCorrectnessControls(page, options) {
    const canvas = page.locator("#frame canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Correctness canvas is not visible.");
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const errors = [];

    try {
        await toggleCloseup(page, 250);
        await toggleCloseup(page, 250);
        await page.mouse.move(point.x, point.y);
        await page.waitForTimeout(150);
        await page.evaluate(() => {
            const root = window.__genomeSpyAppHarness?.api.debug.getViewRoot();
            root?.context.getCurrentHover();
        });
    } catch (error) {
        errors.push(
            `motion/picking: ${error instanceof Error ? error.message : String(error)}`
        );
    }

    for (const [name, selector] of [
        ["filter", options.filterSelector],
        ["sort", options.sortSelector],
    ]) {
        if (!selector) continue;
        try {
            await page.locator(selector).first().click({ timeout: 2_000 });
            await page.waitForTimeout(250);
            await openCloseup(page, 250);
        } catch (error) {
            errors.push(
                `${name}: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    try {
        await page.setViewportSize({
            width: options.viewport.width + 40,
            height: options.viewport.height + 20,
        });
        await page.waitForTimeout(100);
        await page.setViewportSize(options.viewport);
        await page.waitForTimeout(100);
    } catch (error) {
        errors.push(
            `resize: ${error instanceof Error ? error.message : String(error)}`
        );
    }

    return {
        repeatedCloseupTransitions: errors.every(
            (error) => !error.startsWith("motion")
        ),
        hoverAndPickingAfterMotion: errors.every(
            (error) => !error.startsWith("motion")
        ),
        filteringOrSortingFollowedByCloseup:
            Boolean(options.filterSelector || options.sortSelector) &&
            errors.every(
                (error) =>
                    !error.startsWith("filter") && !error.startsWith("sort")
            ),
        resize: errors.every((error) => !error.startsWith("resize")),
        errors,
    };
}

/** @param {import("playwright").Page} page @param {number} duration @param {InteractionState[]} [observations] */
async function openCloseup(page, duration, observations) {
    await holdKey(page, "KeyE", duration, observations);
}

/** @param {import("playwright").Page} page @param {number} duration @param {InteractionState[]} [observations] */
async function toggleCloseup(page, duration, observations) {
    await openCloseup(page, duration, observations);
    await holdKey(page, "KeyE", duration, observations);
}

/** @param {import("playwright").Page} page @param {string} key @param {number} duration @param {InteractionState[]} [observations] */
async function holdKey(page, key, duration, observations) {
    await page.keyboard.down(key);
    await page.waitForTimeout(duration);
    if (observations) observations.push(await captureInteractionState(page));
    await page.keyboard.up(key);
    await page.waitForTimeout(duration);
}

/** @param {import("playwright").Page} page @param {{x: number, y: number}} start @param {{x: number, y: number}} end @param {number} duration */
async function drag(page, start, end, duration) {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, {
        steps: Math.max(10, Math.round(duration / 16)),
    });
    await page.mouse.up();
}

/** @param {import("playwright").Page} page @param {{x: number, y: number}} point @param {number} deltaY @param {number} deltaX @param {number} duration */
async function wheel(page, point, deltaY, deltaX, duration) {
    await page.mouse.move(point.x, point.y);
    const count = Math.max(10, Math.round(duration / 16));
    for (let index = 0; index < count; index += 1) {
        await page.mouse.wheel(deltaX, deltaY);
    }
}

/** @param {import("playwright").Page} page @param {RendererName} renderer @param {number} dpr */
async function readEnvironment(page, renderer, dpr) {
    return page.evaluate(
        async ({ renderer: selectedRenderer, dpr: selectedDpr }) => {
            const adapter = await navigator.gpu?.requestAdapter();
            const adapterInfo =
                adapter?.info ?? (await adapter?.requestAdapterInfo?.());
            let webgl = {};
            const canvas = document.createElement("canvas");
            const gl = canvas.getContext("webgl2");
            const debug = gl?.getExtension("WEBGL_debug_renderer_info");
            if (gl && debug) {
                webgl = {
                    vendor: gl.getParameter(debug.UNMASKED_VENDOR_WEBGL),
                    renderer: gl.getParameter(debug.UNMASKED_RENDERER_WEBGL),
                };
            }
            return {
                renderer: selectedRenderer,
                dpr: selectedDpr,
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                hardwareConcurrency: navigator.hardwareConcurrency,
                deviceMemory: navigator.deviceMemory,
                viewport: { width: innerWidth, height: innerHeight },
                screen: {
                    width: screen.width,
                    height: screen.height,
                    refreshRate: screen.refreshRate,
                },
                webgpu: adapterInfo
                    ? {
                          vendor: adapterInfo.vendor,
                          architecture: adapterInfo.architecture,
                          device: adapterInfo.device,
                          description: adapterInfo.description,
                      }
                    : null,
                webgl,
                preferredFormat: navigator.gpu?.getPreferredCanvasFormat?.(),
            };
        },
        { renderer, dpr }
    );
}

/** @param {number[]} timestamps */
export function summarizeCadence(timestamps) {
    const intervals = [];
    for (let index = 1; index < timestamps.length; index += 1) {
        intervals.push(timestamps[index] - timestamps[index - 1]);
    }
    return {
        frameCount: intervals.length,
        intervals: summarizeNumbers(intervals),
        over16_7: intervals.filter((value) => value > 16.7).length,
        over33_3: intervals.filter((value) => value > 33.3).length,
    };
}

/** @param {number[]} values */
function summarizeNumbers(values) {
    if (!values.length)
        return { median: null, p95: null, p99: null, max: null };
    const sorted = [...values].sort((a, b) => a - b);
    return {
        median: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
        p99: percentile(sorted, 0.99),
        max: sorted.at(-1),
    };
}

/** @param {number[]} sorted @param {number} fraction */
function percentile(sorted, fraction) {
    return sorted[
        Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
    ];
}

/** @param {{options: BenchmarkOptions, samples: object[]}} input */
function createReport({ options, samples }) {
    const passedSamples = samples.filter(
        (sample) => sample.status === "passed"
    );
    const inapplicableSamples = samples.filter(
        (sample) => sample.status === "inapplicable"
    );
    const failedSamples = samples.filter(
        (sample) => sample.status === "failed"
    );
    const completed = samples.every(
        (sample) =>
            sample.status === "passed" || sample.status === "inapplicable"
    );
    const environment = {};
    for (const sample of samples) {
        if (sample.environment && !environment[sample.renderer]) {
            environment[sample.renderer] = sample.environment;
        }
    }
    const missingEnvironment = options.renderers.find(
        (renderer) => !environment[renderer]
    );
    const softwareRenderer = options.renderers.find((renderer) =>
        isSoftwareAdapter(
            renderer === "webgpu"
                ? environment[renderer]?.webgpu
                : environment[renderer]?.webgl
        )
    );
    const hardwareBacked = !missingEnvironment && !softwareRenderer;
    const correctness = samples
        .map((sample) => sample.correctness)
        .filter(Boolean);
    const aa = estimateAaNoise(samples);
    const tolerance = Math.max(0.05, aa.relativeNoiseBound);
    const ratios = [];
    for (const key of new Set(samples.map(sampleKey))) {
        const pair = samples.filter((sample) => sampleKey(sample) === key);
        const webgl = pair.filter((sample) => sample.renderer === "webgl");
        const webgpu = pair.filter((sample) => sample.renderer === "webgpu");
        if (webgl.length && webgpu.length) {
            const webglValue = medianFrameTime(webgl);
            const webgpuValue = medianFrameTime(webgpu);
            if (webglValue > 0 && webgpuValue > 0) {
                ratios.push(webgpuValue / webglValue);
            }
        }
    }
    return {
        generatedAt: new Date().toISOString(),
        methodology: {
            runsPerCell: options.runs,
            cases: options.cases,
            viewport: options.viewport,
            dprs: options.dprs,
            counterbalancedRendererOrder: true,
            freshBrowserContextPerSample: true,
            lowOverheadCadenceIsAuthoritative: true,
            tracesCaptured: options.traces,
            practicalEquivalenceTolerance: tolerance,
            toleranceDefinition:
                "max(5%, same-backend A/A relative noise bound)",
        },
        environment,
        coverage: {
            totalSamples: samples.length,
            passedSamples: passedSamples.length,
            inapplicableSamples: inapplicableSamples.length,
            failedSamples: failedSamples.length,
            inapplicableCases: [
                ...new Set(inapplicableSamples.map((sample) => sample.case)),
            ],
        },
        authoritative:
            options.headed &&
            hardwareBacked &&
            completed &&
            passedSamples.length > 0,
        limitation: !options.headed
            ? "Headless Chromium was requested; use a headed hardware-backed run for final conclusions."
            : missingEnvironment
              ? `No ${missingEnvironment} environment metadata was captured; inspect the failed samples.`
              : softwareRenderer
                ? `${softwareRenderer} adapter appears software-rendered; performance conclusions are not authoritative.`
                : completed
                  ? undefined
                  : "At least one benchmark sample failed; the matrix is incomplete.",
        sameBackendAa: aa,
        cpuTimeRatio: {
            median: ratios.length ? median(ratios) : null,
            bootstrap95: bootstrapInterval(ratios),
            samples: ratios,
        },
        samples,
        correctnessControls: {
            repeatedCloseupTransitions: correctness.every(
                (control) => control.repeatedCloseupTransitions
            ),
            hoverAndPickingAfterMotion: correctness.every(
                (control) => control.hoverAndPickingAfterMotion
            ),
            filteringOrSortingFollowedByCloseup:
                Boolean(options.filterSelector || options.sortSelector) &&
                correctness.every(
                    (control) => control.filteringOrSortingFollowedByCloseup
                ),
            resize: correctness.every((control) => control.resize),
            errors: correctness.flatMap((control) => control.errors),
        },
    };
}

/** @param {object} sample */
function sampleKey(sample) {
    return `${sample.subject}:${sample.case}:dpr${sample.dpr}`;
}

/** @param {object[]} samples */
function estimateAaNoise(samples) {
    const relative = [];
    for (const renderer of ["webgl", "webgpu"]) {
        for (const key of new Set(samples.map(sampleKey))) {
            const values = samples
                .filter(
                    (sample) =>
                        sample.renderer === renderer &&
                        sampleKey(sample) === key
                )
                .map(medianFrameTime)
                .filter((value) => value > 0);
            const center = median(values);
            if (center > 0) {
                for (const value of values)
                    relative.push(Math.abs(value - center) / center);
            }
        }
    }
    return {
        relativeNoiseBound: relative.length ? Math.max(...relative) : 0,
        relativeMedian: relative.length ? median(relative) : 0,
        values: relative,
    };
}

/** @param {object[]} samples */
function medianFrameTime(samples) {
    const sampleList = Array.isArray(samples) ? samples : [samples];
    const values = sampleList
        .flatMap((sample) => sample.profile?.frames ?? [])
        .filter((frame) => frame.kind !== "picking")
        .map((frame) => frame.duration)
        .filter((value) => Number.isFinite(value));
    return median(values);
}

/** @param {number[]} values */
function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
}

/** @param {number[]} values */
function bootstrapInterval(values) {
    if (!values.length) return { low: null, high: null };
    let seed = 0x9e3779b9;
    const draws = [];
    for (let iteration = 0; iteration < 1000; iteration += 1) {
        const resample = [];
        for (let index = 0; index < values.length; index += 1) {
            seed = (1664525 * seed + 1013904223) >>> 0;
            resample.push(values[seed % values.length]);
        }
        draws.push(median(resample));
    }
    draws.sort((a, b) => a - b);
    return { low: percentile(draws, 0.025), high: percentile(draws, 0.975) };
}

/** @param {object} report */
function renderReport(report) {
    const ratio = report.cpuTimeRatio.median;
    const ratioText = ratio == null ? "unavailable" : `${ratio.toFixed(3)}x`;
    const ratioLabel =
        report.environment.webgpu && report.environment.webgl
            ? "WebGPU/WebGL"
            : "Cross-renderer";
    const limitation = report.limitation ?? "None reported.";
    const rows = report.samples
        .filter((sample) => sample.status === "passed")
        .map(
            (sample) =>
                `| ${sample.subject} | ${sample.renderer} | ${sample.case} | ${sample.dpr} | ` +
                `${sample.cadence?.intervals?.median?.toFixed?.(2) ?? "n/a"} | ` +
                `${sample.cadence?.over33_3 ?? "n/a"} |`
        )
        .join("\n");
    return `# GPU interaction benchmark report

Generated: ${report.generatedAt}

This report is generated by the generic benchmark driver. It must be rerun with
the private MCCA spec before making performance conclusions. The low-overhead
in-page cadence measurements are authoritative for frame pacing; browser traces
are attribution evidence and may perturb scheduling.

Authoritative run: **${report.authoritative ? "yes" : "no"}**<br>
Limitation: ${limitation}

Coverage: ${report.coverage.passedSamples} passed, ${report.coverage.inapplicableSamples} inapplicable, ${report.coverage.failedSamples} failed out of ${report.coverage.totalSamples} samples.<br>
Inapplicable cases: ${report.coverage.inapplicableCases.join(", ") || "none"}

The practical CPU equivalence tolerance was fixed before optimization as
\`max(5%, same-backend A/A relative noise bound)\`. The current bound is
\`${(report.methodology.practicalEquivalenceTolerance * 100).toFixed(1)}%\`.

${ratioLabel} median frame-time ratio: **${ratioText}**<br>
Bootstrap 95% interval: \`${report.cpuTimeRatio.bootstrap95.low ?? "n/a"}\` – \`${report.cpuTimeRatio.bootstrap95.high ?? "n/a"}\`

| Subject | Renderer | Case | DPR | rAF median (ms) | gaps >33.3 ms |
| --- | --- | --- | ---: | ---: | ---: |
${rows || "| no completed samples | | | | | |"}

## Measurement and inference boundary

The JSON summary contains phase timings and counters for layout replay, mark
configuration, retained-resource synchronization, placement computation and
copies, renderer draw normalization, draw-global writes, command encoding,
submission, resource creation, and picking where the browser exposes them.
The \`layoutReplay\` phase is render-command collection from an existing
LayoutResult; actual view arrangement and layout computation are recorded as
the separate \`layout\` phase.
Those measurements identify costs; explanations about user-visible judder are
inferences until repeated hardware-backed runs confirm them.

The control subject, when supplied, is intended to expose fixed renderer
overhead. Main-spec-only increases are evidence for mark, facet, or sample
scaling but are not proof of causation by themselves.

## Controls and hypotheses

Correctness controls cover repeated closeup transitions, hover/picking after
motion, optional filter/sort selectors followed by closeup, and resize. Resize
is not mixed into steady-state navigation results.

The driver does not implement retained-frame architecture, scrolling shortcuts,
or smoothing intended to hide missed frames. Any hypothesis not supported by
the recorded counters must be listed as disproved or unresolved in the
experiment notes accompanying the private run.
`;
}

/** @param {string} spec */
function toSpecUrl(spec) {
    if (/^https?:\/\//.test(spec)) return spec;
    if (
        spec.startsWith("/examples/") ||
        spec.startsWith("/private/") ||
        spec.startsWith("/@fs/")
    ) {
        return spec;
    }
    if (path.isAbsolute(spec) && !fs.existsSync(spec)) return spec;
    const absolute = path.resolve(process.cwd(), spec);
    const relative = path
        .relative(repoRoot, absolute)
        .replaceAll(path.sep, "/");
    if (!relative.startsWith("..")) return `/${relative}`;
    return `/@fs/${absolute}`;
}

/** @param {string[]} args @returns {BenchmarkOptions & {help: boolean}} */
export function parseArgs(args) {
    const options = {
        help: false,
        spec: undefined,
        controlSpec: undefined,
        renderers: ["webgl", "webgpu"],
        cases: [...allCases],
        runs: defaultRuns,
        durationMs: defaultDurationMs,
        warmupMs: defaultWarmupMs,
        dprs: [1],
        viewport: defaultViewport,
        serverUrl: undefined,
        outputDir: defaultOutputDir,
        filterSelector: undefined,
        sortSelector: undefined,
        headed: true,
        traces: true,
    };
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === "--help" || arg === "-h") options.help = true;
        else if (arg === "--spec")
            options.spec = requireValue(args, ++index, arg);
        else if (arg === "--control-spec")
            options.controlSpec = requireValue(args, ++index, arg);
        else if (arg === "--renderer") {
            const value = requireValue(args, ++index, arg);
            if (value === "both") options.renderers = ["webgl", "webgpu"];
            else if (value === "webgl" || value === "webgpu")
                options.renderers = [value];
            else throw new Error(`Unknown renderer: ${value}`);
        } else if (arg === "--cases") {
            options.cases = requireValue(args, ++index, arg).split(",");
            for (const caseName of options.cases)
                if (!allCases.includes(caseName))
                    throw new Error(`Unknown case: ${caseName}`);
        } else if (arg === "--runs")
            options.runs = positiveInteger(args, ++index, arg);
        else if (arg === "--duration-ms")
            options.durationMs = positiveNumber(args, ++index, arg);
        else if (arg === "--warmup-ms")
            options.warmupMs = positiveNumber(args, ++index, arg);
        else if (arg === "--dpr")
            options.dprs = [positiveNumber(args, ++index, arg)];
        else if (arg === "--sensitivity-dpr")
            options.dprs = [
                options.dprs[0],
                positiveNumber(args, ++index, arg),
            ];
        else if (arg === "--viewport")
            options.viewport = parseViewport(requireValue(args, ++index, arg));
        else if (arg === "--server-url")
            options.serverUrl = requireValue(args, ++index, arg);
        else if (arg === "--output-dir")
            options.outputDir = path.resolve(requireValue(args, ++index, arg));
        else if (arg === "--filter-selector")
            options.filterSelector = requireValue(args, ++index, arg);
        else if (arg === "--sort-selector")
            options.sortSelector = requireValue(args, ++index, arg);
        else if (arg === "--headed") options.headed = true;
        else if (arg === "--headless") options.headed = false;
        else if (arg === "--no-trace") options.traces = false;
        else throw new Error(`Unknown option: ${arg}`);
    }
    if (!options.spec && !options.help) throw new Error("--spec is required.");
    return options;
}

/** @param {string[]} args @param {number} index @param {string} option */
function requireValue(args, index, option) {
    const value = args[index];
    if (!value || value.startsWith("--"))
        throw new Error(`Missing value for ${option}.`);
    return value;
}

/** @param {string[]} args @param {number} index @param {string} option */
function positiveNumber(args, index, option) {
    const value = Number(requireValue(args, index, option));
    if (!Number.isFinite(value) || value <= 0)
        throw new Error(`${option} must be positive.`);
    return value;
}

/** @param {string[]} args @param {number} index @param {string} option */
function positiveInteger(args, index, option) {
    const value = positiveNumber(args, index, option);
    if (!Number.isInteger(value))
        throw new Error(`${option} must be an integer.`);
    return value;
}

/** @param {string} value */
function parseViewport(value) {
    const match = /^(\d+)x(\d+)$/.exec(value);
    if (!match) throw new Error("Viewport must use WIDTHxHEIGHT.");
    return { width: Number(match[1]), height: Number(match[2]) };
}

function getBrowserArgs() {
    const args = [
        "--enable-unsafe-webgpu",
        "--enable-features=WebGPU",
        "--ignore-gpu-blocklist",
    ];
    if (process.platform === "darwin") args.push("--use-angle=metal");
    return args;
}

/** @param {string} origin @param {import("node:child_process").ChildProcess | undefined} child */
async function waitForServer(origin, child) {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        if (child?.exitCode != null)
            throw new Error(`Dev server exited with code ${child.exitCode}.`);
        try {
            if ((await fetch(new URL(healthCheckPath, origin))).ok) return;
        } catch {
            // The dev server may still be starting.
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out while waiting for ${origin}${healthCheckPath}.`);
}

async function startDevServer(origin) {
    const port = String(new URL(origin).port || "4173");
    const child = spawn("node", ["dev-server.mjs"], {
        cwd: appPackageDir,
        env: { ...process.env, PORT: port },
        stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    return child;
}

/** @param {import("node:child_process").ChildProcess | undefined} child */
async function stopServer(child) {
    if (!child || child.exitCode !== null) return;
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
}

function isSoftwareAdapter(info) {
    const text = JSON.stringify(info ?? {}).toLowerCase();
    return /swiftshader|software|llvmpipe|angle \(.*swiftshader/.test(text);
}

if (path.resolve(process.argv[1] ?? "") === scriptPath) {
    await main().catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
