import { isSeriesChannelConfig } from "../../../types.js";
import { packHighPrecisionU32ArrayInto } from "../../../utils/highPrecision.js";

/**
 * @typedef {import("../../../index.d.ts").ChannelConfigResolved} ChannelConfigResolved
 * @typedef {import("../../../index.d.ts").TypedArray} TypedArray
 * @typedef {import("../../utils/channelSpecUtils.js").ChannelSpec} ChannelSpec
 * @typedef {import("../../../types.js").ScalarType} ScalarType
 *
 * @typedef {object} PackedSeriesLayoutEntry
 * @prop {string} name
 * @prop {"f32"|"u32"|"i32"} scalarType
 * @prop {1|2|4} components
 * @prop {number} offset
 *   Element offset within a packed per-instance struct.
 * @prop {number} stride
 *   Total element width of the packed per-instance struct.
 *
 * @typedef {object} PackedSeriesLayout
 * @prop {Map<string, PackedSeriesLayoutEntry>} entries
 * @prop {number} f32Stride
 * @prop {number} u32Stride
 * @prop {number} i32Stride
 */

/**
 * Build per-instance packed layout metadata for series channels.
 * Offsets are per-instance, so the layout stays stable as count changes.
 *
 * @param {Record<string, ChannelConfigResolved>} channels
 * @param {Record<string, ChannelSpec>} channelSpecs
 * @param {Map<string, string>} [seriesBufferAliases]
 * @returns {PackedSeriesLayout}
 */
export function buildPackedSeriesLayout(
    channels,
    channelSpecs,
    seriesBufferAliases = new Map()
) {
    /** @type {Map<string, PackedSeriesLayoutEntry>} */
    const entries = new Map();
    /** @type {Map<string, PackedSeriesLayoutEntry>} */
    const entriesByAlias = new Map();
    let f32Offset = 0;
    let u32Offset = 0;
    let i32Offset = 0;

    for (const [name, channel] of Object.entries(channels)) {
        if (!isSeriesChannelConfig(channel)) {
            continue;
        }
        const scalarType = channel.type ?? channelSpecs[name]?.type;
        if (!scalarType) {
            throw new Error(`Missing type for series channel "${name}".`);
        }
        if (
            scalarType !== "f32" &&
            scalarType !== "u32" &&
            scalarType !== "i32"
        ) {
            throw new Error(
                `Packed series only supports f32/u32/i32 channels. "${name}" is ${scalarType}.`
            );
        }
        const components = /** @type {1|2|4} */ (
            channel.inputComponents ?? channel.components ?? 1
        );
        if (components !== 1 && components !== 2 && components !== 4) {
            throw new Error(
                `Packed series only supports 1, 2, or 4 components. "${name}" is ${components}.`
            );
        }
        const aliasKey = seriesBufferAliases.get(name) ?? name;
        const existing = entriesByAlias.get(aliasKey);
        if (existing) {
            if (
                existing.scalarType !== scalarType ||
                existing.components !== components
            ) {
                throw new Error(
                    `Packed alias "${aliasKey}" must keep type/components consistent.`
                );
            }
            entries.set(name, existing);
            continue;
        }
        const offset =
            scalarType === "f32"
                ? f32Offset
                : scalarType === "u32"
                  ? u32Offset
                  : i32Offset;
        const entry = {
            name,
            scalarType,
            components,
            offset,
            stride: 0,
        };
        entries.set(name, entry);
        entriesByAlias.set(aliasKey, entry);
        if (scalarType === "f32") {
            f32Offset += components;
        } else if (scalarType === "u32") {
            u32Offset += components;
        } else {
            i32Offset += components;
        }
    }

    for (const entry of entries.values()) {
        entry.stride =
            entry.scalarType === "f32"
                ? f32Offset
                : entry.scalarType === "u32"
                  ? u32Offset
                  : i32Offset;
    }

    return {
        entries,
        f32Stride: f32Offset,
        u32Stride: u32Offset,
        i32Stride: i32Offset,
    };
}

/**
 * Pack series arrays into per-instance interleaved buffers for the layout.
 *
 * @param {object} params
 * @param {Record<string, ChannelConfigResolved>} params.channels
 * @param {Record<string, ChannelSpec>} params.channelSpecs
 * @param {PackedSeriesLayout} params.layout
 * @param {number} params.count
 * @returns {{ f32: Float32Array | null, u32: Uint32Array | null, i32: Int32Array | null }}
 */
export function packSeriesArrays({ channels, channelSpecs, layout, count }) {
    const f32 =
        layout.f32Stride > 0
            ? new Float32Array(count * layout.f32Stride)
            : null;
    const u32 =
        layout.u32Stride > 0 ? new Uint32Array(count * layout.u32Stride) : null;
    const i32 =
        layout.i32Stride > 0 ? new Int32Array(count * layout.i32Stride) : null;

    const packedEntries = new Set();

    for (const entry of layout.entries.values()) {
        if (packedEntries.has(entry)) {
            continue;
        }
        packedEntries.add(entry);
        const channel = channels[entry.name];
        if (!channel || !isSeriesChannelConfig(channel)) {
            throw new Error(`Missing series data for "${entry.name}".`);
        }
        const inputComponents =
            channel.inputComponents ?? channel.components ?? entry.components;
        const required = count * inputComponents;
        let source = channel.data;
        if (!source) {
            throw new Error(`Missing data for "${entry.name}".`);
        }

        const scaleType = channel.scale?.type ?? "identity";
        if (
            entry.scalarType === "u32" &&
            scaleType === "index" &&
            source instanceof Float64Array
        ) {
            if (inputComponents !== 2) {
                throw new Error(
                    `Channel "${entry.name}" requires inputComponents: 2 when providing Float64Array data.`
                );
            }
            const packed = new Uint32Array(source.length * 2);
            packHighPrecisionU32ArrayInto(source, packed);
            source = packed;
        }

        if (entry.scalarType === "f32" && !(source instanceof Float32Array)) {
            throw new Error(
                `Channel "${entry.name}" expects a Float32Array for f32 data`
            );
        }
        if (entry.scalarType === "u32" && !(source instanceof Uint32Array)) {
            throw new Error(
                `Channel "${entry.name}" expects a Uint32Array for u32 data`
            );
        }
        if (entry.scalarType === "i32" && !(source instanceof Int32Array)) {
            throw new Error(
                `Channel "${entry.name}" expects an Int32Array for i32 data`
            );
        }
        if (source.length < required) {
            throw new Error(
                `Channel "${entry.name}" length (${source.length}) is less than count (${count}).`
            );
        }

        const dest =
            entry.scalarType === "f32"
                ? f32
                : entry.scalarType === "u32"
                  ? u32
                  : i32;
        if (!dest) {
            continue;
        }
        for (let i = 0; i < count; i++) {
            const base = i * entry.stride + entry.offset;
            const srcBase = i * inputComponents;
            for (let c = 0; c < entry.components; c++) {
                dest[base + c] = source[srcBase + c];
            }
        }
    }

    return { f32, u32, i32 };
}
