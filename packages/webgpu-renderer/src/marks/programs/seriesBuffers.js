/* global GPUBufferUsage */
import { isSeriesChannelConfig } from "../../types.js";
import {
    buildPackedSeriesLayout,
    packSeriesArrays,
} from "./packedSeriesLayout.js";

/**
 * @typedef {import("../../index.d.ts").ChannelConfigResolved} ChannelConfigResolved
 * @typedef {import("../../index.d.ts").TypedArray} TypedArray
 * @typedef {import("../utils/channelSpecUtils.js").ChannelSpec} ChannelSpec
 */

/**
 * Manages per-mark series buffers: alias grouping, packing, validation,
 * and GPU buffer upload/reuse for columnar storage.
 */
export class SeriesBufferManager {
    /**
     * @param {GPUDevice} device
     * @param {Record<string, ChannelConfigResolved>} channels
     * @param {Record<string, ChannelSpec>} channelSpecs
     */
    constructor(device, channels, channelSpecs) {
        this._device = device;
        this._channels = channels;
        this._channelSpecs = channelSpecs;
        /**
         * Channel name -> alias group key (single source of truth).
         * @type {Map<string, string>}
         */
        this._seriesBufferAliases = new Map();
        /**
         * Packed series layout metadata for f32/u32/i32 buffers.
         * @type {import("./packedSeriesLayout.js").PackedSeriesLayout | null}
         */
        this._packedSeriesLayout = null;
        /**
         * Packed series buffers keyed by name ("seriesF32"/"seriesU32"/"seriesI32").
         * @type {Map<string, { buffer: GPUBuffer, byteLength: number }>}
         */
        this._packedBuffers = new Map();

        this._initializeSeriesAliases();
    }

    /**
     * @returns {Map<string, import("./packedSeriesLayout.js").PackedSeriesLayoutEntry> | null}
     */
    get packedSeriesLayoutEntries() {
        return this._getPackedLayout()?.entries ?? null;
    }

    /**
     * @returns {Map<string, { stride: number, channels: Array<{ name: string, alias: string, offset: number, components: 1|2|4, stride: number }> }>}
     */
    getPackedSeriesInfo() {
        const layout = this._getPackedLayout();
        if (!layout) {
            return new Map();
        }
        /** @type {Map<string, { stride: number, channels: Array<{ name: string, alias: string, offset: number, components: 1|2|4, stride: number }> }>} */
        const info = new Map();
        for (const [name, entry] of layout.entries) {
            const bufferName =
                entry.scalarType === "f32"
                    ? "seriesF32"
                    : entry.scalarType === "u32"
                      ? "seriesU32"
                      : "seriesI32";
            const alias = this._seriesBufferAliases.get(name) ?? name;
            let bucket = info.get(bufferName);
            if (!bucket) {
                bucket = { stride: entry.stride, channels: [] };
                info.set(bufferName, bucket);
            }
            bucket.channels.push({
                name,
                alias,
                offset: entry.offset,
                components: entry.components,
                stride: entry.stride,
            });
        }
        return info;
    }

    /**
     * @param {string} name
     * @returns {GPUBuffer | null}
     */
    getBuffer(name) {
        const packed = this._packedBuffers.get(name);
        if (packed) {
            return packed.buffer;
        }
        return null;
    }

    /**
     * Infer the instance count from series buffers when possible.
     *
     * @param {Record<string, TypedArray>} [channels]
     * @returns {number | null}
     */
    inferCount(channels) {
        let inferred = null;
        let hasSeries = false;

        for (const [name, channel] of Object.entries(this._channels)) {
            if (!isSeriesChannelConfig(channel)) {
                continue;
            }
            hasSeries = true;
            const data = channels?.[name] ?? channel.data;
            if (!data) {
                throw new Error(`Missing data for channel "${name}"`);
            }
            const inputComponents =
                channel.inputComponents ?? channel.components ?? 1;
            const scaleType = channel.scale?.type ?? "identity";
            const divisor =
                scaleType === "index" &&
                data instanceof Float64Array &&
                inputComponents === 2
                    ? 1
                    : inputComponents;
            if (divisor <= 0) {
                throw new Error(`Invalid input component count for "${name}"`);
            }
            if (data.length % divisor !== 0) {
                throw new Error(
                    `Channel "${name}" length (${data.length}) must be divisible by ${divisor}.`
                );
            }
            const count = data.length / divisor;
            if (inferred === null) {
                inferred = count;
            } else if (count !== inferred) {
                throw new Error(
                    `Channel "${name}" count (${count}) does not match inferred count (${inferred}).`
                );
            }
        }

        if (!hasSeries) {
            return null;
        }
        return inferred ?? 0;
    }

