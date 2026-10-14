import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createServer } from "vite";

const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("="))
);
for (const name of Object.keys(args)) {
    if (
        !["sizes", "scenarios", "candidates", "repeats", "output"].includes(
            name
        )
    )
        throw new Error("Unknown option: " + name);
}
const repeats = Number(args.repeats ?? 3);
if (!Number.isSafeInteger(repeats) || repeats < 3)
    throw new Error("Use at least three repetitions");
const output = path.resolve(
    args.output ??
        "packages/core/benchmarks/uniqueIdIndex/results/chromium.jsonl"
);
mkdirSync(path.dirname(output), { recursive: true });
const server = await createServer({
    configFile: false,
    root: process.cwd(),
    server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const browser = await chromium.launch({
    headless: true,
    args: ["--js-flags=--expose-gc"],
});
const url =
    server.resolvedUrls.local[0] +
    "packages/core/benchmarks/uniqueIdIndex/browser.html";
const probePage = await browser.newPage();
const environment = await probePage.evaluate(() => ({
    userAgent: navigator.userAgent,
    // Minimal valid function: v128.const, drop, end. Feature detection only;
    // the benchmark's scalar Wasm kernel does not execute SIMD instructions.
    simdAvailable: WebAssembly.validate(
        new Uint8Array([
            0,
            97,
            115,
            109,
            1,
            0,
            0,
            0,
            1,
            4,
            1,
            96,
            0,
            0,
            3,
            2,
            1,
            0,
            10,
            23,
            1,
            21,
            0,
            253,
            12,
            ...new Array(16).fill(0),
            26,
            11,
        ])
    ),
}));
await probePage.close();
writeFileSync(
    output,
    JSON.stringify({
        type: "metadata",
        createdAt: new Date().toISOString(),
        browser: browser.version(),
        engine: "Chromium V8",
        headless: true,
        exposedGc: true,
        isolatedPages: true,
        memoryMeasured: false,
        ...environment,
    }) + "\n"
);
const cells = [];
for (const scenario of [
    "sorted",
    "shuffled",
    "retain1",
    "sparseBlocks",
    "largeIntegers",
]) {
    for (const candidate of [
        "baseline",
        "typed8",
        "typed11",
        "pairs8",
        "blocks",
        "hybridBlocks",
        "hash70",
        "wasm8",
    ]) {
        if (scenario === "sparseBlocks" && candidate === "blocks") continue;
        cells.push({ candidate, scenario, size: 1000000 });
    }
}
for (const candidate of [
    "baseline",
    "typed8",
    "typed11",
    "pairs8",
    "blocks",
    "hash70",
    "wasm8",
]) {
    cells.push({ candidate, scenario: "shuffled", size: 10000000 });
}
try {
    const selected = cells.filter(
        (cell) =>
            (!args.candidates ||
                args.candidates.split(",").includes(cell.candidate)) &&
            (!args.scenarios ||
                args.scenarios.split(",").includes(cell.scenario)) &&
            (!args.sizes ||
                args.sizes.split(",").map(Number).includes(cell.size))
    );
    if (!selected.length) throw new Error("No cells match the browser filters");
    let done = 0;
    for (const cell of selected) {
        const config = {
            ...cell,
            repeats,
            seed: 20261014,
            queryCount: 8192,
        };
        const page = await browser.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(String(error)));
        await page.goto(url);
        await page.waitForFunction(
            () => typeof window.runUniqueIdBenchmark === "function"
        );
        const result = await page.evaluate(
            (config) => window.runUniqueIdBenchmark(config),
            config
        );
        if (errors.length) throw new Error(errors.join("\n"));
        appendFileSync(output, JSON.stringify(result) + "\n");
        await page.close();
        process.stderr.write(
            `${++done}/${selected.length} ${cell.size} ${cell.scenario} ${cell.candidate}\n`
        );
    }
} finally {
    await browser.close();
    await server.close();
}
