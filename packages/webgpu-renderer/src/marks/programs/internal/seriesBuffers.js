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
    /** @type {GPUDevice} */
    #device;

    /** @type {Record<string, ChannelConfigResolved>} */
    #channels;

    /** @type {string} */
    #label;

    /**
     * Channel name -> alias group key (single source of truth).
     * @type {Map<string, string>}
     */
    #seriesBufferAliases = new Map();

    /**
     * One word layout shared by all scalar representations.
     * @type {import("./packedSeriesLayout.js").PackedSeriesLayout}
     */
    #packedSeriesLayout;

    /** @type {GPUBuffer | null} */
    #buffer = null;

    /**
     * @param {GPUDevice} device
     * @param {Record<string, ChannelConfigResolved>} channels
     * @param {Record<string, ChannelSpec>} channelSpecs
     * @param {string} [label]
     */
    constructor(device, channels, channelSpecs, label = "mark") {
        this.#device = device;
        this.#channels = channels;

        this.#label = label;

        this.#initializeSeriesAliases();
        this.#packedSeriesLayout = buildPackedSeriesLayout(
            channels,
            channelSpecs,
            this.#seriesBufferAliases
        );
    }

    /**
     * @returns {Map<string, import("./packedSeriesLayout.js").PackedSeriesLayoutEntry>}
     */
    get packedSeriesLayoutEntries() {
        return this.#packedSeriesLayout.entries;
    }

    /**
     * @returns {Map<string, { stride: number, channels: Array<{ name: string, scalarType: "f32"|"u32"|"i32", alias: string, offset: number, components: 1|2|4, stride: number }> }>}
     */
    getPackedSeriesInfo() {
        const layout = this.#packedSeriesLayout;
        return new Map([
            [
                "series",
                {
                    stride: layout.stride,
                    channels: Array.from(layout.entries, ([name, entry]) => ({
                        name,
                        scalarType: entry.scalarType,
                        alias: this.#seriesBufferAliases.get(name) ?? name,
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
        return this.#buffer;
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

        for (const [name, channel] of Object.entries(this.#channels)) {
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
    #initializeSeriesAliases() {
        this.#seriesBufferAliases.clear();

        const groupByArray = new Map();

        for (const [name, channel] of Object.entries(this.#channels)) {
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
            this.#seriesBufferAliases.set(name, group);
        }
    }

    /**
     * @param {Record<string, TypedArray>} channels
     * @param {number} count
     * @returns {boolean} Whether a packed buffer identity changed.
     */
    updateSeries(channels, count) {
        const layout = this.#packedSeriesLayout;
        if (!layout.stride) {
            return false;
        }

        validateStorageBufferSize(
            this.#device,
            Math.max(4, count * layout.stride * 4),
            this.#label + " series"
        );

        /** @type {Map<string, TypedArray>} */
        const groupArrays = new Map();

        for (const [name, channel] of Object.entries(this.#channels)) {
            if (!isSeriesChannelConfig(channel)) {
                continue;
            }
            const sourceArray = channels[name] ?? channel.data;
            if (!sourceArray) {
                throw new Error(`Missing data for channel "${name}"`);
            }
            const group = this.#seriesBufferAliases.get(name) ?? name;
            const existing = groupArrays.get(group);
            if (existing && existing !== sourceArray) {
                const members = this.#getAliasMembers(group);
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
            channels: this.#channels,
            layout,
            count,
        });
        return this.#ensurePackedBuffer(words);
    }

    /**
     * @param {string} group
     * @returns {string[]}
     */
    #getAliasMembers(group) {
        const members = [];
        for (const [name, alias] of this.#seriesBufferAliases.entries()) {
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
    #ensurePackedBuffer(array) {
        const requiredSize = Math.max(4, array.byteLength);
        const changed = !this.#buffer || this.#buffer.size < requiredSize;
        if (changed) {
            const previous = this.#buffer;
            this.#buffer = this.#device.createBuffer({
                label: gpuLabel(this.#label, "series"),
                size: requiredSize,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            previous?.destroy();
        }
        if (array.byteLength) {
            this.#device.queue.writeBuffer(
                this.#buffer,
                0,
                asGpuBufferSource(array)
            );
        }
        return changed;
    }

    /** @returns {void} */
    destroy() {
        this.#buffer?.destroy();
        this.#buffer = null;
    }
}
