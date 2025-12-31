/* global GPUTextureUsage */
import { buildMarkShader } from "./markShaderBuilder.js";
import { isSeriesChannelConfig, isValueChannelConfig } from "../types.js";
import { UniformBuffer } from "../utils/uniformBuffer.js";
import {
    DOMAIN_PREFIX,
    RANGE_COUNT_PREFIX,
    RANGE_PREFIX,
} from "../wgsl/prefixes.js";
import { buildChannelAnalysis } from "./channelAnalysis.js";
import {
    getScaleUniformDef,
    getScaleOutputType,
    validateScaleConfig,
} from "./scaleCodegen.js";
import {
    coerceRangeValue,
    getDomainRangeKind,
    getDomainRangeLengths,
    isColorRange,
    isRangeFunction,
    normalizeDomainRange,
    normalizeDiscreteRange,
    normalizeOrdinalRange,
    normalizeRangePositions,
    usesRangeTexture,
} from "./domainRangeUtils.js";
import { createSchemeTexture } from "../utils/colorUtils.js";
import { prepareTextureData } from "../utils/webgpuTextureUtils.js";

/**
 * @typedef {{
 *   shaderCode: string,
 *   resourceBindings: GPUBindGroupLayoutEntry[],
 *   resourceLayout: { name: string, role: "series"|"ordinalRange"|"rangeTexture"|"rangeSampler" }[],
 * }} ShaderBuildResult
 */

/**
 * Base class for marks that build WGSL dynamically based on channel configs.
 * Subclasses supply channel lists, defaults, and shader bodies.
 */
export default class BaseProgram {
    /**
     * @typedef {import("../index.d.ts").TypedArray} TypedArray
     * @typedef {import("../index.d.ts").ChannelConfigInput} ChannelConfigInput
     * @typedef {import("../index.d.ts").ChannelConfigResolved} ChannelConfigResolved
     * @typedef {import("./channelSpecUtils.js").ChannelSpec} ChannelSpec
     */

    /**
     * @param {import("../renderer.js").Renderer} renderer
     * @param {{ channels: Record<string, ChannelConfigInput>, count: number }} config
     */
    constructor(renderer, config) {
        this.renderer = renderer;
        this.device = renderer.device;
        this.count = config.count;

        this._channels = this._normalizeChannels(config.channels);
        this._buffersByField = new Map();
        this._bufferByArray = new Map();
        this._domainRangeSizes = new Map();
        this._ordinalRangeBuffers = new Map();
        this._ordinalRangeSizes = new Map();
        /** @type {Map<string, { texture: GPUTexture, sampler: GPUSampler, width: number, height: number, format: GPUTextureFormat }>} */
        this._rangeTextures = new Map();

        /** @type {{ name: string, role: "series"|"ordinalRange"|"rangeTexture"|"rangeSampler" }[]} */
        this._resourceLayout = [];

        /** @type {{ name: string, type: import("../types.js").ScalarType, components: 1|2|4, arrayLength?: number }[]} */
        this._uniformLayout = [];

        /** @type {UniformBuffer | null} */
        this._uniformBufferState = null;

        // Build a per-mark uniform layout. The layout can differ between marks,
        // but is stable for the lifetime of the mark.
        // Create a shader that matches the active channels (series vs values)
        // and the selected scale types. This keeps GPU programs minimal but makes
        // shader generation dynamic.
        this._buildUniformLayout();
        const { shaderCode, resourceBindings } = this._buildShader();
        this._uniformBuffer = this.device.createBuffer({
            size: this._uniformBufferState?.byteLength ?? 0,
            // eslint-disable-next-line no-undef
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this._initializeUniforms();
        this._writeUniforms();
        this._bindGroupLayout = this.device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    // eslint-disable-next-line no-undef
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
                ...resourceBindings,
            ],
        });

