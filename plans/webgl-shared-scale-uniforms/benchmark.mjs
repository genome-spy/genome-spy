import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const [baseline, candidate, output, pairs = "5"] = process.argv.slice(2);
const diagnostics = process.env.SHARED_SCALE_DIAGNOSTICS === "1";
const sampleCount = 1536;
const attributeCount = 20;
const groupCount = 24;
const trackCount = 24;
const origin = 2 ** 26;

function createFixture() {
    const groups = Array.from({ length: groupCount }, (_, i) => `G${i + 1}`);
    const names = Array.from(
        { length: attributeCount - 1 },
        (_, i) => `attr${i + 1}`
    );
    const metadata = Array.from({ length: sampleCount }, (_, i) => {
        const row = { sample: `S${i}`, group: groups[i % groupCount] };
        names.forEach((name, j) => {
            row[name] =
                j % 2
                    ? "ABCD"[(i + j) % 4]
                    : i % 37 === 0
                      ? null
                      : ((i * 37 + j * 71) % 1000) / 999;
        });
        return row;
    });
    const attributes = { group: { type: "nominal", width: 14 } };
    names.forEach((name, j) => {
        attributes[name] =
            j % 2
                ? { type: "nominal", width: 14 }
                : {
                      type: "quantitative",
                      width: 14,
                      barScale: { domain: [0, 1] },
                  };
    });
    return {
        samples: { labelLength: 80 },
        metadata: {
            sources: [
                {
                    backend: { backend: "data", data: { values: metadata } },
                    attributes,
                },
            ],
        },
        sampleLayout: {
            sampleHeight: 35,
            groupSpacing: 5,
            peekGroupSpacing: 15,
        },
        data: {
            values: metadata.flatMap(({ sample }, i) =>
                Array.from({ length: 16 }, (_, j) => ({
                    sample,
                    start: j * 64,
                    end: (j + 1) * 64,
                    value: ((i + j * 23) % 101) / 100,
                }))
            ),
        },
        spec: {
            name: "signal",
            mark: "rect",
            encoding: {
                sample: { field: "sample" },
                x: {
                    field: "start",
                    type: "index",
                    scale: { domain: [0, 1024], zoom: true },
                },
                x2: { field: "end" },
                y: {
                    field: "value",
                    type: "quantitative",
                    scale: { domain: [0, 1], zoom: false },
                    axis: null,
                },
                y2: { datum: 0 },
            },
        },
    };
}

function createTracks() {
    return {
        spacing: 3,
        scales: {
            x: {
                type: "index",
                domain: [origin + 256, origin + 767],
                zoom: { extent: [origin, origin + 1024] },
            },
        },
        vconcat: Array.from({ length: trackCount }, (_, track) => ({
            name: "track" + track,
            height: 22,
            data: {
                values: Array.from({ length: 64 }, (_, i) => ({
                    start: origin + i * 16,
                    end: origin + i * 16 + 9,
                    value: (((i + track) % 9) + 1) / 10,
                })),
            },
            mark: { type: "rect", fill: track % 2 ? "#698ca7" : "#965d6a" },
            encoding: {
                x: { field: "start", type: "index", axis: null },
                x2: { field: "end" },
                y: {
                    field: "value",
                    type: "quantitative",
                    scale: { domain: [0, 1] },
                    axis: null,
                },
                y2: { datum: 0 },
            },
        })),
    };
}

const fixtures = { samples: createFixture(), tracks: createTracks() };

