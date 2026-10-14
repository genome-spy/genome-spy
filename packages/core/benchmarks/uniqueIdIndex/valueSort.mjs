import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { setImmediate } from "node:timers/promises";
import os from "node:os";
import radixSort from "../../src/utils/radixSort.js";
import baselineRadixSort from "./baselineRadixSort.js";
import { random, shuffle } from "./data.js";
import { summary } from "./measure.js";

/** @param {number} n @param {string} scenario */
function values(n, scenario) {
    const result = new Array(n);
    for (let i = 0; i < n; i++) {
        result[i] =
            scenario === "largeIntegers"
                ? i % 3 === 0
                    ? 2 ** 31 + i
                    : i % 3 === 1
                      ? 2 ** 32 + i
                      : Number.MAX_SAFE_INTEGER - i
                : 10000 + i;
    }
    return scenario === "sorted" ? result : shuffle(result, random(20261014));
}

if (process.argv[2] === "--worker") {
    /** @type {{candidate: string, size: number, scenario: string}} */
    const config = JSON.parse(process.argv[3]);
    const sort =
        config.candidate === "baseline" ? baselineRadixSort : radixSort;
    for (let i = 0; i < 4; i++) sort(values(12000, config.scenario));
    const source = values(config.size, config.scenario);

    /** @returns {Promise<object>} */
    async function trial() {
        // Both sorters may mutate their input. Copies and GC are outside timing.
        const input = source.slice();
        globalThis.gc();
        await setImmediate();
        globalThis.gc();
        const start = performance.now();
        const result = sort(input);
        const buildMs = performance.now() - start;
        if (!Array.isArray(result) || result.length !== source.length)
            throw new Error("Invalid result");
        for (let i = 1; i < result.length; i++) {
            if (result[i] < result[i - 1]) throw new Error("Unsorted result");
        }
        return {
            buildMs,
            first: result[0],
            middle: result[Math.floor(result.length / 2)],
            last: result.at(-1),
        };
    }

    const samples = [];
    for (let i = 0; i < 3; i++) samples.push(await trial());
    process.stdout.write(
        JSON.stringify({
            ...config,
            samples,
            buildMs: summary(samples.map((s) => s.buildMs)),
        })
    );
} else {
    const output =
        process.argv[2] ??
        fileURLToPath(new URL("results/valueSort.json", import.meta.url));
    /** @param {URL} file */
    const hash = (file) =>
        createHash("sha256").update(readFileSync(file)).digest("hex");
    const metadata = {
        createdAt: new Date().toISOString(),
        node: process.version,
        v8: process.versions.v8,
        cpu: os.cpus()[0].model,
        seed: 20261014,
        repeats: 3,
        warmups: 4,
        isolatedProcesses: true,
        setupOutsideTiming: "input generation, per-trial copy, explicit GC",
        outputConversionIncluded: true,
        sortedOutputCheckedAfterTiming: true,
        baselineSha256: hash(new URL("baselineRadixSort.js", import.meta.url)),
        productionSha256: hash(
            new URL("../../src/utils/radixSort.js", import.meta.url)
        ),
    };
    const rows = [];
    for (const size of [1000000, 10000000]) {
        for (const scenario of ["sorted", "shuffled", "largeIntegers"]) {
            for (const candidate of ["baseline", "production"]) {
                const config = { size, scenario, candidate };
                const child = spawnSync(
                    process.execPath,
                    [
                        "--expose-gc",
                        fileURLToPath(import.meta.url),
                        "--worker",
                        JSON.stringify(config),
                    ],
                    { encoding: "utf8" }
                );
                if (child.error) throw child.error;
                if (child.status !== 0) throw new Error(child.stderr);
                rows.push(JSON.parse(child.stdout));
                writeFileSync(
                    output,
                    JSON.stringify({ metadata, rows }, null, 2) + "\n"
                );
                process.stderr.write(`${size} ${scenario} ${candidate}\n`);
            }
        }
    }
}
