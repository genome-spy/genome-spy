import {
    equalCuts,
    hasGroupingGaps,
    normalizeCuts,
    normalizeGapWidth,
    writeGapGeometry,
} from "../../scales/groupingGaps.js";
import { normalizeOrdinalDomain } from "../../scales/ordinalDomain.js";
import { normalizeScaleViewport } from "../../scales/scaleViewport.js";
import { packHighPrecisionDomain } from "../../../utils/highPrecision.js";

/** @typedef {import("../../../index.d.ts").SharedScaleHandle} Handle */
/** @typedef {import("../../../index.d.ts").ChannelScale} ChannelScale */
/** @typedef {import("../../scales/scaleCodegen.js").ShareableScaleDef} ShareableScaleDef */

/**
 * @typedef {object} SharedScaleResources
 * @property {import("../../../renderer.js").Renderer} renderer
 * @property {ChannelScale} scale
 * @property {GPUBuffer} buffer
 * @property {readonly number[]} cuts
 * @property {Set<(domainChanged: boolean, cutsChanged: boolean) => void>} listeners
 */

/** @type {WeakMap<Handle, SharedScaleResources>} */
export const sharedScaleResources = new WeakMap();

/** @param {ChannelScale | Handle | undefined} input @returns {input is Handle} */
export function isSharedScale(input) {
    return input !== undefined && "update" in input;
}

/**
 * @param {ChannelScale["domain"]} domain
 * @param {ChannelScale["range"]} range
 * @param {boolean} categorical
 */
function hasSharedScaleShape(domain, range, categorical) {
    return (
        Array.isArray(domain) &&
        (categorical || domain.length === 2) &&
        Array.isArray(range) &&
        range.length === 2 &&
        range.every((value) => typeof value === "number")
    );
}

/**
 * @param {import("../../../renderer.js").Renderer} renderer
 * @param {ChannelScale} config
 * @param {(handle: Handle) => void} release
 * @returns {Handle | undefined}
 */
export function createSharedScale(renderer, config, release) {
    renderer._assertAlive();
    const categorical = config.type === "band";
    const definition = /** @type {ShareableScaleDef | undefined} */ (
        config.definition
    );
    const layout = definition?.sharedScaleLayout;
    if (
        !layout ||
        !hasSharedScaleShape(config.domain, config.range, categorical)
    )
        return;
    const { device } = renderer;
    /** @type {ChannelScale} */
    const scale = {
        ...config,
        gapEnabled: hasGroupingGaps(config),
        band: undefined,
        gapAxis: undefined,
        gapPeer: undefined,
        gapBefore: undefined,
    };
    // Bounds and alignment, gap geometry, then range and padding.
    const data = new Float32Array(12);
    const gapGeometry = data.subarray(4, 8);
    const words = new Uint32Array(data.buffer);
    const uploaded = new Uint32Array(words.length);
    const packed = layout === "packed-index";
    const buffer = device.createBuffer({
        label: "Shared scale",
        size: data.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    /** @type {SharedScaleResources} */
    const resources = {
        renderer,
        scale,
        buffer,
        cuts: [],
        listeners: new Set(),
    };
    let written = false;

    /** @type {Handle} */
    const handle = Object.freeze({
        update(values) {
            if (!sharedScaleResources.has(handle))
                throw new Error("Shared scale is disposed.");

            const next = { ...scale, ...values };
            if (!hasSharedScaleShape(next.domain, next.range, categorical))
                throw new Error(
                    "The new mapping requires a different shared scale layout."
                );
            if (!categorical && next.viewport != null)
                throw new Error("Scale viewport requires a band scale.");
            const domain = next.domain ?? [];
            const domainChanged =
                categorical && !equalCuts(domain, scale.domain ?? []);
            if (categorical) {
                next.domain =
                    domainChanged || !written
                        ? normalizeOrdinalDomain("shared scale", "band", domain)
                        : scale.domain;
            } else if (!domain.every(Number.isFinite)) {
                throw new Error("Shared scale domain requires finite bounds.");
            }
            const viewport = categorical
                ? normalizeScaleViewport(next.viewport ?? null)
                : null;
            const [start, end] = categorical
                ? (viewport?.interval ?? [0, domain.length])
                : domain;
            const range = /** @type {number[]} */ (next.range);
            const inner = next.paddingInner ?? 0;
            const outer = next.paddingOuter ?? 0;
            const align = next.align ?? 0.5;
            if (
                !range.every(Number.isFinite) ||
                ![inner, outer, align].every(Number.isFinite)
            )
                throw new Error(
                    "Shared scale range and padding require finite values."
                );

            const cuts =
                values.gapPositions === undefined && written
                    ? resources.cuts
                    : normalizeCuts(next.gapPositions);
            const gapWidth = normalizeGapWidth(
                next.gapWidth === undefined ? 6 : next.gapWidth
            );
            if (!scale.gapEnabled && cuts.length && gapWidth)
                throw new Error(
                    "The shared scale was created without grouping gaps."
                );
            const cutsChanged = !equalCuts(cuts, resources.cuts);
            if (packed) data.set(packHighPrecisionDomain(start, end));
            else {
                data[0] = start;
                data[1] = end;
            }
            data[3] = align;
            data[8] = range[0];
            data[9] = range[1];
            data[10] = inner;
            data[11] = outer;
            if (scale.gapEnabled)
                writeGapGeometry(
                    gapGeometry,
                    gapWidth,
                    cuts,
                    start,
                    end,
                    viewport?.gapRanks ?? next.gapDomain
                );

            Object.assign(scale, {
                domain: categorical ? next.domain : domain.slice(),
                range: range.slice(),
                viewport,
                gapPositions: cuts,
                gapDomain: next.gapDomain?.slice(),
                gapWidth: next.gapWidth,
                paddingInner: inner,
                paddingOuter: outer,
                align,
            });
            resources.cuts = cuts;
            if (cutsChanged || domainChanged) {
                for (const refresh of resources.listeners)
                    refresh(domainChanged, cutsChanged);
                renderer.markPickingDirty();
            }
            if (!written || words.some((word, i) => word !== uploaded[i])) {
                device.queue.writeBuffer(buffer, 0, data);
                uploaded.set(words);
                written = true;
                renderer.markPickingDirty();
            }
        },
        destroy() {
            if (!sharedScaleResources.delete(handle)) return;
            buffer.destroy();
            resources.listeners.clear();
            release(handle);
        },
    });
    sharedScaleResources.set(handle, resources);
    try {
        handle.update({});
    } catch (error) {
        handle.destroy();
        throw error;
    }
    return renderer._ownResource(handle);
}