async function run(browser, base, workload) {
    const page = await browser.newPage({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
    });
    try {
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
            const text = message.text();
            if (
                text.includes("WebGL: INVALID_") ||
                (message.type() === "error" &&
                    !text.startsWith("Failed to load resource"))
            )
                errors.push(text);
        });
        if (diagnostics) await page.addInitScript(installCounters);
        await page.route(
            (url) => url.pathname === "/shared-scale-fixture.json",
            (route) => route.fulfill({ json: fixtures[workload] })
        );
        await page.goto(
            new URL(
                "/screenshot.html?renderer=webgl&spec=/shared-scale-fixture.json",
                base
            ).href
        );
        await page.waitForFunction(
            () =>
                ["ready", "error"].includes(
                    window.__genomeSpyScreenshot?.status
                ),
            undefined,
            { timeout: 60000 }
        );
        const state = await page.evaluate(() => window.__genomeSpyScreenshot);
        assert.equal(state.status, "ready", state.error);
        const scene = await page.evaluate(
            async ({
                workload,
                diagnostics,
                sampleCount,
                attributeCount,
                groupCount,
            }) => {
                const { api } = window.__genomeSpyAppHarness;
                const root = api.debug.getViewRoot();
                const frames = () =>
                    new Promise((resolve) =>
                        requestAnimationFrame(() =>
                            requestAnimationFrame(resolve)
                        )
                    );
                let view;
                root.visit((child) => {
                    if (child.locationManager) view = child;
                });
                if (workload === "samples") {
                    await view.awaitMetadataReady();
                    view.dispatchAttributeAction(
                        view.actions.groupByNominal({
                            attribute: {
                                type: "SAMPLE_ATTRIBUTE",
                                specifier: "group",
                            },
                        })
                    );
                    await frames();
                    if (
                        view.leafSamples.length !== sampleCount ||
                        view.metadataView.getVisibleAttributeNames().length !==
                            attributeCount ||
                        view.sampleHierarchy.rootGroup.groups.length !==
                            groupCount
                    ) {
                        throw new Error(
                            "SampleView fixture did not render all samples, attributes, and groups"
                        );
                    }
                    if (diagnostics) {
                        const camera = view.locationManager;
                        const toggle = camera.togglePeek.bind(camera);
                        camera.togglePeek = (open) =>
                            toggle(
                                open,
                                300,
                                camera.getBandLayout().sampleIds[768]
                            );
                    }
                }
                const track = root.findDescendantByName("track12");
                const scale = track?.getScaleResolution("x");
                window.sharedScaleTest = { view, scale };
                if (diagnostics)
                    root._addBroadcastHandler(
                        "layout",
                        () => window.rowCounters.layouts++
                    );
                const canvas = document
                    .querySelector("#frame canvas")
                    .getBoundingClientRect();
                const coords = view?.childCoords ?? track.layoutCoords;
                return {
                    x: Math.round(canvas.left + coords.x + coords.width / 2),
                    y: Math.round(canvas.top + coords.y + coords.height / 2),
                    profiling: Boolean(window.__genomeSpyPerformance?.enabled),
                    coords: [coords.x, coords.y, coords.width, coords.height],
                    zoom: scale?.isZoomable(),
                };
            },
            { workload, diagnostics, sampleCount, attributeCount, groupCount }
        );
        assert.equal(scene.profiling, false);
        await page.mouse.move(scene.x, scene.y);
        await page.locator("#frame canvas").focus();
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Performance.enable", { timeDomain: "threadTicks" });
        const taskTime = async () =>
            (await cdp.send("Performance.getMetrics")).metrics.find(
                ({ name }) => name === "TaskDuration"
            ).value;
        async function measure(action) {
            const before =
                diagnostics && (await page.evaluate(() => window.rowCounters));
            const start = await taskTime();
            await action();
            const milliseconds = ((await taskTime()) - start) * 1000;
            const after =
                diagnostics && (await page.evaluate(() => window.rowCounters));
            return {
                milliseconds,
                counts: diagnostics
                    ? Object.fromEntries(
                          Object.entries(after).map(([k, v]) => [
                              k,
                              v - before[k],
                          ])
                      )
                    : undefined,
            };
        }
        async function wheel(delta, count, horizontal = false) {
            for (let i = 0; i < count; i++) {
                await page.mouse.wheel(
                    horizontal ? delta : 0,
                    horizontal ? 0 : delta
                );
                await page.waitForTimeout(16);
            }
            await page.waitForTimeout(180);
        }
        const results = {};
        if (workload === "samples") {
            await page.keyboard.down("KeyE");
            await page.waitForTimeout(650);
            assert.equal(
                await page.evaluate(() =>
                    window.sharedScaleTest.view.locationManager.getPeekState()
                ),
                1
            );
            await wheel(-72, 40);
            const before = await page.evaluate(() =>
                window.sharedScaleTest.view.locationManager.getScrollOffset()
            );
            results.scroll = await measure(() => wheel(72, 40));
            const after = await page.evaluate(() =>
                window.sharedScaleTest.view.locationManager.getScrollOffset()
            );
            assert.equal(after - before, 5760);
        } else {
            const domain = () =>
                page.evaluate(() =>
                    window.sharedScaleTest.scale.getScale().domain()
                );
            await wheel(-8, 26, true);
            const beforePan = await domain();
            results.pan = await measure(() => wheel(8, 26, true));
            assert.notDeepEqual(
                await domain(),
                beforePan,
                "Pan did not move x: " + JSON.stringify(scene)
            );
            await page.mouse.move(scene.x, scene.y);
            await wheel(-35, 5);
            const beforeZoom = await domain();
            results.zoom = await measure(() => wheel(-35, 15));
            assert.notDeepEqual(await domain(), beforeZoom);
        }
        let verification;
        if (diagnostics) {
            for (const result of Object.values(results)) {
                assert.equal(result.counts.layouts, 0);
                assert.ok(result.counts.visibleFrames > 0);
            }
        }
        if (diagnostics && workload === "samples") {
            verification = await page.evaluate(async () => {
                const { api } = window.__genomeSpyAppHarness;
                const { view } = window.sharedScaleTest;
                view.dispatchAttributeAction(
                    view.actions.groupToQuartiles({
                        attribute: {
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "attr1",
                        },
                    })
                );
                await api.awaitVisibleLazyData(AbortSignal.timeout(10000));
                await new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve))
                );
                const { blob } = await api.imageExport.raster({
                    pixelRatio: 1,
                });
                const bitmap = await createImageBitmap(blob);
                const canvas = new OffscreenCanvas(120, 90);
                const context = canvas.getContext("2d");
                context.drawImage(bitmap, 0, 0, 120, 90);
                bitmap.close();
                return {
                    width: bitmap.width,
                    height: bitmap.height,
                    pixels: Array.from(
                        context.getImageData(0, 0, 120, 90).data
                    ),
                };
            });
        }
        assert.deepEqual(errors, []);
        return { results, verification };
    } finally {
        await page.close();
    }
}

