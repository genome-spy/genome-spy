// Symbol.for lets independently bundled Core and optional modules agree on this
// internal contract without sharing a module instance or a global runtime registry.
const captureTargetKey = Symbol.for("@genome-spy/core/canvas-capture/v1");

/** @typedef {ReturnType<import("./genomeSpyBase.js").default["getCanvasCaptureTarget"]>} CanvasCaptureTarget */

/**
 * @param {import("./types/embedApi.js").EmbedResult} api
 * @param {() => CanvasCaptureTarget} getTarget
 */
export function attachCaptureTarget(api, getTarget) {
    Object.defineProperty(api, captureTargetKey, { value: getTarget });
}

/**
 * @param {import("./types/embedApi.js").EmbedResult} api
 * @returns {CanvasCaptureTarget}
 */
export function getCaptureTarget(api) {
    const getTarget = Reflect.get(api, captureTargetKey);
    if (typeof getTarget !== "function") {
        throw new Error(
            "Recording requires a compatible GenomeSpy embed. Use Core and recording from the same release."
        );
    }
    return getTarget();
}
