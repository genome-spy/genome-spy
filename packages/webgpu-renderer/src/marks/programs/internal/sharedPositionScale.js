import {
    equalCuts,
    normalizeCuts,
    normalizeGapWidth,
    writeGapGeometry,
} from "../../scales/groupingGaps.js";
import { packHighPrecisionDomain } from "../../../utils/highPrecision.js";

/** @typedef {import("../../../index.d.ts").SharedPositionScaleHandle} Handle */

/**
 * @typedef {object} SharedPositionResources
 * @property {import("../../../renderer.js").Renderer} renderer
 * @property {import("../../../index.d.ts").ScaleDef} definition
 * @property {GPUBuffer} buffer
 * @property {readonly number[]} cuts
 * @property {Set<() => void>} cutListeners
 */

/** @type {WeakMap<Handle, SharedPositionResources>} */
export const sharedPositionScaleBuffers = new WeakMap();

/** @param {import("../../../index.d.ts").ChannelScale} scale */
export function supportsSharedPositionScale(scale) {
    const { definition, domain, range } = scale;
    const layout = definition?.sharedPositionLayout;
    if (layout === undefined) return false;
    if (!definition.continuous || layout === "packed-index") return true;
    return (
        domain?.length === 2 &&
        (range === undefined ||
            (Array.isArray(range) &&
                range.length === 2 &&
                range.every((value) => typeof value === "number")))
    );
}

/**
 * @param {import("../../../renderer.js").Renderer} renderer
 * @param {import("../../../index.d.ts").ChannelScale} scale
 * @param {(handle: Handle) => void} release
 * @returns {Handle}
 */
export function createSharedPositionScale(renderer, scale, release) {
    const { device } = renderer;
    const { definition } = scale;
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
    /** @type {SharedPositionResources} */
    const resources = {
        renderer,
        definition,
        buffer,
        cuts: [],
        cutListeners: new Set(),
    };
    /** @type {Handle} */
    const handle = Object.freeze({
        update({ start, end, gapWidth, gapPositions, gapRanks }) {
            if (!sharedPositionScaleBuffers.has(handle))
                throw new Error("Shared position scale is disposed.");
            if (definition.sharedPositionLayout === "packed-index") {
                data.set(packHighPrecisionDomain(start, end));
            } else {
                data[0] = start;
                data[1] = end;
            }
            const cuts =
                gapPositions === previousCuts
                    ? resources.cuts
                    : normalizeCuts(gapPositions ?? null);
            writeGapGeometry(
                gapGeometry,
                normalizeGapWidth(gapWidth),
                cuts,
                start,
                end,
                gapRanks
            );
            if (!equalCuts(cuts, resources.cuts)) {
                resources.cuts = cuts;
                for (const refresh of resources.cutListeners) refresh();
            }
            previousCuts = gapPositions;
            if (!written || words.some((word, i) => word !== uploaded[i])) {
                device.queue.writeBuffer(buffer, 0, data);
                uploaded.set(words);
                written = true;
                renderer.markPickingDirty();
            }
        },
        destroy() {
            if (!sharedPositionScaleBuffers.delete(handle)) return;
            buffer.destroy();
            resources.cutListeners.clear();
            release(handle);
        },
    });
    sharedPositionScaleBuffers.set(handle, resources);
    return handle;
}