    /**
     * @returns {void}
     */
    _initializeSeriesAliases() {
        this._seriesBufferAliases.clear();

        const groupByArray = new Map();

        for (const [name, channel] of Object.entries(this._channels)) {
            if (!isSeriesChannelConfig(channel)) {
                continue;
            }
            const array = channel.data;
            if (!array) {
                continue;
            }
            let group = groupByArray.get(array);
            if (!group) {
                group = name;
                groupByArray.set(array, group);
            }
            this._seriesBufferAliases.set(name, group);
        }
    }

    /**
     * @param {Record<string, TypedArray>} channels
     * @param {number} count
     * @returns {void}
     */
    updateSeries(channels, count) {
        this._updatePackedSeries(channels, count);
    }

    /**
     * @param {Record<string, TypedArray>} channels
     * @param {number} count
     * @returns {void}
     */
    _updatePackedSeries(channels, count) {
        const layout = this._getPackedLayout();
        if (!layout) {
            return;
        }

        /** @type {Map<string, TypedArray>} */
        const groupArrays = new Map();

        for (const [name, channel] of Object.entries(this._channels)) {
            if (!isSeriesChannelConfig(channel)) {
                continue;
            }
            const sourceArray = channels[name] ?? channel.data;
            if (!sourceArray) {
                throw new Error(`Missing data for channel "${name}"`);
            }
            const group = this._seriesBufferAliases.get(name) ?? name;
            const existing = groupArrays.get(group);
            if (existing && existing !== sourceArray) {
                const members = this._getAliasMembers(group);
                throw new Error(
                    `Series channels ${members
                        .map((member) => `"${member}"`)
                        .join(", ")} must share the same buffer.`
                );
            }
            groupArrays.set(group, sourceArray);
            channel.data = sourceArray;
        }

        const { f32, u32, i32 } = packSeriesArrays({
            channels: this._channels,
            channelSpecs: this._channelSpecs,
            layout,
            count,
        });

        if (f32) {
            this._ensurePackedBuffer("seriesF32", f32);
        }
        if (u32) {
            this._ensurePackedBuffer("seriesU32", u32);
        }
        if (i32) {
            this._ensurePackedBuffer("seriesI32", i32);
        }
    }

    /**
     * @returns {import("./packedSeriesLayout.js").PackedSeriesLayout | null}
     */
    _getPackedLayout() {
        if (!this._packedSeriesLayout) {
            const layout = buildPackedSeriesLayout(
                this._channels,
                this._channelSpecs,
                this._seriesBufferAliases
            );
            this._packedSeriesLayout = layout;
        }
        return this._packedSeriesLayout;
    }

    /**
     * @param {string} group
     * @returns {string[]}
     */
    _getAliasMembers(group) {
        const members = [];
        for (const [name, alias] of this._seriesBufferAliases.entries()) {
            if (alias === group) {
                members.push(name);
            }
        }
        return members.length > 0 ? members : [group];
    }

    /**
     * @param {string} field
     * @param {TypedArray} array
     * @returns {void}
     */
    /**
     * @param {string} name
     * @param {Float32Array | Uint32Array | Int32Array} array
     * @returns {void}
     */
    _ensurePackedBuffer(name, array) {
        const existing = this._packedBuffers.get(name);
        let buffer = existing?.buffer ?? null;
        if (!buffer || existing.byteLength < array.byteLength) {
            buffer = this._device.createBuffer({
                size: array.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            this._packedBuffers.set(name, {
                buffer,
                byteLength: array.byteLength,
            });
        }

        this._device.queue.writeBuffer(buffer, 0, array);
    }
}
