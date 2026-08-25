import { isSeriesChannelConfig, isValueChannelConfig } from "../../../types.js";
import { UniformBuffer } from "../../../utils/uniformBuffer.js";
import { SeriesBufferManager } from "./seriesBuffers.js";
import { buildBindGroup } from "./bindGroupBuilder.js";
import { ScaleResourceManager } from "./scaleResources.js";
import { normalizeChannels } from "./channelConfigResolver.js";
import { buildPipelines } from "./pipelineBuilder.js";
import { SelectionResourceManager } from "./selectionResources.js";
import {
    normalizeVisibilityPredicate,
    scalarSlotUniformName,
} from "../../shaders/visibilityPredicate.js";
import { buildChannelAnalysis } from "../../shaders/channelAnalysis.js";
import { compileMarkChannels } from "../../shaders/channelIR.js";

let debugResourcesEnabled = false;

/**
 * @param {unknown} inputs
 * @param {Set<string>} channelNames
 * @returns {Record<string, import("../../../index.d.ts").ChannelConfigResolved>}
 */
function normalizeScalarInputs(inputs, channelNames) {
    if (inputs == null) {
        return {};
    }
    if (typeof inputs !== "object" || Array.isArray(inputs)) {
        throw new Error('Mark "inputs" must be an object.');
    }

    /** @type {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} */
    const normalized = {};
    const inputConfigs =
        /** @type {Record<string, import("../../../index.d.ts").ScalarInputConfig>} */ (
            inputs
        );
    for (const [name, config] of Object.entries(inputConfigs)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
            throw new Error(
                `Scalar input "${name}" must be a valid identifier.`
            );
        }
        if (channelNames.has(name)) {
            throw new Error(
                `Scalar input "${name}" conflicts with a visual channel.`
            );
        }
        if (
            !config ||
            typeof config !== "object" ||
            !ArrayBuffer.isView(config.data) ||
            config.data instanceof DataView
        ) {
            throw new Error(
                `Scalar input "${name}" must specify typed-array data.`
            );
        }
        if (
            config.type !== "f32" &&
            config.type !== "u32" &&
            config.type !== "i32"
        ) {
            throw new Error(
                `Scalar input "${name}" must specify type "f32", "u32", or "i32".`
            );
        }
        normalized[name] =
            /** @type {import("../../../index.d.ts").ChannelConfigResolved} */ (
                /** @type {unknown} */ ({
                    data: config.data,
                    type: config.type,
                    components: 1,
                    inputComponents: 1,
                })
            );
    }
    return normalized;
}

/**
 * @param {unknown} slots
 * @returns {Record<string, import("../../../index.d.ts").ScalarSlotConfig>}
 */
function normalizeScalarSlots(slots) {
    if (slots == null) {
        return {};
    }
    if (typeof slots !== "object" || Array.isArray(slots)) {
        throw new Error('Mark "scalarSlots" must be an object.');
    }

    /** @type {Record<string, import("../../../index.d.ts").ScalarSlotConfig>} */
    const normalized = {};
    const slotConfigs =
        /** @type {Record<string, import("../../../index.d.ts").ScalarSlotConfig>} */ (
            slots
        );
    for (const [name, config] of Object.entries(slotConfigs)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
            throw new Error(
                `Scalar slot "${name}" must be a valid identifier.`
            );
        }
        if (!config || typeof config !== "object") {
            throw new Error(`Scalar slot "${name}" must be an object.`);
        }
        validateScalarSlotValue(name, config.type, config.value);
        normalized[name] = config;
    }
    return normalized;
}

/**
 * @param {string} name
 * @param {unknown} type
 * @param {unknown} value
 * @returns {void}
 */
