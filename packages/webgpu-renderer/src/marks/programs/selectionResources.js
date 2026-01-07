/* global GPUBufferUsage */
import { buildChannelAnalysis } from "../shaders/channelAnalysis.js";
import { buildHashTableSet } from "../../utils/hashTable.js";
import {
    SELECTION_BUFFER_PREFIX,
    SELECTION_COUNT_PREFIX,
    SELECTION_PREFIX,
} from "../../wgsl/prefixes.js";

/**
 * @typedef {import("../../index.d.ts").ChannelConfigResolved} ChannelConfigResolved
 * @typedef {import("../../index.d.ts").SelectionType} SelectionType
 * @typedef {import("../../types.js").ScalarType} ScalarType
 *
 * @typedef {{ type: "single", id: number } | { type: "multi", ids: Uint32Array } | { type: "interval", min: number, max: number }} SelectionUpdate
 *
 * @typedef {object} SelectionDef
 * @prop {string} name
 * @prop {SelectionType} type
 * @prop {string} [channel]
 * @prop {string} [secondaryChannel]
 * @prop {ScalarType} [scalarType]
 */

/**
 * Build a normalized set of selection definitions from channel conditions.
 *
 * @param {Record<string, ChannelConfigResolved>} channels
 * @returns {Map<string, SelectionDef>}
 */
function collectSelectionDefs(channels) {
    /** @type {Map<string, SelectionDef>} */
    const defs = new Map();
    const hasUniqueId = !!channels.uniqueId;

    for (const channel of Object.values(channels)) {
        const conditions = channel.conditions ?? [];
        for (const condition of conditions) {
            const when = condition.when;
            const selectionName = when.selection;
            const type = when.type;
            const existing = defs.get(selectionName);
            if (existing) {
                if (existing.type !== type) {
                    throw new Error(
                        `Selection "${selectionName}" must keep a single type.`
                    );
                }
                if (
                    existing.type === "interval" &&
                    existing.channel &&
                    existing.channel !== when.channel
                ) {
                    throw new Error(
                        `Selection "${selectionName}" must target a single interval channel.`
                    );
                }
                continue;
            }

            if (type === "interval") {
                if (!when.channel) {
                    throw new Error(
                        `Interval selection "${selectionName}" must specify a channel.`
                    );
                }
                const target = channels[when.channel];
                if (!target) {
                    throw new Error(
                        `Interval selection "${selectionName}" references unknown channel "${when.channel}".`
                    );
                }
                const analysis = buildChannelAnalysis(when.channel, target);
                if (analysis.inputComponents !== 1) {
                    throw new Error(
                        `Interval selection "${selectionName}" requires scalar channel "${when.channel}".`
                    );
                }
                const secondaryChannel =
                    when.channel === "x" && channels.x2
                        ? "x2"
                        : when.channel === "y" && channels.y2
                          ? "y2"
                          : undefined;
                defs.set(selectionName, {
                    name: selectionName,
                    type,
                    channel: when.channel,
                    secondaryChannel,
                    scalarType: analysis.scalarType,
                });
                continue;
            }

            defs.set(selectionName, { name: selectionName, type });
        }
    }

    if (
        !hasUniqueId &&
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
     * @param {(name: string, value: number|number[]) => void} params.setUniformValue
     */
    constructor({ device, channels, setUniformValue }) {
        this._device = device;
        this._channels = channels;
        this._setUniformValue = setUniformValue;

        /** @type {Map<string, SelectionDef>} */
        this._selectionDefs = collectSelectionDefs(channels);
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
                layout.push({
                    name: SELECTION_PREFIX + def.name,
                    type: def.scalarType ?? "f32",
                    components: 2,
                });
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
     * @returns {import("../shaders/markShaderBuilder.js").ExtraResourceDef[]}
     */
    getExtraResourceDefs() {
        /** @type {import("../shaders/markShaderBuilder.js").ExtraResourceDef[]} */
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
                this._setUniformValue(SELECTION_PREFIX + def.name, [1, 0]);
            } else if (def.type === "multi") {
                this._setUniformValue(SELECTION_COUNT_PREFIX + def.name, 0);
                const bufferName = SELECTION_BUFFER_PREFIX + def.name;
                const { table } = buildHashTableSet([]);
                const buffer = this._device.createBuffer({
                    size: table.byteLength,
                    usage:
                        // eslint-disable-next-line no-undef
                        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                });
                this._device.queue.writeBuffer(buffer, 0, table);
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

        let needsRebind = false;
        if (update.type === "single") {
            this._setUniformValue(SELECTION_PREFIX + name, update.id);
        } else if (update.type === "interval") {
            this._setUniformValue(SELECTION_PREFIX + name, [
                update.min,
                update.max,
            ]);
        } else if (update.type === "multi") {
            const { table, size } = buildHashTableSet(update.ids);
            this._setUniformValue(SELECTION_COUNT_PREFIX + name, size);
            const bufferName = SELECTION_BUFFER_PREFIX + name;
            const existing = this._selectionBuffers.get(name);
            if (!existing || existing.byteLength < table.byteLength) {
                const buffer = this._device.createBuffer({
                    size: table.byteLength,
                    usage:
                        // eslint-disable-next-line no-undef
                        GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                });
                extraBuffers.set(bufferName, buffer);
                this._selectionBuffers.set(name, {
                    buffer,
                    byteLength: table.byteLength,
                });
                needsRebind = true;
            }
            const buffer = this._selectionBuffers.get(name)?.buffer;
            if (buffer) {
                this._device.queue.writeBuffer(buffer, 0, table);
            }
        } else {
            throw new Error(`Selection "${name}" has unsupported type.`);
        }

        return needsRebind;
    }
}
