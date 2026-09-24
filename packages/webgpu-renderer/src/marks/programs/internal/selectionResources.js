import {
    buildHashTableSet,
    DEFAULT_MAX_LOAD_FACTOR,
} from "../../../utils/hashTable.js";
import { asGpuBufferSource } from "../../../utils/webgpuTextureUtils.js";
import {
    intervalSelectionActiveName,
    intervalSelectionBoundsName,
    SELECTION_BUFFER_PREFIX,
    SELECTION_COUNT_PREFIX,
    SELECTION_PREFIX,
} from "../../../wgsl/prefixes.js";
import { gpuLabel } from "../../../utils/gpuLabel.js";
import { packHighPrecisionU32 } from "../../../utils/highPrecision.js";

/**
 * @typedef {import("../../../index.d.ts").ChannelConfigResolved} ChannelConfigResolved
 * @typedef {import("../../../index.d.ts").SelectionType} SelectionType
 * @typedef {import("../../../index.d.ts").VisibilityPredicate} VisibilityPredicate
 * @typedef {import("../../../types.js").ScalarType} ScalarType
 *
 * @typedef {{ type: "single", id: number } | { type: "multi", ids: Uint32Array } | { type: "interval", intervals: Readonly<Partial<Record<string, readonly [number, number] | null>>> }} SelectionUpdate
 *
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
/** @type {number[]} */
const INACTIVE_PACKED_BOUNDS = [0, 0, 0, 0];

/**
 * @typedef {{ scalarType: ScalarType, inputComponents: 1 | 2 }} IntervalRepresentation
 * @typedef {import("../../../index.d.ts").IntervalSelectionProjection & IntervalRepresentation & { hitTest: "intersects" | "encloses" | "endpoints" }} IntervalProjectionDef
 * @typedef {{ name: string, type: SelectionType, components?: string[], declaredComponents?: string[], representations?: Map<string, IntervalRepresentation>, projections?: IntervalProjectionDef[], membershipUsed?: boolean }} SelectionDef
 */

/**
 * @param {string} selectionName
 * @param {import("../../../index.d.ts").IntervalSelectionProjection} projection
 * @param {(name: string) => ReturnType<typeof import("../../shaders/channelAnalysis.js").buildChannelAnalysis>} getAnalysis
 * @returns {IntervalProjectionDef}
 */
function resolveProjection(selectionName, projection, getAnalysis) {
    if (
        !projection ||
        typeof projection.component !== "string" ||
        !projection.component
    ) {
        throw new Error(
            `Interval selection "${selectionName}" projections require a component.`
        );
    }
    if (typeof projection.input !== "string" || !projection.input) {
        throw new Error(
            `Interval selection "${selectionName}" projections require an input.`
        );
    }
    if (
        Object.keys(projection).some(
            (key) =>
                !["component", "input", "secondaryInput", "hitTest"].includes(
                    key
                )
        )
    ) {
        throw new Error(
            `Interval selection "${selectionName}" projection has unsupported properties.`
        );
    }
    const analysis = getAnalysis(projection.input);
    if (
        analysis.inputComponents !== 1 &&
        !(analysis.inputComponents === 2 && analysis.scalarType === "u32")
    ) {
        throw new Error(
            `Interval selection "${selectionName}" requires a scalar or packed numeric input "${projection.input}".`
        );
    }
    if (projection.secondaryInput !== undefined) {
        const secondary = getAnalysis(projection.secondaryInput);
        if (
            secondary.inputComponents !== analysis.inputComponents ||
            secondary.scalarType !== analysis.scalarType
        ) {
            throw new Error(
                `Interval selection "${selectionName}" requires matching representations for inputs "${projection.input}" and "${projection.secondaryInput}".`
            );
        }
    }
    if (
        projection.hitTest !== undefined &&
        (!projection.secondaryInput ||
            !["intersects", "encloses", "endpoints"].includes(
                projection.hitTest
            ))
    ) {
        throw new Error(
            `Interval selection "${selectionName}" has an invalid hit-test mode.`
        );
    }
    return {
        ...projection,
        hitTest: projection.hitTest ?? "intersects",
        scalarType: analysis.scalarType,
        inputComponents: /** @type {1 | 2} */ (analysis.inputComponents),
    };
}

