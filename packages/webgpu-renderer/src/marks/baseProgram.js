import { buildMarkShader } from "./markShaderBuilder.js";
import { isSeriesChannelConfig, isValueChannelConfig } from "../types.js";
import { UniformBuffer } from "../utils/uniformBuffer.js";
import { DOMAIN_PREFIX, RANGE_PREFIX } from "../wgsl/prefixes.js";
import {
    getScaleUniformDef,
    isPiecewiseScale,
    validateScaleConfig,
} from "./scaleCodegen.js";
import {
    coerceRangeValue,
    getDomainRangeKind,
    getDomainRangeLengths,
    normalizeDomainRange,
    normalizeDiscreteRange,
} from "./domainRangeUtils.js";

/**
 * @typedef {{ shaderCode: string, bufferBindings: GPUBindGroupLayoutEntry[] }} ShaderBuildResult
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
        const { shaderCode, bufferBindings } = this._buildShader();
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
                ...bufferBindings,
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
            const spec = this.channelSpecs[name];
            if (spec?.type === "f32" && !(array instanceof Float32Array)) {
                throw new Error(
                    `Channel "${name}" expects a Float32Array for f32 data`
                );
            }
            if (spec?.type === "u32" && !(array instanceof Uint32Array)) {
                throw new Error(
                    `Channel "${name}" expects a Uint32Array for u32 data`
                );
            }
            if (spec?.type === "i32" && !(array instanceof Int32Array)) {
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

        const entries = [
            {
                binding: 0,
                resource: { buffer: this._uniformBuffer },
            },
        ];

        // Build storage buffer bindings in the same order as the shader expects.
        let bindingIndex = 1;
        for (const [name, channel] of Object.entries(this._channels)) {
            if (!isSeriesChannelConfig(channel)) {
                continue;
            }
            entries.push({
                binding: bindingIndex++,
                resource: { buffer: this._buffersByField.get(name) },
            });
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
        // Accept both direct channel uniforms and scale domain/range updates.
        for (const [key, value] of Object.entries(values)) {
            if (key.endsWith(".domain") || key.endsWith(".range")) {
                const [channelName, rawSuffix] = key.split(".");
                const suffix = rawSuffix === "domain" ? "domain" : "range";
                this._updateDomainRange(channelName, suffix, value);
            } else {
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
                this._updateDomainRange(channelName, "domain", domain);
            }
        }
        this._writeUniforms();
    }

    /**
     * @param {Record<string, Array<number|number[]|string>>} ranges
     * @returns {void}
     */
    updateScaleRanges(ranges) {
        for (const [name, range] of Object.entries(ranges)) {
            for (const channelName of this._resolveScaleTargets(name)) {
                this._updateDomainRange(channelName, "range", range);
            }
        }
        this._writeUniforms();
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
        const scaleType = channel.scale?.type ?? "identity";
        const kind = getDomainRangeKind(channel.scale);
        if (kind) {
            const { domainLength, rangeLength } = getDomainRangeLengths(
                name,
                kind,
                channel.scale
            );
            const outputComponents = channel.components ?? 1;
            const outputType =
                outputComponents === 1 ? (channel.type ?? "f32") : "f32";
            layout.push({
                name: `${DOMAIN_PREFIX}${name}`,
                type: "f32",
                components: 1,
                arrayLength: domainLength,
            });
            layout.push({
                name: `${RANGE_PREFIX}${name}`,
                type: outputType,
                components: outputComponents,
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
            const { domain, range, domainLength, rangeLength } =
                normalizeDomainRange(name, channel, scale, kind, (valueName) =>
                    this.getDefaultScaleRange(valueName)
                );
            this._setUniformValue(`${DOMAIN_PREFIX}${name}`, domain);
            this._setUniformValue(`${RANGE_PREFIX}${name}`, range);
            this._domainRangeSizes.set(name, {
                kind,
                domainLength,
                rangeLength,
            });
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
            const domain = Array.isArray(value)
                ? value
                : typeof value === "object" && value
                  ? /** @type {{ domain?: number[] }} */ ((value).domain ?? [])
                  : [];
            if (domain.length !== sizes.domainLength) {
                throw new Error(
                    `${label} scale on "${name}" expects ${sizes.domainLength} domain entries, got ${domain.length}.`
                );
            }
            this._setUniformValue(uniformName, domain);
            return;
        }

        const range = Array.isArray(value)
            ? value
            : typeof value === "object" && value
              ? /** @type {{ range?: Array<number|number[]|string> }} */ ((
                    value
                ).range ?? [])
              : [];
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
        return buildMarkShader({
            channels: this._channels,
            uniformLayout: this._uniformLayout,
            shaderBody: this.shaderBody,
        });
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
        if (spec?.type && channel.type && channel.type !== spec.type) {
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
            channel.components &&
            channel.components > 1 &&
            channel.type &&
            channel.type !== "f32"
        ) {
            throw new Error(
                `Only f32 vectors are supported for "${name}" right now.`
            );
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
        if (
            channel.inputComponents &&
            channel.inputComponents !== (channel.components ?? 1) &&
            channel.scale?.type !== "threshold" &&
            !isPiecewiseScale(channel.scale)
        ) {
            throw new Error(
                `Channel "${name}" only supports mismatched input/output components with threshold or piecewise scales.`
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
            if (
                isValueChannelConfig(channel) &&
                (channel.components ?? 1) > 1
            ) {
                throw new Error(
                    `Threshold scale on "${name}" requires scalar input values for vector outputs.`
                );
            }
        }
        if (isPiecewiseScale(channel.scale)) {
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
            if (
                isSeriesChannelConfig(channel) &&
                (channel.inputComponents ?? channel.components ?? 1) !== 1
            ) {
                throw new Error(
                    `Piecewise scale on "${name}" requires scalar input data.`
                );
            }
            if (
                isValueChannelConfig(channel) &&
                (channel.components ?? 1) > 1
            ) {
                throw new Error(
                    `Piecewise scale on "${name}" requires scalar input values for vector outputs.`
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
