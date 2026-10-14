import { isSeriesChannelConfig } from "../../../types.js";
import {
    buildPackedSeriesLayout,
    packSeriesArrays,
} from "./packedSeriesLayout.js";
import { asGpuBufferSource } from "../../../utils/webgpuTextureUtils.js";
import { validateStorageBufferSize } from "../../../utils/bufferLimits.js";
import { gpuLabel } from "../../../utils/gpuLabel.js";

/**
 * @typedef {import("../../../index.d.ts").ChannelConfigResolved} ChannelConfigResolved
 * @typedef {import("../../../index.d.ts").TypedArray} TypedArray
 * @typedef {import("../../utils/channelSpecUtils.js").ChannelSpec} ChannelSpec
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
     * @param {string} [label]
     */
    constructor(device, channels, channelSpecs, label = "mark") {
        this._device = device;
        this._channels = channels;
        this._channelSpecs = channelSpecs;
        this._label = label;
        /**
         * Channel name -> alias group key (single source of truth).
         * @type {Map<string, string>}
         */
        this._seriesBufferAliases = new Map();
        /**
         * One word layout shared by all scalar representations.
         * @type {import("./packedSeriesLayout.js").PackedSeriesLayout | null}
         */
        this._packedSeriesLayout = null;
        /** @type {GPUBuffer | null} */
        this._buffer = null;

        this._initializeSeriesAliases();
    }

    /**
     * @returns {Map<string, import("./packedSeriesLayout.js").PackedSeriesLayoutEntry> | null}
     */
    get packedSeriesLayoutEntries() {
        return this._getPackedLayout()?.entries ?? null;
    }

    /**
     * @returns {Map<string, { stride: number, channels: Array<{ name: string, scalarType: "f32"|"u32"|"i32", alias: string, offset: number, components: 1|2|4, stride: number }> }>}
     */
    getPackedSeriesInfo() {
        const layout = this._getPackedLayout();
        if (!layout) {
            return new Map();
        }
        return new Map([
            [
                "series",
                {
                    stride: layout.stride,
                    channels: Array.from(layout.entries, ([name, entry]) => ({
                        name,
                        scalarType: entry.scalarType,
                        alias: this._seriesBufferAliases.get(name) ?? name,
                        offset: entry.offset,
                        components: entry.components,
                        stride: entry.stride,
                    })),
                },
            ],
        ]);
    }

    /** @returns {GPUBuffer | null} */
    getBuffer() {
        return this._buffer;
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
     * @returns {boolean} Whether a packed buffer identity changed.
     */
    updateSeries(channels, count) {
        return this._updatePackedSeries(channels, count);
    }

    /**
     * @param {Record<string, TypedArray>} channels
     * @param {number} count
     * @returns {boolean} Whether a packed buffer identity changed.
     */
    _updatePackedSeries(channels, count) {
        const layout = this._getPackedLayout();
        if (!layout.stride) {
            return false;
        }

        validateStorageBufferSize(
            this._device,
            Math.max(4, count * layout.stride * 4),
            this._label + " series"
        );

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

        const words = packSeriesArrays({
            channels: this._channels,
            layout,
            count,
        });
        return this._ensurePackedBuffer(words);
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
     * @param {Uint32Array} array
     * @returns {boolean} Whether the buffer identity changed.
     */
    _ensurePackedBuffer(array) {
        const requiredSize = Math.max(4, array.byteLength);
        const changed = !this._buffer || this._buffer.size < requiredSize;
        if (changed) {
            const previous = this._buffer;
            this._buffer = this._device.createBuffer({
                label: gpuLabel(this._label, "series"),
                size: requiredSize,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            previous?.destroy();
        }
        if (array.byteLength) {
            this._device.queue.writeBuffer(
                this._buffer,
                0,
                asGpuBufferSource(array)
            );
        }
        return changed;
    }

    /** @returns {void} */
    destroy() {
        this._buffer?.destroy();
        this._buffer = null;
    }
}
