/* global GPUBufferUsage */
import { isSeriesChannelConfig } from "../../types.js";
import { packHighPrecisionU32ArrayInto } from "../../utils/highPrecision.js";

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
         * Channel name -> GPU buffer used for that series.
         * @type {Map<string, GPUBuffer>}
         */
        this._buffersByField = new Map();
        /**
         * TypedArray identity -> GPU buffer (deduped across channels).
         * @type {Map<TypedArray, GPUBuffer>}
         */
        this._bufferByArray = new Map();
        /**
         * Packed cache for Float64 index series -> Uint32 hi/lo pairs.
         * @type {WeakMap<Float64Array, Uint32Array>}
         */
        this._packedSeriesByArray = new WeakMap();
        /**
         * Channel name -> alias group key (single source of truth).
         * @type {Map<string, string>}
         */
        this._seriesBufferAliases = new Map();

        this._initializeSeriesAliases();
    }

    /**
     * @returns {Map<string, string>}
     */
    get seriesBufferAliases() {
        return this._seriesBufferAliases;
    }

    /**
     * @param {string} name
     * @returns {GPUBuffer | null}
     */
    getBuffer(name) {
        return this._buffersByField.get(name) ?? null;
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
        /** @type {Map<string, TypedArray>} */
        const groupArrays = new Map();
        /** @type {Map<string, TypedArray>} */
        const sourceArrays = new Map();

        for (const [name, channel] of Object.entries(this._channels)) {
            if (!isSeriesChannelConfig(channel)) {
                continue;
            }
            const sourceArray = channels[name] ?? channel.data;
            if (!sourceArray) {
                throw new Error(`Missing data for channel "${name}"`);
            }
            sourceArrays.set(name, sourceArray);
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
        }

        for (const [name, channel] of Object.entries(this._channels)) {
            if (!isSeriesChannelConfig(channel)) {
                continue;
            }
            const sourceArray = sourceArrays.get(name);
            if (!sourceArray) {
                throw new Error(`Missing data for channel "${name}"`);
            }
            let array = sourceArray;
            const scaleType = channel.scale?.type ?? "identity";
            const inputComponents =
                channel.inputComponents ?? channel.components ?? 1;
            if (scaleType === "index" && array instanceof Float64Array) {
                if (inputComponents !== 2) {
                    throw new Error(
                        `Channel "${name}" requires inputComponents: 2 when providing Float64Array data.`
                    );
                }
                let packed = this._packedSeriesByArray.get(array);
                if (!packed || packed.length !== array.length * 2) {
                    packed = new Uint32Array(array.length * 2);
                    this._packedSeriesByArray.set(array, packed);
                }
                packHighPrecisionU32ArrayInto(array, packed);
                array = packed;
            }
            const expectedType = channel.type ?? this._channelSpecs[name]?.type;
            if (expectedType === "f32" && !(array instanceof Float32Array)) {
                throw new Error(
                    `Channel "${name}" expects a Float32Array for f32 data`
                );
            }
            if (expectedType === "u32" && !(array instanceof Uint32Array)) {
                throw new Error(
                    `Channel "${name}" expects a Uint32Array for u32 data`
                );
            }
            if (expectedType === "i32" && !(array instanceof Int32Array)) {
                throw new Error(
                    `Channel "${name}" expects an Int32Array for i32 data`
                );
            }
            if (array.length < count * inputComponents) {
                throw new Error(
                    `Channel "${name}" length (${array.length}) is less than count (${count})`
                );
            }
            channel.data = sourceArray;
            this._ensureBuffer(name, array);
        }
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
    _ensureBuffer(field, array) {
        // TODO: Decide whether identity-based deduplication is sufficient long-term.
        let buffer = this._bufferByArray.get(array);

        if (!buffer) {
            buffer = this._device.createBuffer({
                size: array.byteLength,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            this._bufferByArray.set(array, buffer);
        }

        this._device.queue.writeBuffer(buffer, 0, array);
        this._buffersByField.set(field, buffer);
    }
}
