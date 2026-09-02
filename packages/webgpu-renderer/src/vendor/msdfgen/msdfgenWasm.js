import { MSDFGEN_WASM_BASE64 } from "./wasmBinary.js";

const ABI_VERSION = 1;

/** @returns {Uint8Array} */
function decodeBinary() {
    const binary = globalThis.atob(MSDFGEN_WASM_BASE64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

const module = new WebAssembly.Module(
    /** @type {BufferSource} */ (decodeBinary())
);
const instance = new WebAssembly.Instance(module, {
    env: {
        emscripten_notify_memory_growth() {},
    },
    wasi_snapshot_preview1: {
        fd_write() {
            return 0;
        },
        fd_close() {
            return 0;
        },
        fd_seek() {
            return 70;
        },
    },
});

/** @type {WebAssembly.Memory} */
const memory = /** @type {any} */ (instance.exports.memory);
/** @type {(size: number) => number} */
const malloc = /** @type {any} */ (instance.exports.malloc);
/** @type {(pointer: number) => void} */
const free = /** @type {any} */ (instance.exports.free);
/** @type {() => void} */
const initialize = /** @type {any} */ (instance.exports._initialize);
/** @type {() => number} */
const abiVersion = /** @type {any} */ (instance.exports.msdf_abi_version);
/** @type {(...args: number[]) => number} */
const render = /** @type {any} */ (instance.exports.msdf_render_v1);

initialize();
if (abiVersion() !== ABI_VERSION) {
    throw new Error("Unsupported embedded msdfgen WASM ABI.");
}

const STATUS_MESSAGES = [
    "success",
    "ABI mismatch",
    "invalid argument",
    "invalid contour topology",
    "invalid edge kind",
    "invalid shape",
    "output buffer too small",
];

/**
 * Render a path edge stream through canonical msdfgen.
 *
 * @param {Uint32Array} contourOffsets
 * @param {Uint32Array} edgeKinds
 * @param {Float64Array} edgeCoordinates
 * @param {{ width: number, height: number, scaleX: number, scaleY: number, offsetX: number, offsetY: number, pixelRange: number }} options
 * @returns {Uint8Array}
 */
export function renderMsdfWasm(
    contourOffsets,
    edgeKinds,
    edgeCoordinates,
    options
) {
    const { width, height, scaleX, scaleY, offsetX, offsetY, pixelRange } =
        options;
    const outputSize = width * height * 3;
    /** @type {number[]} */
    const allocations = [];
    /** @param {number} size */
    const allocate = (size) => {
        const pointer = malloc(size);
        if (!pointer) {
            throw new Error("msdfgen WASM allocation failed.");
        }
        allocations.push(pointer);
        return pointer;
    };

    try {
        const contourPointer = allocate(contourOffsets.byteLength);
        const kindPointer = allocate(edgeKinds.byteLength);
        const coordinatePointer = allocate(edgeCoordinates.byteLength);
        const outputPointer = allocate(outputSize);
        new Uint32Array(
            memory.buffer,
            contourPointer,
            contourOffsets.length
        ).set(contourOffsets);
        new Uint32Array(memory.buffer, kindPointer, edgeKinds.length).set(
            edgeKinds
        );
        new Float64Array(
            memory.buffer,
            coordinatePointer,
            edgeCoordinates.length
        ).set(edgeCoordinates);

        const status = render(
            ABI_VERSION,
            contourPointer,
            contourOffsets.length - 1,
            kindPointer,
            coordinatePointer,
            edgeKinds.length,
            width,
            height,
            scaleX,
            scaleY,
            offsetX,
            offsetY,
            pixelRange,
            outputPointer,
            outputSize
        );
        if (status !== 0) {
            const message = STATUS_MESSAGES[status] ?? `status ${status}`;
            throw new Error(`msdfgen failed: ${message}.`);
        }
        return new Uint8Array(
            new Uint8Array(memory.buffer, outputPointer, outputSize)
        );
    } finally {
        for (let index = allocations.length - 1; index >= 0; index--) {
            free(allocations[index]);
        }
    }
}
