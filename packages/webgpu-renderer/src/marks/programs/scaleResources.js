/* global GPUBufferUsage, GPUTextureUsage */
import { buildChannelAnalysis } from "../shaders/channelAnalysis.js";
import {
    getScaleResourceRequirements,
    getScaleUniformDef,
} from "../scales/scaleDefs.js";
import {
    coerceRangeValue,
    getScaleStopLengths,
    isColorRange,
    isRangeFunction,
    normalizeDiscreteRange,
    normalizeOrdinalRange,
    normalizeRangePositions,
} from "../scales/scaleStops.js";
import { packHighPrecisionDomain } from "../../utils/highPrecision.js";
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
     * @param {number[]|unknown} domain
     * @returns {boolean}
     */
    updateScaleDomain(name, domain) {
        const updater = this._scaleUpdaters.get(name);
        if (!updater) {
            return false;
        }
        return updater.updateDomain(domain);
    }

    /**
     * @param {string} name
     * @param {Array<number|number[]|string>|import("../../index.d.ts").ColorInterpolatorFn|{ range?: Array<number|number[]|string>|import("../../index.d.ts").ColorInterpolatorFn }} range
     * @returns {boolean}
     */
    updateScaleRange(name, range) {
        const updater = this._scaleUpdaters.get(name);
        if (!updater) {
            return false;
        }
        return updater.updateRange(range);
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
        const isIndexScale = analysis.scaleType === "index";
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
                  /** @type {ArrayLike<number> | null} */
                  let domainSource = null;
                  if (Array.isArray(value)) {
                      domainSource = value;
                  } else if (ArrayBuffer.isView(value)) {
                      domainSource = /** @type {ArrayLike<number>} */ (
                          /** @type {unknown} */ (value)
                      );
                  } else if (
                      value &&
                      typeof value === "object" &&
                      "domain" in value
                  ) {
                      const domainValue = /** @type {{ domain?: unknown }} */ (
                          value
                      ).domain;
                      if (Array.isArray(domainValue)) {
                          domainSource = domainValue;
                      } else if (ArrayBuffer.isView(domainValue)) {
                          domainSource = /** @type {ArrayLike<number>} */ (
                              /** @type {unknown} */ (domainValue)
                          );
                      }
                  }
                  if (!domainSource) {
                      throw new Error(
                          `Scale on "${name}" requires an explicit domain array.`
                      );
                  }
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
                    if (!isIndexScale) {
                        const pair = coerceRangeValue(
                            /** @type {number|number[]|{ domain?: number[], range?: Array<number|number[]|string> }} */ (
                                value
                            ),
                            "domain"
                        );
                        this._setUniformValue(domainUniformName, pair);
                        return;
                    }
                    /** @type {{ domain?: number[] }} */
                    const domainContainer =
                        typeof value === "object" && value
                            ? /** @type {{ domain?: number[] }} */ (value)
                            : {};
                    const domain = Array.isArray(value)
                        ? value
                        : (domainContainer.domain ?? []);
                    if (domain.length === 3) {
                        this._setUniformValue(domainUniformName, [
                            domain[0],
                            domain[1],
                            domain[2],
                        ]);
                        return;
                    }
                    if (domain.length === 2) {
                        this._setUniformValue(
                            domainUniformName,
                            packHighPrecisionDomain(domain[0], domain[1])
                        );
                        return;
                    }
                    throw new Error(
                        `Scale domain for "${name}" must have 2 or 3 entries for "${channel.scale.type}" scales.`
                    );
                };
                updateStopRange = (value) => {
                    const pair = coerceRangeValue(
                        /** @type {number|number[]|{ domain?: number[], range?: Array<number|number[]|string> }} */ (
                            value
                        ),
                        "range"
                    );
                    this._setUniformValue(rangeUniformName, pair);
                };
            } else {
                if (!stopInfo) {
                    throw new Error(
                        `Scale on "${name}" has no recorded stop sizes.`
                    );
                }
                updateStopDomain = (value) => {
                    /** @type {{ domain?: number[] }} */
                    const domainContainer =
                        typeof value === "object" && value
                            ? /** @type {{ domain?: number[] }} */ (value)
                            : {};
                    const domain = Array.isArray(value)
                        ? value
                        : (domainContainer.domain ?? []);
                    if (domain.length !== stopInfo.domainLength) {
                        throw new Error(
                            `${stopKind === "threshold" ? "Threshold" : "Piecewise"} scale on "${name}" expects ${stopInfo.domainLength} domain entries, got ${domain.length}.`
                        );
                    }
                    this._setUniformValue(domainUniformName, domain);
                };
                updateStopRange = (value) => {
                    /** @type {{ range?: Array<number|number[]|string> }} */
                    const rangeContainer =
                        typeof value === "object" && value
                            ? /** @type {{ range?: Array<number|number[]|string> }} */ (
                                  value
                              )
                            : {};
                    const range = Array.isArray(value)
                        ? value
                        : (rangeContainer.range ?? []);
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
            ? (range) => this._updateRangeTexture(name, range)
            : needsOrdinalRange
              ? (range) => {
                    if (isRangeFunction(range)) {
                        throw new Error(
                            `Ordinal scale on "${name}" does not support interpolator ranges.`
                        );
                    }
                    /** @type {Array<number|number[]|string>} */
                    let rangeArray = [];
                    if (Array.isArray(range)) {
                        rangeArray = range;
                    } else if (
                        range &&
                        typeof range === "object" &&
                        "range" in range
                    ) {
                        rangeArray =
                            /** @type {{ range?: Array<number|number[]|string> }} */ (
                                range
                            ).range ?? [];
                    }
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
                      updateStopRange(
                          /** @type {Array<number|number[]|string>|{ range?: Array<number|number[]|string> }} */ (
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
     * @param {Array<number|number[]|string>|import("../../index.d.ts").ColorInterpolatorFn|{ range?: Array<number|number[]|string>|import("../../index.d.ts").ColorInterpolatorFn }} value
     * @returns {boolean}
     */
    _updateRangeTexture(name, value) {
        const channel = this._channels[name];
        if (!channel || !channel.scale) {
            throw new Error(`Channel "${name}" does not use a color scale.`);
        }
        let range = value;
        if (
            range &&
            typeof range === "object" &&
            !Array.isArray(range) &&
            "range" in range
        ) {
            range =
                /** @type {{ range?: Array<number|number[]|string>|import("../../index.d.ts").ColorInterpolatorFn }} */ (
                    range
                ).range ?? [];
        }
        /** @type {Array<number|number[]|string>|import("../../index.d.ts").ColorInterpolatorFn} */
        const normalizedRange =
            /** @type {Array<number|number[]|string>|import("../../index.d.ts").ColorInterpolatorFn} */ (
                range
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
