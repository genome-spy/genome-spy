import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { chromium } from "playwright";

const [, , dataBaseUrl, output, repetitionsArg = "3"] = process.argv;
if (!dataBaseUrl || !output || process.argv.length > 5) {
    throw new Error(
        "Usage: node scripts/benchmarkFigwigGroups.mjs http://127.0.0.1:8080/private/.../output/figwig/ report.json [repetitions]"
    );
}
const repetitions = Number(repetitionsArg);
assert(Number.isSafeInteger(repetitions) && repetitions > 0);
const root = fileURLToPath(new URL("../", import.meta.url));
const origin = new URL(dataBaseUrl).origin;
// Vite must transform the bare package import, including Pako's CommonJS code.
const entry = root + "private/figwig/benchmarkEntry.js";
mkdirSync(root + "private/figwig", { recursive: true });
writeFileSync(entry, 'export { FigWig } from "@genome-spy/figwig";\n');
const moduleUrl = origin + "/@fs" + entry;
const layouts = [
    { groupSize: 1, file: "h3k27ac-g1.fw" },
    { groupSize: 4, file: "h3k27ac-g4.fw" },
    { groupSize: 8, file: "h3k27ac.fw" },
    { groupSize: 24, file: "h3k27ac-g24.fw" },
];
const windows = [
    { name: "overview", chromosome: "chr10", start: 82400000, end: 92400000 },
    { name: "Ascl1", chromosome: "chr10", start: 87300000, end: 87510000 },
];
const browser = await chromium.launch({
    args: ["--enable-precise-memory-info"],
});

try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send("Network.enable");
    await session.send("Network.setCacheDisabled", { cacheDisabled: true });
    await page.goto(origin + "/__health");
    await page.evaluate(async (url) => {
        globalThis.figwigBenchmarkModule = await import(url);
    }, moduleUrl);

    /** @type {{status: number, bytes: number, encodedBytes?: number, contentRange: string}[]} */
    let requests = [];
    /** @type {Map<string, (typeof requests)[number]>} */
    const pending = new Map();
    session.on("Network.responseReceived", ({ requestId, response }) => {
        if (!response.url.endsWith(".fw")) return;
        const headers = new Map(
            Object.entries(response.headers).map(([key, value]) => [
                key.toLowerCase(),
                String(value),
            ])
        );
        const request = {
            status: response.status,
            bytes: Number(headers.get("content-length")),
            contentRange: headers.get("content-range") ?? "",
        };
        requests.push(request);
        pending.set(requestId, request);
    });
    session.on(
        "Network.loadingFinished",
        ({ requestId, encodedDataLength }) => {
            const request = pending.get(requestId);
            if (request) {
                request.encodedBytes = encodedDataLength;
                pending.delete(requestId);
            }
        }
    );

    /** @type {Record<string, any>[]} */
    const samples = [];
    for (let repetition = 0; repetition < repetitions; repetition++) {
        for (const layout of layouts) {
            for (const selection of ["all24", "E12.5"]) {
                for (const window of windows) {
                    await session.send("HeapProfiler.collectGarbage");
                    requests = [];
                    const initialization = await page.evaluate(
                        async ({ url, selection }) => {
                            const started = globalThis.performance.now();
                            const reader =
                                new globalThis.figwigBenchmarkModule.FigWig({
                                    url,
                                });
                            globalThis.figwigBenchmarkReader = reader;
                            const tracks = await reader.getTracks();
                            globalThis.figwigBenchmarkTracks = tracks
                                .filter(
                                    (track) =>
                                        selection === "all24" ||
                                        track.metadata.stage === selection
                                )
                                .map((track) => track.name);
                            return {
                                elapsedMs:
                                    globalThis.performance.now() - started,
                                selectedTracks:
                                    globalThis.figwigBenchmarkTracks.length,
                                diagnostics: reader.getDiagnostics(),
                            };
                        },
                        {
                            url: new URL(layout.file, dataBaseUrl).href,
                            selection,
                        }
                    );
                    assert.equal(
                        initialization.selectedTracks,
                        selection === "all24" ? 24 : 6
                    );
                    const metadataRequests = requests;

                    for (const cache of ["cold", "warm"]) {
                        requests = [];
                        const query = await page.evaluate(async (window) => {
                            const reader = globalThis.figwigBenchmarkReader;
                            reader.resetDiagnostics();
                            const heapBefore =
                                globalThis.performance.memory.usedJSHeapSize;
                            const started = globalThis.performance.now();
                            const [result] = await reader.getBinsMulti(
                                [window],
                                {
                                    tracks: globalThis.figwigBenchmarkTracks,
                                    binSize: Math.ceil(
                                        (window.end - window.start) / 1000
                                    ),
                                    aggregation: "mean",
                                    missing: "omit",
                                    useSummaries: false,
                                }
                            );
                            return {
                                elapsedMs:
                                    globalThis.performance.now() - started,
                                binsPerTrack: result.starts.length,
                                heapBefore,
                                heapWithResults:
                                    globalThis.performance.memory
                                        .usedJSHeapSize,
                                diagnostics: reader.getDiagnostics(),
                            };
                        }, window);
                        // Let CDP deliver completion events after fetch consumes the bodies.
                        await session.send("Runtime.evaluate", {
                            expression: "0",
                        });
                        const sample = {
                            repetition,
                            groupSize: layout.groupSize,
                            selection,
                            window: window.name,
                            cache,
                            initialization,
                            metadataHttp: summarizeRequests(metadataRequests),
                            ...query,
                            http: summarizeRequests(requests),
                        };
                        samples.push(sample);
                        process.stdout.write(
                            `g${layout.groupSize} ${selection} ${window.name} ${cache}: ${query.elapsedMs.toFixed(1)}ms, ${sample.http.requests} requests, ${sample.http.bodyBytes} bytes\n`
                        );
                    }
                    await page.evaluate(async () => {
                        await globalThis.figwigBenchmarkReader.close();
                        delete globalThis.figwigBenchmarkReader;
                    });
                }
            }
        }
    }

    writeFileSync(
        output,
        JSON.stringify(
            {
                browserVersion: browser.version(),
                methodology:
                    "Chromium reader-only localhost benchmark. Browser HTTP cache disabled; new reader per cold/warm pair. Initialization separately measured; warm immediately repeats same exact-mean 1000-bin query. Heap sampled before query and while output is alive, not a peak. JS imports excluded; default reader caches. Repetitions exploratory, sequential on shared workstation.",
                samples,
            },
            null,
            2
        ) + "\n"
    );
} finally {
    await browser.close();
}

/**
 * @param {{status: number, bytes: number, encodedBytes?: number, contentRange: string}[]} requests
 */
function summarizeRequests(requests) {
    for (const request of requests) {
        assert.equal(request.status, 206);
        assert.match(request.contentRange, /^bytes \d+-\d+\/\d+$/);
        assert(Number.isFinite(request.bytes));
        assert(Number.isFinite(request.encodedBytes));
    }
    return {
        requests: requests.length,
        bodyBytes: requests.reduce((sum, request) => sum + request.bytes, 0),
        encodedBytes: requests.reduce(
            (sum, request) => sum + request.encodedBytes,
            0
        ),
        statuses: Array.from(
            new Set(requests.map((request) => request.status))
        ),
    };
}
