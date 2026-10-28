import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import process from "node:process";
import { performance } from "node:perf_hooks";
import console from "node:console";
import { fileURLToPath, URL } from "node:url";
import { getContigs } from "../packages/core/src/genome/genomes.js";

/* global window, document, requestAnimationFrame, AbortSignal */

/**
 * @typedef {{url: string, range: string, bytes: number, status: number, contentRange?: string}} SignalRequest
 * @typedef {{format: string, name: string, state: Record<string, any>}} BrushResult
 */

const root = fileURLToPath(new URL("../", import.meta.url));
const origin = process.env.FIGWIG_APP_ORIGIN ?? "http://127.0.0.1:8080";
const recipe =
    "private/genomespy-dataset-recipes/recipes/encode-mouse-fetal-development-mm10";
const output = path.join(root, "output/playwright");
const wholeGenome = process.env.FIGWIG_WHOLE_GENOME === "1";
const genomeSize = getContigs("mm10").reduce(
    (sum, contig) => sum + contig.size,
    0
);
const bookmarks = JSON.parse(
    await readFile(path.join(root, recipe, "specs/bookmarks.json"), "utf8")
);
const formats = process.argv[2] ? [process.argv[2]] : ["bigwig", "figwig"];
assert(
    process.argv.length <= 3 &&
        formats.every((format) => ["bigwig", "figwig"].includes(format)),
    "Usage: node scripts/benchmarkFigwigApp.mjs [bigwig|figwig]"
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
/** @type {(BrushResult & Record<string, any>)[]} */
const results = [];

try {
    for (const format of formats) {
        const spec = format === "figwig" ? "spec-figwig.json" : "spec.json";
        const context = await browser.newContext({
            viewport: { width: 1440, height: 1000 },
        });
        const page = await context.newPage();
        if (wholeGenome) {
            await page.route(
                (url) => url.pathname === `/${recipe}/specs/${spec}`,
                async (route) => {
                    const response = await route.fetch();
                    const specification = await response.json();
                    // Authored locus domains include both endpoint bases.
                    specification.scales.x.domain = [0, genomeSize - 1];
                    delete specification.bookmarks.remote.initialBookmark;
                    specification.bookmarks.remote.tour = false;
                    await route.fulfill({ response, json: specification });
                }
            );
        }
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
        await cdp.send("Performance.enable");
        /** @type {SignalRequest[]} */
        const requests = [];
        /** @type {Map<string, SignalRequest>} */
        const byId = new Map();
        /** @type {string[]} */
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
            if (message.type() === "error") errors.push(message.text());
        });
        cdp.on("Network.requestWillBeSent", (event) => {
            if (/\.(fw|bigWig)(\?|$)/.test(event.request.url)) {
                const request = {
                    url: event.request.url,
                    range: event.request.headers.Range,
                    bytes: 0,
                    status: 0,
                };
                requests.push(request);
                byId.set(event.requestId, request);
            }
        });
        cdp.on("Network.responseReceived", (event) => {
            const request = byId.get(event.requestId);
            if (request) {
                request.status = event.response.status;
                request.contentRange = event.response.headers["Content-Range"];
            }
        });
        cdp.on("Network.dataReceived", (event) => {
            const request = byId.get(event.requestId);
            if (request) request.bytes += event.encodedDataLength;
        });
        // Instrument the actual source boundary without changing the product API.
        await page.route("**/singlePageApp.js*", async (route) => {
            const response = await route.fetch();
            const prefix = `
import FigWigExperimentSource from ${JSON.stringify("/@fs" + path.join(root, "packages/core/src/data/sources/lazy/figWigSource.js"))};
import ExperimentLazySource from ${JSON.stringify("/@fs" + path.join(root, "packages/core/src/data/sources/lazy/singleAxisLazySource.js"))};
window.experiment = {readers:new Set(), publications:[], headerCalls:0, queryTimes:[], binQueries:[]};
const originalLoadWindow = FigWigExperimentSource.prototype.loadWindow;
FigWigExperimentSource.prototype.loadWindow = async function(domain, handles, signal) {
    for (const handle of handles) {
        const reader = handle.reader;
        if (!window.experiment.readers.has(reader)) {
            window.experiment.readers.add(reader);
            const getHeader = reader.getHeader;
            reader.getHeader = function(...args) {
                window.experiment.headerCalls++;
                return getHeader.apply(this,args);
            };
            const getBinsMulti = reader.getBinsMulti;
            reader.getBinsMulti = async function(regions, options) {
                const result = await getBinsMulti.call(this, regions, options);
                window.experiment.binQueries.push({
                    regions, binSize:options.binSize, missing:options.missing,
                    requireSummaries:options.requireSummaries,
                    sources:result.map(batch=>batch.source),
                });
                return result;
            };
        }
    }
    const start = performance.now();
    try { return await originalLoadWindow.call(this,domain,handles,signal); }
    finally {window.experiment.queryTimes.push(performance.now()-start);}
};
const originalPublish = ExperimentLazySource.prototype.publishData;
ExperimentLazySource.prototype.publishData = function(chunks,domain) {
    const result = originalPublish.call(this,chunks,domain);
    if (["figWigSource","bigWigSource"].includes(this.label)) {
        window.experiment.publications.push({time:performance.now(),rows:chunks.reduce((n,c)=>n+c.length,0)});
    }
    return result;
};
`;
            console.log("Instrumenting App entry", route.request().url());
            await route.fulfill({
                response,
                body: prefix + (await response.text()),
            });
        });

        async function snapshot() {
            return page.evaluate(async () => {
                const api = window.__genomeSpy.api;
                await api.awaitVisibleLazyData(AbortSignal.timeout(60000));
                await new Promise((resolve) =>
                    requestAnimationFrame(() => requestAnimationFrame(resolve))
                );
                const app = document.querySelector("genome-spy-toolbar").app;
                const root = api.debug.getViewRoot();
                const sv = app.getSampleView();
                const source = root.context.dataFlow.dataSources.find((s) =>
                    ["figWigSource", "bigWigSource"].includes(s.label)
                );
                const view = source.view;
                const rows = Array.from(view.getCollector().getData());
                const sampleIds = sv.getSamples().map((sample) => sample.id);
                let derived;
                try {
                    const info =
                        sv.compositeAttributeInfoSource.getAttributeInfo({
                            type: "SAMPLE_ATTRIBUTE",
                            specifier: "Selected H3K27ac mean",
                        });
                    derived = Object.fromEntries(
                        sampleIds.map((id) => [
                            id,
                            info.accessor(id, sv.sampleHierarchy),
                        ])
                    );
                } catch {
                    // Derived metadata is absent until the third bookmark creates it.
                }
                const diagnostics = Array.from(
                    window.experiment.readers,
                    (reader) => reader.getDiagnostics()
                );
                return {
                    loading: api.dataLoading.getSnapshot(),
                    intent: app.store.getState().intentStatus,
                    sampleIds,
                    visibleSamples: sv.paramRuntime.findValue("visibleSamples"),
                    rowSamples: Array.from(
                        new Set(rows.map((r) => r.sampleId))
                    ),
                    rows: rows.length,
                    invalid: rows.filter(
                        (r) => !Number.isFinite(r.score) || r.end <= r.start
                    ).length,
                    domain: view.getScaleResolution("x").getComplexDomain(),
                    derived,
                    brush: view.paramRuntime.findValue("brush"),
                    plots: document
                        .querySelector("gs-bookmark-info-box")
                        ?.plotResults.map((result) => ({
                            error: result.error,
                            summary: result.plot?.summary,
                            spec: result.plot?.spec,
                        })),
                    readers: window.experiment.readers.size,
                    headerCallsAfterInitialization:
                        window.experiment.headerCalls,
                    queryTimes: window.experiment.queryTimes.slice(),
                    binQueries: window.experiment.binQueries.slice(),
                    diagnostics,
                    publications: window.experiment.publications.slice(),
                    memory: performance.memory?.usedJSHeapSize,
                };
            });
        }

        async function metrics() {
            const { metrics } = await cdp.send("Performance.getMetrics");
            return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
        }
        /** @param {string} name @param {() => Promise<void>} action */
        async function stage(name, action) {
            const startIndex = requests.length;
            const before = await metrics();
            const start = performance.now();
            await action();
            const state = await snapshot();
            assert.equal(
                state.invalid,
                0,
                "published records must be finite half-open intervals"
            );
            assert.equal(
                state.loading.filter((entry) => entry.status === "error")
                    .length,
                0
            );
            assert.equal(state.intent?.status, "idle");
            assert.deepEqual(
                state.rowSamples.toSorted(),
                state.visibleSamples.toSorted(),
                "signal tracks must match visible samples"
            );
            if (format === "figwig")
                assert.equal(
                    state.readers,
                    1,
                    "track changes must reuse the reader"
                );
            if (
                wholeGenome &&
                format === "figwig" &&
                !name.includes("bookmark") &&
                name !== "pan-after-filter"
            ) {
                assert(
                    state.diagnostics.every((d) => d.chunksFetched === 0),
                    "whole-genome fast views must never decode raw chunks"
                );
                assert(
                    state.binQueries.every(
                        (q) =>
                            q.requireSummaries &&
                            q.sources.every((source) => source === "summary")
                    )
                );
            }
            if (name.endsWith("bookmark-3")) {
                assert.equal(
                    Object.keys(state.derived).length,
                    24,
                    "brush metadata must cover all samples"
                );
                assert(Object.values(state.derived).every(Number.isFinite));
                assert.equal(state.plots.length, 1);
                assert.equal(state.plots[0].error, undefined);
            }
            const elapsedMs = performance.now() - start;
            const after = await metrics();
            const network = requests.slice(startIndex);
            const bytes = network.reduce((n, r) => n + r.bytes, 0);
            const result = {
                name,
                elapsedMs,
                firstSignalPublicationMs: state.publications[0]?.time ?? null,
                // Signal bodies only: excludes headers, App modules, fonts and other data.
                signal: {
                    requests: network.length,
                    bytes,
                    partialResponses: network.filter((r) => r.status === 206)
                        .length,
                },
                requests: network.length,
                bytes,
                scriptMs:
                    1000 *
                    ((after.ScriptDuration ?? 0) -
                        (before.ScriptDuration ?? 0)),
                heapBytes: after.JSHeapUsedSize,
                state,
            };
            results.push({ format, ...result });
            await writeFile(
                path.join(
                    output,
                    `${format}-${name.replaceAll(/[^a-z0-9]+/gi, "-")}.json`
                ),
                JSON.stringify(result, null, 2)
            );
            console.log(
                JSON.stringify({
                    format,
                    name,
                    elapsedMs: Math.round(elapsedMs),
                    firstSignalPublicationMs: result.firstSignalPublicationMs,
                    requests: result.requests,
                    bytes: result.bytes,
                    samples: state.sampleIds.length,
                    rowSamples: state.rowSamples.length,
                    rows: state.rows,
                    readers: state.readers,
                    errors: state.loading.filter((e) => e.status === "error"),
                    intent: state.intent?.status,
                })
            );
            return result;
        }

        await stage("initial-cold", async () => {
            await page.goto(`${origin}/?spec=${recipe}/specs/${spec}`);
            await page.waitForFunction(() => window.__genomeSpy?.api, null, {
                timeout: 60000,
            });
        });
        // Let completed loading indicators finish their fade before capture.
        await page.locator(".loading-indicators").waitFor({ state: "hidden" });
        await page.screenshot({
            path: path.join(
                output,
                `${format}-${wholeGenome ? "whole-genome" : "overview"}.png`
            ),
        });
        if (wholeGenome) {
            await stage("whole-genome-warm", async () => {
                await page.evaluate(async () => {
                    const source = window.__genomeSpy.api.debug
                        .getViewRoot()
                        .context.dataFlow.dataSources.find(
                            (s) =>
                                s.label === "figWigSource" ||
                                s.label === "bigWigSource"
                        );
                    await source.requestInterval(
                        source.scaleResolution.getDomain()
                    );
                });
            });
            await stage("whole-genome-six-tracks", async () => {
                await page.evaluate(async (actions) => {
                    const app =
                        document.querySelector("genome-spy-toolbar").app;
                    await app.intentPipeline.submit(actions);
                }, bookmarks[1].actions);
            });
            await stage("whole-genome-pan", async () => {
                await page.evaluate(async (size) => {
                    const app =
                        document.querySelector("genome-spy-toolbar").app;
                    await app.genomeSpy
                        .getNamedScaleResolutions()
                        .get("x_at_root")
                        .zoomTo([size * 0.05, size * 0.95], false);
                }, genomeSize);
            });
        }
        for (const pass of ["cold", "warm"]) {
            for (let index = 0; index < bookmarks.length; index++) {
                const bookmark = bookmarks[index];
                await stage(`${pass}-bookmark-${index + 1}`, async () => {
                    await page.evaluate(async (bookmark) => {
                        const { restoreBookmarkAndShowInfoBox } =
                            await import("/bookmark/bookmark.js");
                        const app =
                            document.querySelector("genome-spy-toolbar").app;
                        await restoreBookmarkAndShowInfoBox(bookmark, app, {
                            database: app.remoteBookmarkDatabase,
                        });
                    }, bookmark);
                });
                if (pass === "cold")
                    await page.screenshot({
                        path: path.join(
                            output,
                            `${format}-bookmark-${index + 1}.png`
                        ),
                    });
            }
        }
        await stage("pan-after-filter", async () => {
            await page.evaluate(async (bookmark) => {
                const { restoreBookmark } =
                    await import("/bookmark/bookmark.js");
                const app = document.querySelector("genome-spy-toolbar").app;
                await restoreBookmark(bookmark, app);
                const resolution = app.genomeSpy
                    .getNamedScaleResolutions()
                    .get("x_at_root");
                await resolution.zoomTo(
                    [
                        { chrom: "chr10", pos: 87310000 },
                        { chrom: "chr10", pos: 87520000 },
                    ],
                    false
                );
            }, bookmarks[1]);
        });
        await writeFile(
            path.join(output, `${format}-network.json`),
            JSON.stringify({ requests, errors }, null, 2)
        );
        console.log({ format, errors });
        await context.close();
    }
    await writeFile(
        path.join(
            output,
            `benchmark-results-${wholeGenome ? "whole-genome-" : ""}${formats.join("-")}.json`
        ),
        JSON.stringify(results, null, 2)
    );
} finally {
    await browser.close();
}

