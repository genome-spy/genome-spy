import {
    getScaleResourceRequirements,
    getScaleUniformDef,
} from "../../scales/scaleDefinition.js";
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
    prepareTextureData,
} from "../../../utils/webgpuTextureUtils.js";
import {
    DOMAIN_MAP_COUNT_PREFIX,
    DOMAIN_PREFIX,
    RANGE_COUNT_PREFIX,
    RANGE_PREFIX,
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
 * @property {{ buffer: GPUBuffer, size: { length: number, byteLength: number } } | undefined} ordinalRange
 * @property {{ buffer: GPUBuffer, size: { length: number, byteLength: number } } | undefined} domainMap
 * @property {{ buffer: GPUBuffer, size: { length: number, byteLength: number } }} [gapCuts]
 * @property {{ texture: GPUTexture, sampler: GPUSampler, width: number, height: number, format: GPUTextureFormat } | undefined} rangeTexture
 */

/**
 * Manages scale-related resources: uniforms, domain/range buffers, and textures.
 */
export class ScaleResourceManager {
    /**
     * @param {object} params
     * @param {GPUDevice} params.device
     * @param {Record<string, ChannelConfigResolved>} params.channels
     * @param {ReadonlyMap<string, ReturnType<typeof import("../../shaders/channelAnalysis.js").buildChannelAnalysis>>} params.analysisByChannel
     * @param {string} [params.label]
     * @param {(name: string) => [number, number] | undefined} params.getDefaultScaleRange
     * @param {(name: string, value: number|ArrayLike<number>|Array<number|number[]>) => void} params.setUniformValue
     */
    constructor({
        device,
        channels,
        analysisByChannel,
        label = "mark",
        getDefaultScaleRange,
        setUniformValue,
    }) {
        this._device = device;
        this._channels = channels;
        this._label = label;
        this._getDefaultScaleRange = getDefaultScaleRange;
        this._setUniformValue = setUniformValue;

        this._analysisByChannel = analysisByChannel;

        /** @type {Map<string, ChannelResources>} */
        this._channelResources = new Map();

        /** @type {Map<string, { updateDomain: (domain: unknown) => boolean, updateRange: (range: unknown) => boolean }>} */
        this._scaleUpdaters = new Map();
        /** @type {Map<string, {cuts: readonly number[], domain: readonly number[], width: number, range: readonly number[], axis: "x" | "y", ranks: readonly number[] | undefined}>} */
        this._gapScales = new Map();
    }

    /**
     * @param {string} name
     * @returns {ReturnType<typeof import("../../shaders/channelAnalysis.js").buildChannelAnalysis>}
     */
    _getAnalysis(name) {
        const analysis = this._analysisByChannel.get(name);
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
        return this._channelResources.get(name);
    }

    /**
     * @param {string} name
     * @returns {ChannelResources}
     */
    _ensureChannelResources(name) {
        let resources = this._channelResources.get(name);
        if (!resources) {
            resources = /** @type {ChannelResources} */ ({});
            this._channelResources.set(name, resources);
        }
        return resources;
    }

    /**
     * @param {string} name
     * @returns {ChannelResources["scaleStops"] | undefined}
     */
    _getScaleStopInfo(name) {
        return this._channelResources.get(name)?.scaleStops;
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
        const analysis = this._getAnalysis(name);
        const requirements = getScaleResourceRequirements(
            analysis.scaleDef,
            analysis.isPiecewise
        );
        const kind = requirements.stopKind;
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
        const def = getScaleUniformDef(analysis.scaleDef);
        for (const param of def.params) {
            layout.push({
                name: `${param.prefix}${name}`,
                type: "f32",
                components: 1,
            });
        }
        if (requirements.needsOrdinalRange) {
            layout.push({
                name: RANGE_COUNT_PREFIX + name,
                type: "f32",
                components: 1,
            });
        }
        if (requirements.needsDomainMap) {
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
            this._gapScales.set(name, {
                cuts: normalizeCuts(scale.gapPositions),
                domain: this._unpackDomain(scale.domain ?? [0, 1]),
                width: scale.gapWidth === undefined ? 6 : (scale.gapWidth ?? 0),
                ranks: scale.gapDomain,
                range: /** @type {number[]} */ (
                    scale.range ?? this._getDefaultScaleRange(name)
                ),
                axis: scale.gapAxis ?? (name.startsWith("y") ? "y" : "x"),
            });
            this._updateGapCuts();
            this.updateGapWidth(
                name,
                scale.gapWidth === undefined ? 6 : scale.gapWidth
            );
        }
        const analysis = this._getAnalysis(name);
        const requirements = getScaleResourceRequirements(
            analysis.scaleDef,
            analysis.isPiecewise
        );
        const kind = requirements.stopKind;
        if (kind) {
            const { domainLength, rangeLength } = getScaleStopLengths(
                name,
                kind,
                scale
            );
            this._ensureChannelResources(name).scaleStops = {
                kind,
                domainLength,
                rangeLength,
            };
            if (analysis.useRangeTexture && rangeLength) {
                this._setUniformValue(
                    RANGE_PREFIX + name,
                    normalizeRangePositions(rangeLength)
                );
            }
        }
        const def = getScaleUniformDef(analysis.scaleDef);
        for (const param of def.params) {
            let value = param.defaultValue;
            if (param.prop && scale[param.prop] !== undefined) {
                value = scale[param.prop];
            }
            this._setUniformValue(`${param.prefix}${name}`, value);
        }
        this._registerScaleUpdaters(
            name,
            channel,
            scale,
            analysis,
            requirements,
            kind
        );
    }

    /**
     * @param {string} name
     * @returns {{ updateDomain: (domain: unknown) => boolean, updateRange: (range: unknown) => boolean }}
     */
    getScaleUpdater(name) {
        const updater = this._scaleUpdaters.get(name);
        if (!updater) {
            throw new Error(`Missing scale updater for "${name}".`);
        }
        return updater;
    }

    /**
     * @param {string} name
     * @param {ChannelConfigResolved} channel
     * @param {ChannelScale} scale
     * @param {ReturnType<typeof import("../../shaders/channelAnalysis.js").buildChannelAnalysis>} analysis
     * @param {ReturnType<typeof getScaleResourceRequirements>} requirements
     * @param {"continuous"|"threshold"|"piecewise"|null} kind
     * @returns {void}
     */
    _registerScaleUpdaters(name, channel, scale, analysis, requirements, kind) {
        this._scaleUpdaters.set(
            name,
            this._buildScaleUpdater({
                name,
                channel,
                scale,
                analysis,
                requirements,
                kind,
            })
        );
    }

    /**
     * @param {object} params
     * @param {string} params.name
     * @param {ChannelConfigResolved} params.channel
     * @param {ChannelScale} params.scale
     * @param {ReturnType<typeof import("../../shaders/channelAnalysis.js").buildChannelAnalysis>} params.analysis
     * @param {ReturnType<typeof getScaleResourceRequirements>} params.requirements
     * @param {"continuous"|"threshold"|"piecewise"|null} params.kind
     * @returns {{ updateDomain: (domain: unknown) => boolean, updateRange: (range: unknown) => boolean }}
     */
    _buildScaleUpdater({ name, channel, scale, analysis, requirements, kind }) {
        const useRangeTexture = analysis.useRangeTexture;
        const needsDomainMap = requirements.needsDomainMap;
        const needsOrdinalRange = requirements.needsOrdinalRange;
        const scaleDef = analysis.scaleDef;
        const stopKind = kind;
        const stopInfo = stopKind ? this._getScaleStopInfo(name) : undefined;
        const domainUniformName = DOMAIN_PREFIX + name;
        const rangeUniformName = RANGE_PREFIX + name;
        const defaultRange =
            stopKind === "continuous"
                ? this._getDefaultScaleRange(name)
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
                      needsRebind: this._updateDomainMap(
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
                    this._setUniformValue(domainUniformName, normalized);
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
                    this._setUniformValue(rangeUniformName, value);
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
                    this._setUniformValue(domainUniformName, domain);
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
                        this._setUniformValue(rangeUniformName, value);
                        return;
                    }
                    const normalized = normalizeDiscreteRange(
                        name,
                        value,
                        outputComponents,
                        stopKind
                    );
                    this._setUniformValue(rangeUniformName, normalized);
                };
            }
        }

        /** @type {(domain: unknown) => boolean} */
        const updateDomain =
            updateStopDomain && updateDomainMap
                ? (domain) => {
                      const mapUpdate = updateDomainMap(domain);
                      updateStopDomain(mapUpdate.domainUniform ?? domain);
                      return mapUpdate.needsRebind;
                  }
                : updateStopDomain
                  ? (domain) => {
                        updateStopDomain(domain);
                        return false;
                    }
                  : updateDomainMap
                    ? (domain) => {
                          const mapUpdate = updateDomainMap(domain);
                          if (mapUpdate.domainUniform) {
                              this._setUniformValue(
                                  domainUniformName,
                                  mapUpdate.domainUniform
                              );
                          }
                          return mapUpdate.needsRebind;
                      }
                    : () => false;

        /** @type {(range: unknown) => boolean} */
        const updateRange = useRangeTexture
            ? (range) =>
                  this._updateRangeTexture(
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
                    const data = this._buildOrdinalRangeBufferData(
                        normalized,
                        outputComponents,
                        outputType
                    );
                    return this._setOrdinalRangeBuffer(
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
            updateDomain: (domain) => {
                const result = updateDomain(domain);
                const gaps = this._gapScales.get(name);
                if (gaps) {
                    gaps.domain = this._unpackDomain(
                        /** @type {number[]} */ (domain)
                    );
                    gaps.ranks = undefined;
                    this._updateGapGeometry(name);
                }
                return result;
            },
            updateRange: (range) => {
                const result = updateRange(range);
                const gaps = this._gapScales.get(name);
                if (gaps)
                    gaps.range = /** @type {number[]} */ (
                        range ?? defaultRange
                    );
                return result;
            },
        };
    }

    /** Reject overfull layouts consistently with CPU scale mapping.
     * @param {number} widthFactor
     * @param {number} heightFactor
     */
    validateGapCapacity(widthFactor, heightFactor) {
        for (const {
            cuts,
            width,
            domain,
            range,
            ranks,
            axis,
        } of this._gapScales.values()) {
            const factor = axis === "x" ? widthFactor : heightFactor;
            const available = Math.abs(range[1] - range[0]) * factor;
            const count =
                (ranks?.[1] ?? cutRank(cuts, domain[1], true)) -
                (ranks?.[0] ?? cutRank(cuts, domain[0]));
            if (factor > 0 && available > 0 && count * width >= available) {
                throw new Error(
                    "Grouping gaps exhaust the available axis extent."
                );
            }
        }
    }

    /** @param {readonly number[]} domain */
    _unpackDomain(domain) {
        const start = domain.length === 3 ? domain[0] + domain[1] : domain[0];
        return [start, domain.length === 3 ? start + domain[2] : domain[1]];
    }

    /** @param {string} name */
    _getGaps(name) {
        const state = this._gapScales.get(name);
        if (!state)
            throw new Error(
                `Scale "${name}" was created without grouping gaps.`
            );
        return state;
    }

    /** @param {string} name @param {readonly number[] | null} values */
    updateGapPositions(name, values) {
        const gaps = this._getGaps(name);
        const cuts = normalizeCuts(values);
        if (
            cuts.length === gaps.cuts.length &&
            cuts.every((v, i) => v === gaps.cuts[i])
        )
            return false;
        gaps.cuts = cuts;
        gaps.ranks = undefined;
        const rebind = this._updateGapCuts();
        this._updateGapGeometry(name);
        return rebind;
    }

    /** @param {string} name @param {number | null} width */
    updateGapWidth(name, width) {
        if (width != null && (!Number.isFinite(width) || width < 0))
            throw new Error("Gap width must be finite and nonnegative.");
        this._getGaps(name).width = width ?? 0;
        this._updateGapGeometry(name);
    }

    /** @param {string} name @param {readonly number[] | undefined} ranks */
    updateGapDomain(name, ranks) {
        this._getGaps(name).ranks = ranks;
        this._updateGapGeometry(name);
    }

    /** @param {string} name */
    _updateGapGeometry(name) {
        const { cuts, domain, width, ranks } = this._getGaps(name);
        this._setUniformValue("gapGeometry_" + name, [
            width,
            ranks?.[0] ?? cutRank(cuts, domain[0]),
            ranks?.[1] ?? cutRank(cuts, domain[1], true),
            ranks ? 1 : 0,
        ]);
    }

    _updateGapCuts() {
        /** @type {number[]} */
        const packed = [];
        /** @type {{cuts: readonly number[], offset: number}[]} */
        const tables = [];
        for (const [name, { cuts }] of this._gapScales) {
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
            this._setUniformValue("gapTable_" + name, [offset, cuts.length]);
        }
        const resources = this._ensureChannelResources("__gapCuts");
        const data = new Uint32Array(packed.length ? packed : [0, 0]);
        const previous = resources.gapCuts;
        const rebind = !previous || previous.size.byteLength < data.byteLength;
        const buffer = rebind
            ? this._device.createBuffer({
                  label: gpuLabel(this._label, "index gap cuts"),
                  size: data.byteLength,
                  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
              })
            : previous.buffer;
        this._device.queue.writeBuffer(buffer, 0, asGpuBufferSource(data));
        if (rebind) previous?.buffer.destroy();
        resources.gapCuts = {
            buffer,
            size: { length: data.length / 2, byteLength: buffer.size },
        };
        return rebind;
    }

    /**
     * @param {string} name
     * @param {ChannelConfigResolved} channel
     * @param {ChannelScale} scale
     * @returns {void}
     */
    /**
     * @param {string} name
     * @param {Array<number|number[]|string>|import("../../../index.d.ts").ColorInterpolatorFn} value
     * @param {number | undefined} expectedRangeLength
     * @param {import("../../../index.d.ts").ColorInterpolatorFactory | undefined} interpolate
     * @returns {boolean}
     */
    _updateRangeTexture(name, value, expectedRangeLength, interpolate) {
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
            textureData = createSchemeTexture({
                scheme: colorStops,
                mode: "interpolate",
                interpolate,
            });
        }
        if (!textureData) {
            throw new Error(`Failed to build range texture for "${name}".`);
        }
        return this._setRangeTexture(name, textureData);
    }

    /**
     * @param {string} name
     * @param {import("../../../utils/colorUtils.js").TextureData} textureData
     * @returns {boolean}
     */
    _setRangeTexture(name, textureData) {
        const prepared = prepareTextureData(textureData);
        const resources = this._ensureChannelResources(name);
        const prev = resources.rangeTexture;
        const needsNewTexture =
            !prev ||
            prev.width !== prepared.width ||
            prev.height !== prepared.height ||
            prev.format !== prepared.format;
        const texture = needsNewTexture
            ? this._device.createTexture({
                  label: gpuLabel(this._label, `scale ${name} range texture`),
                  size: {
                      width: prepared.width,
                      height: prepared.height,
                      depthOrArrayLayers: 1,
                  },
                  format: prepared.format,
                  usage:
                      GPUTextureUsage.TEXTURE_BINDING |
                      GPUTextureUsage.COPY_DST,
              })
            : prev.texture;
        this._device.queue.writeTexture(
            { texture },
            asGpuBufferSource(prepared.data),
            { bytesPerRow: prepared.bytesPerRow },
            { width: prepared.width, height: prepared.height }
        );
        const sampler =
            prev?.sampler ??
            this._device.createSampler({
                label: gpuLabel(this._label, `scale ${name} range sampler`),
            });
        resources.rangeTexture = {
            texture,
            sampler,
            width: prepared.width,
            height: prepared.height,
            format: prepared.format,
        };
        if (needsNewTexture) {
            prev?.texture.destroy();
        }
        return needsNewTexture;
    }

    /**
     * @param {string} name
     * @param {Array<number|number[]|string>|{ range?: Array<number|number[]|string> }} value
     * @returns {boolean}
     */
    /**
     * @param {string} name
     * @param {number[]} domain
     * @returns {boolean}
     */
    _updateDomainMap(name, domain) {
        const map = this._buildDomainMapBufferData(domain);
        return this._setDomainMapBuffer(name, map.table, map.length);
    }

    /**
     * @param {number[]} domain
     * @returns {{ table: Uint32Array, length: number }}
     */
    _buildDomainMapBufferData(domain) {
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
    _setDomainMapBuffer(name, data, length) {
        const resources = this._ensureChannelResources(name);
        const prev = resources.domainMap;
        const nextBytes = data.byteLength;
        let buffer = resources.domainMap?.buffer;
        const needsNewBuffer =
            !buffer || !prev || prev.size.byteLength !== nextBytes;

        if (needsNewBuffer) {
            const previous = buffer;
            buffer = this._device.createBuffer({
                label: gpuLabel(this._label, `scale ${name} domain map`),
                size: nextBytes,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            previous?.destroy();
        }

        this._device.queue.writeBuffer(buffer, 0, asGpuBufferSource(data));
        resources.domainMap = {
            buffer,
            size: { length, byteLength: nextBytes },
        };
        this._setUniformValue(DOMAIN_MAP_COUNT_PREFIX + name, length);
        return needsNewBuffer;
    }

    /**
     * @param {Array<number|number[]>} range
     * @param {1|2|4} outputComponents
     * @param {ScalarType} outputType
     * @returns {TypedArray}
     */
    _buildOrdinalRangeBufferData(range, outputComponents, outputType) {
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
    _setOrdinalRangeBuffer(name, data, length) {
        const resources = this._ensureChannelResources(name);
        const prev = resources.ordinalRange;
        const nextBytes = data.byteLength;
        let buffer = resources.ordinalRange?.buffer;
        const needsNewBuffer =
            !buffer || !prev || prev.size.byteLength !== nextBytes;

        if (needsNewBuffer) {
            const previous = buffer;
            buffer = this._device.createBuffer({
                label: gpuLabel(this._label, `scale ${name} ordinal range`),
                size: nextBytes,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            previous?.destroy();
        }

        this._device.queue.writeBuffer(buffer, 0, asGpuBufferSource(data));
        resources.ordinalRange = {
            buffer,
            size: { length, byteLength: nextBytes },
        };
        this._setUniformValue(RANGE_COUNT_PREFIX + name, length);
        return needsNewBuffer;
    }

    /**
     * @returns {void}
     */
    destroy() {
        for (const resources of this._channelResources.values()) {
            resources.ordinalRange?.buffer.destroy();
            resources.domainMap?.buffer.destroy();
            resources.gapCuts?.buffer.destroy();
            resources.rangeTexture?.texture.destroy();
        }
        this._channelResources.clear();
        this._scaleUpdaters.clear();
        this._gapScales.clear();
    }
}