function installCounters() {
    const counts = (window.rowCounters = {
        layouts: 0,
        webglWrites: 0,
        sharedWrites: 0,
        viewUploads: 0,
        markUploads: 0,
        visibleFrames: 0,
        pickingFrames: 0,
    });
    const gl = WebGL2RenderingContext.prototype;
    const blockNames = new WeakMap();
    const bufferNames = new WeakMap();
    const boundBuffers = new WeakMap();
    const programs = new WeakMap();
    const framebuffers = new WeakMap();
    const useProgram = gl.useProgram;
    gl.useProgram = function (program) {
        programs.set(this, program);
        return useProgram.call(this, program);
    };
    const blockBinding = gl.uniformBlockBinding;
    gl.uniformBlockBinding = function (program, index, binding) {
        if (!blockNames.has(program)) blockNames.set(program, new Map());
        blockNames
            .get(program)
            .set(binding, this.getActiveUniformBlockName(program, index));
        return blockBinding.call(this, program, index, binding);
    };
    const bindBuffer = gl.bindBuffer;
    gl.bindBuffer = function (target, buffer) {
        if (target === this.UNIFORM_BUFFER) boundBuffers.set(this, buffer);
        return bindBuffer.call(this, target, buffer);
    };
    function rememberBinding(context, index, buffer) {
        boundBuffers.set(context, buffer);
        const name = blockNames.get(programs.get(context))?.get(index);
        if (buffer && name) bufferNames.set(buffer, name);
    }
    const bindRange = gl.bindBufferRange;
    gl.bindBufferRange = function (target, index, buffer, ...rest) {
        if (target === this.UNIFORM_BUFFER)
            rememberBinding(this, index, buffer);
        return bindRange.call(this, target, index, buffer, ...rest);
    };
    function countUpload(context) {
        counts.webglWrites++;
        const name = bufferNames.get(boundBuffers.get(context));
        if (name === "View") counts.viewUploads++;
        if (name === "Mark") counts.markUploads++;
        if (name?.startsWith("SharedScale_")) counts.sharedWrites++;
    }
    const allocate = gl.bufferData;
    gl.bufferData = function (target, data, ...rest) {
        if (target === this.UNIFORM_BUFFER) countUpload(this);
        return allocate.call(this, target, data, ...rest);
    };
    const write = gl.bufferSubData;
    gl.bufferSubData = function (target, offset, data, ...rest) {
        if (target === this.UNIFORM_BUFFER) countUpload(this);
        return write.call(this, target, offset, data, ...rest);
    };
    const bind = gl.bindBufferBase;
    gl.bindBufferBase = function (target, index, buffer) {
        if (target === this.UNIFORM_BUFFER)
            rememberBinding(this, index, buffer);
        return bind.call(this, target, index, buffer);
    };
    const bindFramebuffer = gl.bindFramebuffer;
    gl.bindFramebuffer = function (target, framebuffer) {
        if (target !== this.READ_FRAMEBUFFER)
            framebuffers.set(this, framebuffer);
        return bindFramebuffer.call(this, target, framebuffer);
    };
    const clear = gl.clear;
    gl.clear = function (mask) {
        if (mask & this.COLOR_BUFFER_BIT) {
            if (framebuffers.get(this)) counts.pickingFrames++;
            else counts.visibleFrames++;
        }
        return clear.call(this, mask);
    };
}

