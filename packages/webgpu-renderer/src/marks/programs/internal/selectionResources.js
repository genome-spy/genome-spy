import { buildChannelAnalysis } from "../../shaders/channelAnalysis.js";
import { buildHashTableSet } from "../../../utils/hashTable.js";
import { asGpuBufferSource } from "../../../utils/webgpuTextureUtils.js";
import {
    intervalSelectionActiveName,
    intervalSelectionBoundsName,
    SELECTION_BUFFER_PREFIX,
    SELECTION_COUNT_PREFIX,
    SELECTION_PREFIX,
} from "../../../wgsl/prefixes.js";

/**
 * @typedef {import("../../../index.d.ts").ChannelConfigResolved} ChannelConfigResolved
 * @typedef {import("../../../index.d.ts").SelectionType} SelectionType
 * @typedef {import("../../../index.d.ts").VisibilityPredicate} VisibilityPredicate
 * @typedef {import("../../../types.js").ScalarType} ScalarType
 *
 * @typedef {{ type: "single", id: number } | { type: "multi", ids: Uint32Array } | { type: "interval", intervals: Readonly<Partial<Record<string, readonly [number, number] | null>>> }} SelectionUpdate
 *
 * @typedef {object} IntervalTargetDef
 * @prop {string} input
 * @prop {string} [secondaryInput]
 * @prop {"intersects"|"encloses"|"endpoints"} hitTest
 * @prop {ScalarType} scalarType
 * @prop {ScalarType} [secondaryScalarType]
 *
 * @typedef {object} SelectionDef
 * @prop {string} name
 * @prop {SelectionType} type
 * @prop {IntervalTargetDef[]} [targets]
 */

/**
 * @param {unknown} value
 * @returns {value is readonly [number, number]}
 */
function isIntervalBounds(value) {
    return (
        Array.isArray(value) &&
        value.length === 2 &&
        typeof value[0] === "number" &&
        typeof value[1] === "number"
    );
}

/** @type {number[]} */
const INACTIVE_INTERVAL_BOUNDS = [0, 0];

/**
 * @param {IntervalTargetDef} a
 * @param {IntervalTargetDef} b
 * @returns {boolean}
 */
function sameIntervalTarget(a, b) {
    return (
        a.input === b.input &&
        a.secondaryInput === b.secondaryInput &&
        a.hitTest === b.hitTest
    );
}

/**
 * @param {IntervalTargetDef[]} a
 * @param {IntervalTargetDef[]} b
 * @returns {boolean}
 */
function sameIntervalTargets(a, b) {
    return (
        a.length === b.length &&
        a.every((target, index) => sameIntervalTarget(target, b[index]))
    );
}

/**
 * Resolve and validate one interval predicate's target descriptors.
 *
 * @param {string} selectionName
 * @param {import("../../../index.d.ts").SelectionPredicate} when
 * @param {Record<string, ChannelConfigResolved>} channels
 * @returns {IntervalTargetDef[]}
 */
function resolveIntervalTargets(selectionName, when, channels) {
    if (when.type !== "interval") {
        throw new Error(`Selection "${selectionName}" is not an interval.`);
    }
    if (!Array.isArray(when.targets) || when.targets.length === 0) {
        throw new Error(
            `Interval selection "${selectionName}" must specify a non-empty targets array.`
        );
    }

    const names = new Set();
    return when.targets.map((target) => {
        if (names.has(target.input)) {
            throw new Error(
                `Interval selection "${selectionName}" cannot target "${target.input}" more than once.`
            );
        }
        names.add(target.input);

        const primary = channels[target.input];
        if (!primary) {
            throw new Error(
                `Interval selection "${selectionName}" references unknown input "${target.input}".`
            );
        }
        const analysis = buildChannelAnalysis(target.input, primary);
        if (analysis.inputComponents !== 1) {
            throw new Error(
                `Interval selection "${selectionName}" requires scalar input "${target.input}".`
            );
        }

        let secondaryScalarType;
        if (target.secondaryInput !== undefined) {
            const secondary = channels[target.secondaryInput];
            if (!secondary) {
                throw new Error(
                    `Interval selection "${selectionName}" references unknown input "${target.secondaryInput}".`
                );
            }
            const secondaryAnalysis = buildChannelAnalysis(
                target.secondaryInput,
                secondary
            );
            if (secondaryAnalysis.inputComponents !== 1) {
                throw new Error(
                    `Interval selection "${selectionName}" requires scalar input "${target.secondaryInput}".`
                );
            }
            if (secondaryAnalysis.scalarType !== analysis.scalarType) {
                throw new Error(
                    `Interval selection "${selectionName}" requires matching scalar types for inputs "${target.input}" and "${target.secondaryInput}".`
                );
            }
            secondaryScalarType = secondaryAnalysis.scalarType;
        }

        return {
            input: target.input,
            secondaryInput: target.secondaryInput,
            hitTest: target.hitTest ?? "intersects",
            scalarType: analysis.scalarType,
            secondaryScalarType,
        };
    });
}

