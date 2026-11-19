import {
    normalizeCuts,
    normalizeGapWidth,
    writeGapGeometry,
} from "../../scales/groupingGaps.js";
import { packHighPrecisionDomain } from "../../../utils/highPrecision.js";

/** @typedef {import("../../../index.d.ts").SharedPositionScaleHandle} Handle */

/** @type {WeakMap<Handle, {renderer: import("../../../renderer.js").Renderer, definition: import("../../../index.d.ts").ScaleDef, buffer: GPUBuffer}>} */
export const sharedPositionScaleBuffers = new WeakMap();

/** @param {import("../../../index.d.ts").ChannelScale} scale */
export function supportsSharedPositionScale(scale) {
    return (
        scale.definition?.sharedPositionLayout !== undefined &&
        (!scale.definition.continuous ||
            scale.definition.sharedPositionLayout === "packed-index" ||
            (scale.domain?.length === 2 &&
                (scale.range === undefined ||
                    (Array.isArray(scale.range) &&
                        scale.range.length === 2 &&
                        scale.range.every(
                            (value) => typeof value === "number"
                        )))))
    );
}

/**
 * @param {import("../../../renderer.js").Renderer} renderer
 * @param {import("../../../index.d.ts").ScaleDef} definition
 * @param {(handle: Handle) => void} release
 * @returns {Handle}
 */
export function createSharedPositionScale(renderer, definition, release) {
    const { device } = renderer;
    const data = new Float32Array(8);
    const gapGeometry = data.subarray(4);
    const words = new Uint32Array(data.buffer);
    const uploaded = new Uint32Array(words.length);
    const buffer = device.createBuffer({
        label: "Shared position scale",
        size: data.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    let written = false;
    /** @type {readonly number[] | undefined} */
    let previousCuts;
    /** @type {readonly number[]} */
    let cuts = [];
    /** @type {Handle} */
    const handle = {
        update({ start, end, gapWidth, gapPositions, gapRanks }) {
            if (!sharedPositionScaleBuffers.has(handle))
                throw new Error("Shared position scale is disposed.");
            if (definition.sharedPositionLayout === "packed-index") {
                data.set(packHighPrecisionDomain(start, end));
            } else {
                data[0] = start;
                data[1] = end;
            }
            if (gapPositions !== previousCuts) {
                cuts = normalizeCuts(gapPositions ?? null);
                previousCuts = gapPositions;
            }
            writeGapGeometry(
                gapGeometry,
                normalizeGapWidth(gapWidth),
                cuts,
                start,
                end,
                gapRanks
            );
            if (written && !words.some((word, i) => word !== uploaded[i]))
                return false;

            device.queue.writeBuffer(buffer, 0, data);
            uploaded.set(words);
            written = true;
            renderer.markPickingDirty();
            return true;
        },
        destroy() {
            if (!sharedPositionScaleBuffers.delete(handle)) return;
            buffer.destroy();
            release(handle);
        },
    };
    sharedPositionScaleBuffers.set(handle, { renderer, definition, buffer });
    return handle;
}
