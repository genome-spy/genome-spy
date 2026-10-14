import { build } from "./candidates.js";
import { generate, queries } from "./data.js";
import { buildWasm } from "./wasm.js";
import { timeLookup } from "./measure.js";

/** @param {{candidate: string, scenario: string, size: number, repeats: number, seed: number, queryCount: number}} config */
export async function run(config) {
    const module =
        config.candidate === "wasm8"
            ? await WebAssembly.compile(
                  await (
                      await fetch(new URL("radix.wasm", import.meta.url))
                  ).arrayBuffer()
              )
            : undefined;
    /** @param {import("./data.js").Dataset} data */
    const construct = (data) =>
        config.candidate === "wasm8"
            ? buildWasm(module, data)
            : build(config.candidate, data);
    /** @param {number} i */
    const warmup = (i) => {
        const data = generate(config.scenario, 12000, 17 + i);
        const index = construct(data);
        const q = queries(data, 1024, i, config.scenario);
        for (const values of Object.values(q)) {
            timeLookup((id) => index.position(id), values, 1);
            timeLookup((id) => index.find(id)?.ordinal ?? -1, values, 1);
        }
    };
    for (let i = 0; i < 4; i++) {
        warmup(i);
        globalThis.gc();
    }
    const data = generate(config.scenario, config.size, config.seed);
    const q = queries(
        data,
        config.queryCount,
        config.seed + 1,
        config.scenario
    );
    /** @returns {object} */
    const trial = () => {
        globalThis.gc();
        const start = performance.now();
        const index = construct(data);
        const buildMs = performance.now() - start;
        globalThis.gc();
        const lookup = {};
        for (const [mode, values] of Object.entries(q)) {
            const raw = timeLookup((id) => index.position(id), values);
            const full = timeLookup(
                (id) => index.find(id)?.ordinal ?? -1,
                values
            );
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
            lookup,
            detail: index.detail,
        };
    };
    const samples = [];
    for (let i = 0; i < config.repeats; i++) {
        samples.push(trial());
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return { ...config, status: "ok", samples };
}
