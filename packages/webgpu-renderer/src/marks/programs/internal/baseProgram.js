import { isSeriesChannelConfig, isValueChannelConfig } from "../../../types.js";
import { UniformBuffer } from "../../../utils/uniformBuffer.js";
import { SeriesBufferManager } from "./seriesBuffers.js";
import { buildBindGroup } from "./bindGroupBuilder.js";
import { ScaleResourceManager } from "./scaleResources.js";
import { normalizeChannels } from "./channelConfigResolver.js";
import { buildPipelines } from "./pipelineBuilder.js";
import { SelectionResourceManager } from "./selectionResources.js";
import {
    normalizeSelectionPredicate,
    normalizeVisibilityPredicate,
    scalarSlotUniformName,
} from "../../shaders/visibilityPredicate.js";
import { buildChannelAnalysis } from "../../shaders/channelAnalysis.js";
import { compileMarkChannels } from "../../shaders/channelIR.js";
import { gpuLabel } from "../../../utils/gpuLabel.js";

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
 * @param {unknown} value
 * @returns {import("../../../index.d.ts").MarkOrder | undefined}
 */
function normalizeOrder(value) {
    if (value === undefined) {
        return undefined;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error('Mark "order" must be an object.');
    }
    const config = /** @type {import("../../../index.d.ts").MarkOrder} */ (
        value
    );
    const when = normalizeSelectionPredicate(config.when);
    if (!when) {
        throw new Error('Mark "order" must specify a selection predicate.');
    }
    const matching = config.matching ?? "last";
    if (matching !== "first" && matching !== "last") {
        throw new Error('Mark "order.matching" must be "first" or "last".');
    }
    return { when, matching };
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
    #destroyed = false;

    /** @type {Record<string, import("../../../index.d.ts").ScalarSlotConfig>} */
    #scalarSlots;

    /** @type {Set<string>} */
    #conditionalChannelNames;

    /** @type {Map<string, string[]>} */
    #logicalSeriesTargets;

    /** @type {ScaleResourceManager} */
    #scaleResources;

    /** @type {SelectionResourceManager} */
    #selectionResources;

    /** @type {import("../../shaders/markShaderBuilder.js").ResourceLayoutEntry[]} */
    #resourceLayout;

    /** @type {import("../../../utils/uniformLayout.js").UniformSpec[]} */
    #uniformLayout;

    /** @type {GPUBuffer} */
    #uniformBuffer;

    /** @type {GPUBindGroupLayout} */
    #bindGroupLayout;

    /** @type {GPUBindGroup} */
    #bindGroup;

    /** @type {import("./pipelineBuilder.js").ProgramTemplate["getPipeline"]} */
    #getPipeline;

    /** @type {import("./pipelineBuilder.js").ProgramTemplate["getPickPipeline"]} */
    #getPickPipeline;

    /** @type {import("./pipelineBuilder.js").ProgramTemplate["diagnostics"]} */
    #programTemplateDiagnostics;

    #slotUpdateDepth = 0;

    #slotUniformsDirty = false;

    #slotBindingsDirty = false;

    /** @type {Omit<import("../../../index.d.ts").MarkHandle<any, any>, "markId">} */
    #slotHandles;

    /**
     * @typedef {import("../../../index.d.ts").TypedArray} TypedArray
     * @typedef {import("../../../index.d.ts").ChannelConfigInput} ChannelConfigInput
     * @typedef {import("../../../index.d.ts").ChannelConfigResolved} ChannelConfigResolved
     * @typedef {import("../../utils/channelSpecUtils.js").ChannelSpec} ChannelSpec
     */

    /**
     * @param {import("../../../renderer.js").Renderer} renderer
     * @param {{ channels: Record<string, ChannelConfigInput>, count?: number, [key: string]: unknown }} config
     * @param {import("../../../index.d.ts").MarkProgramCreationContext} [context]
     */
    constructor(renderer, config, context = { label: "mark" }) {
        this.renderer = renderer;
        this.device = renderer.device;
        this.label = context.label;
        /** @type {{ channels: Record<string, ChannelConfigInput>, count?: number, [key: string]: unknown }} * @internal
         */
        this._markConfig = config;

        const normalizedChannels = normalizeChannels({
            channels: config.channels,
            context: { channelSpecs: this.channelSpecs },
        });
        /** @protected */
        this._channels = normalizedChannels.channels;
        this.antialiasing = this._resolveAntialiasing();
        const visualChannelNames = new Set(Object.keys(this._channels));
        this.#conditionalChannelNames = this.#collectConditionalChannelNames();
        const publicChannelNames = new Set(visualChannelNames);
        for (const name of this.#conditionalChannelNames) {
            publicChannelNames.delete(name);
        }
        /** @internal */
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
        const normalizedInputs = normalizeScalarInputs(
            inputs,
            visualChannelNames
        );
        this.#scalarSlots = normalizeScalarSlots(config.scalarSlots);
        const visibleWhen = normalizeVisibilityPredicate(
            /** @type {import("../../../index.d.ts").VisibilityPredicate | undefined} */ (
                config.visibleWhen
            )
        );
        /** @internal */
        this._order = normalizeOrder(config.order);
        this._channels = { ...this._channels, ...normalizedInputs };
        for (const [name, channel] of Object.entries(normalizedInputs)) {
            normalizedChannels.analysisByChannel.set(
                name,
                buildChannelAnalysis(name, channel)
            );
        }
        const compiledChannels = compileMarkChannels({
            channels: this._channels,
            analysisByChannel: normalizedChannels.analysisByChannel,
            channelNames: publicChannelNames,
            inputNames: new Set(Object.keys(normalizedInputs)),
            seriesIndexExpression:
                typeof config.seriesIndexExpression === "string"
                    ? config.seriesIndexExpression
                    : undefined,
        });
        this.#logicalSeriesTargets = this.#collectLogicalSeriesTargets();
        /** @protected */
        this._seriesBuffers = new SeriesBufferManager(
            this.device,
            this._channels,
            this.channelSpecs,
            this.label
        );
        this.count = config.count ?? this._seriesBuffers.inferCount() ?? 1;
        this.#scaleResources = new ScaleResourceManager({
            device: this.device,
            analysisByChannel: compiledChannels.analysisByChannel,
            label: this.label,
            getDefaultScaleRange: (name) => this.getDefaultScaleRange(name),
            setUniformValue: (name, value) =>
                this._setUniformValue(name, value),
        });
        this.#selectionResources = new SelectionResourceManager({
            device: this.device,
            channels: this._channels,
            analysisByChannel: compiledChannels.analysisByChannel,
            visibleWhen,
            order: this._order,
            label: this.label,
            setUniformValue: (name, value) =>
                this._setUniformValue(name, value),
        });
        /** @type {UniformBuffer | null} * @internal
         */
        this._uniformBufferState = null;

        /** @type {Map<string, { texture: GPUTexture, sampler?: GPUSampler, width: number, height: number, format: GPUTextureFormat }>} * @protected
         */
        this._extraTextures = new Map();

        /** @type {Map<string, GPUBuffer>} * @protected
         */
        this._extraBuffers = new Map();

        /** @type {Set<string>} * @protected
         */
        this._borrowedExtraTextures = new Set();

        /** @type {Set<string>} * @protected
         */
        this._borrowedExtraBuffers = new Set();

        this.#slotHandles = {
            batchUpdates: (update) => this.#batchSlotUpdates(update),
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
        this.#buildUniformLayout();
        this.#validateUniformBufferCapacity();
        this._initializeExtraResources();
        this.#selectionResources.initializeSelections(this._extraBuffers);
        const extraResources = [
            ...this.#selectionResources.getExtraResourceDefs(),
            ...this.getExtraResourceDefs(),
        ];
        const {
            bindGroupLayout,
            getPipeline,
            getPickPipeline,
            diagnostics,
            resourceLayout,
        } = buildPipelines({
            device: this.device,
            cache: renderer._programTemplateCache,
            globalBindGroupLayout: renderer._globalBindGroupLayout,
            format: renderer.format,
            pickFormat: renderer.pickFormat,
            compiledChannels,
            uniformLayout: this.#uniformLayout,
            shaderBody: this.shaderBody,
            packedSeriesLayout:
                this._seriesBuffers.packedSeriesLayoutEntries ?? undefined,
            selectionDefs: this.#selectionResources.selectionDefs,
            visibleWhen: visibleWhen,
            order: this._order,
            scalarSlots: this.#scalarSlots,
            extraResources,
            primitiveTopology: this.primitiveTopology,
            placementBindGroupLayout: renderer._placementBindGroupLayout,
            placementIndex: this._placementIndex,
            label: this.label,
        });
        this.#resourceLayout = resourceLayout;
        this.#programTemplateDiagnostics = diagnostics;
        this.#uniformBuffer = this.device.createBuffer({
            label: gpuLabel(this.label, "uniforms"),
            size: this._uniformBufferState.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.#initializeUniforms();
        const dynamicValues =
            /** @type {Record<string, {value: number | number[]}>} */ (
                this._markConfig.dynamicValues ?? {}
            );
        for (const [name, config] of Object.entries(dynamicValues)) {
            this._setUniformValue(name, config.value);
        }
        for (const [name, config] of Object.entries(this.#scalarSlots)) {
            this._setUniformValue(scalarSlotUniformName(name), config.value);
        }
        this._writeUniforms();
        this.#buildSlotHandles();
        this.#bindGroupLayout = bindGroupLayout;
        this.#getPipeline = getPipeline;
        this.#getPickPipeline = getPickPipeline;

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
     * Whether a referenced selection currently contains any selected values.
     *
     * @returns {boolean}
     * @internal
     */
    get _orderActive() {
        return this.#selectionResources.orderActive;
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
     * Channel metadata for validation and coercion.
     *
     * @returns {Record<string, ChannelSpec>}
     * @protected
     */
    get channelSpecs() {
        return {};
    }

    /**
     * Extra per-mark uniform fields (not tied to channels).
     *
     * @returns {{ name: string, type: import("../../../types.js").ScalarType, components: 1|2|4, arrayLength?: number }[]}
     * @protected
     */
    getExtraUniformLayout() {
        return [];
    }

    /**
     * Extra bind group resources (not tied to channels).
     *
     * @returns {import("../../shaders/markShaderBuilder.js").ExtraResourceDef[]}
     * @protected
     */
    getExtraResourceDefs() {
        return [];
    }

    /**
     * Allocate extra GPU resources before building bind groups.
     *
     * @returns {void}
     * @protected
     */
    _initializeExtraResources() {}

    /**
     * @returns {string}
     * @protected
     */
    get shaderBody() {
        return "";
    }

    /**
     * Returns the immutable edge-antialiasing strategy for this program.
     *
     * @returns {"shader" | "multisample"}
     * @protected
     */
    _resolveAntialiasing() {
        return "shader";
    }

    /**
     * Pipeline primitive topology for this mark.
     *
     * @returns {GPUPrimitiveTopology}
     * @protected
     */
    get primitiveTopology() {
        return "triangle-list";
    }

    /** @returns {number} */
    get verticesPerInstance() {
        return 6;
    }

    /**
     * Override to provide default scale ranges for specific channels.
     *
     * @param {string} _name
     * @returns {[number, number] | undefined}
     * @protected
     */
    getDefaultScaleRange(_name) {
        return undefined;
    }

    /**
     * @param {Record<string, TypedArray>} channels
     * @param {number} [count]
     * @param {boolean} [boundResourcesChanged]
     * @returns {void}
     */
    updateSeries(channels, count, boundResourcesChanged = false) {
        const inferred = count ?? this._seriesBuffers.inferCount(channels);
        this.count = inferred ?? this.count ?? 1;
        const packedBuffersChanged = this._seriesBuffers.updateSeries(
            channels,
            this.count
        );

        if (packedBuffersChanged || boundResourcesChanged || !this.#bindGroup) {
            this._rebuildBindGroup();
        }
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
        this.updateSeries(this._resolveSeries(channels), count);
    }

    /**
     * Translate the complete public series set before changing GPU resources.
     * @protected
     * @param {Record<string, import("../../../index.d.ts").SeriesData>} channels
     * @returns {Record<string, TypedArray>}
     */
    _resolveSeries(channels) {
        /** @type {Record<string, TypedArray>} */
        const resolved = {};
        for (const [name, targets] of this.#logicalSeriesTargets) {
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
        return resolved;
    }

    /**
     * @returns {Set<string>}
     */
    #collectConditionalChannelNames() {
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
    #collectLogicalSeriesTargets() {
        const targetsByChannel = new Map();
        for (const [name, channel] of Object.entries(this._channels)) {
            if (this.#conditionalChannelNames.has(name)) {
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
     * @protected
     */
    _rebuildBindGroup() {
        this.#bindGroup = buildBindGroup({
            device: this.device,
            label: this.label,
            layout: this.#bindGroupLayout,
            uniformBuffer: this.#uniformBuffer,
            resourceLayout: this.#resourceLayout,
            getScaleTableBuffer: () => this.#scaleResources.tableBuffer,
            getSeriesBuffer: () => this._seriesBuffers.getBuffer(),
            getScaleResources: (name) =>
                this.#scaleResources.getChannelResources(name),
            extraTextures: this._extraTextures,
            extraBuffers: this._extraBuffers,
        });
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

        for (const entry of this.#resourceLayout) {
            if (entry.role === "series") {
                const buffer = this._seriesBuffers.getBuffer();
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
            const scaleResources = this.#scaleResources.getChannelResources(
                entry.name
            );
            if (entry.role === "scaleTables") {
                storage.push({
                    name: entry.name,
                    role: entry.role,
                    bytes: this.#scaleResources.tableBuffer.size,
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
            programTemplate: {
                id: this.#programTemplateDiagnostics.id,
                firstBorrowerLabel:
                    this.#programTemplateDiagnostics.firstBorrowerLabel,
                borrowerLabels: Array.from(
                    this.#programTemplateDiagnostics.borrowerLabels
                ),
            },
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
        return this.#slotHandles;
    }

    /**
     * Build per-channel slot handles for scales and dynamic values.
     *
     * @returns {void}
     */
    #buildSlotHandles() {
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
            group.setGapPositions = slot.setGapPositions;
            group.setGapWidth = slot.setGapWidth;
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
            if (this.#conditionalChannelNames.has(name)) {
                continue;
            }
            if (channel.scale) {
                attachScaleSlot(
                    ensureScaleGroup(this.#slotHandles.scales, name),
                    this.#createScaleSlot(name)
                );
            }
            if (isValueChannelConfig(channel) && channel.dynamic) {
                attachValueSlot(
                    ensureValueGroup(this.#slotHandles.values, name),
                    this.#createValueSlot(name)
                );
            }
            const conditions = channel.conditions ?? [];
            if (!conditions.length) {
                continue;
            }
            for (const [conditionIndex, condition] of conditions.entries()) {
                if (!condition.channelName) {
                    continue;
                }
                const conditionChannel = this._channels[condition.channelName];
                if (!conditionChannel) {
                    continue;
                }
                if (conditionChannel.scale) {
                    const group = ensureScaleGroup(
                        this.#slotHandles.scales,
                        name
                    );
                    if (!group.conditions) {
                        group.conditions = {};
                    }
                    group.conditions[conditionIndex] = this.#createScaleSlot(
                        condition.channelName
                    );
                }
                if (
                    isValueChannelConfig(conditionChannel) &&
                    conditionChannel.dynamic
                ) {
                    const group = ensureValueGroup(
                        this.#slotHandles.values,
                        name
                    );
                    if (!group.conditions) {
                        group.conditions = {};
                    }
                    group.conditions[conditionIndex] = this.#createValueSlot(
                        condition.channelName
                    );
                }
            }
        }

        const dynamicValues = /** @type {Record<string, unknown>} */ (
            this._markConfig.dynamicValues ?? {}
        );
        for (const name of Object.keys(dynamicValues)) {
            this.#slotHandles.extraValues[name] =
                this.#createExtraValueSlot(name);
        }

        for (const name of Object.keys(this.#scalarSlots)) {
            this.#slotHandles.scalarSlots[name] = this.#createScalarSlot(name);
        }

        for (const def of this.#selectionResources.selectionDefs) {
            this.#slotHandles.selections[def.name] =
                this.#createSelectionSlot(def);
        }
    }

    /**
     * @param {string} name
     * @returns {import("../../../index.d.ts").ScaleSlotHandle}
     */
    #createScaleSlot(name) {
        const updater = this.#scaleResources.getScaleUpdater(name);
        return {
            setGapPositions: (values) => {
                this._assertAlive();
                this._queueSlotUpdate(
                    this.#scaleResources.updateGapPositions(name, values)
                );
            },
            setGapWidth: (width) => {
                this._assertAlive();
                this.#scaleResources.updateGapWidth(name, width);
                this._queueSlotUpdate(false);
            },
            setDomain: (domain, ranks) => {
                this._assertAlive();
                const needsRebind = updater.updateDomain(domain, ranks);
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
    #createValueSlot(name) {
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
    #createExtraValueSlot(name) {
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
    #createScalarSlot(name) {
        const config = this.#scalarSlots[name];
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
     * @protected
     */
    _setExtraUniformValue(name, value) {
        this._setUniformValue(name, value);
    }

    /**
     * @param {{ name: string, type: import("../../../index.d.ts").SelectionType, components?: string[] }} def
     * @returns {import("../../../index.d.ts").SelectionSlotHandle}
     */
    #createSelectionSlot(def) {
        /**
         * @param {{ type: "single", id: number } | { type: "multi", ids: Uint32Array } | { type: "interval", intervals: Readonly<Partial<Record<string, readonly [number, number] | null>>> }} next
         */
        const update = (next) => {
            this._assertAlive();
            const needsRebind = this.#selectionResources.updateSelection(
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
            components: def.components ?? [],
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
    #batchSlotUpdates(update) {
        this._assertAlive();
        this.#slotUpdateDepth++;
        try {
            update();
        } finally {
            this.#slotUpdateDepth--;
            if (this.#slotUpdateDepth === 0) {
                this.#flushSlotUpdates();
            }
        }
    }

    /** @param {boolean} needsRebind * @internal
     */
    _queueSlotUpdate(needsRebind) {
        this.#slotUniformsDirty = true;
        this.#slotBindingsDirty ||= needsRebind;
        if (this.#slotUpdateDepth === 0) {
            this.#flushSlotUpdates();
        }
    }

    #flushSlotUpdates() {
        if (!this.#slotUniformsDirty) {
            return;
        }
        this._writeUniforms();
        if (this.#slotBindingsDirty) {
            this._rebuildBindGroup();
        }
        this.renderer.markPickingDirty();
        this.#slotUniformsDirty = false;
        this.#slotBindingsDirty = false;
    }

    /**
     * Reject a mark whose uniform block exceeds a binding or allocation limit
     * before allocating any mark GPU resources.
     *
     * @returns {void}
     */
    #validateUniformBufferCapacity() {
        const limit = Math.min(
            this.device.limits.maxUniformBufferBindingSize,
            this.device.limits.maxBufferSize
        );
        const byteLength = this._uniformBufferState.byteLength;
        if (byteLength <= limit) {
            return;
        }

        const intervalDefs = this.#selectionResources.selectionDefs.filter(
            (def) => def.type === "interval"
        );
        const details = intervalDefs
            .map(
                (def) =>
                    `"${def.name}" (${def.components?.length ?? 0} components)`
            )
            .join(", ");
        throw new Error(
            `Uniform buffer for interval selection ${details || "mark"} requires ${byteLength} bytes, exceeding the device limit of ${limit} bytes.`
        );
    }

    /**
     * @returns {void}
     */
    #buildUniformLayout() {
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
                this.#scaleResources.addScaleUniforms(layout, name, channel);
            }
            if (isValueChannelConfig(channel) && channel.scale) {
                this.#scaleResources.addScaleUniforms(layout, name, channel);
            }
        }

        for (const [name, config] of Object.entries(this.#scalarSlots)) {
            layout.push({
                name: scalarSlotUniformName(name),
                type: config.type,
                components: 1,
            });
        }

        this.#selectionResources.addSelectionUniforms(layout);
        this.#uniformLayout = layout.concat(this.getExtraUniformLayout());
        if (this.#uniformLayout.length === 0) {
            // WebGPU does not allow empty uniform buffers; keep a dummy entry.
            this.#uniformLayout.push({
                name: "dummy",
                type: "f32",
                components: 1,
            });
        }
        this._uniformBufferState = new UniformBuffer(this.#uniformLayout);
    }

    /**
     * @returns {void}
     */
    #initializeUniforms() {
        for (const [name, channel] of Object.entries(this._channels)) {
            if (
                (isSeriesChannelConfig(channel) ||
                    isValueChannelConfig(channel)) &&
                channel.scale
            ) {
                this.#scaleResources.initializeScale(
                    name,
                    channel,
                    channel.scale
                );
                const updater = this.#scaleResources.getScaleUpdater(name);
                updater.updateDomain(
                    channel.scale.domain,
                    channel.scale.gapDomain
                );
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
     * @protected
     */
    _initializeExtraUniforms() {}

    /**
     * @param {string} name
     * @param {number|ArrayLike<number>|Array<number|number[]>} value
     * @returns {void}
     * @internal
     */
    _setUniformValue(name, value) {
        this._uniformBufferState?.setValue(name, value);
    }

    /**
     * @returns {void}
     * @protected
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
            this.#uniformBuffer,
            0,
            this._uniformBufferState.data
        );
    }
    // Uniform packing lives in utils/uniformBuffer.js.

    /**
     * @param {import("../../../index.d.ts").RenderPassState} state
     * @param {import("../../../index.d.ts").ProgramDrawOptions} options
     */
    prepareDraw(state, options) {
        state.setPipeline(this.#getPipeline(options.sampleCount));
        state.setBindGroup(1, this.#bindGroup);
    }

    /**
     * @param {import("../../../index.d.ts").RenderPassState} state
     */
    preparePick(state) {
        state.setPipeline(this.#getPickPipeline());
        state.setBindGroup(1, this.#bindGroup);
    }

    /**
     * @param {GPURenderPassEncoder} pass
     * @param {import("../../../index.d.ts").ProgramDrawOptions} options
     */
    draw(pass, options) {
        pass.draw(
            this.verticesPerInstance,
            options.instanceCount,
            0,
            options.firstInstance
        );
    }

    destroy() {
        if (this.#destroyed) {
            return;
        }
        this.#destroyed = true;
        this.#uniformBuffer.destroy();
        this._seriesBuffers.destroy();
        this.#scaleResources.destroy();
        for (const [name, buffer] of this._extraBuffers) {
            if (!this._borrowedExtraBuffers.has(name)) {
                buffer.destroy();
            }
        }
        this._extraBuffers.clear();
        for (const [name, { texture }] of this._extraTextures) {
            if (!this._borrowedExtraTextures.has(name)) {
                texture.destroy();
            }
        }
        this._extraTextures.clear();
    }

    /**
     * @returns {void}
     * @internal
     */
    _assertAlive() {
        this.renderer._assertAlive();
        if (this.#destroyed) {
            throw new Error(`${this.constructor.name} has been destroyed.`);
        }
    }
    // Type guards live in src/types.js to keep runtime checks consistent across modules.
}