const browser = await chromium.launch({
    channel: "chrome",
    headless: false,
    args:
        process.platform === "darwin"
            ? ["--use-angle=metal", "--ignore-gpu-blocklist"]
            : [],
});
const rows = [];
try {
    for (const workload of process.env.SHARED_SCALE_WORKLOAD
        ? [process.env.SHARED_SCALE_WORKLOAD]
        : Object.keys(fixtures)) {
        for (let pair = -1; pair < Number(pairs); pair++) {
            const samples = {};
            for (const variant of pair % 2 === 0
                ? ["baseline", "candidate"]
                : ["candidate", "baseline"]) {
                samples[variant] = await run(
                    browser,
                    variant === "baseline" ? baseline : candidate,
                    workload
                );
                console.log(workload, pair, variant, samples[variant].results);
            }
            if (diagnostics && workload === "samples") {
                const a = samples.baseline.verification;
                const b = samples.candidate.verification;
                assert.deepEqual([b.width, b.height], [a.width, a.height]);
                const delta =
                    a.pixels.reduce(
                        (sum, v, i) => sum + Math.abs(v - b.pixels[i]),
                        0
                    ) / a.pixels.length;
                assert.ok(
                    delta < 1,
                    "SampleView export mean channel difference " + delta
                );
            }
            if (diagnostics) {
                for (const [name, result] of Object.entries(
                    samples.candidate.results
                )) {
                    assert.equal(
                        samples.baseline.results[name].counts.sharedWrites,
                        0
                    );
                    assert.ok(
                        result.counts.sharedWrites > 0,
                        workload + " " + name + " should update a shared scale"
                    );
                    assert.ok(
                        result.counts.markUploads <
                            samples.baseline.results[name].counts.markUploads
                    );
                }
            }
            rows.push({
                workload,
                pair,
                baseline: samples.baseline.results,
                candidate: samples.candidate.results,
            });
            await writeFile(
                output,
                JSON.stringify({ browser: browser.version(), rows }, null, 2) +
                    "\n"
            );
        }
    }
} finally {
    await browser.close();
}
