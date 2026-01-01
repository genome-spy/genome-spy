/* global GPUBufferUsage, GPUTextureUsage */
import { buildChannelAnalysis } from "../shaders/channelAnalysis.js";
import {
    getScaleUniformDef,
    getScaleOutputType,
} from "../scales/scaleCodegen.js";
import {
    coerceRangeValue,
    getDomainRangeKind,
    getDomainRangeLengths,
    isColorRange,
    isRangeFunction,
    normalizeOrdinalDomain,
    normalizeDomainRange,
    normalizeDiscreteRange,
    normalizeOrdinalRange,
    normalizeRangePositions,
    usesOrdinalDomainMap,
    usesRangeTexture,
} from "../scales/domainRangeUtils.js";
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
import { isValueChannelConfig } from "../../types.js";

/**
 * @typedef {import("../../index.d.ts").ChannelConfigResolved} ChannelConfigResolved
 * @typedef {import("../../index.d.ts").ChannelScale} ChannelScale
 * @typedef {import("../../index.d.ts").TypedArray} TypedArray
 * @typedef {import("../../types.js").ScalarType} ScalarType
 * @typedef {object} ChannelResources
 * @property {{ kind: "continuous"|"threshold"|"piecewise", domainLength: number, rangeLength: number } | undefined} domainRange
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
     * @param {(name: string) => boolean} params.hasUniform
     */
    constructor({
        device,
        channels,
        getDefaultScaleRange,
        setUniformValue,
        hasUniform,
    }) {
        this._device = device;
        this._channels = channels;
        this._getDefaultScaleRange = getDefaultScaleRange;
        this._setUniformValue = setUniformValue;
        this._hasUniform = hasUniform;

        /** @type {Map<string, ChannelResources>} */
        this._channelResources = new Map();
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
     * @returns {ChannelResources["domainRange"] | undefined}
     */
    _getDomainRangeInfo(name) {
        return this._channelResources.get(name)?.domainRange;
    }

    /**
     * @param {Array<{ name: string, type: ScalarType, components: 1|2|4, arrayLength?: number }>} layout
     * @param {string} name
     * @param {ChannelConfigResolved} channel
     * @returns {void}
     */
    addScaleUniforms(layout, name, channel) {
        const analysis = buildChannelAnalysis(name, channel);
        const scaleType = analysis.scaleType;
        const kind = getDomainRangeKind(channel.scale);
        if (kind) {
            const { domainLength, rangeLength } = getDomainRangeLengths(
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
                name: `${DOMAIN_PREFIX}${name}`,
                type: "f32",
                components: 1,
                arrayLength: domainLength,
            });
            layout.push({
                name: `${RANGE_PREFIX}${name}`,
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
        if (analysis.needsOrdinalRange) {
            layout.push({
                name: `${RANGE_COUNT_PREFIX}${name}`,
                type: "f32",
                components: 1,
            });
        }
        if (analysis.needsDomainMap) {
            layout.push({
                name: `${DOMAIN_MAP_COUNT_PREFIX}${name}`,
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
        const kind = getDomainRangeKind(scale);
        if (kind) {
            const outputComponents = channel.components ?? 1;
            if (usesRangeTexture(scale, outputComponents)) {
                const { domainLength, rangeLength } = getDomainRangeLengths(
                    name,
                    kind,
                    scale
                );
                const rawDomain = Array.isArray(scale.domain)
                    ? scale.domain
                    : [0, 1];
                const domain =
                    kind === "continuous"
                        ? [rawDomain[0] ?? 0, rawDomain[1] ?? 1]
                        : rawDomain;
                const range =
                    kind === "piecewise"
                        ? normalizeRangePositions(rangeLength)
                        : [0, 1];
                this._setUniformValue(`${DOMAIN_PREFIX}${name}`, domain);
                this._setUniformValue(`${RANGE_PREFIX}${name}`, range);
                this._getChannelResources(name).domainRange = {
                    kind,
                    domainLength,
                    rangeLength,
                };
                this._initializeRangeTexture(name, scale);
            } else {
                const { domain, range, domainLength, rangeLength } =
                    normalizeDomainRange(
                        name,
                        channel,
                        scale,
                        kind,
                        (valueName) => this._getDefaultScaleRange(valueName)
                    );
                this._setUniformValue(`${DOMAIN_PREFIX}${name}`, domain);
                this._setUniformValue(`${RANGE_PREFIX}${name}`, range);
                this._getChannelResources(name).domainRange = {
                    kind,
                    domainLength,
                    rangeLength,
                };
            }
        }
        if (usesOrdinalDomainMap(scale)) {
            this._initializeDomainMap(name, scale);
        }
        if (scale.type === "ordinal") {
            this._initializeOrdinalRange(name, channel, scale);
        }
        const def = getScaleUniformDef(scale.type);
        for (const param of def.params) {
            let value = param.defaultValue;
            if (param.prop && scale[param.prop] !== undefined) {
                value = scale[param.prop];
            }
            this._setUniformValue(`${param.prefix}${name}`, value);
        }
    }

    /**
     * @param {Record<string, number[]>} domains
     * @param {(nameOrScale: string) => string[]} resolveTargets
     * @returns {boolean}
     */
    updateScaleDomains(domains, resolveTargets) {
        let needsRebind = false;
        for (const [name, domain] of Object.entries(domains)) {
            for (const channelName of resolveTargets(name)) {
                const channel = this._channels[channelName];
                const outputComponents = channel?.components ?? 1;
                const scaleType = channel?.scale?.type ?? "identity";
                if (
                    channel &&
                    (scaleType === "ordinal" || scaleType === "band")
                ) {
                    const inputComponents =
                        channel.inputComponents ?? channel.components ?? 1;
                    const ordinalDomain = normalizeOrdinalDomain(
                        channelName,
                        scaleType,
                        Array.isArray(domain) || ArrayBuffer.isView(domain)
                            ? domain
                            : undefined
                    );
                    if (ordinalDomain) {
                        if (scaleType === "band" && channel.type !== "u32") {
                            throw new Error(
                                `Band scale on "${channelName}" requires u32 inputs when using an ordinal domain.`
                            );
                        }
                        if (scaleType === "band" && inputComponents !== 1) {
                            throw new Error(
                                `Band scale on "${channelName}" requires scalar inputs when using an ordinal domain.`
                            );
                        }
                        if (
                            scaleType === "band" &&
                            isValueChannelConfig(channel) &&
                            typeof channel.value === "number" &&
                            !Number.isInteger(channel.value)
                        ) {
                            throw new Error(
                                `Band scale on "${channelName}" requires integer values when using an ordinal domain.`
                            );
                        }
                        if (this._updateDomainMap(channelName, ordinalDomain)) {
                            needsRebind = true;
                        }
                        if (scaleType === "band") {
                            this._setUniformValue(
                                `${DOMAIN_PREFIX}${channelName}`,
                                [0, ordinalDomain.length]
                            );
                        }
                        continue;
                    }
                }
                const kind = getDomainRangeKind(channel?.scale);
                if (
                    channel &&
                    kind &&
                    usesRangeTexture(channel.scale, outputComponents)
                ) {
                    this._updateDomainRange(channelName, "domain", domain);
                    if (kind === "piecewise") {
                        const sizes = this._getDomainRangeInfo(channelName);
                        const positions = normalizeRangePositions(
                            sizes?.rangeLength ?? domain.length
                        );
                        if (sizes && positions.length !== sizes.rangeLength) {
                            throw new Error(
                                `Piecewise scale on "${channelName}" expects ${sizes.rangeLength} range entries, got ${positions.length}.`
                            );
                        }
                        this._setUniformValue(
                            `${RANGE_PREFIX}${channelName}`,
                            positions
                        );
                    }
                    continue;
                }
                this._updateDomainRange(channelName, "domain", domain);
            }
        }
        return needsRebind;
    }

    /**
     * @param {Record<string, Array<number|number[]|string>|import("../../index.d.ts").ColorInterpolatorFn|{ range?: Array<number|number[]|string>|import("../../index.d.ts").ColorInterpolatorFn }>} ranges
     * @param {(nameOrScale: string) => string[]} resolveTargets
     * @returns {boolean}
     */
    updateScaleRanges(ranges, resolveTargets) {
        let needsRebind = false;
        for (const [name, range] of Object.entries(ranges)) {
            for (const channelName of resolveTargets(name)) {
                const channel = this._channels[channelName];
                const outputComponents = channel?.components ?? 1;
                const scaleType = channel?.scale?.type ?? "identity";
                if (
                    channel &&
                    usesRangeTexture(channel.scale, outputComponents)
                ) {
                    if (this._updateRangeTexture(channelName, range)) {
                        needsRebind = true;
                    }
                    continue;
                }
                if (scaleType === "ordinal") {
                    if (
                        this._updateOrdinalRange(
                            channelName,
                            /** @type {Array<number|number[]|string>} */ (range)
                        )
                    ) {
                        needsRebind = true;
                    }
                    continue;
                }
                if (isRangeFunction(range)) {
                    throw new Error(
                        `Scale on "${channelName}" does not support interpolator ranges.`
                    );
                }
                this._updateDomainRange(
                    channelName,
                    "range",
                    /** @type {Array<number|number[]|string>|{ range?: Array<number|number[]|string> }} */ (
                        range
                    )
                );
            }
        }
        return needsRebind;
    }

    /**
     * @param {string} name
     * @param {"domain"|"range"} suffix
     * @param {unknown} value
     * @returns {void}
     */
    _updateDomainRange(name, suffix, value) {
        const channel = this._channels[name];
        const kind = getDomainRangeKind(channel?.scale);
        const label =
            kind === "threshold"
                ? "Threshold"
                : kind === "piecewise"
                  ? "Piecewise"
                  : "Scale";
        if (!channel || !kind) {
            throw new Error(
                `Channel "${name}" does not use a scale with ${suffix} values.`
            );
        }
        const uniformName =
            suffix === "domain"
                ? `${DOMAIN_PREFIX}${name}`
                : `${RANGE_PREFIX}${name}`;
        if (!this._hasUniform(uniformName)) {
            throw new Error(
                `Uniform "${uniformName}" is not available for updates.`
            );
        }

        if (kind === "continuous") {
            const isHighPrecision = channel.scale?.type === "index";
            if (isHighPrecision && suffix === "domain") {
                /** @type {{ domain?: number[] }} */
                const domainContainer =
                    typeof value === "object" && value
                        ? /** @type {{ domain?: number[] }} */ (value)
                        : {};
                const domain = Array.isArray(value)
                    ? value
                    : (domainContainer.domain ?? []);
                if (domain.length === 3) {
                    this._setUniformValue(uniformName, [
                        domain[0],
                        domain[1],
                        domain[2],
                    ]);
                    return;
                }
                if (domain.length === 2) {
                    this._setUniformValue(
                        uniformName,
                        packHighPrecisionDomain(domain[0], domain[1])
                    );
                    return;
                }
                throw new Error(
                    `Scale domain for "${name}" must have 2 or 3 entries for "${channel.scale.type}" scales.`
                );
            }
            const pair = coerceRangeValue(
                /** @type {number|number[]|{ domain?: number[], range?: Array<number|number[]|string> }} */ (
                    value
                ),
                suffix
            );
            this._setUniformValue(uniformName, pair);
            return;
        }

        const sizes = this._getDomainRangeInfo(name);
        if (!sizes) {
            throw new Error(
                `${label} scale on "${name}" has no recorded size.`
            );
        }

        if (suffix === "domain") {
            /** @type {{ domain?: number[] }} */
            const domainContainer =
                typeof value === "object" && value
                    ? /** @type {{ domain?: number[] }} */ (value)
                    : {};
            const domain = Array.isArray(value)
                ? value
                : (domainContainer.domain ?? []);
            if (domain.length !== sizes.domainLength) {
                throw new Error(
                    `${label} scale on "${name}" expects ${sizes.domainLength} domain entries, got ${domain.length}.`
                );
            }
            this._setUniformValue(uniformName, domain);
            return;
        }

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
        if (range.length !== sizes.rangeLength) {
            throw new Error(
                `${label} scale on "${name}" expects ${sizes.rangeLength} range entries, got ${range.length}.`
            );
        }
        const outputComponents = buildChannelAnalysis(
            name,
            channel
        ).outputComponents;
        const normalized = normalizeDiscreteRange(
            name,
            range,
            outputComponents,
            kind
        );
        this._setUniformValue(uniformName, normalized);
    }

    /**
     * @param {string} name
     * @param {ChannelConfigResolved} channel
     * @param {ChannelScale} scale
     * @returns {void}
     */
    _initializeOrdinalRange(name, channel, scale) {
        const outputComponents = channel.components ?? 1;
        const outputType =
            outputComponents === 1
                ? getScaleOutputType("ordinal", channel.type ?? "f32")
                : "f32";
        if (isRangeFunction(scale.range)) {
            throw new Error(
                `Ordinal scale on "${name}" does not support interpolator ranges.`
            );
        }
        const normalized = normalizeOrdinalRange(
            name,
            /** @type {Array<number|number[]|string>} */ (scale.range ?? []),
            outputComponents
        );
        const data = this._buildOrdinalRangeBufferData(
            normalized,
            outputComponents,
            outputType
        );
        this._setOrdinalRangeBuffer(name, data, normalized.length);
    }

    /**
     * @param {string} name
     * @param {ChannelScale} scale
     * @returns {void}
     */
    _initializeDomainMap(name, scale) {
        const scaleType =
            scale.type === "band" || scale.type === "ordinal"
                ? scale.type
                : "ordinal";
        const domain = normalizeOrdinalDomain(name, scaleType, scale.domain);
        const map = this._buildDomainMapBufferData(domain ?? []);
        this._setDomainMapBuffer(name, map.table, map.length);
    }

    /**
     * @param {string} name
     * @param {ChannelScale} scale
     * @returns {void}
     */
    _initializeRangeTexture(name, scale) {
        const range = scale.range ?? [];
        let textureData;
        if (isRangeFunction(range)) {
            textureData = createSchemeTexture(range);
        } else {
            if (!isColorRange(range)) {
                throw new Error(
                    `Interpolated color scale on "${name}" requires a color range.`
                );
            }
            const colorStops = /** @type {Array<string|number[]>} */ (range);
            textureData = createSchemeTexture({
                scheme: colorStops,
                mode: "interpolate",
                interpolate: scale.interpolate,
            });
        }
        if (!textureData) {
            throw new Error(`Failed to build range texture for "${name}".`);
        }
        this._setRangeTexture(name, textureData);
    }

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
        const sizes = this._getDomainRangeInfo(name);
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
    _updateOrdinalRange(name, value) {
        const channel = this._channels[name];
        if (!channel || channel.scale?.type !== "ordinal") {
            throw new Error(`Channel "${name}" does not use an ordinal scale.`);
        }
        const outputComponents = channel.components ?? 1;
        const outputType =
            outputComponents === 1
                ? getScaleOutputType("ordinal", channel.type ?? "f32")
                : "f32";
        const range = Array.isArray(value)
            ? value
            : /** @type {{ range?: Array<number|number[]|string> }} */ ((value)
                  .range ?? []);
        const normalized = normalizeOrdinalRange(
            name,
            /** @type {Array<number|number[]|string>} */ (range),
            outputComponents
        );
        const data = this._buildOrdinalRangeBufferData(
            normalized,
            outputComponents,
            outputType
        );
        return this._setOrdinalRangeBuffer(name, data, normalized.length);
    }

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
        this._setUniformValue(`${DOMAIN_MAP_COUNT_PREFIX}${name}`, length);
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
        this._setUniformValue(`${RANGE_COUNT_PREFIX}${name}`, length);
        return needsNewBuffer;
    }
}
