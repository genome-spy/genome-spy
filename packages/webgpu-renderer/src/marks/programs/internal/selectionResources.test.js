import { describe, expect, it, vi } from "vitest";

import { SelectionResourceManager as DefinedSelectionResourceManager } from "./selectionResources.js";
import { analyzeTestChannels } from "../../../../testUtils/scaleDefinitions.js";
import { HASH_EMPTY_KEY, hash32 } from "../../../utils/hashTable.js";
import {
    intervalSelectionActiveName,
    intervalSelectionBoundsName,
    SELECTION_BUFFER_PREFIX,
} from "../../../wgsl/prefixes.js";

class SelectionResourceManager extends DefinedSelectionResourceManager {
    /**
     * @param {Omit<ConstructorParameters<typeof DefinedSelectionResourceManager>[0], "analysisByChannel">} params
     */
    constructor(params) {
        super({
            ...params,
            analysisByChannel: analyzeTestChannels(params.channels),
        });
    }
}

/**
 * @param {Array<{ input: string, secondaryInput?: string, hitTest?: "intersects"|"encloses"|"endpoints" }>} targets
 */
function makeIntervalChannels(targets) {
    return /** @type {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} */ (
        /** @type {unknown} */ ({
            x: {
                data: new Float32Array([0, 1]),
                type: "f32",
                components: 1,
            },
            y: {
                data: new Uint32Array([0, 1]),
                type: "u32",
                components: 1,
            },
            z: {
                data: new Int32Array([0, 1]),
                type: "i32",
                components: 1,
            },
            vec: {
                data: new Float32Array([0, 1, 2, 3]),
                type: "f32",
                components: 2,
            },
            fill: {
                value: 0,
                type: "f32",
                components: 1,
                conditions: [
                    {
                        when: {
                            selection: "brush",
                            type: "interval",
                            targets,
                        },
                        value: 1,
                    },
                ],
            },
        })
    );
}

function makeMultiChannels() {
    return /** @type {Record<string, import("../../../index.d.ts").ChannelConfigResolved>} */ (
        /** @type {unknown} */ ({
            uniqueId: {
                data: new Uint32Array([0]),
                type: "u32",
                components: 1,
            },
            fill: {
                value: [0, 0, 0, 1],
                type: "f32",
                components: 4,
                conditions: [
                    {
                        when: { selection: "chosen", type: "multi" },
                        channel: {
                            value: [1, 0, 0, 1],
                            type: "f32",
                            components: 4,
                        },
                        channelName: "fill__cond0",
                    },
                ],
            },
            fill__cond0: {
                value: [1, 0, 0, 1],
                type: "f32",
                components: 4,
            },
        })
    );
}

function createDevice() {
    return /** @type {GPUDevice} */ (
        /** @type {unknown} */ ({
            createBuffer: (/** @type {GPUBufferDescriptor} */ { size }) => ({
                size,
                destroy: vi.fn(),
            }),
            queue: { writeBuffer: vi.fn() },
        })
    );
}

/**
 * Matches the shader's lookup using the storage buffer's full capacity.
 *
 * @param {Uint32Array} table
 * @param {number} key
 */
function contains(table, key) {
    const capacity = table.length / 2;
    const mask = capacity - 1;
    let index = hash32(key) & mask;
    for (let probe = 0; probe < capacity; probe += 1) {
        const entryKey = table[index * 2];
        if (entryKey === key) {
            return true;
        }
        if (entryKey === HASH_EMPTY_KEY) {
            return false;
        }
        index = (index + 1) & mask;
    }
    return false;
}