/**
 * Add one selection declaration to the normalized definition map.
 *
 * @param {Map<string, SelectionDef>} defs
 * @param {import("../../../index.d.ts").SelectionPredicate} when
 * @param {Record<string, ChannelConfigResolved>} channels
 * @returns {void}
 */
function addSelectionDef(defs, when, channels) {
    const selectionName = when.selection;
    const type = when.type;
    const existing = defs.get(selectionName);
    if (existing) {
        if (existing.type !== type) {
            throw new Error(
                `Selection "${selectionName}" must keep a single type.`
            );
        }
        if (type === "interval") {
            const targets = resolveIntervalTargets(
                selectionName,
                when,
                channels
            );
            if (
                !existing.targets ||
                !sameIntervalTargets(existing.targets, targets)
            ) {
                throw new Error(
                    `Selection "${selectionName}" must keep the same interval targets.`
                );
            }
        }
        return;
    }

    if (type === "interval") {
        defs.set(selectionName, {
            name: selectionName,
            type,
            targets: resolveIntervalTargets(selectionName, when, channels),
        });
    } else {
        defs.set(selectionName, { name: selectionName, type });
    }
}

/**
 * Collect selection leaves from an immutable visibility tree.
 *
 * @param {VisibilityPredicate | undefined} node
 * @param {Map<string, SelectionDef>} defs
 * @param {Record<string, ChannelConfigResolved>} channels
 * @returns {void}
 */
function collectVisibilitySelections(node, defs, channels) {
    if (!node || typeof node !== "object") {
        return;
    }
    if ("selection" in node) {
        addSelectionDef(defs, node, channels);
    } else if ("all" in node) {
        for (const child of node.all) {
            collectVisibilitySelections(child, defs, channels);
        }
    } else if ("any" in node) {
        for (const child of node.any) {
            collectVisibilitySelections(child, defs, channels);
        }
    }
}

/**
 * Build a normalized set of selection definitions from channel conditions and
 * visibility predicates.
 *
 * @param {Record<string, ChannelConfigResolved>} channels
 * @param {VisibilityPredicate | undefined} visibleWhen
 * @returns {Map<string, SelectionDef>}
 */
function collectSelectionDefs(channels, visibleWhen) {
    /** @type {Map<string, SelectionDef>} */
    const defs = new Map();

    for (const channel of Object.values(channels)) {
        for (const condition of channel.conditions ?? []) {
            addSelectionDef(defs, condition.when, channels);
        }
    }
    collectVisibilitySelections(visibleWhen, defs, channels);

    if (
        !channels.uniqueId &&
        Array.from(defs.values()).some(
            (def) => def.type === "single" || def.type === "multi"
        )
    ) {
        throw new Error(
            'Selections of type "single" or "multi" require the "uniqueId" channel.'
        );
    }

    return defs;
}

/**
 * Manages GPU resources for selection predicates declared in channel configs.
 */
export class SelectionResourceManager {
    /**
     * @param {object} params
     * @param {GPUDevice} params.device
     * @param {Record<string, ChannelConfigResolved>} params.channels
     * @param {VisibilityPredicate} [params.visibleWhen]
     * @param {(name: string, value: number|number[]) => void} params.setUniformValue
     */
    constructor({ device, channels, visibleWhen, setUniformValue }) {
        this._device = device;
        this._channels = channels;
        this._setUniformValue = setUniformValue;

        /** @type {Map<string, SelectionDef>} */
        this._selectionDefs = collectSelectionDefs(channels, visibleWhen);
        /** @type {Map<string, { buffer: GPUBuffer, byteLength: number }>} */
        this._selectionBuffers = new Map();
    }

    /**
     * @returns {SelectionDef[]}
     */
    get selectionDefs() {
        return Array.from(this._selectionDefs.values());
    }

    /**
     * @param {Array<{ name: string, type: ScalarType, components: 1|2|4, arrayLength?: number }>} layout
     * @returns {void}
     */
    addSelectionUniforms(layout) {
        for (const def of this._selectionDefs.values()) {
            if (def.type === "single") {
                layout.push({
                    name: SELECTION_PREFIX + def.name,
                    type: "u32",
                    components: 1,
                });
            } else if (def.type === "interval") {
                for (const [index, target] of def.targets.entries()) {
                    layout.push({
                        name: intervalSelectionActiveName(def.name, index),
                        type: "u32",
                        components: 1,
                    });
                    layout.push({
                        name: intervalSelectionBoundsName(def.name, index),
                        type: target.scalarType,
                        components: 2,
                    });
                }
            } else if (def.type === "multi") {
                layout.push({
                    name: SELECTION_COUNT_PREFIX + def.name,
                    type: "u32",
                    components: 1,
                });
            } else {
                throw new Error(
                    `Selection "${def.name}" has unsupported type "${def.type}".`
                );
            }
        }
    }

