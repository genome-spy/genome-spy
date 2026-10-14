import { readFileSync } from "node:fs";
import { PerformanceObserver } from "node:perf_hooks";
import { setImmediate } from "node:timers/promises";
import { build } from "./candidates.js";
import { generate, queries } from "./data.js";
import { buildWasm } from "./wasm.js";
import { timeLookup } from "./measure.js";

/** @type {{candidate: string, scenario: string, size: number, repeats: number, seed: number, queryCount: number}} */
const config = JSON.parse(process.argv[2]);
const module =
    config.candidate === "wasm8"
        ? new WebAssembly.Module(
              readFileSync(new URL("radix.wasm", import.meta.url))
          )
        : undefined;
/** @param {import("./data.js").Dataset} data @param {import("./candidates.js").Checkpoint} [checkpoint] */
const construct = (data, checkpoint) =>
    config.candidate === "wasm8"
        ? buildWasm(module, data, checkpoint)
        : build(config.candidate, data, checkpoint);
/** @type {{start: number, ms: number, kind: number}[]} */
const gcEntries = [];
const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries())
        gcEntries.push({
            start: entry.startTime,
            ms: entry.duration,
            kind: entry.detail.kind,
        });
});
observer.observe({ entryTypes: ["gc"] });

/** @returns {Promise<void>} */
async function collect() {
    globalThis.gc();
    await setImmediate();
    globalThis.gc();
    await setImmediate();
}

// Warm functions on the measured distribution, independently of the large
// dataset. Small loop-only warmups do not sufficiently warm radix hot paths.
/** @param {number} i */
function warmup(i) {
    const warmSize =
        config.candidate === "blocks" && config.scenario === "uniform"
            ? 512
            : 12000;
    const warmData = generate(config.scenario, warmSize, 17 + i);
    const warmIndex = construct(warmData);
    const q = queries(warmData, 1024, i, config.scenario);
    for (const values of Object.values(q)) {
        timeLookup((id) => warmIndex.position(id), values, 1);
        timeLookup((id) => warmIndex.find(id)?.ordinal ?? -1, values, 1);
    }
}
for (let i = 0; i < 4; i++) {
    warmup(i);
    await collect();
}
const data = generate(config.scenario, config.size, config.seed);
const querySets = queries(
    data,
    config.queryCount,
    config.seed + 1,
    config.scenario
);
await collect();
const samples = [];
// Each async frame owns exactly one index; completed frames expose only
// numbers. Reassigning a shared index let a JIT-kept previous value survive GC.
/** @returns {Promise<object>} */
async function trial() {
    await collect();
    const before = process.memoryUsage();
    const checkpoints = [];
    const checkpoint = (phase) =>
        checkpoints.push({ phase, ...process.memoryUsage() });
    const start = performance.now();
    const index = construct(data, checkpoint);
    const buildMs = performance.now() - start;
    checkpoint("returned");
    await setImmediate();
    const constructionGc = gcEntries.filter(
        (entry) => entry.start >= start && entry.start <= start + buildMs
    );
    await collect();
    const retained = process.memoryUsage();
    const lookup = {};
    for (const [mode, values] of Object.entries(querySets)) {
        const raw = timeLookup((id) => index.position(id), values);
        const full = timeLookup((id) => index.find(id)?.ordinal ?? -1, values);
        // Every batch in a mode has the same checksum for raw and full paths.
        if (
            raw.checksum / (raw.calls / values.length) !==
            full.checksum / (full.calls / values.length)
        ) {
            throw new Error("Raw/full checksum mismatch");
        }
        lookup[mode] = { raw, full };
    }
    return {
        buildMs,
        millionPerSecond: data.length / buildMs / 1000,
        before,
        checkpoints,
        retained,
        retainedDeltaBytes:
            retained.heapUsed +
            retained.arrayBuffers -
            before.heapUsed -
            before.arrayBuffers,
        peakObservedDeltaBytes:
            Math.max(...checkpoints.map((m) => m.heapUsed + m.arrayBuffers)) -
            before.heapUsed -
            before.arrayBuffers,
        peakRssBytes: process.resourceUsage().maxRSS * 1024,
        // Byte models count payloads; measured deltas include Map/array overhead.
        retainedPayloadBytes: index.retainedBytes,
        peakPayloadUpperBoundBytes: index.peakBytes,
        detail: index.detail,
        constructionGc,
        lookup,
    };
}
for (let repeat = 0; repeat < config.repeats; repeat++) {
    samples.push(await trial());
}
observer.disconnect();
process.stdout.write(JSON.stringify({ ...config, status: "ok", samples }));