function validateScalarSlotValue(name, type, value) {
    if (type !== "f32" && type !== "u32" && type !== "i32") {
        throw new Error(
            `Scalar slot "${name}" must specify type "f32", "u32", or "i32".`
        );
    }
    if (typeof value !== "number" || Number.isNaN(value)) {
        throw new Error(`Scalar slot "${name}" must not contain NaN.`);
    }
    if (
        type === "u32" &&
        (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
    ) {
        throw new Error(`Scalar slot "${name}" requires a valid u32 value.`);
    }
    if (
        type === "i32" &&
        (!Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff)
    ) {
        throw new Error(`Scalar slot "${name}" requires a valid i32 value.`);
    }
}

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
     * @typedef {import("../../../index.d.ts").TypedArray} TypedArray
     * @typedef {import("../../../index.d.ts").ChannelConfigInput} ChannelConfigInput
     * @typedef {import("../../../index.d.ts").ChannelConfigResolved} ChannelConfigResolved
     * @typedef {import("../../utils/channelSpecUtils.js").ChannelSpec} ChannelSpec
     */

    /**
     * @param {import("../../../renderer.js").Renderer} renderer
     * @param {{ channels: Record<string, ChannelConfigInput>, count?: number, [key: string]: unknown }} config
     */
    constructor(renderer, config) {
        this.renderer = renderer;
        this.device = renderer.device;
        this._destroyed = false;
        /** @type {{ channels: Record<string, ChannelConfigInput>, count?: number, [key: string]: unknown }} */
        this._markConfig = config;

        const normalizedChannels = normalizeChannels({
            channels: config.channels,
            context: {
                channelOrder: this.channelOrder,
                optionalChannels: this.optionalChannels,
                defaultChannelConfigs: this.defaultChannelConfigs,
                defaultValues: this.defaultValues,
                channelSpecs: this.channelSpecs,
            },
        });
        this._channels = normalizedChannels.channels;
        this._visualChannelNames = new Set(Object.keys(this._channels));
        this._conditionalChannelNames = this._collectConditionalChannelNames();
        this._publicChannelNames = new Set(this._visualChannelNames);
        for (const name of this._conditionalChannelNames) {
            this._publicChannelNames.delete(name);
        }
        this._placementIndex =
            /** @type {import("../../../index.d.ts").MarkConfig["placementIndex"]} */ (
                config.placementIndex
            );
        const inputs =
            this._placementIndex && "data" in this._placementIndex
                ? {
                      .../** @type {Record<string, unknown>} */ (
                          config.inputs ?? {}
                      ),
                      __placementIndex: this._placementIndex,
                  }
                : config.inputs;
        this._inputs = normalizeScalarInputs(inputs, this._visualChannelNames);
        this._scalarSlots = normalizeScalarSlots(config.scalarSlots);
        this._visibleWhen = normalizeVisibilityPredicate(
            /** @type {import("../../../index.d.ts").VisibilityPredicate | undefined} */ (
                config.visibleWhen
            )
        );
        this._channels = { ...this._channels, ...this._inputs };
        for (const [name, channel] of Object.entries(this._inputs)) {
            normalizedChannels.analysisByChannel.set(
                name,
                buildChannelAnalysis(name, channel)
            );
        }
        this._compiledChannels = compileMarkChannels({
            channels: this._channels,
            analysisByChannel: normalizedChannels.analysisByChannel,
            channelNames: this._publicChannelNames,
            inputNames: new Set(Object.keys(this._inputs)),
            seriesIndexExpression:
                typeof config.seriesIndexExpression === "string"
                    ? config.seriesIndexExpression
                    : undefined,
        });
        this._logicalSeriesTargets = this._collectLogicalSeriesTargets();
        this._seriesBuffers = new SeriesBufferManager(
            this.device,
            this._channels,
            this.channelSpecs
        );
        this.count = config.count ?? this._seriesBuffers.inferCount() ?? 1;
        this._scaleResources = new ScaleResourceManager({
            device: this.device,
            channels: this._channels,
            analysisByChannel: this._compiledChannels.analysisByChannel,
            getDefaultScaleRange: (name) => this.getDefaultScaleRange(name),
            setUniformValue: (name, value) =>
                this._setUniformValue(name, value),
        });
        this._selectionResources = new SelectionResourceManager({
            device: this.device,
            channels: this._channels,
            analysisByChannel: this._compiledChannels.analysisByChannel,
            visibleWhen: this._visibleWhen,
            setUniformValue: (name, value) =>
                this._setUniformValue(name, value),
        });
        /** @type {{ name: string, role: "series"|"ordinalRange"|"domainMap"|"rangeTexture"|"rangeSampler"|"extraTexture"|"extraSampler"|"extraBuffer" }[]} */
        this._resourceLayout = [];

        /** @type {{ name: string, type: import("../../../types.js").ScalarType, components: 1|2|4, arrayLength?: number }[]} */
        this._uniformLayout = [];

        /** @type {UniformBuffer | null} */
        this._uniformBufferState = null;

        /** @type {Map<string, { texture: GPUTexture, sampler?: GPUSampler, width: number, height: number, format: GPUTextureFormat }>} */
        this._extraTextures = new Map();

        /** @type {Map<string, GPUBuffer>} */
        this._extraBuffers = new Map();

        this._slotUpdateDepth = 0;
        this._slotUniformsDirty = false;
        this._slotBindingsDirty = false;
        this._slotPickingDirty = false;

        /** @type {Omit<import("../../../index.d.ts").MarkHandle<any, any>, "markId">} */
        this._slotHandles = {
            batchUpdates: (update) => this._batchSlotUpdates(update),
            series: {
                replace: (channels, count) => {
                    this._assertAlive();
                    this.replaceSeries(channels, count);
                },
            },
            scales: {},
            values: {},
            properties: {},
            extraValues: {},
            scalarSlots: {},
            selections: {},
        };

        // Build a per-mark uniform layout. The layout can differ between marks,
        // but is stable for the lifetime of the mark.
        // Create a shader that matches the active channels (series vs values)
        // and the selected scale types. This keeps GPU programs minimal but makes
        // shader generation dynamic.
        this._buildUniformLayout();
        this._validateUniformBufferCapacity();
        this._initializeExtraResources();
        this._selectionResources.initializeSelections(this._extraBuffers);
        const extraResources = [
            ...this._selectionResources.getExtraResourceDefs(),
            ...this.getExtraResourceDefs(),
        ];
        const { bindGroupLayout, pipeline, pickPipeline, resourceLayout } =
            buildPipelines({
                device: this.device,
                globalBindGroupLayout: renderer._globalBindGroupLayout,
                format: renderer.format,
                pickFormat: renderer.pickFormat,
                compiledChannels: this._compiledChannels,
                uniformLayout: this._uniformLayout,
                shaderBody: this.shaderBody,
                packedSeriesLayout:
                    this._seriesBuffers.packedSeriesLayoutEntries ?? undefined,
                selectionDefs: this._selectionResources.selectionDefs,
                visibleWhen: this._visibleWhen,
                scalarSlots: this._scalarSlots,
                extraResources,
                primitiveTopology: this.primitiveTopology,
                placementBindGroupLayout: renderer._placementBindGroupLayout,
                placementIndex: this._placementIndex,
            });
        this._resourceLayout = resourceLayout;
        this._uniformBuffer = this.device.createBuffer({
            size: this._uniformBufferState?.byteLength ?? 0,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this._initializeUniforms();
        const dynamicValues =
            /** @type {Record<string, {value: number | number[]}>} */ (
                this._markConfig.dynamicValues ?? {}
            );
        for (const [name, config] of Object.entries(dynamicValues)) {
            this._setUniformValue(name, config.value);
        }
        for (const [name, config] of Object.entries(this._scalarSlots)) {
            this._setUniformValue(scalarSlotUniformName(name), config.value);
        }
        this._writeUniforms();
        this._buildSlotHandles();
        this._bindGroupLayout = bindGroupLayout;
        this._pipeline = pipeline;
        this._pickPipeline = pickPipeline;

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
     * Number of logical instances accepted by retained draw ranges.
     *
     * @returns {number}
     */
    get drawCount() {
        return this.count;
    }

    /**
     * Translate a logical retained draw range to GPU instance indices.
     *
     * @param {number} firstInstance
     * @param {number} instanceCount
     * @returns {{ firstInstance: number, instanceCount: number }}
     */
    resolveDrawRange(firstInstance, instanceCount) {
        return { firstInstance, instanceCount };
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
     * @returns {{ name: string, type: import("../../../types.js").ScalarType, components: 1|2|4, arrayLength?: number }[]}
     */
    getExtraUniformLayout() {
        return [];
    }

    /**
     * Extra bind group resources (not tied to channels).
     *
     * @returns {import("../../shaders/markShaderBuilder.js").ExtraResourceDef[]}
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
        this.renderer.markPickingDirty();
    }

    /**
     * Replace the complete logical series set exposed through the public handle.
     *
     * @param {Record<string, import("../../../index.d.ts").SeriesData>} channels
     * @param {number} [count]
     * @returns {void}
     */
    replaceSeries(channels, count) {
        /** @type {Record<string, TypedArray>} */
        const resolved = {};
        for (const [name, targets] of this._logicalSeriesTargets) {
            if (targets.length > 1) {
                throw new Error(
                    `Series replacement for channel "${name}" is not supported because it has multiple series-backed branches.`
                );
            }
            const data = channels[name];
            if (data === undefined) {
                throw new Error(
                    `Series replacement is missing channel "${name}".`
                );
            }
            resolved[targets[0]] = /** @type {TypedArray} */ (data);
        }
        this.updateSeries(resolved, count);
    }

    /**
     * @returns {Set<string>}
     */
    _collectConditionalChannelNames() {
        const names = new Set();
        for (const channel of Object.values(this._channels)) {
            for (const condition of channel.conditions ?? []) {
                if (condition.channelName) {
                    names.add(condition.channelName);
                }
            }
        }
        return names;
    }

    /**
     * Map stable logical channel names to their normalized series branches.
     * Multiple targets remain representable internally even though public
     * replacement currently supports only one series branch per channel.
     *
     * @returns {Map<string, string[]>}
     */
    _collectLogicalSeriesTargets() {
        const targetsByChannel = new Map();
        for (const [name, channel] of Object.entries(this._channels)) {
            if (this._conditionalChannelNames.has(name)) {
                continue;
            }
            const targets = [];
            if (isSeriesChannelConfig(channel)) {
                targets.push(name);
            }
            for (const condition of channel.conditions ?? []) {
                if (!condition.channelName) {
                    continue;
                }
                const conditional = this._channels[condition.channelName];
                if (conditional && isSeriesChannelConfig(conditional)) {
                    targets.push(condition.channelName);
                }
            }
            if (targets.length > 0) {
                targetsByChannel.set(name, targets);
            }
        }
        return targetsByChannel;
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
            getScaleResources: (name) =>
                this._scaleResources.getChannelResources(name),
            extraTextures: this._extraTextures,
            extraBuffers: this._extraBuffers,
        });
    }

    /**
     * @param {Record<string, number|number[]>} values
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
        this.renderer.markPickingDirty();
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
            const scaleResources = this._scaleResources.getChannelResources(
                entry.name
            );
            if (entry.role === "ordinalRange") {
                const buffer = scaleResources?.ordinalRange?.buffer;
                storage.push({
                    name: entry.name,
                    role: entry.role,
                    bytes: buffer?.size ?? 0,
                });
                continue;
            }
            if (entry.role === "domainMap") {
                const buffer = scaleResources?.domainMap?.buffer;
                storage.push({
                    name: entry.name,
                    role: entry.role,
                    bytes: buffer?.size ?? 0,
                });
                continue;
            }
            if (entry.role === "rangeTexture") {
                const texture = scaleResources?.rangeTexture;
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
     * @returns {Omit<import("../../../index.d.ts").MarkHandle<any, any>, "markId">}
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
        /**
         * @param {Record<string, import("../../../index.d.ts").ChannelSlotGroup<import("../../../index.d.ts").ScaleSlotHandle>>} map
         * @param {string} name
         * @returns {import("../../../index.d.ts").ChannelSlotGroup<import("../../../index.d.ts").ScaleSlotHandle>}
         */
        const ensureScaleGroup = (map, name) => {
            if (!map[name]) {
                map[name] = {};
            }
            return map[name];
        };

        /**
         * @param {Record<string, import("../../../index.d.ts").ChannelSlotGroup<import("../../../index.d.ts").ValueSlotHandle>>} map
         * @param {string} name
         * @returns {import("../../../index.d.ts").ChannelSlotGroup<import("../../../index.d.ts").ValueSlotHandle>}
         */
        const ensureValueGroup = (map, name) => {
            if (!map[name]) {
                map[name] = {};
            }
            return map[name];
        };

        /**
         * @param {import("../../../index.d.ts").ChannelSlotGroup<import("../../../index.d.ts").ScaleSlotHandle>} group
         * @param {import("../../../index.d.ts").ScaleSlotHandle} slot
         */
        const attachScaleSlot = (group, slot) => {
            group.default = slot;
            group.setDomain = slot.setDomain;
            group.setRange = slot.setRange;
        };

        /**
         * @param {import("../../../index.d.ts").ChannelSlotGroup<import("../../../index.d.ts").ValueSlotHandle>} group
         * @param {import("../../../index.d.ts").ValueSlotHandle} slot
         */
        const attachValueSlot = (group, slot) => {
            group.default = slot;
            group.set = slot.set;
        };

        for (const [name, channel] of Object.entries(this._channels)) {
            if (this._conditionalChannelNames.has(name)) {
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

        const dynamicValues = /** @type {Record<string, unknown>} */ (
            this._markConfig.dynamicValues ?? {}
        );
        for (const name of Object.keys(dynamicValues)) {
            this._slotHandles.extraValues[name] =
                this._createExtraValueSlot(name);
        }

        for (const name of Object.keys(this._scalarSlots)) {
            this._slotHandles.scalarSlots[name] = this._createScalarSlot(name);
        }

        for (const def of this._selectionResources.selectionDefs) {
            this._slotHandles.selections[def.name] =
                this._createSelectionSlot(def);
        }
    }

    /**
     * @param {string} name
     * @returns {import("../../../index.d.ts").ScaleSlotHandle}
     */
    _createScaleSlot(name) {
        const updater = this._scaleResources.getScaleUpdater(name);
        return {
            setDomain: (domain) => {
                this._assertAlive();
                const needsRebind = updater.updateDomain(domain);
                this._queueSlotUpdate(needsRebind);
            },
            setRange: (range) => {
                this._assertAlive();
                const needsRebind = updater.updateRange(range);
                this._queueSlotUpdate(needsRebind);
            },
        };
    }

    /**
     * @param {string} name
     * @returns {import("../../../index.d.ts").ValueSlotHandle}
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
                this._assertAlive();
                this._setUniformValue(uniformName, value);
                this._queueSlotUpdate(false);
            },
        };
    }

    /**
     * @param {string} name
     * @returns {import("../../../index.d.ts").ValueSlotHandle}
     */
    _createExtraValueSlot(name) {
        if (!this._uniformBufferState?.entries.has(name)) {
            throw new Error(`Uniform "${name}" is not available for updates.`);
        }
        return {
            set: (value) => {
                this._assertAlive();
                this._setExtraUniformValue(name, value);
                this._queueSlotUpdate(false);
            },
        };
    }

    /**
     * @param {string} name
     * @returns {import("../../../index.d.ts").ScalarSlotHandle}
     */
    _createScalarSlot(name) {
        const config = this._scalarSlots[name];
        if (!config) {
            throw new Error(`Unknown scalar slot "${name}".`);
        }
        const uniformName = scalarSlotUniformName(name);
        if (!this._uniformBufferState?.entries.has(uniformName)) {
            throw new Error(
                `Uniform "${uniformName}" is not available for updates.`
            );
        }
        return {
            set: (value) => {
                this._assertAlive();
                validateScalarSlotValue(name, config.type, value);
                this._setUniformValue(uniformName, value);
                this._queueSlotUpdate(false);
            },
        };
    }

    /**
     * Hook for mark programs whose draw parameters mirror an extra uniform.
     *
     * @param {string} name
     * @param {number | number[]} value
     */
    _setExtraUniformValue(name, value) {
        this._setUniformValue(name, value);
    }

    /**
     * @param {{ name: string, type: import("../../../index.d.ts").SelectionType, targets?: Array<{ input: string }> }} def
     * @returns {import("../../../index.d.ts").SelectionSlotHandle}
     */
    _createSelectionSlot(def) {
        /**
         * @param {{ type: "single", id: number } | { type: "multi", ids: Uint32Array } | { type: "interval", intervals: Readonly<Partial<Record<string, readonly [number, number] | null>>> }} next
         */
        const update = (next) => {
            this._assertAlive();
            const needsRebind = this._selectionResources.updateSelection(
                def.name,
                next,
                this._extraBuffers
            );
            this._queueSlotUpdate(needsRebind);
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
            targets: (def.targets ?? []).map((target) => target.input),
            set: (intervals) => update({ type: "interval", intervals }),
        };
    }

    /**
     * Applies several public slot mutations as one retained-resource update.
     * Texture and buffer contents may change immediately, but uniforms, bind
     * groups, and picking invalidation are committed once at the outer edge.
     *
     * @param {() => void} update
     */
    _batchSlotUpdates(update) {
        this._assertAlive();
        this._slotUpdateDepth++;
        try {
            update();
        } finally {
            this._slotUpdateDepth--;
            if (this._slotUpdateDepth === 0) {
                this._flushSlotUpdates();
            }
        }
    }

    /** @param {boolean} needsRebind */
    _queueSlotUpdate(needsRebind) {
        this._slotUniformsDirty = true;
        this._slotBindingsDirty ||= needsRebind;
        this._slotPickingDirty = true;
        if (this._slotUpdateDepth === 0) {
            this._flushSlotUpdates();
        }
    }

    _flushSlotUpdates() {
        if (this._slotUniformsDirty) {
            this._writeUniforms();
        }
        if (this._slotBindingsDirty) {
            this._rebuildBindGroup();
        }
        if (this._slotPickingDirty) {
            this.renderer.markPickingDirty();
        }
        this._slotUniformsDirty = false;
        this._slotBindingsDirty = false;
        this._slotPickingDirty = false;
    }

    /**
     * Reject a mark whose uniform block exceeds the device's binding limit
     * before allocating any mark GPU resources.
     *
     * @returns {void}
     */
    _validateUniformBufferCapacity() {
        const limit = this.device.limits?.maxUniformBufferBindingSize;
        const byteLength = this._uniformBufferState?.byteLength ?? 0;
        if (limit === undefined || byteLength <= limit) {
            return;
        }

        const intervalDefs = this._selectionResources.selectionDefs.filter(
            (def) => def.type === "interval"
        );
        const details = intervalDefs
            .map((def) => `"${def.name}" (${def.targets?.length ?? 0} targets)`)
            .join(", ");
        throw new Error(
            `Uniform buffer for interval selection ${details || "mark"} requires ${byteLength} bytes, exceeding the device limit of ${limit} bytes.`
        );
    }

    /**
     * @returns {void}
     */
    _buildUniformLayout() {
        /** @type {{ name: string, type: import("../../../types.js").ScalarType, components: 1|2|4, arrayLength?: number }[]} */
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

        for (const [name, config] of Object.entries(this._scalarSlots)) {
            layout.push({
                name: scalarSlotUniformName(name),
                type: config.type,
                components: 1,
            });
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
                const updater = this._scaleResources.getScaleUpdater(name);
                updater.updateDomain(channel.scale.domain);
                const rangeValue =
                    channel.scale.range ?? this.getDefaultScaleRange(name);
                if (rangeValue !== undefined) {
                    updater.updateRange(rangeValue);
                }
            }
            if (isValueChannelConfig(channel) && channel.scale) {
                this._scaleResources.initializeScale(
                    name,
                    channel,
                    channel.scale
                );
                const updater = this._scaleResources.getScaleUpdater(name);
                updater.updateDomain(channel.scale.domain);
                const rangeValue =
                    channel.scale.range ?? this.getDefaultScaleRange(name);
                if (rangeValue !== undefined) {
                    updater.updateRange(rangeValue);
                }
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
     * @param {number|ArrayLike<number>|Array<number|number[]>} value
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
     * @param {import("../../../index.d.ts").ProgramDrawOptions} options
     */
    draw(pass, options) {
        pass.setPipeline(this._pipeline);
        pass.setBindGroup(1, this._bindGroup);
        if (options.placement) {
            pass.setBindGroup(2, options.placement.bindGroup);
        }
        pass.draw(6, options.instanceCount, 0, options.firstInstance);
    }

    /**
     * @param {GPURenderPassEncoder} pass
     * @param {import("../../../index.d.ts").ProgramDrawOptions} options
     * @returns {void}
     */
    drawPick(pass, options) {
        pass.setPipeline(this._pickPipeline);
        pass.setBindGroup(1, this._bindGroup);
        if (options.placement) {
            pass.setBindGroup(2, options.placement.bindGroup);
        }
        pass.draw(6, options.instanceCount, 0, options.firstInstance);
    }

    destroy() {
        if (this._destroyed) {
            return;
        }
        this._destroyed = true;
        this._uniformBuffer.destroy();
        this._seriesBuffers.destroy();
        this._scaleResources.destroy();
        for (const buffer of this._extraBuffers.values()) {
            buffer.destroy();
        }
        this._extraBuffers.clear();
        for (const { texture } of this._extraTextures.values()) {
            texture.destroy();
        }
        this._extraTextures.clear();
    }

    /**
     * @returns {void}
     */
    _assertAlive() {
        if (this._destroyed) {
            throw new Error(`${this.constructor.name} has been destroyed.`);
        }
    }
    // Type guards live in src/types.js to keep runtime checks consistent across modules.
}