    /**
     * @returns {import("../../shaders/markShaderBuilder.js").ExtraResourceDef[]}
     */
    getExtraResourceDefs() {
        /** @type {import("../../shaders/markShaderBuilder.js").ExtraResourceDef[]} */
        const extras = [];
        for (const def of this._selectionDefs.values()) {
            if (def.type !== "multi") {
                continue;
            }
            const bufferName = SELECTION_BUFFER_PREFIX + def.name;
            extras.push({
                name: bufferName,
                kind: "buffer",
                role: "extraBuffer",
                wgslName: bufferName,
                wgslType: "array<HashEntry>",
                bufferType: "read-only-storage",
                visibility: "vertex",
            });
        }
        return extras;
    }

    /**
     * Allocate initial buffers and uniforms for selections.
     *
     * @param {Map<string, GPUBuffer>} extraBuffers
     * @returns {void}
     */
    initializeSelections(extraBuffers) {
        for (const def of this._selectionDefs.values()) {
            if (def.type === "single") {
                this._setUniformValue(SELECTION_PREFIX + def.name, 0);
            } else if (def.type === "interval") {
                for (const [index] of def.targets.entries()) {
                    this._setUniformValue(
                        intervalSelectionActiveName(def.name, index),
                        0
                    );
                    this._setUniformValue(
                        intervalSelectionBoundsName(def.name, index),
                        [0, 0]
                    );
                }
            } else if (def.type === "multi") {
                this._setUniformValue(SELECTION_COUNT_PREFIX + def.name, 0);
                const bufferName = SELECTION_BUFFER_PREFIX + def.name;
                const { table } = buildHashTableSet([]);
                const buffer = this._device.createBuffer({
                    size: table.byteLength,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                });
                this._device.queue.writeBuffer(
                    buffer,
                    0,
                    asGpuBufferSource(table)
                );
                extraBuffers.set(bufferName, buffer);
                this._selectionBuffers.set(def.name, {
                    buffer,
                    byteLength: table.byteLength,
                });
            } else {
                throw new Error(
                    `Selection "${def.name}" has unsupported type "${def.type}".`
                );
            }
        }
    }

    /**
     * @param {string} name
     * @param {SelectionUpdate} update
     * @param {Map<string, GPUBuffer>} extraBuffers
     * @returns {boolean} Whether a bind group rebuild is required.
     */
    updateSelection(name, update, extraBuffers) {
        const def = this._selectionDefs.get(name);
        if (!def) {
            throw new Error(`Unknown selection "${name}".`);
        }
        if (update.type !== def.type) {
            throw new Error(
                `Selection "${name}" must remain type "${def.type}".`
            );
        }

        if (update.type === "single") {
            this._setUniformValue(SELECTION_PREFIX + name, update.id);
        } else if (update.type === "interval") {
            const intervals = update.intervals ?? {};
            const targets = def.targets ?? [];
            for (const input of Object.keys(intervals)) {
                let declared = false;
                for (const target of targets) {
                    if (target.input === input) {
                        declared = true;
                        break;
                    }
                }
                if (!declared) {
                    throw new Error(
                        `Selection "${name}" cannot update unknown target "${input}".`
                    );
                }
            }

            for (const target of targets) {
                const hasInterval = Object.hasOwn(intervals, target.input);
                const interval = intervals[target.input];
                if (
                    hasInterval &&
                    interval !== null &&
                    !isIntervalBounds(interval)
                ) {
                    throw new Error(
                        `Selection "${name}" target "${target.input}" requires two numeric bounds or null.`
                    );
                }
            }

            for (const [index, target] of targets.entries()) {
                const interval = intervals[target.input];
                const active =
                    interval !== undefined && interval !== null ? 1 : 0;
                this._setUniformValue(
                    intervalSelectionActiveName(name, index),
                    active
                );
                this._setUniformValue(
                    intervalSelectionBoundsName(name, index),
                    active
                        ? /** @type {number[]} */ (
                              /** @type {unknown} */ (interval)
                          )
                        : INACTIVE_INTERVAL_BOUNDS
                );
            }
        } else if (update.type === "multi") {
            const { table, size } = buildHashTableSet(update.ids);
            this._setUniformValue(SELECTION_COUNT_PREFIX + name, size);
            const bufferName = SELECTION_BUFFER_PREFIX + name;
            const existing = this._selectionBuffers.get(name);
            if (!existing || existing.byteLength < table.byteLength) {
                const buffer = this._device.createBuffer({
                    size: table.byteLength,
                    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                });
                extraBuffers.set(bufferName, buffer);
                this._selectionBuffers.set(name, {
                    buffer,
                    byteLength: table.byteLength,
                });
                existing?.buffer.destroy();
                this._device.queue.writeBuffer(
                    buffer,
                    0,
                    asGpuBufferSource(table)
                );
                return true;
            }
            this._device.queue.writeBuffer(
                existing.buffer,
                0,
                asGpuBufferSource(table)
            );
        } else {
            throw new Error(`Selection "${name}" has unsupported type.`);
        }

        return false;
    }
}