        this._pipeline = this.device.createRenderPipeline({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [
                    renderer._globalBindGroupLayout,
                    this._bindGroupLayout,
                ],
            }),
            vertex: {
                module: this.device.createShaderModule({
                    code: shaderCode,
                }),
                entryPoint: "vs_main",
            },
            fragment: {
                module: this.device.createShaderModule({
                    code: shaderCode,
                }),
                entryPoint: "fs_main",
                targets: [{ format: renderer.format }],
            },
            primitive: { topology: "triangle-list" },
        });

        // Initialize any series-backed channels.
        this.updateSeries(
            Object.fromEntries(
                Object.entries(this._channels)
                    .filter(([, v]) => isSeriesChannelConfig(v))
                    .map(([k, v]) => [k, v.data])
            ),
            config.count
        );
    }

    /**
     * @returns {string[]}
     */
    get channelOrder() {
        return [];
    }

    /**
     * Channels that may be omitted without data/value/defaults.
     *
     * @returns {string[]}
     */
    get optionalChannels() {
        return [];
    }

    /**
     * Channel metadata for validation and coercion.
     *
     * @returns {Record<string, ChannelSpec>}
     */
    get channelSpecs() {
        return {};
    }

    /**
     * @returns {Record<string, ChannelConfigInput>}
     */
    get defaultChannelConfigs() {
        return {};
    }

    /**
     * @returns {Record<string, number|number[]>}
     */
    get defaultValues() {
        return {};
    }

    /**
     * @returns {string}
     */
    get shaderBody() {
        return "";
    }

    /**
     * Override to provide default scale ranges for specific channels.
     *
     * @param {string} _name
     * @returns {[number, number] | undefined}
     */
    getDefaultScaleRange(_name) {
        return undefined;
    }

    /**
     * @param {Record<string, TypedArray>} channels
     * @param {number} count
     * @returns {void}
     */
    updateSeries(channels, count) {
        this.count = count;

        // Upload any columnar buffers to the GPU. Buffer identity is deduplicated
        // so a single array can feed multiple channels.
        for (const [name, channel] of Object.entries(this._channels)) {
            if (!isSeriesChannelConfig(channel)) {
                continue;
            }
            const array = channels[name] ?? channel.data;
            if (!array) {
                throw new Error(`Missing data for channel "${name}"`);
            }
            const expectedType = channel.type ?? this.channelSpecs[name]?.type;
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
            const inputComponents =
                channel.inputComponents ?? channel.components ?? 1;
            if (array.length < count * inputComponents) {
                throw new Error(
                    `Channel "${name}" length (${array.length}) is less than count (${count})`
                );
            }
            this._ensureBuffer(name, array);
        }

        this._rebuildBindGroup();
    }

    /**
     * @returns {void}
     */
    _rebuildBindGroup() {
        /** @type {GPUBindGroupEntry[]} */
        const entries = [
            {
                binding: 0,
                resource: { buffer: this._uniformBuffer },
            },
        ];

        // Build storage/texture bindings in the same order as the shader expects.
        let bindingIndex = 1;
        for (const entry of this._resourceLayout) {
            if (entry.role === "series") {
                const buffer = this._buffersByField.get(entry.name) ?? null;
                if (!buffer) {
                    throw new Error(
                        `Missing buffer binding for "${entry.name}".`
                    );
                }
                entries.push({
                    binding: bindingIndex++,
                    resource: { buffer },
                });
                continue;
            } else if (entry.role === "ordinalRange") {
                const buffer =
                    this._ordinalRangeBuffers.get(entry.name) ?? null;
                if (!buffer) {
                    throw new Error(
                        `Missing buffer binding for "${entry.name}".`
                    );
                }
                entries.push({
                    binding: bindingIndex++,
                    resource: { buffer },
                });
                continue;
            } else if (entry.role === "rangeTexture") {
                const texture = this._rangeTextures.get(entry.name)?.texture;
                if (!texture) {
                    throw new Error(
                        `Missing range texture for "${entry.name}".`
                    );
                }
                entries.push({
                    binding: bindingIndex++,
                    resource: texture.createView(),
                });
                continue;
            } else if (entry.role === "rangeSampler") {
                const sampler = this._rangeTextures.get(entry.name)?.sampler;
                if (!sampler) {
                    throw new Error(
                        `Missing range sampler for "${entry.name}".`
                    );
                }
                entries.push({
                    binding: bindingIndex++,
                    resource: sampler,
                });
                continue;
            }
            throw new Error(`Unknown resource binding role "${entry.role}".`);
        }

        this._bindGroup = this.device.createBindGroup({
            layout: this._bindGroupLayout,
            entries,
        });
    }

    /**
     * @param {string} field
     * @param {TypedArray} array
     */
    _ensureBuffer(field, array) {
        // TODO: Decide whether identity-based deduplication is sufficient long-term.
        let buffer = this._bufferByArray.get(array);

        if (!buffer) {
            // Storage buffers are used for per-instance columnar data.
            buffer = this.device.createBuffer({
                size: array.byteLength,
                // eslint-disable-next-line no-undef
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            this._bufferByArray.set(array, buffer);
        }

        this.device.queue.writeBuffer(buffer, 0, array);
        this._buffersByField.set(field, buffer);
    }

    /**
     * @param {Record<string, number|number[]|{ domain?: number[], range?: Array<number|number[]|string> }>} values
     * @returns {void}
     */
    updateValues(values) {
        for (const [key, value] of Object.entries(values)) {
            const uniformKey = `u_${key}`;
            if (!this._uniformBufferState?.entries.has(uniformKey)) {
                throw new Error(
                    `Uniform "${uniformKey}" is not available for updates.`
                );
            }
            this._setUniformValue(
                uniformKey,

                /** @type {number|number[]} */ (value)
            );
        }
        this._writeUniforms();
    }

    /**
     * @param {Record<string, number[]>} domains
     * @returns {void}
     */
    updateScaleDomains(domains) {
        for (const [name, domain] of Object.entries(domains)) {
            for (const channelName of this._resolveScaleTargets(name)) {
                const channel = this._channels[channelName];
                const outputComponents = channel?.components ?? 1;
                const kind = getDomainRangeKind(channel?.scale);
                if (
                    channel &&
                    kind &&
                    usesRangeTexture(channel.scale, outputComponents)
                ) {
                    this._updateDomainRange(channelName, "domain", domain);
                    if (kind === "piecewise") {
                        const sizes = this._domainRangeSizes.get(channelName);
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
        this._writeUniforms();
    }

    /**
     * @param {Record<string, Array<number|number[]|string>|import("../index.d.ts").ColorInterpolatorFn|{ range?: Array<number|number[]|string>|import("../index.d.ts").ColorInterpolatorFn }>} ranges
     * @returns {void}
     */
    updateScaleRanges(ranges) {
        let needsRebind = false;
        for (const [name, range] of Object.entries(ranges)) {
            for (const channelName of this._resolveScaleTargets(name)) {
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
        this._writeUniforms();
        if (needsRebind) {
            this._rebuildBindGroup();
        }
    }

    /**
     * @returns {void}
     */
    _buildUniformLayout() {
        /** @type {{ name: string, type: import("../types.js").ScalarType, components: 1|2|4, arrayLength?: number }[]} */
        const layout = [];

        // Create uniform slots for per-channel values and scale parameters.
        for (const [name, channel] of Object.entries(this._channels)) {
            if (isValueChannelConfig(channel) && channel.dynamic) {
                layout.push({
                    name: `u_${name}`,
                    type: channel.type ?? "f32",
                    components: channel.components ?? 1,
                });
            }
            if (isSeriesChannelConfig(channel) && channel.scale) {
                this._addScaleUniforms(layout, name, channel);
            }
            if (isValueChannelConfig(channel) && channel.scale) {
                this._addScaleUniforms(layout, name, channel);
            }
        }

        this._uniformLayout = layout;
        if (this._uniformLayout.length === 0) {
            // WebGPU does not allow empty uniform buffers; keep a dummy entry.
            this._uniformLayout.push({
                name: "dummy",
                type: "f32",
                components: 1,
            });
        }
        this._uniformBufferState = new UniformBuffer(this._uniformLayout);
    }

    /**
     * @returns {void}
     */
    _initializeUniforms() {
        for (const [name, channel] of Object.entries(this._channels)) {
            if (isSeriesChannelConfig(channel) && channel.scale) {
                this._initializeScaleUniforms(name, channel, channel.scale);
            }
            if (isValueChannelConfig(channel) && channel.scale) {
                this._initializeScaleUniforms(name, channel, channel.scale);
            }
            if (isValueChannelConfig(channel) && channel.dynamic) {
                this._setUniformValue(`u_${name}`, channel.value);
            }
        }
    }

    /**
     * @param {Array<{ name: string, type: import("../types.js").ScalarType, components: 1|2|4, arrayLength?: number }>} layout
     * @param {string} name
     * @param {import("../index.d.ts").ChannelConfigResolved} channel
     * @returns {void}
     */
    _addScaleUniforms(layout, name, channel) {
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
    }

    /**
     * @param {string} name
     * @param {import("../index.d.ts").ChannelConfigResolved} channel
     * @param {import("../index.d.ts").ChannelScale} scale
     * @returns {void}
     */
    _initializeScaleUniforms(name, channel, scale) {
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
                // Ramp textures assume uniformly spaced stops for piecewise scales.
                const range =
                    kind === "piecewise"
                        ? normalizeRangePositions(rangeLength)
                        : [0, 1];
                this._setUniformValue(`${DOMAIN_PREFIX}${name}`, domain);
                this._setUniformValue(`${RANGE_PREFIX}${name}`, range);
                this._domainRangeSizes.set(name, {
                    kind,
                    domainLength,
                    rangeLength,
                });
                this._initializeRangeTexture(name, scale);
            } else {
                const { domain, range, domainLength, rangeLength } =
                    normalizeDomainRange(
                        name,
                        channel,
                        scale,
                        kind,
                        (valueName) => this.getDefaultScaleRange(valueName)
                    );
                this._setUniformValue(`${DOMAIN_PREFIX}${name}`, domain);
                this._setUniformValue(`${RANGE_PREFIX}${name}`, range);
                this._domainRangeSizes.set(name, {
                    kind,
                    domainLength,
                    rangeLength,
                });
            }
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
        if (!this._uniformBufferState?.entries.has(uniformName)) {
            throw new Error(
                `Uniform "${uniformName}" is not available for updates.`
            );
        }

        if (kind === "continuous") {
            const pair = coerceRangeValue(
                /** @type {number|number[]|{ domain?: number[], range?: Array<number|number[]|string> }} */ (
                    value
                ),
                suffix
            );
            this._setUniformValue(uniformName, pair);
            return;
        }

        const sizes = this._domainRangeSizes.get(name);
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
        const outputComponents = channel.components ?? 1;
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
     * @param {import("../index.d.ts").ChannelConfigResolved} channel
     * @param {import("../index.d.ts").ChannelScale} scale
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
            /** @type {Array<number|number[]|string>|undefined} */ (
                scale.range
            ),
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
     * @param {import("../index.d.ts").ChannelScale} scale
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
     * @param {Array<number|number[]|string>|import("../index.d.ts").ColorInterpolatorFn|{ range?: Array<number|number[]|string>|import("../index.d.ts").ColorInterpolatorFn }} value
     * @returns {boolean}
     */
    _updateRangeTexture(name, value) {
        const channel = this._channels[name];
        if (!channel || !channel.scale) {
            throw new Error(`Channel "${name}" does not use a color scale.`);
        }
        const range =
            /** @type {Array<number|number[]|string>|import("../index.d.ts").ColorInterpolatorFn} */ (
                Array.isArray(value)
                    ? value
                    : typeof value === "object" && value
                      ? /** @type {{ range?: Array<number|number[]|string>|import("../index.d.ts").ColorInterpolatorFn }} */ (
                            value.range ?? []
                        )
                      : value
            );
        const sizes = this._domainRangeSizes.get(name);
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
     * @param {import("../utils/colorUtils.js").TextureData} textureData
     * @returns {boolean}
     */
    _setRangeTexture(name, textureData) {
        const prepared = prepareTextureData(textureData);
        const prev = this._rangeTextures.get(name);
        const needsNewTexture =
            !prev ||
            prev.width !== prepared.width ||
            prev.height !== prepared.height ||
            prev.format !== prepared.format;
        const texture = needsNewTexture
            ? this.device.createTexture({
                  size: {
                      width: prepared.width,
                      height: prepared.height,
                      depthOrArrayLayers: 1,
                  },
                  format: prepared.format,
                  // eslint-disable-next-line no-undef
                  usage:
                      GPUTextureUsage.TEXTURE_BINDING |
                      GPUTextureUsage.COPY_DST,
              })
            : prev.texture;
        const sampler = needsNewTexture
            ? this.device.createSampler({
                  addressModeU: "clamp-to-edge",
                  addressModeV: "clamp-to-edge",
                  magFilter: "linear",
                  minFilter: "linear",
              })
            : prev.sampler;

        this.device.queue.writeTexture(
            { texture },
            prepared.data,
            {
                bytesPerRow: prepared.bytesPerRow,
                rowsPerImage: prepared.height,
            },
            {
                width: prepared.width,
                height: prepared.height,
                depthOrArrayLayers: 1,
            }
        );

        if (needsNewTexture) {
            this._rangeTextures.set(name, {
                texture,
                sampler,
                width: prepared.width,
                height: prepared.height,
                format: prepared.format,
            });
        }

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
            : typeof value === "object" && value
              ? /** @type {{ range?: Array<number|number[]|string> }} */ (
                    value.range ?? []
                )
              : [];
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
     * @param {Array<number|number[]>} range
     * @param {1|2|4} outputComponents
     * @param {import("../types.js").ScalarType} outputType
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
        const prev = this._ordinalRangeSizes.get(name);
        const nextBytes = data.byteLength;
        let buffer = this._ordinalRangeBuffers.get(name);
        const needsNewBuffer = !buffer || prev?.byteLength !== nextBytes;

        if (needsNewBuffer) {
            buffer = this.device.createBuffer({
                size: nextBytes,
                // eslint-disable-next-line no-undef
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            });
            this._ordinalRangeBuffers.set(name, buffer);
        }

        this.device.queue.writeBuffer(buffer, 0, data);
        this._ordinalRangeSizes.set(name, { length, byteLength: nextBytes });
        this._setUniformValue(`${RANGE_COUNT_PREFIX}${name}`, length);
        return needsNewBuffer;
    }

    /**
     * @param {string} nameOrScale
     * @returns {string[]}
     */
    _resolveScaleTargets(nameOrScale) {
        return [nameOrScale];
    }

    /**
     * @param {string} name
     * @param {number|number[]|Array<number|number[]>} value
     * @returns {void}
     */
    _setUniformValue(name, value) {
        this._uniformBufferState?.setValue(name, value);
    }

    /**
     * @returns {void}
     */
    _writeUniforms() {
        if (
            !this._uniformBufferState ||
            this._uniformBufferState.byteLength === 0
        ) {
            return;
        }
        // Single uniform buffer update keeps GPU bindings stable.
        this.device.queue.writeBuffer(
            this._uniformBuffer,
            0,
            this._uniformBufferState.data
        );
    }
    // Uniform packing lives in utils/uniformBuffer.js.

    /**
     * @returns {ShaderBuildResult}
     */
    _buildShader() {
        const result = buildMarkShader({
            channels: this._channels,
            uniformLayout: this._uniformLayout,
            shaderBody: this.shaderBody,
        });
        this._resourceLayout = result.resourceLayout;
        return result;
    }

    /**
     * @param {GPURenderPassEncoder} pass
     */
    draw(pass) {
        pass.setPipeline(this._pipeline);
        pass.setBindGroup(0, this.renderer._globalBindGroup);
        pass.setBindGroup(1, this._bindGroup);
        pass.draw(6, this.count, 0, 0);
    }

    destroy() {
        // TODO: Track and destroy buffers once GPUBuffer.destroy is supported in all targets.
    }

    /**
     * @param {Record<string, ChannelConfigInput>} [config]
     * @returns {Record<string, ChannelConfigResolved>}
     */
    _normalizeChannels(config) {
        /** @type {Record<string, ChannelConfigResolved>} */
        const channels = {};
        for (const name of this.channelOrder) {
            const configChannel = config?.[name];
            const merged = /** @type {ChannelConfigInput} */ (
                /** @type {unknown} */ ({
                    ...(this.defaultChannelConfigs[name] ?? {}),
                    ...(config?.[name] ?? {}),
                })
            );
            if (!merged.components) {
                merged.components = 1;
            }
            if (isSeriesChannelConfig(merged) && !merged.inputComponents) {
                merged.inputComponents = merged.components;
            }
            if (
                isSeriesChannelConfig(merged) &&
                (configChannel?.value !== undefined ||
                    configChannel?.default !== undefined)
            ) {
                throw new Error(
                    `Channel "${name}" must not specify both data and value.`
                );
            }
            if (isSeriesChannelConfig(merged)) {
                delete merged.value;
                delete merged.default;
            }
            // Provide sensible defaults early so downstream code can assume data or value.
            if (!isSeriesChannelConfig(merged) && merged.value === undefined) {
                if (merged.default !== undefined) {
                    merged.value = merged.default;
                } else if (this.defaultValues[name] !== undefined) {
                    merged.value = this.defaultValues[name];
                }
            }
            if (
                this.optionalChannels.includes(name) &&
                !isSeriesChannelConfig(merged) &&
                !isValueChannelConfig(merged)
            ) {
                continue;
            }
            this._validateChannel(name, merged);
            channels[name] = /** @type {ChannelConfigResolved} */ (merged);
        }
        return channels;
    }

    /**
     * @param {string} name
     * @param {ChannelConfigInput} channel
     */
    _validateChannel(name, channel) {
        if (!this.channelOrder.includes(name)) {
            throw new Error(`Unknown channel: ${name}`);
        }
        const spec = this.channelSpecs[name];
        if (spec?.components && channel.components !== spec.components) {
            throw new Error(
                `Channel "${name}" must use ${spec.components} components`
            );
        }
        const analysis = buildChannelAnalysis(name, channel);
        const {
            scaleType,
            outputComponents,
            inputComponents,
            allowsScalarToVector,
            isContinuousScale,
            rangeIsFunction,
            rangeIsColor,
            isPiecewise,
        } = analysis;
        const allowsOrdinalTypeOverride =
            scaleType === "ordinal" &&
            spec?.type === "f32" &&
            outputComponents > 1 &&
            channel.type === "u32";
        if (
            spec?.type &&
            channel.type &&
            channel.type !== spec.type &&
            !allowsOrdinalTypeOverride
        ) {
            throw new Error(`Channel "${name}" must use type "${spec.type}"`);
        }
        if (
            this.optionalChannels.includes(name) &&
            !isSeriesChannelConfig(channel) &&
            !isValueChannelConfig(channel)
        ) {
            return;
        }
        if (isSeriesChannelConfig(channel)) {
            if (!channel.data) {
                throw new Error(`Missing data for channel "${name}"`);
            }
            if (!channel.type) {
                throw new Error(`Missing type for channel "${name}"`);
            }
        }
        if (isSeriesChannelConfig(channel) && isValueChannelConfig(channel)) {
            throw new Error(
                `Channel "${name}" must not specify both data and value.`
            );
        }
        if (!isSeriesChannelConfig(channel) && !isValueChannelConfig(channel)) {
            throw new Error(
                `Channel "${name}" must specify either data or value.`
            );
        }
        if (channel.components && ![1, 2, 4].includes(channel.components)) {
            throw new Error(`Invalid component count for "${name}"`);
        }
        if (
            channel.inputComponents &&
            ![1, 2, 4].includes(channel.inputComponents)
        ) {
            throw new Error(`Invalid input component count for "${name}"`);
        }
        if (
            channel.inputComponents &&
            channel.inputComponents > 1 &&
            channel.type &&
            channel.type !== "f32"
        ) {
            throw new Error(
                `Only f32 vectors are supported for "${name}" input data.`
            );
        }
        if (scaleType === "ordinal" && channel.type !== "u32") {
            throw new Error(
                `Ordinal scale on "${name}" requires u32 input type.`
            );
        }
        if (
            outputComponents > 1 &&
            channel.type &&
            channel.type !== "f32" &&
            !allowsScalarToVector
        ) {
            throw new Error(
                `Only f32 vectors are supported for "${name}" right now.`
            );
        }
        if (inputComponents !== outputComponents && !allowsScalarToVector) {
            throw new Error(
                `Channel "${name}" only supports mismatched input/output components when mapping scalars to vectors.`
            );
        }
        if (rangeIsFunction) {
            if (!isContinuousScale) {
                throw new Error(
                    `Channel "${name}" only supports function ranges with continuous scales.`
                );
            }
            if (outputComponents !== 4) {
                throw new Error(
                    `Channel "${name}" requires vec4 outputs when using function ranges.`
                );
            }
        }
        if (channel.scale?.interpolate !== undefined) {
            if (!rangeIsColor) {
                throw new Error(
                    `Channel "${name}" requires a color range when interpolate is set.`
                );
            }
            if (!isContinuousScale) {
                throw new Error(
                    `Channel "${name}" only supports color interpolation with continuous scales.`
                );
            }
            if (outputComponents !== 4) {
                throw new Error(
                    `Channel "${name}" requires vec4 outputs when using color interpolation.`
                );
            }
        }
        if (
            isContinuousScale &&
            !rangeIsFunction &&
            rangeIsColor &&
            outputComponents !== 4
        ) {
            throw new Error(
                `Channel "${name}" requires vec4 outputs when using color ranges.`
            );
        }

        if (channel.scale?.type === "threshold") {
            const domain = channel.scale.domain;
            const range = channel.scale.range;
            if (!Array.isArray(domain) || domain.length === 0) {
                throw new Error(
                    `Threshold scale on "${name}" requires a non-empty domain.`
                );
            }
            if (!Array.isArray(range) || range.length < 2) {
                throw new Error(
                    `Threshold scale on "${name}" requires at least two range entries.`
                );
            }
            if (range.length !== domain.length + 1) {
                throw new Error(
                    `Threshold scale on "${name}" requires range length of ${
                        domain.length + 1
                    }, got ${range.length}.`
                );
            }
            if (inputComponents !== 1) {
                throw new Error(
                    `Threshold scale on "${name}" requires scalar input values.`
                );
            }
        }
        if (isPiecewise) {
            const domain = channel.scale?.domain;
            const range = channel.scale?.range;
            if (!Array.isArray(domain) || domain.length < 2) {
                throw new Error(
                    `Piecewise scale on "${name}" requires at least two domain entries.`
                );
            }
            if (!Array.isArray(range) || range.length < 2) {
                throw new Error(
                    `Piecewise scale on "${name}" requires at least two range entries.`
                );
            }
            if (domain.length !== range.length) {
                throw new Error(
                    `Piecewise scale on "${name}" requires range length of ${domain.length}, got ${range.length}.`
                );
            }
            if (inputComponents !== 1) {
                throw new Error(
                    `Piecewise scale on "${name}" requires scalar input values.`
                );
            }
        }
        if (channel.scale?.type === "ordinal") {
            const range = channel.scale?.range;
            if (!Array.isArray(range) || range.length === 0) {
                throw new Error(
                    `Ordinal scale on "${name}" requires a non-empty range.`
                );
            }
            if (inputComponents !== 1) {
                throw new Error(
                    `Ordinal scale on "${name}" requires scalar input values.`
                );
            }
            if (isValueChannelConfig(channel)) {
                if (Array.isArray(channel.value)) {
                    throw new Error(
                        `Ordinal scale on "${name}" requires scalar integer values.`
                    );
                }
                if (
                    typeof channel.value === "number" &&
                    !Number.isInteger(channel.value)
                ) {
                    throw new Error(
                        `Ordinal scale on "${name}" requires integer values.`
                    );
                }
            }
            if (
                isValueChannelConfig(channel) &&
                outputComponents > 1 &&
                Array.isArray(channel.value)
            ) {
                throw new Error(
                    `Ordinal scale on "${name}" requires scalar input values for vector outputs.`
                );
            }
        }

        const scaleError = validateScaleConfig(name, channel);
        if (scaleError) {
            throw new Error(scaleError);
        }
    }

    // Type guards live in src/types.js to keep runtime checks consistent across modules.
}
