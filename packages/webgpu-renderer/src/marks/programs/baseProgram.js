import { isSeriesChannelConfig, isValueChannelConfig } from "../../types.js";
import { UniformBuffer } from "../../utils/uniformBuffer.js";
import { SeriesBufferManager } from "./seriesBuffers.js";
import { buildBindGroup } from "./bindGroupBuilder.js";
import { ScaleResourceManager } from "./scaleResources.js";
import { normalizeChannels } from "./channelConfigResolver.js";
import { buildPipeline } from "./pipelineBuilder.js";
import { SelectionResourceManager } from "./selectionResources.js";

let debugResourcesEnabled = false;

/**
 * @param {boolean} enabled
 * @returns {void}
 */
export function setDebugResourcesEnabled(enabled) {
    debugResourcesEnabled = enabled;
}

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
     * @param {{ channels: Record<string, ChannelConfigInput>, count?: number, [key: string]: unknown }} config
     */
    constructor(renderer, config) {
        this.renderer = renderer;
        this.device = renderer.device;
        /** @type {{ channels: Record<string, ChannelConfigInput>, count?: number, [key: string]: unknown }} */
        this._markConfig = config;

        this._channels = normalizeChannels({
            channels: config.channels,
            context: {
                channelOrder: this.channelOrder,
                optionalChannels: this.optionalChannels,
                defaultChannelConfigs: this.defaultChannelConfigs,
                defaultValues: this.defaultValues,
                channelSpecs: this.channelSpecs,
            },
        });
        this._seriesBuffers = new SeriesBufferManager(
            this.device,
            this._channels,
            this.channelSpecs
        );
        this.count = config.count ?? this._seriesBuffers.inferCount() ?? 1;
        this._scaleResources = new ScaleResourceManager({
            device: this.device,
            channels: this._channels,
            getDefaultScaleRange: (name) => this.getDefaultScaleRange(name),
            setUniformValue: (name, value) =>
                this._setUniformValue(name, value),
        });
        this._selectionResources = new SelectionResourceManager({
            device: this.device,
            channels: this._channels,
            setUniformValue: (name, value) =>
                this._setUniformValue(name, value),
        });

        /** @type {{ name: string, role: "series"|"ordinalRange"|"domainMap"|"rangeTexture"|"rangeSampler"|"extraTexture"|"extraSampler"|"extraBuffer" }[]} */
        this._resourceLayout = [];

        /** @type {{ name: string, type: import("../../types.js").ScalarType, components: 1|2|4, arrayLength?: number }[]} */
        this._uniformLayout = [];

        /** @type {UniformBuffer | null} */
        this._uniformBufferState = null;

        /** @type {Map<string, { texture: GPUTexture, sampler?: GPUSampler, width: number, height: number, format: GPUTextureFormat }>} */
        this._extraTextures = new Map();

        /** @type {Map<string, GPUBuffer>} */
        this._extraBuffers = new Map();

        /** @type {{ scales: Record<string, import("../../index.d.ts").ChannelSlotGroup<import("../../index.d.ts").ScaleSlotHandle>>, values: Record<string, import("../../index.d.ts").ChannelSlotGroup<import("../../index.d.ts").ValueSlotHandle>>, selections: Record<string, import("../../index.d.ts").SelectionSlotHandle> }} */
        this._slotHandles = { scales: {}, values: {}, selections: {} };

        // Build a per-mark uniform layout. The layout can differ between marks,
        // but is stable for the lifetime of the mark.
        // Create a shader that matches the active channels (series vs values)
        // and the selected scale types. This keeps GPU programs minimal but makes
        // shader generation dynamic.
        this._buildUniformLayout();
        this._initializeExtraResources();
        this._selectionResources.initializeSelections(this._extraBuffers);
        const extraResources = [
            ...this._selectionResources.getExtraResourceDefs(),
            ...this.getExtraResourceDefs(),
        ];
        const { bindGroupLayout, pipeline, resourceLayout } = buildPipeline({
            device: this.device,
            globalBindGroupLayout: renderer._globalBindGroupLayout,
            format: renderer.format,
            channels: this._channels,
            uniformLayout: this._uniformLayout,
            shaderBody: this.shaderBody,
            packedSeriesLayout:
                this._seriesBuffers.packedSeriesLayoutEntries ?? undefined,
            selectionDefs: this._selectionResources.selectionDefs,
            extraResources,
            primitiveTopology: this.primitiveTopology,
        });
        this._resourceLayout = resourceLayout;
        this._uniformBuffer = this.device.createBuffer({
            size: this._uniformBufferState?.byteLength ?? 0,
            // eslint-disable-next-line no-undef
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this._initializeUniforms();
        this._writeUniforms();
        this._buildSlotHandles();
        this._bindGroupLayout = bindGroupLayout;
        this._pipeline = pipeline;

        // Initialize any series-backed channels.
        this.updateSeries(
            Object.fromEntries(
                Object.entries(this._channels)
                    .filter(([, v]) => isSeriesChannelConfig(v))
                    .map(([k, v]) => [k, v.data])
            ),
            this.count
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
     * Extra per-mark uniform fields (not tied to channels).
     *
     * @returns {{ name: string, type: import("../../types.js").ScalarType, components: 1|2|4, arrayLength?: number }[]}
     */
    getExtraUniformLayout() {
        return [];
    }

    /**
     * Extra bind group resources (not tied to channels).
     *
     * @returns {import("../shaders/markShaderBuilder.js").ExtraResourceDef[]}
     */
    getExtraResourceDefs() {
        return [];
    }

    /**
     * Allocate extra GPU resources before building bind groups.
     *
     * @returns {void}
     */
    _initializeExtraResources() {}

    /**
     * @returns {string}
     */
    get shaderBody() {
        return "";
    }

    /**
     * Pipeline primitive topology for this mark.
     *
     * @returns {GPUPrimitiveTopology}
     */
    get primitiveTopology() {
        return "triangle-list";
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
     * @param {number} [count]
     * @returns {void}
     */
    updateSeries(channels, count) {
        const inferred = count ?? this._seriesBuffers.inferCount(channels);
        this.count = inferred ?? this.count ?? 1;
        this._seriesBuffers.updateSeries(channels, this.count);

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
            extraTextures: this._extraTextures,
            extraBuffers: this._extraBuffers,
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
        const packedSeriesInfo = this._seriesBuffers.getPackedSeriesInfo();

        for (const entry of this._resourceLayout) {
            if (entry.role === "series") {
                const buffer = this._seriesBuffers.getBuffer(entry.name);
                storage.push({
                    name: entry.name,
                    role: entry.role,
                    bytes: buffer?.size ?? 0,
                    packed: packedSeriesInfo.get(entry.name) ?? {
                        stride: 0,
                        channels: [],
                    },
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
                continue;
            }
            if (entry.role === "extraTexture") {
                const texture = this._extraTextures.get(entry.name);
                textures.push({
                    name: entry.name,
                    role: entry.role,
                    width: texture?.width ?? 0,
                    height: texture?.height ?? 0,
                    format: texture?.format ?? "unknown",
                });
                continue;
            }
            if (entry.role === "extraSampler") {
                samplers.push({ name: entry.name, role: entry.role });
                continue;
            }
            if (entry.role === "extraBuffer") {
                const buffer = this._extraBuffers.get(entry.name);
                storage.push({
                    name: entry.name,
                    role: entry.role,
                    bytes: buffer?.size ?? 0,
                });
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
     * Slot handles for scale/value/selection updates (default + conditional branches).
     *
     * @returns {{ scales: Record<string, import("../../index.d.ts").ChannelSlotGroup<import("../../index.d.ts").ScaleSlotHandle>>, values: Record<string, import("../../index.d.ts").ChannelSlotGroup<import("../../index.d.ts").ValueSlotHandle>>, selections: Record<string, import("../../index.d.ts").SelectionSlotHandle> }}
     */
    getSlotHandles() {
        return this._slotHandles;
    }

    /**
     * Build per-channel slot handles for scales and dynamic values.
     *
     * @returns {void}
     */
    _buildSlotHandles() {
        const conditionalNames = new Set();
        for (const channel of Object.values(this._channels)) {
            for (const condition of channel.conditions ?? []) {
                if (condition.channelName) {
                    conditionalNames.add(condition.channelName);
                }
            }
        }

        /**
         * @param {Record<string, import("../../index.d.ts").ChannelSlotGroup<import("../../index.d.ts").ScaleSlotHandle>>} map
         * @param {string} name
         * @returns {import("../../index.d.ts").ChannelSlotGroup<import("../../index.d.ts").ScaleSlotHandle>}
         */
        const ensureScaleGroup = (map, name) => {
            if (!map[name]) {
                map[name] = {};
            }
            return map[name];
        };

        /**
         * @param {Record<string, import("../../index.d.ts").ChannelSlotGroup<import("../../index.d.ts").ValueSlotHandle>>} map
         * @param {string} name
         * @returns {import("../../index.d.ts").ChannelSlotGroup<import("../../index.d.ts").ValueSlotHandle>}
         */
        const ensureValueGroup = (map, name) => {
            if (!map[name]) {
                map[name] = {};
            }
            return map[name];
        };

        /**
         * @param {import("../../index.d.ts").ChannelSlotGroup<import("../../index.d.ts").ScaleSlotHandle>} group
         * @param {import("../../index.d.ts").ScaleSlotHandle} slot
         */
        const attachScaleSlot = (group, slot) => {
            group.default = slot;
            group.setDomain = slot.setDomain;
            group.setRange = slot.setRange;
        };

        /**
         * @param {import("../../index.d.ts").ChannelSlotGroup<import("../../index.d.ts").ValueSlotHandle>} group
         * @param {import("../../index.d.ts").ValueSlotHandle} slot
         */
        const attachValueSlot = (group, slot) => {
            group.default = slot;
            group.set = slot.set;
        };

        for (const [name, channel] of Object.entries(this._channels)) {
            if (conditionalNames.has(name)) {
                continue;
            }
            if (channel.scale) {
                attachScaleSlot(
                    ensureScaleGroup(this._slotHandles.scales, name),
                    this._createScaleSlot(name)
                );
            }
            if (isValueChannelConfig(channel) && channel.dynamic) {
                attachValueSlot(
                    ensureValueGroup(this._slotHandles.values, name),
                    this._createValueSlot(name)
                );
            }

            const conditions = channel.conditions ?? [];
            if (!conditions.length) {
                continue;
            }
            for (const condition of conditions) {
                if (!condition.channelName) {
                    continue;
                }
                const conditionChannel = this._channels[condition.channelName];
                if (!conditionChannel) {
                    continue;
                }
                if (conditionChannel.scale) {
                    const group = ensureScaleGroup(
                        this._slotHandles.scales,
                        name
                    );
                    if (!group.conditions) {
                        group.conditions = {};
                    }
                    group.conditions[condition.when.selection] =
                        this._createScaleSlot(condition.channelName);
                }
                if (
                    isValueChannelConfig(conditionChannel) &&
                    conditionChannel.dynamic
                ) {
                    const group = ensureValueGroup(
                        this._slotHandles.values,
                        name
                    );
                    if (!group.conditions) {
                        group.conditions = {};
                    }
                    group.conditions[condition.when.selection] =
                        this._createValueSlot(condition.channelName);
                }
            }
        }

        for (const def of this._selectionResources.selectionDefs) {
            this._slotHandles.selections[def.name] =
                this._createSelectionSlot(def);
        }
    }

    /**
     * @param {string} name
     * @returns {import("../../index.d.ts").ScaleSlotHandle}
     */
    _createScaleSlot(name) {
        return {
            setDomain: (domain) => {
                const needsRebind = this._scaleResources.updateScaleDomain(
                    name,
                    domain
                );
                this._writeUniforms();
                if (needsRebind) {
                    this._rebuildBindGroup();
                }
            },
            setRange: (range) => {
                const needsRebind = this._scaleResources.updateScaleRange(
                    name,
                    range
                );
                this._writeUniforms();
                if (needsRebind) {
                    this._rebuildBindGroup();
                }
            },
        };
    }

    /**
     * @param {string} name
     * @returns {import("../../index.d.ts").ValueSlotHandle}
     */
    _createValueSlot(name) {
        const uniformName = `u_${name}`;
        if (!this._uniformBufferState?.entries.has(uniformName)) {
            throw new Error(
                `Uniform "${uniformName}" is not available for updates.`
            );
        }
        return {
            set: (value) => {
                this._setUniformValue(uniformName, value);
                this._writeUniforms();
            },
        };
    }

    /**
     * @param {{ name: string, type: import("../../index.d.ts").SelectionType }} def
     * @returns {import("../../index.d.ts").SelectionSlotHandle}
     */
    _createSelectionSlot(def) {
        /**
         * @param {{ type: "single", id: number } | { type: "multi", ids: Uint32Array } | { type: "interval", min: number, max: number }} next
         */
        const update = (next) => {
            const needsRebind = this._selectionResources.updateSelection(
                def.name,
                next,
                this._extraBuffers
            );
            this._writeUniforms();
            if (needsRebind) {
                this._rebuildBindGroup();
            }
        };

        if (def.type === "single") {
            return {
                type: "single",
                set: (id) => update({ type: "single", id }),
            };
        }
        if (def.type === "multi") {
            return {
                type: "multi",
                set: (ids) => update({ type: "multi", ids }),
            };
        }
        return {
            type: "interval",
            set: (min, max) => update({ type: "interval", min, max }),
        };
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

        this._selectionResources.addSelectionUniforms(layout);
        this._uniformLayout = layout.concat(this.getExtraUniformLayout());
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
                this._scaleResources.updateScaleDomain(
                    name,
                    channel.scale.domain
                );
                const rangeValue =
                    channel.scale.range ?? this.getDefaultScaleRange(name);
                this._scaleResources.updateScaleRange(name, rangeValue);
            }
            if (isValueChannelConfig(channel) && channel.scale) {
                this._scaleResources.initializeScale(
                    name,
                    channel,
                    channel.scale
                );
                this._scaleResources.updateScaleDomain(
                    name,
                    channel.scale.domain
                );
                const rangeValue =
                    channel.scale.range ?? this.getDefaultScaleRange(name);
                this._scaleResources.updateScaleRange(name, rangeValue);
            }
            if (isValueChannelConfig(channel) && channel.dynamic) {
                this._setUniformValue(`u_${name}`, channel.value);
            }
        }
        this._initializeExtraUniforms();
    }

    /**
     * Initialize non-channel uniforms after the main uniform buffer is ready.
     *
     * @returns {void}
     */
    _initializeExtraUniforms() {}

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
    // Type guards live in src/types.js to keep runtime checks consistent across modules.
}
