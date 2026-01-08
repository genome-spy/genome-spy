/* global GPUBufferUsage, GPUTextureUsage */
import { buildChannelAnalysis } from "../shaders/channelAnalysis.js";
import {
    getScaleResourceRequirements,
    getScaleUniformDef,
} from "../scales/scaleDefs.js";
import {
    getScaleStopLengths,
    isColorRange,
    isRangeFunction,
    normalizeDiscreteRange,
    normalizeOrdinalRange,
    normalizeRangePositions,
} from "../scales/scaleStops.js";
import { buildHashTableMap, HASH_EMPTY_KEY } from "../../utils/hashTable.js";
import { createSchemeTexture } from "../../utils/colorUtils.js";
import { prepareTextureData } from "../../utils/webgpuTextureUtils.js";
import {
    DOMAIN_MAP_COUNT_PREFIX,
    DOMAIN_PREFIX,
    RANGE_COUNT_PREFIX,
    RANGE_PREFIX,
} from "../../wgsl/prefixes.js";

/**
 * @typedef {import("../../index.d.ts").ChannelConfigResolved} ChannelConfigResolved
 * @typedef {import("../../index.d.ts").ChannelScale} ChannelScale
 * @typedef {import("../../index.d.ts").TypedArray} TypedArray
 * @typedef {import("../../types.js").ScalarType} ScalarType
 * @typedef {object} ChannelResources
 * @property {{ kind: "continuous"|"threshold"|"piecewise", domainLength: number, rangeLength: number } | undefined} scaleStops
 * @property {{ buffer: GPUBuffer, size: { length: number, byteLength: number } } | undefined} ordinalRange
 * @property {{ buffer: GPUBuffer, size: { length: number, byteLength: number } } | undefined} domainMap
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
     * @param {(name: string) => [number, number] | undefined} params.getDefaultScaleRange
     * @param {(name: string, value: number|number[]|Array<number|number[]>) => void} params.setUniformValue
     */
    constructor({ device, channels, getDefaultScaleRange, setUniformValue }) {
        this._device = device;
        this._channels = channels;
        this._getDefaultScaleRange = getDefaultScaleRange;
        this._setUniformValue = setUniformValue;

        /** @type {Map<string, ReturnType<typeof buildChannelAnalysis>>} */
        this._analysisByChannel = new Map();
        for (const [name, channel] of Object.entries(channels)) {
            this._analysisByChannel.set(
                name,
                buildChannelAnalysis(name, channel)
            );
        }

        /** @type {Map<string, ChannelResources>} */
        this._channelResources = new Map();

        /** @type {Map<string, { updateDomain: (domain: unknown) => boolean, updateRange: (range: unknown) => boolean }>} */
        this._scaleUpdaters = new Map();
    }

    /**
     * @param {string} name
     * @returns {ReturnType<typeof buildChannelAnalysis>}
     */
    _getAnalysis(name) {
        const analysis = this._analysisByChannel.get(name);
        if (!analysis) {
            throw new Error(`Missing channel analysis for "${name}".`);
        }
        return analysis;
    }

    /**
     * @returns {Map<string, GPUBuffer>}
     */
    get ordinalRangeBuffers() {
        const buffers = new Map();
        for (const [name, resources] of this._channelResources) {
            if (resources.ordinalRange) {
                buffers.set(name, resources.ordinalRange.buffer);
            }
        }
        return buffers;
    }

    /**
     * @returns {Map<string, GPUBuffer>}
     */
    get domainMapBuffers() {
        const buffers = new Map();
        for (const [name, resources] of this._channelResources) {
            if (resources.domainMap) {
                buffers.set(name, resources.domainMap.buffer);
            }
        }
        return buffers;
    }

    /**
     * @returns {Map<string, { texture: GPUTexture, sampler: GPUSampler, width: number, height: number, format: GPUTextureFormat }>}
     */
    get rangeTextures() {
        const textures = new Map();
        for (const [name, resources] of this._channelResources) {
            if (resources.rangeTexture) {
                textures.set(name, resources.rangeTexture);
            }
        }
        return textures;
    }

    /**
     * @param {string} name
     * @returns {ChannelResources}
     */
    _getChannelResources(name) {
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
        const analysis = this._getAnalysis(name);
        const scaleType = analysis.scaleType;
        const requirements = getScaleResourceRequirements(
            scaleType,
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
        const def = getScaleUniformDef(scaleType);
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
        const analysis = this._getAnalysis(name);
        const requirements = getScaleResourceRequirements(
            analysis.scaleType,
            analysis.isPiecewise
        );
        const kind = requirements.stopKind;
        if (kind) {
            const { domainLength, rangeLength } = getScaleStopLengths(
                name,
                kind,
                scale
            );
            this._getChannelResources(name).scaleStops = {
                kind,
                domainLength,
                rangeLength,
            };
            if (
                kind === "piecewise" &&
                analysis.useRangeTexture &&
                rangeLength
            ) {
                this._setUniformValue(
                    RANGE_PREFIX + name,
                    normalizeRangePositions(rangeLength)
                );
            }
        }
        const def = getScaleUniformDef(scale.type);
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
     * @param {ReturnType<typeof buildChannelAnalysis>} analysis
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
     * @param {ReturnType<typeof buildChannelAnalysis>} params.analysis
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
        const outputComponents = analysis.outputComponents ?? 1;
        const outputType =
            outputComponents === 1 ? analysis.outputScalarType : "f32";
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
                updateStopDomain = (value) => {
                    const domainLength = stopInfo?.domainLength ?? 2;
                    const normalizeDomain =
                        scaleDef.normalizeDomain ??
                        (({ name, domain, domainLength: expectedLength }) => {
                            if (!Array.isArray(domain)) {
                                throw new Error(
                                    `Scale on "${name}" expects a domain array.`
                                );
                            }
                            if (
                                expectedLength &&
                                domain.length !== expectedLength
                            ) {
                                throw new Error(
                                    `Scale domain for "${name}" expects ${expectedLength} entries, got ${domain.length}.`
                                );
                            }
                            return domain;
                        });
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
                        stopInfo?.rangeLength &&
                        value.length !== stopInfo.rangeLength
                    ) {
                        throw new Error(
                            `Scale range for "${name}" expects ${stopInfo.rangeLength} entries, got ${value.length}.`
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
                updateStopDomain = (value) => {
                    if (!Array.isArray(value) && !ArrayBuffer.isView(value)) {
                        throw new Error(
                            `${stopKind === "threshold" ? "Threshold" : "Piecewise"} scale on "${name}" expects a domain array.`
                        );
                    }
                    const domain = Array.isArray(value)
                        ? value
                        : Array.from(
                              /** @type {ArrayLike<number>} */ (
                                  /** @type {unknown} */ (value)
                              )
                          );
                    if (domain.length !== stopInfo.domainLength) {
                        throw new Error(
                            `${stopKind === "threshold" ? "Threshold" : "Piecewise"} scale on "${name}" expects ${stopInfo.domainLength} domain entries, got ${domain.length}.`
                        );
                    }
                    this._setUniformValue(domainUniformName, domain);
                };
                updateStopRange = (value) => {
                    if (!Array.isArray(value)) {
                        throw new Error(
                            `${stopKind === "threshold" ? "Threshold" : "Piecewise"} scale on "${name}" expects a range array.`
                        );
                    }
                    const range = value;
                    if (range.length !== stopInfo.rangeLength) {
                        throw new Error(
                            `${stopKind === "threshold" ? "Threshold" : "Piecewise"} scale on "${name}" expects ${stopInfo.rangeLength} range entries, got ${range.length}.`
                        );
                    }
                    const normalized = normalizeDiscreteRange(
                        name,
                        range,
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
                      /** @type {Array<number|number[]|string>|import("../../index.d.ts").ColorInterpolatorFn} */ (
                          range
                      )
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
                    const normalized = normalizeOrdinalRange(
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
                              ? (this._getDefaultScaleRange(name) ?? range)
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

        return { updateDomain, updateRange };
    }

    /**
     * @param {string} name
     * @param {ChannelConfigResolved} channel
     * @param {ChannelScale} scale
     * @returns {void}
     */
    /**
     * @param {string} name
     * @param {Array<number|number[]|string>|import("../../index.d.ts").ColorInterpolatorFn} value
     * @returns {boolean}
     */
    _updateRangeTexture(name, value) {
        const channel = this._channels[name];
        if (!channel || !channel.scale) {
            throw new Error(`Channel "${name}" does not use a color scale.`);
        }
        /** @type {Array<number|number[]|string>|import("../../index.d.ts").ColorInterpolatorFn} */
        const normalizedRange =
            /** @type {Array<number|number[]|string>|import("../../index.d.ts").ColorInterpolatorFn} */ (
                value
            );
        const sizes = this._getScaleStopInfo(name);
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
            if (sizes && colorStops.length !== sizes.rangeLength) {
                throw new Error(
                    `Scale on "${name}" expects ${sizes.rangeLength} range entries, got ${colorStops.length}.`
                );
            }
            textureData = createSchemeTexture({
                scheme: colorStops,
                mode: "interpolate",
                interpolate: channel.scale.interpolate,
            });
        }
        if (!textureData) {
            throw new Error(`Failed to build range texture for "${name}".`);
        }
        return this._setRangeTexture(name, textureData);
    }

    /**
     * @param {string} name
     * @param {import("../../utils/colorUtils.js").TextureData} textureData
     * @returns {boolean}
     */
    _setRangeTexture(name, textureData) {
        const prepared = prepareTextureData(textureData);
        const resources = this._getChannelResources(name);
        const prev = resources.rangeTexture;
        const needsNewTexture =
            !prev ||
            prev.width !== prepared.width ||
            prev.height !== prepared.height ||
            prev.format !== prepared.format;
        const texture = needsNewTexture
            ? this._device.createTexture({
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
            prepared.data,
            { bytesPerRow: prepared.bytesPerRow },
            { width: prepared.width, height: prepared.height }
        );
        const sampler = prev?.sampler ?? this._device.createSampler();
        resources.rangeTexture = {
            texture,
            sampler,
            width: prepared.width,
            height: prepared.height,
            format: prepared.format,
        };
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
        const resources = this._getChannelResources(name);
        const prev = resources.domainMap;
        const nextBytes = data.byteLength;
        let buffer = resources.domainMap?.buffer;
        const needsNewBuffer =
            !buffer || !prev || prev.size.byteLength !== nextBytes;

        if (needsNewBuffer) {
            buffer = this._device.createBuffer({
                size: nextBytes,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
        }

        this._device.queue.writeBuffer(buffer, 0, data);
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
        const resources = this._getChannelResources(name);
        const prev = resources.ordinalRange;
        const nextBytes = data.byteLength;
        let buffer = resources.ordinalRange?.buffer;
        const needsNewBuffer =
            !buffer || !prev || prev.size.byteLength !== nextBytes;

        if (needsNewBuffer) {
            buffer = this._device.createBuffer({
                size: nextBytes,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
        }

        this._device.queue.writeBuffer(buffer, 0, data);
        resources.ordinalRange = {
            buffer,
            size: { length, byteLength: nextBytes },
        };
        this._setUniformValue(RANGE_COUNT_PREFIX + name, length);
        return needsNewBuffer;
    }
}
