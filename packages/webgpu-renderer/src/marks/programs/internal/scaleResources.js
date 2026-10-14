import { validateStorageBufferSize } from "../../../utils/bufferLimits.js";
import {
    getScaleStopLengths,
    isColorRange,
    isRangeFunction,
    normalizeDiscreteRange,
    normalizeOrdinalRange,
    normalizeRangePositions,
} from "../../scales/scaleStops.js";
import { buildHashTableMap, HASH_EMPTY_KEY } from "../../../utils/hashTable.js";
import { createSchemeTexture } from "../../../utils/colorUtils.js";
import {
    asGpuBufferSource,
    writeTextureData,
} from "../../../utils/webgpuTextureUtils.js";
import {
    DOMAIN_MAP_COUNT_PREFIX,
    DOMAIN_PREFIX,
    RANGE_COUNT_PREFIX,
    RANGE_PREFIX,
    RANGE_TABLE_PREFIX,
    DOMAIN_MAP_TABLE_PREFIX,
} from "../../../wgsl/prefixes.js";
import { gpuLabel } from "../../../utils/gpuLabel.js";
import {
    hasIndexGaps,
    normalizeCuts,
    cutRank,
} from "../../scales/indexGaps.js";

/**
 * @typedef {import("../../../index.d.ts").ChannelConfigResolved} ChannelConfigResolved
 * @typedef {import("../../../index.d.ts").ChannelScale} ChannelScale
 * @typedef {import("../../../index.d.ts").TypedArray} TypedArray
 * @typedef {import("../../../types.js").ScalarType} ScalarType
 * @typedef {object} ChannelResources
 * @property {{ kind: "continuous"|"threshold"|"piecewise", domainLength: number, rangeLength: number } | undefined} scaleStops
 * @property {{ texture: GPUTexture, sampler: GPUSampler, width: number, height: number, format: GPUTextureFormat } | undefined} rangeTexture
 */

/**
 * Manages scale-related resources: uniforms, domain/range buffers, and textures.
 */
export class ScaleResourceManager {
    /** @type {GPUDevice} */
    #device;

    /** @type {string} */
    #label;

    /** @type {(name: string) => [number, number] | undefined} */
    #getDefaultScaleRange;

    /** @type {(name: string, value: number|ArrayLike<number>|Array<number|number[]>) => void} */
    #setUniformValue;

    /** @type {ReadonlyMap<string, ReturnType<typeof import("../../shaders/channelAnalysis.js").buildChannelAnalysis>>} */
    #analysisByChannel;

    /** @type {Map<string, ChannelResources>} */
    #channelResources = new Map();

    /** @type {Map<string, { updateDomain: (domain: unknown, ranks?: readonly number[]) => boolean, updateRange: (range: unknown) => boolean }>} */
    #scaleUpdaters = new Map();

    /** @type {Map<string, {cuts: readonly number[], domain: readonly number[], width: number, ranks: readonly number[] | undefined}>} */
    #gapScales = new Map();

    /** @type {GPUBuffer | null} */
    #tableBuffer = null;

    /** @type {Map<string, {data: Uint32Array, offset: number, capacity: number, publish: (offset: number) => void}>} */
    #tables = new Map();

    /**
     * @param {object} params
     * @param {GPUDevice} params.device
     * @param {ReadonlyMap<string, ReturnType<typeof import("../../shaders/channelAnalysis.js").buildChannelAnalysis>>} params.analysisByChannel
     * @param {string} [params.label]
     * @param {(name: string) => [number, number] | undefined} params.getDefaultScaleRange
     * @param {(name: string, value: number|ArrayLike<number>|Array<number|number[]>) => void} params.setUniformValue
     */
    constructor({
        device,
        analysisByChannel,
        label = "mark",
        getDefaultScaleRange,
        setUniformValue,
    }) {
        this.#device = device;
        this.#label = label;
        this.#getDefaultScaleRange = getDefaultScaleRange;
        this.#setUniformValue = setUniformValue;

        this.#analysisByChannel = analysisByChannel;
    }