/**
 * @param {Map<string, SelectionDef>} defs
 * @param {import("../../../index.d.ts").SelectionStateReference | import("../../../index.d.ts").SelectionPredicateLeaf} reference
 * @returns {SelectionDef}
 */
function addSelectionReference(defs, reference) {
    if (
        !reference ||
        typeof reference.selection !== "string" ||
        !reference.selection ||
        !["single", "multi", "interval"].includes(reference.type)
    ) {
        throw new Error(
            "Selection predicates require a named selection and type."
        );
    }
    if (
        reference.type === "interval" &&
        "components" in reference &&
        (!Array.isArray(reference.components) ||
            reference.components.length === 0 ||
            reference.components.some(
                (component) => typeof component !== "string" || !component
            ) ||
            new Set(reference.components).size !== reference.components.length)
    ) {
        throw new Error(
            `Interval selection "${reference.selection}" requires distinct components.`
        );
    }
    const existing = defs.get(reference.selection);
    if (existing) {
        if (existing.type !== reference.type) {
            throw new Error(
                `Selection "${reference.selection}" must keep a single type.`
            );
        }
        if (reference.type === "interval" && "components" in reference) {
            if (
                existing.declaredComponents &&
                (existing.declaredComponents.length !==
                    reference.components.length ||
                    existing.declaredComponents.some(
                        (component) => !reference.components.includes(component)
                    ))
            ) {
                throw new Error(
                    `Selection "${reference.selection}" must keep the same components.`
                );
            }
            existing.declaredComponents = Array.from(reference.components);
            for (const component of reference.components) {
                if (!existing.components?.includes(component)) {
                    existing.components?.push(component);
                }
            }
        }
        return existing;
    }
    /** @type {SelectionDef} */
    const def = {
        name: reference.selection,
        type: reference.type,
        membershipUsed: false,
    };
    if (reference.type === "interval") {
        def.components =
            "components" in reference ? Array.from(reference.components) : [];
        if ("components" in reference) {
            def.declaredComponents = Array.from(reference.components);
        }
        def.representations = new Map();
        def.projections = [];
    }
    defs.set(def.name, def);
    return def;
}

/**
 * @param {import("../../../index.d.ts").VisibilityPredicate | undefined} node
 * @param {Map<string, SelectionDef>} defs
 * @param {(name: string) => ReturnType<typeof import("../../shaders/channelAnalysis.js").buildChannelAnalysis>} getAnalysis
 * @returns {void}
 */
function collectSelections(node, defs, getAnalysis) {
    if (!node) {
        return;
    }
    if ("all" in node || "any" in node) {
        for (const child of "all" in node ? node.all : node.any) {
            collectSelections(child, defs, getAnalysis);
        }
    } else if ("not" in node) {
        collectSelections(node.not, defs, getAnalysis);
    } else if ("selectionActive" in node) {
        addSelectionReference(defs, node.selectionActive);
    } else if ("selection" in node) {
        const def = addSelectionReference(defs, node);
        def.membershipUsed = true;
        if (node.type !== "interval") {
            return;
        }
        if (!Array.isArray(node.projections) || !node.projections.length) {
            throw new Error(
                `Interval selection "${node.selection}" must specify non-empty projections.`
            );
        }
        for (const projection of node.projections) {
            const resolved = resolveProjection(
                node.selection,
                projection,
                getAnalysis
            );
            if (!def.components?.includes(resolved.component)) {
                def.components?.push(resolved.component);
            }
            const current = def.representations?.get(resolved.component);
            if (
                current &&
                (current.scalarType !== resolved.scalarType ||
                    current.inputComponents !== resolved.inputComponents)
            ) {
                throw new Error(
                    `Interval selection "${node.selection}" component "${resolved.component}" must keep one comparison representation.`
                );
            }
            def.representations?.set(resolved.component, {
                scalarType: resolved.scalarType,
                inputComponents: resolved.inputComponents,
            });
            if (
                !def.projections?.some(
                    (item) =>
                        item.component === resolved.component &&
                        item.input === resolved.input &&
                        item.secondaryInput === resolved.secondaryInput &&
                        item.hitTest === resolved.hitTest
                )
            ) {
                def.projections?.push(resolved);
            }
        }
    }
}

