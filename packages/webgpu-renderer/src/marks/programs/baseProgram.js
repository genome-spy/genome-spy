import { buildMarkShader } from "../shaders/markShaderBuilder.js";
import { isSeriesChannelConfig, isValueChannelConfig } from "../../types.js";
import { UniformBuffer } from "../../utils/uniformBuffer.js";
import { buildChannelAnalysis } from "../shaders/channelAnalysis.js";
import { validateScaleConfig } from "../scales/scaleCodegen.js";
import { usesOrdinalDomainMap } from "../scales/domainRangeUtils.js";
import { SeriesBufferManager } from "./seriesBuffers.js";
import { buildBindGroup } from "./bindGroupBuilder.js";
import { ScaleResourceManager } from "./scaleResources.js";

let debugResourcesEnabled = false;

/**
 * @param {boolean} enabled
 * @returns {void}
 */
export function setDebugResourcesEnabled(enabled) {
    debugResourcesEnabled = enabled;
}

/**
 * @typedef {{
 *   shaderCode: string,
 *   resourceBindings: GPUBindGroupLayoutEntry[],
 *   resourceLayout: { name: string, role: "series"|"ordinalRange"|"domainMap"|"rangeTexture"|"rangeSampler" }[],
 * }} ShaderBuildResult
 */

/**
 * Base class for marks that build WGSL dynamically based on channel configs.
 * Subclasses supply channel lists, defaults, and shader bodies.
 */
export default class BaseProgram {
    /**
     * @typedef {import("../../index.d.ts").TypedArray} TypedArray
     * @typedef {import("../../index.d.ts").ChannelConfigInput} ChannelConfigInput
     * @typedef {import("../../index.d.ts").ChannelConfigResolved} ChannelConfigResolved
     * @typedef {import("../utils/channelSpecUtils.js").ChannelSpec} ChannelSpec
     */

    /**
     * @param {import("../../renderer.js").Renderer} renderer
     * @param {{ channels: Record<string, ChannelConfigInput>, count: number }} config
     */
    constructor(renderer, config) {
        this.renderer = renderer;
        this.device = renderer.device;
        this.count = config.count;

        this._channels = this._normalizeChannels(config.channels);
        this._seriesBuffers = new SeriesBufferManager(
            this.device,
            this._channels,
            this.channelSpecs
        );
        this._scaleResources = new ScaleResourceManager({
            device: this.device,
            channels: this._channels,
            getDefaultScaleRange: (name) => this.getDefaultScaleRange(name),
            setUniformValue: (name, value) =>
                this._setUniformValue(name, value),
            hasUniform: (name) =>
                this._uniformBufferState?.entries.has(name) ?? false,
        });

        /** @type {{ name: string, role: "series"|"ordinalRange"|"domainMap"|"rangeTexture"|"rangeSampler" }[]} */
        this._resourceLayout = [];

        /** @type {{ name: string, type: import("../../types.js").ScalarType, components: 1|2|4, arrayLength?: number }[]} */
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
        this._seriesBuffers.updateSeries(channels, count);

        this._rebuildBindGroup();
    }