    /** The single mark-owned scale/gap storage buffer. */
    get tableBuffer() {
        return this.#tableBuffer;
    }

    /**
     * Retain independent CPU slices; only growth relocates and reuploads them.
     * Offsets and capacities use 32-bit words, without binding-alignment padding.
     *
     * @param {string} key
     * @param {TypedArray} data
     * @param {(offset: number) => void} publish
     * @returns {boolean} Whether the aggregate buffer identity changed.
     */
    #setTable(key, data, publish) {
        const words = new Uint32Array(
            data.buffer,
            data.byteOffset,
            data.byteLength / 4
        );
        const previous = this.#tables.get(key);
        if (previous && words.length <= previous.capacity) {
            previous.data = words;
            previous.publish = publish;
            publish(previous.offset);
            this.#device.queue.writeBuffer(
                this.#tableBuffer,
                previous.offset * 4,
                asGpuBufferSource(words)
            );
            return false;
        }

        this.#tables.set(key, {
            data: words,
            offset: 0,
            capacity: Math.max(1, words.length),
            publish,
        });
        let length = 0;
        for (const table of this.#tables.values()) {
            table.offset = length;
            length += table.capacity;
        }
        const limit = Math.min(
            this.#device.limits.maxStorageBufferBindingSize,
            this.#device.limits.maxBufferSize
        );
        if (length * 4 > limit) {
            // Release spare slice capacity before rejecting a payload that fits.
            length = 0;
            for (const table of this.#tables.values()) {
                table.offset = length;
                table.capacity = Math.max(1, table.data.length);
                length += table.capacity;
            }
        }
        validateStorageBufferSize(
            this.#device,
            length * 4,
            this.#label + " scale/gap tables"
        );
        const buffer = this.#device.createBuffer({
            label: gpuLabel(this.#label, "scale/gap tables"),
            size: length * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        for (const table of this.#tables.values()) {
            table.publish(table.offset);
            this.#device.queue.writeBuffer(
                buffer,
                table.offset * 4,
                asGpuBufferSource(table.data)
            );
        }
        this.#tableBuffer?.destroy();
        this.#tableBuffer = buffer;
        return true;
    }

    /**
     * @param {string} name
     * @returns {ReturnType<typeof import("../../shaders/channelAnalysis.js").buildChannelAnalysis>}
     */
    #getAnalysis(name) {
        const analysis = this.#analysisByChannel.get(name);
        if (!analysis) {
            throw new Error(`Missing channel analysis for "${name}".`);
        }
        return analysis;
    }

    /**
     * @param {string} name
     * @returns {ChannelResources | undefined}
     */
    getChannelResources(name) {
        return this.#channelResources.get(name);
    }

    /**
     * @param {string} name
     * @returns {ChannelResources}
     */
    #ensureChannelResources(name) {
        let resources = this.#channelResources.get(name);
        if (!resources) {
            resources = /** @type {ChannelResources} */ ({});
            this.#channelResources.set(name, resources);
        }
        return resources;
    }

    /**
     * @param {string} name
     * @returns {ChannelResources["scaleStops"] | undefined}
     */
    #getScaleStopInfo(name) {
        return this.#channelResources.get(name)?.scaleStops;
    }

    /**
     * @param {Array<{ name: string, type: ScalarType, components: 1|2|4, arrayLength?: number }>} layout
     * @param {string} name
     * @param {ChannelConfigResolved} channel
     * @returns {void}
     */
    addScaleUniforms(layout, name, channel) {
        if (hasIndexGaps(channel.scale)) {
            layout.push(
                { name: "gapTable_" + name, type: "u32", components: 2 },
                { name: "gapGeometry_" + name, type: "f32", components: 4 }
            );
        }
        const analysis = this.#getAnalysis(name);
        const kind = analysis.stopKind;
        if (kind) {
            const { domainLength, rangeLength } = getScaleStopLengths(
                name,
                kind,
                channel.scale
            );
            const outputComponents = analysis.outputComponents;
            const useRangeTexture = analysis.useRangeTexture;
            const outputType =
                outputComponents === 1 ? analysis.outputScalarType : "f32";
            const rangeComponents = useRangeTexture ? 1 : outputComponents;
            const rangeType = useRangeTexture ? "f32" : outputType;
            layout.push({
                name: DOMAIN_PREFIX + name,
                type: "f32",
                components: 1,
                arrayLength: domainLength,
            });
            layout.push({
                name: RANGE_PREFIX + name,
                type: rangeType,
                components: rangeComponents,
                arrayLength: rangeLength,
            });
        }
        for (const param of analysis.scaleDef.params) {
            layout.push({
                name: `${param.prefix}${name}`,
                type: "f32",
                components: 1,
            });
        }
        if (analysis.needsOrdinalRange) {
            layout.push({
                name: RANGE_TABLE_PREFIX + name,
                type: "u32",
                components: 1,
            });
            layout.push({
                name: RANGE_COUNT_PREFIX + name,
                type: "f32",
                components: 1,
            });
        }
        if (analysis.needsDomainMap) {
            layout.push({
                name: DOMAIN_MAP_TABLE_PREFIX + name,
                type: "u32",
                components: 2,
            });
            layout.push({
                name: DOMAIN_MAP_COUNT_PREFIX + name,
                type: "f32",
                components: 1,
            });
        }
    }

    /**
     * @param {string} name
     * @param {ChannelConfigResolved} channel
     * @param {ChannelScale} scale
     * @returns {void}
     */
    initializeScale(name, channel, scale) {
        if (hasIndexGaps(scale)) {
            this.#gapScales.set(name, {
                cuts: normalizeCuts(scale.gapPositions),
                domain: this.#unpackDomain(scale.domain ?? [0, 1]),
                width: scale.gapWidth === undefined ? 6 : (scale.gapWidth ?? 0),
                ranks: scale.gapDomain,
            });
            this.#updateGapCuts();
            this.updateGapWidth(
                name,
                scale.gapWidth === undefined ? 6 : scale.gapWidth
            );
        }
        const analysis = this.#getAnalysis(name);
        const kind = analysis.stopKind;
        if (kind) {
            const { domainLength, rangeLength } = getScaleStopLengths(
                name,
                kind,
                scale
            );
            this.#ensureChannelResources(name).scaleStops = {
                kind,
                domainLength,
                rangeLength,
            };
            if (analysis.useRangeTexture && rangeLength) {
                this.#setUniformValue(
                    RANGE_PREFIX + name,
                    normalizeRangePositions(rangeLength)
                );
            }
        }
        for (const param of analysis.scaleDef.params) {
            let value = param.defaultValue;
            if (param.prop && scale[param.prop] !== undefined) {
                value = scale[param.prop];
            }
            this.#setUniformValue(`${param.prefix}${name}`, value);
        }
        this.#scaleUpdaters.set(
            name,
            this.#buildScaleUpdater({ name, channel, scale, analysis })
        );
    }

    /**
     * @param {string} name
     * @returns {{ updateDomain: (domain: unknown, ranks?: readonly number[]) => boolean, updateRange: (range: unknown) => boolean }}
     */
    getScaleUpdater(name) {
        const updater = this.#scaleUpdaters.get(name);
        if (!updater) {
            throw new Error(`Missing scale updater for "${name}".`);
        }
        return updater;
    }

    /**
     * @param {object} params
     * @param {string} params.name
     * @param {ChannelConfigResolved} params.channel
     * @param {ChannelScale} params.scale
     * @param {ReturnType<typeof import("../../shaders/channelAnalysis.js").buildChannelAnalysis>} params.analysis
     * @returns {{ updateDomain: (domain: unknown, ranks?: readonly number[]) => boolean, updateRange: (range: unknown) => boolean }}
     */
    #buildScaleUpdater({ name, channel, scale, analysis }) {
        const useRangeTexture = analysis.useRangeTexture;
        const needsDomainMap = analysis.needsDomainMap;
        const needsOrdinalRange = analysis.needsOrdinalRange;
        const scaleDef = analysis.scaleDef;
        const stopKind = analysis.stopKind;
        const stopInfo = stopKind ? this.#getScaleStopInfo(name) : undefined;
        const domainUniformName = DOMAIN_PREFIX + name;
        const rangeUniformName = RANGE_PREFIX + name;
        const defaultRange =
            stopKind === "continuous"
                ? this.#getDefaultScaleRange(name)
                : undefined;
        const outputComponents = analysis.outputComponents ?? 1;
        const outputType =
            outputComponents === 1 ? analysis.outputScalarType : "f32";
        const interpolate = channel.scale?.interpolate;
        /**
         * @param {unknown} value
         * @param {string} label
         * @returns {ArrayLike<number>}
         */
        const coerceArrayLike = (value, label) => {
            if (Array.isArray(value) || ArrayBuffer.isView(value)) {
                return /** @type {ArrayLike<number>} */ (
                    /** @type {unknown} */ (value)
                );
            }
            throw new Error(label);
        };
        /**
         * @param {unknown} value
         * @returns {value is number[]}
         */
        const isNumericRange = (value) => {
            if (!Array.isArray(value)) {
                return false;
            }
            for (let i = 0; i < value.length; i++) {
                if (typeof value[i] !== "number") {
                    return false;
                }
            }
            return true;
        };
        const updateDomainMap = needsDomainMap
            ? /**
               * @param {unknown} value
               * @returns {{ needsRebind: boolean, domainUniform?: number[] }}
               */
              (value) => {
                  if (!scaleDef.normalizeDomainMap) {
                      throw new Error(
                          `Scale "${analysis.scaleType}" does not provide domain map normalization.`
                      );
                  }
                  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) {
                      throw new Error(
                          `Scale on "${name}" requires an explicit domain array.`
                      );
                  }
                  const domainSource = Array.isArray(value)
                      ? value
                      : /** @type {ArrayLike<number>} */ (
                            /** @type {unknown} */ (value)
                        );
                  const update = scaleDef.normalizeDomainMap({
                      name,
                      scale,
                      domain: domainSource,
                  });
                  if (!update) {
                      return { needsRebind: false };
                  }
                  return {
                      needsRebind: this.#updateDomainMap(
                          name,
                          update.domainMap
                      ),
                      domainUniform: update.domainUniform,
                  };
              }
            : null;

        /** @type {(value: unknown) => void | null} */
        let updateStopDomain = null;
        /** @type {(value: unknown) => void | null} */
        let updateStopRange = null;

        if (stopKind) {
            if (stopKind === "continuous") {
                const domainLength = stopInfo?.domainLength ?? 2;
                const normalizeDomain =
                    scaleDef.normalizeDomain ??
                    (({ name, domain, domainLength: expectedLength }) => {
                        const domainValues = coerceArrayLike(
                            domain,
                            `Scale on "${name}" expects a domain array.`
                        );
                        if (
                            expectedLength &&
                            domainValues.length !== expectedLength
                        ) {
                            throw new Error(
                                `Scale domain for "${name}" expects ${expectedLength} entries, got ${domainValues.length}.`
                            );
                        }
                        return domainValues;
                    });
                const expectedRangeLength = stopInfo?.rangeLength;
                updateStopDomain = (value) => {
                    const normalized = normalizeDomain({
                        name,
                        scale,
                        domain: value,
                        domainLength,
                    });
                    if (!normalized) {
                        return;
                    }
                    this.#setUniformValue(domainUniformName, normalized);
                };
                updateStopRange = (value) => {
                    if (!Array.isArray(value)) {
                        throw new Error(
                            `Scale on "${name}" expects a range array.`
                        );
                    }
                    if (
                        expectedRangeLength &&
                        value.length !== expectedRangeLength
                    ) {
                        throw new Error(
                            `Scale range for "${name}" expects ${expectedRangeLength} entries, got ${value.length}.`
                        );
                    }
                    this.#setUniformValue(rangeUniformName, value);
                };
            } else {
                if (!stopInfo) {
                    throw new Error(
                        `Scale on "${name}" has no recorded stop sizes.`
                    );
                }
                const domainLength = stopInfo.domainLength;
                const rangeLength = stopInfo.rangeLength;
                const label =
                    stopKind === "threshold" ? "Threshold" : "Piecewise";
                updateStopDomain = (value) => {
                    const domain = coerceArrayLike(
                        value,
                        `${label} scale on "${name}" expects a domain array.`
                    );
                    if (domain.length !== domainLength) {
                        throw new Error(
                            `${label} scale on "${name}" expects ${domainLength} domain entries, got ${domain.length}.`
                        );
                    }
                    this.#setUniformValue(domainUniformName, domain);
                };
                updateStopRange = (value) => {
                    if (!Array.isArray(value)) {
                        throw new Error(
                            `${label} scale on "${name}" expects a range array.`
                        );
                    }
                    if (value.length !== rangeLength) {
                        throw new Error(
                            `${label} scale on "${name}" expects ${rangeLength} range entries, got ${value.length}.`
                        );
                    }
                    if (outputComponents === 1 && isNumericRange(value)) {
                        this.#setUniformValue(rangeUniformName, value);
                        return;
                    }
                    const normalized = normalizeDiscreteRange(
                        name,
                        value,
                        outputComponents,
                        stopKind
                    );
                    this.#setUniformValue(rangeUniformName, normalized);
                };
            }
        }

        /** @type {(domain: unknown) => boolean} */
        const updateDomain = (domain) => {
            const mapUpdate = updateDomainMap?.(domain);
            if (updateStopDomain) {
                updateStopDomain(mapUpdate?.domainUniform ?? domain);
            } else if (mapUpdate?.domainUniform) {
                this.#setUniformValue(
                    domainUniformName,
                    mapUpdate.domainUniform
                );
            }
            return mapUpdate?.needsRebind ?? false;
        };

        /** @type {(range: unknown) => boolean} */
        const updateRange = useRangeTexture
            ? (range) =>
                  this.#updateRangeTexture(
                      name,
                      /** @type {Array<number|number[]|string>|import("../../../index.d.ts").ColorInterpolatorFn} */ (
                          range
                      ),
                      stopInfo?.rangeLength,
                      interpolate
                  )
            : needsOrdinalRange
              ? (range) => {
                    if (isRangeFunction(range)) {
                        throw new Error(
                            `Ordinal scale on "${name}" does not support interpolator ranges.`
                        );
                    }
                    if (!Array.isArray(range)) {
                        throw new Error(
                            `Ordinal scale on "${name}" expects a range array.`
                        );
                    }
                    const rangeArray = range;
                    const normalized =
                        outputComponents === 1 && isNumericRange(rangeArray)
                            ? rangeArray
                            : normalizeOrdinalRange(
                                  name,
                                  /** @type {Array<number|number[]|string>} */ (
                                      rangeArray
                                  ),
                                  outputComponents
                              );
                    const data = this.#buildOrdinalRangeBufferData(
                        normalized,
                        outputComponents,
                        outputType
                    );
                    return this.#setOrdinalRangeBuffer(
                        name,
                        data,
                        normalized.length
                    );
                }
              : stopKind
                ? (range) => {
                      if (isRangeFunction(range)) {
                          throw new Error(
                              `Scale on "${name}" does not support interpolator ranges.`
                          );
                      }
                      const effectiveRange =
                          range ??
                          (stopKind === "continuous"
                              ? (defaultRange ?? range)
                              : range);
                      if (!Array.isArray(effectiveRange)) {
                          throw new Error(
                              `Scale on "${name}" expects a range array.`
                          );
                      }
                      updateStopRange(
                          /** @type {Array<number|number[]|string>} */ (
                              effectiveRange
                          )
                      );
                      return false;
                  }
                : () => false;

        return {
            updateDomain: (domain, ranks) => {
                const result = updateDomain(domain);
                const gaps = this.#gapScales.get(name);
                if (gaps) {
                    gaps.domain = this.#unpackDomain(
                        /** @type {number[]} */ (domain)
                    );
                    gaps.ranks = ranks;
                    this.#updateGapGeometry(name);
                }
                return result;
            },
            updateRange,
        };
    }

    /** @param {readonly number[]} domain */
    #unpackDomain(domain) {
        const start = domain.length === 3 ? domain[0] + domain[1] : domain[0];
        return [start, domain.length === 3 ? start + domain[2] : domain[1]];
    }

    /** @param {string} name */
    #getGaps(name) {
        const state = this.#gapScales.get(name);
        if (!state)
            throw new Error(
                `Scale "${name}" was created without grouping gaps.`
            );
        return state;
    }

    /** @param {string} name @param {readonly number[] | null} values */
    updateGapPositions(name, values) {
        const gaps = this.#getGaps(name);
        const cuts = normalizeCuts(values);
        if (
            cuts.length === gaps.cuts.length &&
            cuts.every((v, i) => v === gaps.cuts[i])
        )
            return false;
        gaps.cuts = cuts;
        const rebind = this.#updateGapCuts();
        this.#updateGapGeometry(name);
        return rebind;
    }

    /** @param {string} name @param {number | null} width */
    updateGapWidth(name, width) {
        if (width != null && (!Number.isFinite(width) || width < 0))
            throw new Error("Gap width must be finite and nonnegative.");
        this.#getGaps(name).width = width ?? 0;
        this.#updateGapGeometry(name);
    }

    /** @param {string} name */
    #updateGapGeometry(name) {
        const { cuts, domain, width, ranks } = this.#getGaps(name);
        this.#setUniformValue("gapGeometry_" + name, [
            width,
            ranks?.[0] ?? cutRank(cuts, domain[0]),
            ranks?.[1] ?? cutRank(cuts, domain[1], true),
            ranks ? 1 : 0,
        ]);
    }

    #updateGapCuts() {
        /** @type {number[]} */
        const packed = [];
        /** @type {{cuts: readonly number[], offset: number}[]} */
        const tables = [];
        /** @type {Array<{name: string, offset: number, length: number}>} */
        const slices = [];
        for (const [name, { cuts }] of this.#gapScales) {
            const previous = tables.find(
                (table) =>
                    table.cuts.length === cuts.length &&
                    cuts.every((v, i) => table.cuts[i] === v)
            );
            const offset = previous?.offset ?? packed.length / 2;
            if (!previous) {
                for (const cut of cuts)
                    packed.push(Math.floor(cut / 4096), cut % 4096);
                tables.push({ cuts, offset });
            }
            slices.push({ name, offset: offset * 2, length: cuts.length });
        }
        const data = new Uint32Array(packed.length ? packed : [0, 0]);
        return this.#setTable("gapCuts", data, (offset) => {
            for (const slice of slices) {
                this.#setUniformValue("gapTable_" + slice.name, [
                    offset + slice.offset,
                    slice.length,
                ]);
            }
        });
    }

    /**
     * @param {string} name
     * @param {Array<number|number[]|string>|import("../../../index.d.ts").ColorInterpolatorFn} value
     * @param {number | undefined} expectedRangeLength
     * @param {import("../../../index.d.ts").ColorInterpolatorFactory | undefined} interpolate
     * @returns {boolean}
     */
    #updateRangeTexture(name, value, expectedRangeLength, interpolate) {
        /** @type {Array<number|number[]|string>|import("../../../index.d.ts").ColorInterpolatorFn} */
        const normalizedRange =
            /** @type {Array<number|number[]|string>|import("../../../index.d.ts").ColorInterpolatorFn} */ (
                value
            );
        let textureData;
        if (isRangeFunction(normalizedRange)) {
            textureData = createSchemeTexture(normalizedRange);
        } else {
            if (!isColorRange(normalizedRange)) {
                throw new Error(
                    `Interpolated color scale on "${name}" requires a color range.`
                );
            }
            const colorStops = /** @type {Array<string|number[]>} */ (
                normalizedRange
            );
            if (
                expectedRangeLength !== undefined &&
                colorStops.length !== expectedRangeLength
            ) {
                throw new Error(
                    `Scale on "${name}" expects ${expectedRangeLength} range entries, got ${colorStops.length}.`
                );
            }
            textureData = createSchemeTexture(colorStops, { interpolate });
        }
        return this.#setRangeTexture(name, textureData);
    }

    /**
     * @param {string} name
     * @param {import("../../../utils/colorUtils.js").TextureData} textureData
     * @returns {boolean}
     */
    #setRangeTexture(name, textureData) {
        const resources = this.#ensureChannelResources(name);
        const prev = resources.rangeTexture;
        const needsNewTexture = !prev;
        const texture = needsNewTexture
            ? this.#device.createTexture({
                  label: gpuLabel(this.#label, `scale ${name} range texture`),
                  size: {
                      width: textureData.width,
                      height: textureData.height,
                      depthOrArrayLayers: 1,
                  },
                  format: textureData.format,
                  usage:
                      GPUTextureUsage.TEXTURE_BINDING |
                      GPUTextureUsage.COPY_DST,
              })
            : prev.texture;
        writeTextureData(this.#device, texture, textureData);
        const sampler =
            prev?.sampler ??
            this.#device.createSampler({
                label: gpuLabel(this.#label, `scale ${name} range sampler`),
            });
        resources.rangeTexture = {
            texture,
            sampler,
            width: textureData.width,
            height: textureData.height,
            format: textureData.format,
        };
        return needsNewTexture;
    }

    /**
     * @param {string} name
     * @param {number[]} domain
     * @returns {boolean}
     */
    #updateDomainMap(name, domain) {
        const map = this.#buildDomainMapBufferData(domain);
        return this.#setDomainMapBuffer(name, map.table, map.length);
    }

    /**
     * @param {number[]} domain
     * @returns {{ table: Uint32Array, length: number }}
     */
    #buildDomainMapBufferData(domain) {
        if (domain.length === 0) {
            return { table: new Uint32Array([HASH_EMPTY_KEY, 0]), length: 0 };
        }
        /** @type {Array<[number, number]>} */
        const entries = domain.map((value, index) => [value, index]);
        const { table } = buildHashTableMap(entries);
        return { table, length: domain.length };
    }

    /**
     * @param {string} name
     * @param {Uint32Array} data
     * @param {number} length
     * @returns {boolean}
     */
    #setDomainMapBuffer(name, data, length) {
        this.#setUniformValue(DOMAIN_MAP_COUNT_PREFIX + name, length);
        return this.#setTable("domainMap_" + name, data, (offset) => {
            this.#setUniformValue(DOMAIN_MAP_TABLE_PREFIX + name, [
                offset,
                data.length / 2,
            ]);
        });
    }

    /**
     * @param {Array<number|number[]>} range
     * @param {1|2|4} outputComponents
     * @param {ScalarType} outputType
     * @returns {TypedArray}
     */
    #buildOrdinalRangeBufferData(range, outputComponents, outputType) {
        if (outputComponents === 1) {
            const values = /** @type {number[]} */ (range);
            if (outputType === "u32") {
                return new Uint32Array(values);
            }
            if (outputType === "i32") {
                return new Int32Array(values);
            }
            return new Float32Array(values);
        }

        const data = new Float32Array(range.length * 4);
        for (let i = 0; i < range.length; i++) {
            data.set(/** @type {number[]} */ (range[i]), i * 4);
        }
        return data;
    }

    /**
     * @param {string} name
     * @param {TypedArray} data
     * @param {number} length
     * @returns {boolean}
     */
    #setOrdinalRangeBuffer(name, data, length) {
        this.#setUniformValue(RANGE_COUNT_PREFIX + name, length);
        return this.#setTable("range_" + name, data, (offset) => {
            this.#setUniformValue(RANGE_TABLE_PREFIX + name, offset);
        });
    }

    /**
     * @returns {void}
     */
    destroy() {
        for (const resources of this.#channelResources.values()) {
            resources.rangeTexture?.texture.destroy();
        }
        this.#tableBuffer?.destroy();
        this.#tableBuffer = null;
        this.#tables.clear();
        this.#channelResources.clear();
        this.#scaleUpdaters.clear();
        this.#gapScales.clear();
    }
}
