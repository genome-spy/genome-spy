import { materialize, permutationIndex } from "./candidates.js";

/** @param {WebAssembly.Module} module @param {import("./data.js").Dataset} data @param {(phase: string) => void} [checkpoint] */
export function buildWasm(module, data, checkpoint = () => {}) {
    const start = performance.now();
    const ids = materialize(data, checkpoint);
    const converted = performance.now();
    const base = 131072;
    const pages = Math.ceil((base + data.length * 24) / 65536);
    const memory = new WebAssembly.Memory({ initial: pages, maximum: 32768 });
    const instance = new WebAssembly.Instance(module, { env: { memory } });
    const allocated = performance.now();
    new Float64Array(memory.buffer, base, data.length).set(ids);
    const copied = performance.now();
    checkpoint("wasm-input");
    const pointer = instance.exports.sort_ids(base, data.length);
    const sorted = performance.now();
    const indexes = new Uint32Array(
        new Uint32Array(memory.buffer, pointer, data.length)
    );
    checkpoint("wasm-output");
    const finished = performance.now();
    const result = permutationIndex(
        data,
        indexes,
        indexes.byteLength,
        memory.buffer.byteLength + data.length * 12
    );
    result.detail = {
        materializeMs: converted - start,
        allocateInstantiateMs: allocated - converted,
        copyInMs: copied - allocated,
        kernelMs: sorted - copied,
        copyOutMs: finished - sorted,
        linearMemoryBytes: memory.buffer.byteLength,
        growthCount: 0,
    };
    return result;
}