    /**
     * @returns {void}
     */
    _rebuildBindGroup() {
        this._bindGroup = buildBindGroup({
            device: this.device,
            layout: this._bindGroupLayout,
            uniformBuffer: this._uniformBuffer,
            resourceLayout: this._resourceLayout,
            getSeriesBuffer: (name) => this._seriesBuffers.getBuffer(name),
            ordinalRangeBuffers: this._scaleResources.ordinalRangeBuffers,
            domainMapBuffers: this._scaleResources.domainMapBuffers,
            rangeTextures: this._scaleResources.rangeTextures,
        });
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
     * Log reserved GPU resources for this mark to the console.
     *
     * @param {string} [label]
     * @returns {void}
     */
    debugResources(label = this.constructor.name) {
        if (!debugResourcesEnabled) {
            return;
        }
        const storage = [];
        const textures = [];
        const samplers = [];

        for (const entry of this._resourceLayout) {
            if (entry.role === "series") {
                const buffer = this._seriesBuffers.getBuffer(entry.name);
                storage.push({
                    name: entry.name,
                    role: entry.role,
                    bytes: buffer?.size ?? 0,
                });
                continue;
            }
            if (entry.role === "ordinalRange") {
                const buffer = this._scaleResources.ordinalRangeBuffers.get(
                    entry.name
                );
                storage.push({
                    name: entry.name,
                    role: entry.role,
                    bytes: buffer?.size ?? 0,
                });
                continue;
            }
            if (entry.role === "domainMap") {
                const buffer = this._scaleResources.domainMapBuffers.get(
                    entry.name
                );
                storage.push({
                    name: entry.name,
                    role: entry.role,
                    bytes: buffer?.size ?? 0,
                });
                continue;
            }
            if (entry.role === "rangeTexture") {
                const texture = this._scaleResources.rangeTextures.get(
                    entry.name
                );
                textures.push({
                    name: entry.name,
                    role: entry.role,
                    width: texture?.width ?? 0,
                    height: texture?.height ?? 0,
                    format: texture?.format ?? "unknown",
                });
                continue;
            }
            if (entry.role === "rangeSampler") {
                samplers.push({ name: entry.name, role: entry.role });
            }
        }

        console.debug(`[webgpu-renderer] ${label} resources`, {
            uniforms: this._uniformBufferState?.byteLength ?? 0,
            storageBuffers: storage,
            textures,
            samplers,
        });
    }

    /**
     * @param {Record<string, number[]>} domains
     * @returns {void}
     */
    updateScaleDomains(domains) {
        const needsRebind = this._scaleResources.updateScaleDomains(
            domains,
            (name) => this._resolveScaleTargets(name)
        );
        this._writeUniforms();
        if (needsRebind) {
            this._rebuildBindGroup();
        }
    }

    /**
     * @param {Record<string, Array<number|number[]|string>|import("../../index.d.ts").ColorInterpolatorFn|{ range?: Array<number|number[]|string>|import("../../index.d.ts").ColorInterpolatorFn }>} ranges
     * @returns {void}
     */
    updateScaleRanges(ranges) {
        const needsRebind = this._scaleResources.updateScaleRanges(
            ranges,
            (name) => this._resolveScaleTargets(name)
        );
        this._writeUniforms();
        if (needsRebind) {
            this._rebuildBindGroup();
        }
    }

    /**
     * @returns {void}
     */
    _buildUniformLayout() {
        /** @type {{ name: string, type: import("../../types.js").ScalarType, components: 1|2|4, arrayLength?: number }[]} */
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
                this._scaleResources.addScaleUniforms(layout, name, channel);
            }
            if (isValueChannelConfig(channel) && channel.scale) {
                this._scaleResources.addScaleUniforms(layout, name, channel);
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
                this._scaleResources.initializeScale(
                    name,
                    channel,
                    channel.scale
                );
            }
            if (isValueChannelConfig(channel) && channel.scale) {
                this._scaleResources.initializeScale(
                    name,
                    channel,
                    channel.scale
                );
            }
            if (isValueChannelConfig(channel) && channel.dynamic) {
                this._setUniformValue(`u_${name}`, channel.value);
            }
        }
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
            seriesBufferAliases: this._seriesBuffers.seriesBufferAliases,
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
        const allowsBandTypeOverride =
            scaleType === "band" &&
            spec?.type === "f32" &&
            channel.type === "u32";
        const allowsIndexTypeOverride =
            scaleType === "index" &&
            spec?.type === "f32" &&
            channel.type === "u32";
        if (
            spec?.type &&
            channel.type &&
            channel.type !== spec.type &&
            !allowsOrdinalTypeOverride &&
            !allowsBandTypeOverride &&
            !allowsIndexTypeOverride
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
            const allowPackedU32 =
                channel.type === "u32" &&
                channel.inputComponents === 2 &&
                scaleType === "index";
            if (!allowPackedU32) {
                throw new Error(
                    `Only f32 vectors are supported for "${name}" input data.`
                );
            }
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
        const allowsPackedScalarInput =
            inputComponents === 2 &&
            outputComponents === 1 &&
            channel.type === "u32" &&
            scaleType === "index";
        if (
            inputComponents !== outputComponents &&
            !allowsScalarToVector &&
            !allowsPackedScalarInput
        ) {
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
            if (
                !Array.isArray(channel.scale.domain) &&
                !ArrayBuffer.isView(channel.scale.domain)
            ) {
                throw new Error(
                    `Ordinal scale on "${name}" requires an explicit domain array.`
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
        if (
            scaleType === "band" &&
            !Array.isArray(channel.scale?.domain) &&
            !ArrayBuffer.isView(channel.scale?.domain)
        ) {
            throw new Error(
                `Band scale on "${name}" requires an explicit domain array.`
            );
        }
        if (usesOrdinalDomainMap(channel.scale)) {
            if (scaleType === "band" && channel.type !== "u32") {
                throw new Error(
                    `Band scale on "${name}" requires u32 inputs when using an ordinal domain.`
                );
            }
            if (scaleType === "band" && inputComponents !== 1) {
                throw new Error(
                    `Band scale on "${name}" requires scalar inputs when using an ordinal domain.`
                );
            }
            if (
                scaleType === "band" &&
                isValueChannelConfig(channel) &&
                typeof channel.value === "number" &&
                !Number.isInteger(channel.value)
            ) {
                throw new Error(
                    `Band scale on "${name}" requires integer values when using an ordinal domain.`
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
