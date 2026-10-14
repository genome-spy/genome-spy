import {
    appendFileSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { candidateNames } from "./candidates.js";
import { random, scenarios, shuffle } from "./data.js";

const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
        const [key, value] = arg.replace(/^--/, "").split("=");
        return [key, value];
    })
);
const knownOptions = new Set([
    "sizes",
    "scenarios",
    "candidates",
    "repeats",
    "seed",
    "queries",
    "indexBudgetMiB",
    "output",
]);
for (const name of Object.keys(args)) {
    if (!knownOptions.has(name)) throw new Error("Unknown option: " + name);
}
const sizes = (args.sizes ?? "10000,100000,1000000,10000000")
    .split(",")
    .map(Number);
const selectedScenarios = (args.scenarios ?? scenarios.join(",")).split(",");
const candidates = (
    args.candidates ?? [...candidateNames, "wasm8"].join(",")
).split(",");
const repeats = Number(args.repeats ?? 3);
const seed = Number(args.seed ?? 20261014);
const queryCount = Number(args.queries ?? 8192);
const budget = Number(args.indexBudgetMiB ?? 768) * 2 ** 20;
const output = path.resolve(
    args.output ?? "packages/core/benchmarks/uniqueIdIndex/results/node.jsonl"
);
mkdirSync(path.dirname(output), { recursive: true });
if (sizes.some((n) => !Number.isSafeInteger(n) || n < 1 || n > 20000000))
    throw new Error("Sizes must be integers in [1, 20000000]");
if (selectedScenarios.some((s) => !scenarios.includes(s)))
    throw new Error("Unknown scenario");
if (candidates.some((c) => ![...candidateNames, "wasm8"].includes(c)))
    throw new Error("Unknown candidate");
if (
    !Number.isSafeInteger(repeats) ||
    repeats < 3 ||
    !Number.isSafeInteger(queryCount) ||
    queryCount < 1024 ||
    queryCount > 1000000
)
    throw new Error(
        "Use integer repetitions >= 3 and queries in [1024, 1000000]"
    );
if (!Number.isSafeInteger(seed) || !Number.isFinite(budget) || budget <= 0)
    throw new Error(
        "Use an integer seed and a positive finite allocation budget"
    );

/** @param {string} candidate @param {string} scenario @param {number} n */
function estimate(candidate, scenario, n) {
    if (candidate !== "blocks") {
        if (candidate === "hybridBlocks" && scenario === "uniform")
            return n * 512;
        if (candidate === "hybridBlocks" && scenario === "sparseBlocks")
            return n * 96;
        return n * 64;
    }
    let blocks = Math.ceil(n / 10000) + 4;
    if (scenario.startsWith("retain"))
        blocks =
            Math.ceil(n / ((10000 * Number(scenario.slice(6))) / 100)) + 10;
    if (scenario === "sparseBlocks") blocks = Math.ceil(n / 10);
    if (scenario === "uniform") blocks = n;
    return blocks * 40000 + n * 16;
}

const metadata = {
    type: "metadata",
    createdAt: new Date().toISOString(),
    node: process.version,
    v8: process.versions.v8,
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    cpu: os.cpus()[0].model,
    totalMemoryBytes: os.totalmem(),
    sourceCommit: spawnSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
    }).stdout.trim(),
    baselineSha256: createHash("sha256")
        .update(readFileSync(new URL("baselineRadixSort.js", import.meta.url)))
        .digest("hex"),
    productionSha256: createHash("sha256")
        .update(
            readFileSync(
                new URL("../../src/utils/radixSort.js", import.meta.url)
            )
        )
        .digest("hex"),
    sizes,
    scenarios: selectedScenarios,
    candidates,
    repeats,
    seed,
    queryCount,
    indexBudgetBytes: budget,
    maxOldSpaceMiB: 4096,
    isolatedProcesses: true,
    ordering: "seeded shuffle within each size; serial workers",
    payloadModelNotes:
        "Null means unmodeled: Map storage and hybrid construction temporaries. Measurements remain separate.",
};
writeFileSync(output, JSON.stringify(metadata) + "\n");
let done = 0;
const total = sizes.length * selectedScenarios.length * candidates.length;
for (const size of sizes) {
    const cells = [];
    for (const scenario of selectedScenarios) {
        for (const candidate of candidates)
            cells.push({
                candidate,
                scenario,
                size,
                repeats,
                seed,
                queryCount,
            });
    }
    // Avoid measuring each method at systematically earlier/later thermal state.
    const order = shuffle(
        Array.from({ length: cells.length }, (_, i) => i),
        random(seed + size)
    );
    for (const i of order) {
        const config = cells[i];
        let result;
        if (config.candidate === "map" && size > 1000000) {
            result = {
                ...config,
                status: "skipped",
                reason: "Map reference limited to 1M rows",
            };
        } else if (estimate(config.candidate, config.scenario, size) > budget) {
            result = {
                ...config,
                status: "skipped",
                reason: "Projected index allocation exceeds configured budget",
                estimatedBytes: estimate(
                    config.candidate,
                    config.scenario,
                    size
                ),
            };
        } else {
            result = await new Promise((resolve) => {
                const child = spawn(
                    process.execPath,
                    [
                        "--expose-gc",
                        "--max-old-space-size=4096",
                        fileURLToPath(new URL("worker.mjs", import.meta.url)),
                        JSON.stringify(config),
                    ],
                    { stdio: ["ignore", "pipe", "pipe"] }
                );
                let stdout = "";
                let stderr = "";
                child.stdout.on("data", (chunk) => {
                    stdout += chunk;
                });
                child.stderr.on("data", (chunk) => {
                    stderr += chunk;
                });
                child.on("error", (error) =>
                    resolve({
                        ...config,
                        status: "failed",
                        error: String(error),
                    })
                );
                child.on("close", (code, signal) => {
                    if (code === 0) resolve(JSON.parse(stdout));
                    else
                        resolve({
                            ...config,
                            status: "failed",
                            code,
                            signal,
                            error: stderr.slice(-4000),
                        });
                });
            });
        }
        appendFileSync(output, JSON.stringify(result) + "\n");
        done++;
        process.stderr.write(
            `${done}/${total} ${size} ${config.scenario} ${config.candidate} ${result.status}\n`
        );
        if (result.status === "failed") process.exitCode = 1;
    }
}