describe("SelectionResourceManager", () => {
    it("discovers visibility-only and shared interval selections", () => {
        const visibleWhen =
            /** @type {import("../../../index.d.ts").VisibilityPredicate} */ ({
                selection: "brush",
                type: "interval",
                targets: [{ input: "x" }],
            });
        const manager = new SelectionResourceManager({
            device: createDevice(),
            channels: makeIntervalChannels([{ input: "x" }]),
            visibleWhen,
            setUniformValue: vi.fn(),
        });

        expect(manager.selectionDefs).toHaveLength(1);
        expect(manager.selectionDefs[0].targets).toEqual([
            { input: "x", hitTest: "intersects", scalarType: "f32" },
        ]);
    });

    it("rejects conflicting visibility-only selection declarations", () => {
        expect(
            () =>
                new SelectionResourceManager({
                    device: createDevice(),
                    channels: makeIntervalChannels([{ input: "x" }]),
                    visibleWhen: {
                        selection: "brush",
                        type: "interval",
                        targets: [{ input: "y" }],
                    },
                    setUniformValue: vi.fn(),
                })
        ).toThrow("must keep the same interval targets");
    });

    it("rejects predicate nodes with multiple union members before discovery", () => {
        expect(
            () =>
                new SelectionResourceManager({
                    device: createDevice(),
                    channels: makeIntervalChannels([{ input: "x" }]),
                    visibleWhen: {
                        selection: "brush",
                        type: "interval",
                        targets: [{ input: "x" }],
                        any: [],
                    },
                    setUniformValue: vi.fn(),
                })
        ).toThrow("exactly one of compare, selection, all, or any");
    });

    it("allocates independently typed fields for an N-target interval", () => {
        const setUniformValue = vi.fn();
        const manager = new SelectionResourceManager({
            device: createDevice(),
            channels: makeIntervalChannels([
                { input: "x" },
                { input: "y" },
                { input: "z" },
            ]),
            setUniformValue,
        });
        const layout =
            /** @type {Array<{ name: string, type: import("../../../types.js").ScalarType, components: 1|2|4 }>} */ ([]);

        manager.addSelectionUniforms(layout);

        expect(layout).toEqual([
            {
                name: intervalSelectionActiveName("brush", 0),
                type: "u32",
                components: 1,
            },
            {
                name: intervalSelectionBoundsName("brush", 0),
                type: "f32",
                components: 2,
            },
            {
                name: intervalSelectionActiveName("brush", 1),
                type: "u32",
                components: 1,
            },
            {
                name: intervalSelectionBoundsName("brush", 1),
                type: "u32",
                components: 2,
            },
            {
                name: intervalSelectionActiveName("brush", 2),
                type: "u32",
                components: 1,
            },
            {
                name: intervalSelectionBoundsName("brush", 2),
                type: "i32",
                components: 2,
            },
        ]);

        const extraBuffers = new Map();
        manager.initializeSelections(extraBuffers);
        expect(setUniformValue).toHaveBeenCalledWith(
            intervalSelectionActiveName("brush", 0),
            0
        );
        expect(setUniformValue).toHaveBeenCalledWith(
            intervalSelectionBoundsName("brush", 2),
            [0, 0]
        );
    });

    it("updates all interval targets atomically without a rebind", () => {
        const setUniformValue = vi.fn();
        const manager = new SelectionResourceManager({
            device: createDevice(),
            channels: makeIntervalChannels([{ input: "x" }, { input: "y" }]),
            setUniformValue,
        });
        manager.addSelectionUniforms([]);
        manager.initializeSelections(new Map());
        setUniformValue.mockClear();

        expect(
            manager.updateSelection(
                "brush",
                {
                    type: "interval",
                    intervals: { x: [4, 1], y: null },
                },
                new Map()
            )
        ).toBe(false);

        expect(setUniformValue).toHaveBeenCalledTimes(4);
        expect(setUniformValue).toHaveBeenCalledWith(
            intervalSelectionActiveName("brush", 0),
            1
        );
        expect(setUniformValue).toHaveBeenCalledWith(
            intervalSelectionBoundsName("brush", 0),
            [4, 1]
        );
        expect(setUniformValue).toHaveBeenCalledWith(
            intervalSelectionActiveName("brush", 1),
            0
        );
    });

    it("rejects invalid interval updates before mutating uniforms", () => {
        const setUniformValue = vi.fn();
        const manager = new SelectionResourceManager({
            device: createDevice(),
            channels: makeIntervalChannels([{ input: "x" }, { input: "y" }]),
            setUniformValue,
        });
        manager.addSelectionUniforms([]);
        manager.initializeSelections(new Map());
        setUniformValue.mockClear();

        expect(() =>
            manager.updateSelection(
                "brush",
                {
                    type: "interval",
                    intervals: { unknown: [0, 1] },
                },
                new Map()
            )
        ).toThrow('cannot update unknown target "unknown"');
        expect(setUniformValue).not.toHaveBeenCalled();

        const invalidUpdate =
            /** @type {import("./selectionResources.js").SelectionUpdate} */ (
                /** @type {unknown} */ ({
                    type: "interval",
                    intervals: { x: [0] },
                })
            );
        expect(() =>
            manager.updateSelection("brush", invalidUpdate, new Map())
        ).toThrow("requires two numeric bounds or null");
        expect(setUniformValue).not.toHaveBeenCalled();
    });

    it("rejects inconsistent duplicate interval declarations", () => {
        const channels = makeIntervalChannels([{ input: "x" }]);
        channels.fill.conditions.push({
            when: {
                selection: "brush",
                type: "interval",
                targets: [{ input: "y" }],
            },
            value: 2,
        });

        expect(
            () =>
                new SelectionResourceManager({
                    device: createDevice(),
                    channels,
                    setUniformValue: vi.fn(),
                })
        ).toThrow("must keep the same interval targets");
    });

    it("rejects unknown and non-scalar interval inputs", () => {
        expect(
            () =>
                new SelectionResourceManager({
                    device: createDevice(),
                    channels: makeIntervalChannels([
                        { input: "x", secondaryInput: "missing" },
                    ]),
                    setUniformValue: vi.fn(),
                })
        ).toThrow('references unknown input "missing"');

        expect(
            () =>
                new SelectionResourceManager({
                    device: createDevice(),
                    channels: makeIntervalChannels([{ input: "vec" }]),
                    setUniformValue: vi.fn(),
                })
        ).toThrow('requires scalar input "vec"');
    });

    it("destroys a superseded multi-selection buffer", () => {
        /** @type {Array<{ size: number, destroy: ReturnType<typeof vi.fn> }>} */
        const buffers = [];
        const device = /** @type {GPUDevice} */ (
            /** @type {unknown} */ ({
                createBuffer: (/** @type {GPUBufferDescriptor} */ { size }) => {
                    const buffer = { size, destroy: vi.fn() };
                    buffers.push(buffer);
                    return buffer;
                },
                queue: { writeBuffer: vi.fn() },
            })
        );
        const manager = new SelectionResourceManager({
            device,
            channels: makeMultiChannels(),
            setUniformValue: vi.fn(),
        });
        const extraBuffers = new Map();
        manager.initializeSelections(extraBuffers);

        const needsRebind = manager.updateSelection(
            "chosen",
            { type: "multi", ids: new Uint32Array([1, 2, 3, 4]) },
            extraBuffers
        );

        expect(needsRebind).toBe(true);
        expect(buffers[0].destroy).toHaveBeenCalledOnce();
        expect(extraBuffers.get(SELECTION_BUFFER_PREFIX + "chosen")).toBe(
            buffers[1]
        );
    });

    it("preserves multi-selection lookup capacity when the selection shrinks", () => {
        /** @type {Array<{ size: number, data: Uint32Array, destroy: ReturnType<typeof vi.fn> }>} */
        const buffers = [];
        const device = /** @type {GPUDevice} */ (
            /** @type {unknown} */ ({
                createBuffer: (/** @type {GPUBufferDescriptor} */ { size }) => {
                    const buffer = {
                        size,
                        data: new Uint32Array(
                            size / Uint32Array.BYTES_PER_ELEMENT
                        ),
                        destroy: vi.fn(),
                    };
                    buffers.push(buffer);
                    return buffer;
                },
                queue: {
                    writeBuffer: (
                        /** @type {{ data: Uint32Array }} */ buffer,
                        /** @type {number} */ offset,
                        /** @type {Uint32Array} */ source
                    ) => {
                        buffer.data.set(
                            source,
                            offset / Uint32Array.BYTES_PER_ELEMENT
                        );
                    },
                },
            })
        );
        const manager = new SelectionResourceManager({
            device,
            channels: makeMultiChannels(),
            setUniformValue: vi.fn(),
        });
        const extraBuffers = new Map();
        manager.initializeSelections(extraBuffers);
        manager.updateSelection(
            "chosen",
            { type: "multi", ids: new Uint32Array([10000, 10001, 10002]) },
            extraBuffers
        );

        expect(
            manager.updateSelection(
                "chosen",
                { type: "multi", ids: new Uint32Array([10000, 10002]) },
                extraBuffers
            )
        ).toBe(false);

        const table = buffers.at(-1).data;
        expect(contains(table, 10000)).toBe(true);
        expect(contains(table, 10001)).toBe(false);
        expect(contains(table, 10002)).toBe(true);
    });
});