/**
 * @param {Record<string, ChannelConfigResolved>} channels
 * @param {ReadonlyMap<string, ReturnType<typeof import("../../shaders/channelAnalysis.js").buildChannelAnalysis>>} analysisByChannel
 * @param {import("../../../index.d.ts").VisibilityPredicate | undefined} visibleWhen
 * @param {import("../../../index.d.ts").MarkOrder | undefined} order
 * @returns {Map<string, SelectionDef>}
 */
function collectSelectionDefs(channels, analysisByChannel, visibleWhen, order) {
    /** @type {Map<string, SelectionDef>} */
    const defs = new Map();
    /** @param {string} name */
    const getAnalysis = (name) => {
        const analysis = analysisByChannel.get(name);
        if (!analysis) {
            throw new Error(`Selection references unknown input "${name}".`);
        }
        return analysis;
    };

    for (const channel of Object.values(channels)) {
        for (const condition of channel.conditions ?? []) {
            collectSelections(condition.when, defs, getAnalysis);
        }
    }
    collectSelections(visibleWhen, defs, getAnalysis);
    collectSelections(order?.when, defs, getAnalysis);

    for (const def of defs.values()) {
        if (
            def.declaredComponents &&
            def.components?.some(
                (component) => !def.declaredComponents?.includes(component)
            )
        ) {
            throw new Error(
                `Selection "${def.name}" projects an undeclared component.`
            );
        }
    }

    if (
        !channels.uniqueId &&
        Array.from(defs.values()).some(
            (def) =>
                def.membershipUsed &&
                (def.type === "single" || def.type === "multi")
        )
    ) {
        throw new Error(
            'Selections of type "single" or "multi" require the "uniqueId" channel.'
        );
    }
    return defs;
}

/**
 * @param {import("../../../index.d.ts").SelectionPredicate} node
 * @param {string} name
 * @returns {boolean}
 */
function predicateReferences(node, name) {
    if ("all" in node || "any" in node) {
        return ("all" in node ? node.all : node.any).some((child) =>
            predicateReferences(child, name)
        );
    }
    if ("not" in node) {
        return predicateReferences(node.not, name);
    }
    if ("selectionActive" in node) {
        return node.selectionActive.selection === name;
    }
    return node.selection === name;
}

/**
 * Manages GPU resources for selection predicates declared in channel configs.
 */
export class SelectionResourceManager {
    /**
     * @param {object} params
     * @param {GPUDevice} params.device
     * @param {Record<string, ChannelConfigResolved>} params.channels
     * @param {ReadonlyMap<string, ReturnType<typeof import("../../shaders/channelAnalysis.js").buildChannelAnalysis>>} params.analysisByChannel
     * @param {VisibilityPredicate} [params.visibleWhen]
     * @param {import("../../../index.d.ts").MarkOrder} [params.order]
     * @param {string} [params.label]
     * @param {(name: string, value: number|number[]) => void} params.setUniformValue
     */
    constructor({
        device,
        channels,
        analysisByChannel,
        visibleWhen,
        order,
        label = "mark",
        setUniformValue,
    }) {
        this._device = device;
        this._label = label;
        this._setUniformValue = setUniformValue;

        /** @type {Map<string, SelectionDef>} */
        this._selectionDefs = collectSelectionDefs(
            channels,
            analysisByChannel,
            visibleWhen,
            order
        );
        /** @type {Map<string, boolean>} */
        this._orderSelectionActive = new Map(
            Array.from(this._selectionDefs.values())
                .filter(
                    (def) => order && predicateReferences(order.when, def.name)
                )
                .map((def) => [def.name, false])
        );
        this.orderActive = false;
        /** @type {Map<string, { buffer: GPUBuffer, byteLength: number }>} */
        this._selectionBuffers = new Map();
    }