if (formats.length === 2) {
    await writeBrushComparison(results);
}

/**
 * Compare restored brush metadata with exact covered-base means over the same
 * interval. This quantifies coarse-bin differences without imposing pixel parity.
 * @param {BrushResult[]} results
 */
async function writeBrushComparison(results) {
    const brushAction = bookmarks[2].actions.find(
        (action) => action.type === "paramProvenance/paramChange"
    );
    const [start, end] = brushAction.payload.value.intervals.x;
    const reference = JSON.parse(
        await readFile(
            path.join(root, recipe, "output/figwig/numeric-reference.json"),
            "utf8"
        )
    );
    const test = reference.cases.find(
        (test) =>
            test.chromosome === start.chrom &&
            test.start === start.pos &&
            test.end === end.pos &&
            test.binSize === end.pos - start.pos
    );
    assert(
        test,
        "Numerical reference must contain the exact bookmark brush interval"
    );

    const comparisons = ["cold", "warm"].map((pass) => {
        const states = Object.fromEntries(
            ["bigwig", "figwig"].map((format) => [
                format,
                results.find(
                    (result) =>
                        result.format === format &&
                        result.name === pass + "-bookmark-3"
                ).state,
            ])
        );
        const rows = reference.samples.map((sampleId, index) => {
            const expected = test.expected[index][0];
            assert(
                Number.isFinite(expected),
                "Brush reference must have observed signal"
            );
            const bigwig = states.bigwig.derived[sampleId];
            const figwig = states.figwig.derived[sampleId];
            return {
                sampleId,
                expected,
                bigwig,
                figwig,
                bigwigError: difference(bigwig, expected),
                figwigError: difference(figwig, expected),
                betweenFormats: difference(figwig, bigwig),
            };
        });
        return {
            pass,
            maxErrors: Object.fromEntries(
                ["bigwigError", "figwigError", "betweenFormats"].map((key) => [
                    key,
                    {
                        absolute: Math.max(
                            ...rows.map((row) => row[key].absolute)
                        ),
                        relative: Math.max(
                            ...rows.flatMap((row) =>
                                row[key].relative === null
                                    ? []
                                    : [row[key].relative]
                            )
                        ),
                    },
                ])
            ),
            rows,
        };
    });
    await writeFile(
        path.join(root, recipe, "output/figwig/brush-comparison.json"),
        JSON.stringify(
            {
                interval: {
                    chromosome: start.chrom,
                    start: start.pos,
                    end: end.pos,
                },
                methodology:
                    "Restored brush weighted means versus exact original BigWig covered-base means. Relative errors use the reference denominator; nonzero errors against zero have null relative error. Published coarse bins are piecewise constant, so arbitrary brush boundaries can differ from exact interval means.",
                comparisons,
            },
            null,
            2
        ) + "\n"
    );
}

/** @param {number} actual @param {number} expected */
function difference(actual, expected) {
    assert(Number.isFinite(actual));
    const absolute = Math.abs(actual - expected);
    return {
        absolute,
        relative:
            expected === 0
                ? actual === 0
                    ? 0
                    : null
                : absolute / Math.abs(expected),
    };
}