    /**
     * @param {string} name
     * @param {boolean} active
     * @returns {void}
     */
    _setOrderSelectionActive(name, active) {
        if (!this._orderSelectionActive.has(name)) {
            return;
        }
        this._orderSelectionActive.set(name, active);
        this.orderActive = this._orderSelectionActive.values().some(Boolean);
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
                for (const [index, component] of (
                    def.components ?? []
                ).entries()) {
                    layout.push({
                        name: intervalSelectionActiveName(def.name, index),
                        type: "u32",
                        components: 1,
                    });
                    const representation = def.representations?.get(component);
                    if (representation) {
                        layout.push({
                            name: intervalSelectionBoundsName(def.name, index),
                            type: representation.scalarType,
                            components:
                                representation.inputComponents === 2 ? 4 : 2,
                        });
                    }
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
                this.updateSelection(
                    def.name,
                    { type: "single", id: 0 },
                    extraBuffers
                );
            } else if (def.type === "interval") {
                this.updateSelection(
                    def.name,
                    { type: "interval", intervals: {} },
                    extraBuffers
                );
            } else if (def.type === "multi") {
                this.updateSelection(
                    def.name,
                    { type: "multi", ids: new Uint32Array() },
                    extraBuffers
                );
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
            this._setOrderSelectionActive(name, update.id !== 0);
        } else if (update.type === "interval") {
            const intervals = update.intervals ?? {};
            const components = def.components ?? [];
            for (const component of Object.keys(intervals)) {
                if (!components.includes(component)) {
                    throw new Error(
                        `Selection "${name}" cannot update unknown component "${component}".`
                    );
                }
            }

            const prepared = components.map((component) => {
                const hasInterval = Object.hasOwn(intervals, component);
                const interval = intervals[component];
                if (
                    hasInterval &&
                    interval !== null &&
                    !isIntervalBounds(interval)
                ) {
                    throw new Error(
                        `Selection "${name}" component "${component}" requires two numeric bounds or null.`
                    );
                }
                const active = interval !== undefined && interval !== null;
                const representation = def.representations?.get(component);
                const bounds = representation
                    ? active
                        ? representation.inputComponents === 2
                            ? Array.from(interval).flatMap((value) =>
                                  Array.from(packHighPrecisionU32(value))
                              )
                            : Array.from(interval)
                        : representation.inputComponents === 2
                          ? INACTIVE_PACKED_BOUNDS
                          : INACTIVE_INTERVAL_BOUNDS
                    : undefined;
                return { active, bounds };
            });

            let anyActive = false;
            for (const [index, { active, bounds }] of prepared.entries()) {
                anyActive ||= active;
                this._setUniformValue(
                    intervalSelectionActiveName(name, index),
                    active ? 1 : 0
                );
                if (bounds) {
                    this._setUniformValue(
                        intervalSelectionBoundsName(name, index),
                        bounds
                    );
                }
            }
            this._setOrderSelectionActive(name, anyActive);
        } else if (update.type === "multi") {
            const bufferName = SELECTION_BUFFER_PREFIX + name;
            const existing = this._selectionBuffers.get(name);
            // The shader derives its hash mask from the bound buffer length.
            const existingCapacity =
                existing?.byteLength / (Uint32Array.BYTES_PER_ELEMENT * 2);
            const reuseExisting =
                existingCapacity !== undefined &&
                update.ids.length / existingCapacity <= DEFAULT_MAX_LOAD_FACTOR;
            const { table, size } = buildHashTableSet(
                update.ids,
                reuseExisting ? { capacity: existingCapacity } : undefined
            );
            this._setUniformValue(SELECTION_COUNT_PREFIX + name, size);
            this._setOrderSelectionActive(name, size > 0);
            if (!existing || existing.byteLength < table.byteLength) {
                const buffer = this._device.createBuffer({
                    label: gpuLabel(this._label, `selection ${name}`),
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
