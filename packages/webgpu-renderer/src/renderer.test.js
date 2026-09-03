import { describe, expect, test, vi } from "vitest";

import { Renderer } from "./renderer.js";

describe("Renderer mark definitions", () => {
    test("renders detached targets with target-local globals", async () => {
        const { renderer, pass } = createRendererHarness();
        renderer.format = "bgra8unorm";
        renderer.alphaMode = "premultiplied";
        renderer.device.queue.onSubmittedWorkDone = vi.fn();
        const context = {
            configure: vi.fn(),
            getCurrentTexture: () => ({ createView: vi.fn() }),
            unconfigure: vi.fn(),
        };
        const canvas = /** @type {HTMLCanvasElement} */ (
            /** @type {unknown} */ ({
                width: 300,
                height: 150,
                getContext: vi.fn(() => context),
            })
        );
        const program = createProgram();
        const definition = Object.freeze({
            type: "custom",
            createProgram: vi.fn(() => program),
        });
        const mark = renderer.createMark(definition, { channels: {} });
        const target = renderer.createDetachedTarget(canvas, {
            width: 200,
            height: 100,
            dpr: 1.5,
        });

        target.render({ draws: [{ mark }] });
        await target.onSubmittedWorkDone();

        expect(context.configure).toHaveBeenCalledWith({
            device: renderer.device,
            format: "bgra8unorm",
            alphaMode: "premultiplied",
        });
        expect(pass.setViewport).toHaveBeenCalledWith(0, 0, 300, 150, 0, 1);
        expect(renderer._globalUniformStaging.floats[2]).toBe(1.5);
        expect(renderer._globals).toEqual({ width: 100, height: 50, dpr: 2 });
        expect(renderer._renderFrame).toBeNull();
        expect(
            renderer.device.queue.onSubmittedWorkDone
        ).toHaveBeenCalledOnce();

        target.destroy();
        target.destroy();
        expect(context.unconfigure).toHaveBeenCalledOnce();
        expect(() => target.render()).toThrow("has been destroyed");
    });

    test("notifies the host instead of submitting an implicit frame", () => {
        const { renderer } = createRendererHarness();
        const onInvalidate = vi.fn();
        renderer._onInvalidate = onInvalidate;
        renderer._pickingDirty = false;

        renderer._invalidate();

        expect(onInvalidate).toHaveBeenCalledOnce();
        expect(renderer._pickingDirty).toBe(true);
        expect(renderer.device.queue.submit).not.toHaveBeenCalled();
    });

    test("creates a mark through an imported definition", () => {
        const program = createProgram();
        /** @type {import("./index.d.ts").MarkDefinition<{ channels: Record<string, never> }>} */
        const definition = Object.freeze({
            type: "custom",
            createProgram: vi.fn(() => program),
        });
        const { renderer } = createRendererHarness();
        const config = { channels: {} };

        const handle = renderer.createMark(definition, config, {
            label: "root/points [point]",
        });

        expect(definition.createProgram).toHaveBeenCalledWith(
            renderer,
            config,
            { label: "root/points [point]" }
        );
        expect(handle.markId).toBe(1);
        expect(handle.series).toBe(program.getSlotHandles().series);
        expect(handle.scales).toEqual({});
        expect(renderer._marks.get(handle.markId)).toBe(program);
    });

    test("generates a stable standalone mark label", () => {
        const definition = Object.freeze({
            type: "custom",
            createProgram: vi.fn(() => createProgram()),
        });
        const { renderer } = createRendererHarness();

        renderer.createMark(definition, { channels: {} });

        expect(definition.createProgram).toHaveBeenCalledWith(
            renderer,
            { channels: {} },
            { label: "custom #1" }
        );
    });

    test("retains placement-set identity while replacing and destroying data", () => {
        const { renderer } = createRendererHarness();
        renderer._placementSets = new Map();
        renderer._nextPlacementSetId = 1;
        renderer._placementBindGroupLayout = /** @type {GPUBindGroupLayout} */ (
            /** @type {unknown} */ ({})
        );

        const placements = renderer.createPlacementSet({
            rectangles: new Float32Array([0, 0, 1, 1]),
        });
        const initialBuffer = placements._buffer;

        expect(placements.placementSetId).toBe(1);
        expect(placements.count).toBe(1);
        expect(() =>
            placements.replace({ rectangles: new Float32Array([0, 0, 1]) })
        ).toThrow("four values per entry");

        renderer._renderFrame = /** @type {any} */ ([{}]);
        renderer._pickingFrame = /** @type {any} */ ([{}]);
        placements.replace({
            rectangles: new Float32Array([0, 0, 0.5, 1, 0.5, 0, 0.5, 1]),
        });

        expect(placements.placementSetId).toBe(1);
        expect(placements.count).toBe(2);
        expect(initialBuffer.destroy).toHaveBeenCalledOnce();
        expect(renderer._renderFrame).toBeNull();
        expect(renderer._pickingFrame).toBeNull();

        renderer._pickingDirty = false;
        placements.destroy();
        placements.destroy();
        expect(placements._buffer.destroy).toHaveBeenCalledOnce();
        expect(renderer._placementSets.size).toBe(0);
        expect(renderer._pickingDirty).toBe(true);
        expect(renderer._renderFrame).toBeNull();
        expect(renderer._pickingFrame).toBeNull();
        expect(() =>
            placements.replace({ rectangles: new Float32Array() })
        ).toThrow("destroyed");
    });

    test("uses logical placement count after a set shrinks", () => {
        const { renderer } = createRendererHarness();
        renderer._placementSets = new Map();
        renderer._nextPlacementSetId = 1;
        renderer._placementBindGroupLayout = /** @type {GPUBindGroupLayout} */ (
            /** @type {unknown} */ ({})
        );
        const placements = renderer.createPlacementSet({
            rectangles: new Float32Array([0, 0, 1, 1, 0, 0, 1, 1]),
        });
        const program = Object.assign(createProgram(), {
            _placementIndex:
                /** @type {import("./index.d.ts").MarkConfig["placementIndex"]} */ ({
                    source: "draw",
                }),
        });
        const definition = Object.freeze({
            type: "custom",
            createProgram: vi.fn(() => program),
        });
        const mark = renderer.createMark(definition, { channels: {} });
        const draw = { mark, placement: { set: placements, index: 1 } };

        renderer.renderPicking({ draws: [draw] });
        expect(renderer._pickingFrame).toHaveLength(1);
        placements.replace({
            rectangles: new Float32Array([0, 0, 1, 1]),
        });
        expect(renderer._renderFrame).toBeNull();
        expect(renderer._pickingFrame).toBeNull();
        expect(() => renderer._normalizeDraws([draw])).toThrow(
            "exceeds set count"
        );

        renderer.render({
            draws: [{ mark, placement: { set: placements, index: 0 } }],
        });
        expect(renderer._renderFrame?.[0].placement).toMatchObject({
            bindGroup: placements._bindGroup,
            count: 1,
            index: 0,
        });
    });

    test("accepts a separate ordered pick draw list", () => {
        const { renderer } = createRendererHarness();

        renderer.renderPicking({ draws: [] });

        expect(renderer._pickingFrame).toEqual([]);
    });

    test("serializes concurrent pick readbacks without dropping requests", async () => {
        const { renderer } = createRendererHarness();
        /** @type {[number, number][]} */
        const calls = [];
        /** @type {() => void} */
        let releaseFirst = () => {};
        const firstReadback = new Promise((resolve) => {
            releaseFirst = () => resolve();
        });
        renderer._pickSingle = vi.fn(async (x, y) => {
            calls.push([x, y]);
            if (calls.length === 1) {
                await firstReadback;
            }
            return x + y;
        });

        const first = renderer.pick(1, 2);
        const second = renderer.pick(3, 4);
        const third = renderer.pick(5, 6);

        await Promise.resolve();
        expect(calls).toEqual([[1, 2]]);

        releaseFirst();

        await expect(Promise.all([first, second, third])).resolves.toEqual([
            3, 7, 11,
        ]);
        expect(calls).toEqual([
            [1, 2],
            [3, 4],
            [5, 6],
        ]);
    });

    test("reports device loss once and rejects picks before deferred work starts", async () => {
        const { renderer } = createRendererHarness();
        renderer._pickSingle = vi.fn(async () => 1);
        const first = renderer.pick(1, 2);
        const second = renderer.pick(3, 4);
        const info = /** @type {GPUDeviceLostInfo} */ (
            /** @type {unknown} */ ({ reason: "unknown", message: "gone" })
        );

        renderer._handleDeviceLoss(info);
        const error = renderer._deviceLossError;

        await expect(first).rejects.toBe(error);
        await expect(second).rejects.toBe(error);
        await Promise.resolve();
        expect(renderer._pickSingle).not.toHaveBeenCalled();
        expect(renderer._activePick).toBeNull();
        expect(renderer._pickQueue).toHaveLength(0);
        expect(renderer._onDeviceLoss).toHaveBeenCalledOnce();
        expect(renderer._onDeviceLoss).toHaveBeenCalledWith(info);

        renderer._handleDeviceLoss(info);
        expect(renderer._onDeviceLoss).toHaveBeenCalledOnce();
        expect(() => renderer.render()).toThrow(error);
        expect(() =>
            renderer.createPlacementSet({ rectangles: new Float32Array() })
        ).toThrow(error);
    });

    test("settles an active pick once when loss races GPU readback", async () => {
        const { renderer } = createRendererHarness();
        /** @type {() => void} */
        let release = () => {};
        renderer._pickSingle = vi.fn(
            () =>
                new Promise((resolve) => {
                    release = () => resolve(7);
                })
        );
        const pick = renderer.pick(1, 2);
        await Promise.resolve();

        renderer._handleDeviceLoss(
            /** @type {GPUDeviceLostInfo} */ (
                /** @type {unknown} */ ({ reason: "unknown", message: "" })
            )
        );
        await expect(pick).rejects.toBe(renderer._deviceLossError);

        release();
        await Promise.resolve();
        await Promise.resolve();
        expect(renderer._activePick).toBeNull();
    });

    test("resolves active and queued picks to null on intentional destruction", async () => {
        const { renderer } = createRendererHarness();
        renderer._pickSingle = vi.fn(async () => 1);
        const active = renderer.pick(1, 2);
        const queued = renderer.pick(3, 4);

        renderer.destroy();
        renderer._handleDeviceLoss(
            /** @type {GPUDeviceLostInfo} */ (
                /** @type {unknown} */ ({
                    reason: "destroyed",
                    message: "",
                })
            )
        );

        await expect(active).resolves.toBeNull();
        await expect(queued).resolves.toBeNull();
        expect(renderer._onDeviceLoss).not.toHaveBeenCalled();
    });

    test("destroys cached font resources with the renderer", () => {
        const { renderer } = createRendererHarness();
        const resources = { destroy: vi.fn() };
        renderer._fontResourceCache.set({}, new Map([["font.png", resources]]));

        renderer.destroy();
        renderer.destroy();

        expect(resources.destroy).toHaveBeenCalledOnce();
        expect(renderer._fontResourceCache.size).toBe(0);
    });

    test("draws retained mark occurrences in the requested order", () => {
        const firstProgram = createProgram();
        const secondProgram = createProgram();
        const definition = Object.freeze({
            type: "custom",
            createProgram: vi
                .fn()
                .mockReturnValueOnce(firstProgram)
                .mockReturnValueOnce(secondProgram),
        });
        const { renderer, pass } = createRendererHarness();
        const first = renderer.createMark(definition, { channels: {} });
        const second = renderer.createMark(definition, { channels: {} });

        renderer.render({
            draws: [
                {
                    mark: second,
                    viewport: { x: 50, y: 0, width: 50, height: 50 },
                    scissor: { x: 75, y: 0, width: 25, height: 50 },
                    firstInstance: 2,
                    instanceCount: 3,
                },
                { mark: first },
                { mark: second },
            ],
        });

        expect(secondProgram.draw.mock.invocationCallOrder[0]).toBeLessThan(
            firstProgram.draw.mock.invocationCallOrder[0]
        );
        expect(secondProgram.draw).toHaveBeenCalledTimes(2);
        expect(secondProgram.draw).toHaveBeenNthCalledWith(
            1,
            expect.anything(),
            { firstInstance: 2, instanceCount: 3, sampleCount: 1 }
        );
        expect(pass.setViewport).toHaveBeenNthCalledWith(
            1,
            100,
            0,
            100,
            100,
            0,
            1
        );
        expect(pass.setScissorRect).toHaveBeenNthCalledWith(1, 150, 0, 50, 100);
        expect(pass.setBindGroup).toHaveBeenNthCalledWith(
            3,
            0,
            renderer._globalBindGroup,
            [512]
        );
        expect(renderer._renderFrame?.map((draw) => draw.markId)).toEqual([
            second.markId,
            first.markId,
            second.markId,
        ]);
    });

    test("retains effective state across consecutive placement draws", () => {
        const pipeline = /** @type {GPURenderPipeline} */ ({});
        const markBindGroup = /** @type {GPUBindGroup} */ ({});
        const program = Object.assign(createProgram(), {
            _placementIndex:
                /** @type {import("./index.d.ts").MarkConfig["placementIndex"]} */ ({
                    source: "draw",
                }),
        });
        program.prepareDraw.mockImplementation((state) => {
            state.setPipeline(pipeline);
            state.setBindGroup(1, markBindGroup);
        });
        const definition = Object.freeze({
            type: "custom",
            createProgram: () => program,
        });
        const { renderer, pass } = createRendererHarness();
        renderer._placementBindGroupLayout =
            /** @type {GPUBindGroupLayout} */ ({});
        const placements = renderer.createPlacementSet({
            rectangles: new Float32Array([0, 0, 1, 0.5, 0, 0.5, 1, 0.5]),
        });
        const mark = renderer.createMark(definition, { channels: {} });

        renderer.render({
            draws: [
                { mark, placement: { set: placements, index: 0 } },
                { mark, placement: { set: placements, index: 1 } },
            ],
        });

        expect(pass.setViewport).toHaveBeenCalledOnce();
        expect(pass.setScissorRect).toHaveBeenCalledOnce();
        expect(pass.setPipeline).toHaveBeenCalledOnce();
        expect(
            pass.setBindGroup.mock.calls.filter(([index]) => index === 0)
        ).toEqual([
            [0, renderer._globalBindGroup, [0]],
            [0, renderer._globalBindGroup, [256]],
        ]);
        expect(
            pass.setBindGroup.mock.calls.filter(([index]) => index === 1)
        ).toEqual([[1, markBindGroup]]);
        expect(
            pass.setBindGroup.mock.calls.filter(([index]) => index === 2)
        ).toEqual([[2, placements._bindGroup]]);
        expect(program.draw).toHaveBeenCalledTimes(2);

        renderer.render({
            draws: [{ mark, placement: { set: placements, index: 0 } }],
        });

        expect(pass.setViewport).toHaveBeenCalledTimes(2);
        expect(pass.setScissorRect).toHaveBeenCalledTimes(2);
        expect(pass.setPipeline).toHaveBeenCalledTimes(2);
    });

    test("labels frame encoding resources", () => {
        const { renderer, commandEncoderDescriptors, renderPassDescriptors } =
            createRendererHarness();

        renderer.render({ draws: [] });

        expect(commandEncoderDescriptors).toContainEqual({
            label: "webgpu-renderer: main command encoder",
        });
        expect(renderPassDescriptors[0].label).toBe(
            "webgpu-renderer: main render pass"
        );
    });

    test("destroys evicted textures when frame encoding aborts", () => {
        const { renderer } = createRendererHarness();
        renderer._encodeRenderItems = vi.fn(() => {
            throw new Error("encoding failed");
        });

        expect(() => renderer.render({ draws: [] })).toThrow("encoding failed");

        expect(
            renderer._transientTextures.destroyEvicted
        ).toHaveBeenCalledOnce();
        expect(renderer.device.queue.submit).not.toHaveBeenCalled();
    });

    test("reuses draw-global CPU staging while capacity is unchanged", () => {
        const { renderer } = createRendererHarness();
        const staging = renderer._globalUniformStaging;
        const draw = /** @type {import("./renderer.js").NormalizedDraw} */ ({
            viewport: { x: 2, y: 3, width: 40, height: 30 },
            visibleRange: {
                x1: 4,
                y1: 5,
                x2: 20,
                y2: 25,
                cullX: true,
                cullY: false,
            },
            placement: { index: 7, clipMode: 3, count: 9 },
        });

        renderer._writeDrawGlobals([draw]);
        draw.viewport.width = 50;
        renderer._writeDrawGlobals([draw]);

        expect(renderer._globalUniformStaging).toBe(staging);
        expect(staging.floats[0]).toBe(50);
        expect(Array.from(staging.floats.slice(4, 10))).toEqual([
            4, 5, 20, 25, 1, 0,
        ]);
        expect(Array.from(staging.integers.slice(16, 19))).toEqual([7, 3, 9]);
        expect(renderer.device.queue.writeBuffer).toHaveBeenLastCalledWith(
            renderer._globalUniformBuffer,
            0,
            staging.buffer,
            0,
            renderer._globalUniformStride
        );
    });

    test("clamps physical scissors to the render target", () => {
        const program = createProgram();
        const definition = Object.freeze({
            type: "custom",
            createProgram: vi.fn(() => program),
        });
        const { renderer, pass } = createRendererHarness();
        renderer.canvas = /** @type {HTMLCanvasElement} */ (
            /** @type {unknown} */ ({ width: 99, height: 100 })
        );
        const mark = renderer.createMark(definition, { channels: {} });

        renderer.render({
            draws: [{ mark, scissor: { x: 0, y: 0, width: 100, height: 50 } }],
        });

        expect(pass.setScissorRect).toHaveBeenCalledWith(0, 0, 99, 100);
    });

    test("renders a bounded multisampled group and composites it once", () => {
        const program = createProgram("multisample");
        const definition = Object.freeze({
            type: "custom",
            createProgram: () => program,
        });
        const { renderer, pass, renderPassDescriptors, transientAcquires } =
            createRendererHarness();
        const mark = renderer.createMark(definition, { channels: {} });

        renderer.render({
            items: [
                {
                    bounds: { x: 10, y: 5, width: 20, height: 10 },
                    opacity: 0.5,
                    items: [
                        {
                            mark,
                            viewport: {
                                x: 10,
                                y: 5,
                                width: 20,
                                height: 10,
                            },
                            scissor: {
                                x: 10,
                                y: 5,
                                width: 20,
                                height: 10,
                            },
                        },
                    ],
                },
            ],
        });

        expect(program.draw).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ sampleCount: 4 })
        );
        expect(transientAcquires).toEqual([
            expect.objectContaining({ width: 40, height: 20, sampleCount: 1 }),
            expect.objectContaining({ width: 40, height: 20, sampleCount: 4 }),
        ]);
        expect(renderPassDescriptors).toHaveLength(2);
        expect(
            Array.from(renderPassDescriptors[0].colorAttachments)[0]
                .resolveTarget
        ).toBeDefined();
        expect(renderPassDescriptors[1].label).toBe(
            "webgpu-renderer: group composite pass"
        );
        expect(pass.setViewport).toHaveBeenNthCalledWith(1, 0, 0, 40, 20, 0, 1);
        expect(pass.setScissorRect).toHaveBeenNthCalledWith(1, 0, 0, 40, 20);
        expect(pass.setViewport).toHaveBeenNthCalledWith(
            2,
            20,
            10,
            40,
            20,
            0,
            1
        );
        expect(renderer._renderFrame).toHaveLength(1);

        renderer.renderPicking();
        expect(renderer._pickingFrame).toBe(renderer._renderFrame);
    });

    test("clamps opaque nested MSAA groups into one accumulation pass", () => {
        const program = createProgram("multisample");
        const definition = Object.freeze({
            type: "custom",
            createProgram: () => program,
        });
        const { renderer, renderPassDescriptors, transientAcquires } =
            createRendererHarness();
        const first = renderer.createMark(definition, { channels: {} });
        const second = renderer.createMark(definition, { channels: {} });
        const bounds = { x: 0, y: 0, width: 100, height: 50 };

        renderer.render({
            items: [
                {
                    bounds,
                    items: [
                        {
                            bounds,
                            opacity: 2,
                            items: [{ mark: first }],
                        },
                        {
                            bounds,
                            opacity: 2,
                            items: [{ mark: second }],
                        },
                    ],
                },
            ],
        });

        expect(transientAcquires).toEqual([
            expect.objectContaining({ sampleCount: 1 }),
            expect.objectContaining({ sampleCount: 4 }),
        ]);
        expect(renderPassDescriptors).toHaveLength(2);
        expect(program.draw).toHaveBeenCalledTimes(2);
    });

    test("batches consecutive flat MSAA draws without reordering", () => {
        const firstProgram = createProgram("multisample");
        const middleProgram = createProgram();
        const lastProgram = createProgram("multisample");
        const definition = Object.freeze({
            type: "custom",
            createProgram: vi
                .fn()
                .mockReturnValueOnce(firstProgram)
                .mockReturnValueOnce(middleProgram)
                .mockReturnValueOnce(lastProgram),
        });
        const { renderer, renderPassDescriptors } = createRendererHarness();
        const first = renderer.createMark(definition, { channels: {} });
        const middle = renderer.createMark(definition, { channels: {} });
        const last = renderer.createMark(definition, { channels: {} });

        renderer.render({
            items: [{ mark: first }, { mark: middle }, { mark: last }],
        });

        expect(renderPassDescriptors.map((pass) => pass.label)).toEqual([
            "webgpu-renderer: multisample group pass",
            "webgpu-renderer: group composite pass",
            "webgpu-renderer: main render pass",
            "webgpu-renderer: multisample group pass",
            "webgpu-renderer: group composite pass",
        ]);
        expect(firstProgram.draw.mock.invocationCallOrder[0]).toBeLessThan(
            middleProgram.draw.mock.invocationCallOrder[0]
        );
        expect(middleProgram.draw.mock.invocationCallOrder[0]).toBeLessThan(
            lastProgram.draw.mock.invocationCallOrder[0]
        );
    });

    test("keeps a mixed semantic scope single-sampled around its MSAA child", () => {
        const exonProgram = createProgram("multisample");
        const bodyProgram = createProgram();
        const definition = Object.freeze({
            type: "custom",
            createProgram: vi
                .fn()
                .mockReturnValueOnce(exonProgram)
                .mockReturnValueOnce(bodyProgram),
        });
        const { renderer, renderPassDescriptors, transientAcquires } =
            createRendererHarness();
        const exon = renderer.createMark(definition, { channels: {} });
        const body = renderer.createMark(definition, { channels: {} });
        const bounds = { x: 0, y: 0, width: 100, height: 50 };

        renderer.render({
            items: [
                {
                    bounds,
                    opacity: 0.5,
                    items: [{ mark: exon }, { mark: body }],
                },
            ],
        });

        expect(transientAcquires).toEqual([
            expect.objectContaining({ sampleCount: 1 }),
            expect.objectContaining({ sampleCount: 1 }),
            expect.objectContaining({ sampleCount: 4 }),
        ]);
        expect(renderPassDescriptors.map((pass) => pass.label)).toEqual([
            "webgpu-renderer: multisample group pass",
            "webgpu-renderer: group composite pass",
            "webgpu-renderer: main render pass",
            "webgpu-renderer: group composite pass",
        ]);
        expect(exonProgram.draw).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ sampleCount: 4 })
        );
        expect(bodyProgram.draw).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ sampleCount: 1 })
        );
    });

    test("clips inferred MSAA children to an opaque semantic scope", () => {
        const coverageProgram = createProgram("multisample");
        const directProgram = createProgram();
        const definition = Object.freeze({
            type: "custom",
            createProgram: vi
                .fn()
                .mockReturnValueOnce(coverageProgram)
                .mockReturnValueOnce(directProgram),
        });
        const { renderer, pass, transientAcquires } = createRendererHarness();
        const coverage = renderer.createMark(definition, { channels: {} });
        const direct = renderer.createMark(definition, { channels: {} });

        renderer.render({
            items: [
                {
                    bounds: { x: 10, y: 5, width: 20, height: 10 },
                    items: [{ mark: coverage }, { mark: direct }],
                },
            ],
        });

        expect(transientAcquires).toEqual([
            expect.objectContaining({ width: 40, height: 20, sampleCount: 1 }),
            expect.objectContaining({ width: 40, height: 20, sampleCount: 4 }),
        ]);
        expect(pass.setScissorRect).toHaveBeenNthCalledWith(1, 0, 0, 40, 20);
        expect(pass.setScissorRect).toHaveBeenNthCalledWith(3, 0, 0, 200, 100);
    });

    test("preserves draw order across nested opacity groups", () => {
        const firstProgram = createProgram();
        const nestedProgram = createProgram();
        const lastProgram = createProgram();
        const definition = Object.freeze({
            type: "custom",
            createProgram: vi
                .fn()
                .mockReturnValueOnce(firstProgram)
                .mockReturnValueOnce(nestedProgram)
                .mockReturnValueOnce(lastProgram),
        });
        const { renderer } = createRendererHarness();
        const first = renderer.createMark(definition, { channels: {} });
        const nested = renderer.createMark(definition, { channels: {} });
        const last = renderer.createMark(definition, { channels: {} });
        const bounds = { x: 0, y: 0, width: 100, height: 50 };

        renderer.render({
            items: [
                {
                    bounds,
                    opacity: 0.5,
                    items: [
                        { mark: first },
                        {
                            bounds,
                            opacity: 0.5,
                            items: [{ mark: nested }],
                        },
                        { mark: last },
                    ],
                },
            ],
        });

        expect(firstProgram.draw.mock.invocationCallOrder[0]).toBeLessThan(
            nestedProgram.draw.mock.invocationCallOrder[0]
        );
        expect(nestedProgram.draw.mock.invocationCallOrder[0]).toBeLessThan(
            lastProgram.draw.mock.invocationCallOrder[0]
        );
    });

    test("clamps negative-opacity groups before normalizing their draws", () => {
        const program = createProgram();
        const definition = Object.freeze({
            type: "custom",
            createProgram: () => program,
        });
        const { renderer, transientAcquires } = createRendererHarness();
        const mark = renderer.createMark(definition, { channels: {} });

        renderer.render({
            items: [
                {
                    bounds: { x: 0, y: 0, width: 100, height: 50 },
                    opacity: -1,
                    items: [{ mark }],
                },
            ],
        });

        expect(renderer._renderFrame).toEqual([]);
        expect(program.draw).not.toHaveBeenCalled();
        expect(transientAcquires).toEqual([]);
    });

    test("ignores empty scope bounds before normalizing their draws", () => {
        const program = createProgram("multisample");
        const definition = Object.freeze({
            type: "custom",
            createProgram: () => program,
        });
        const { renderer, transientAcquires } = createRendererHarness();
        const mark = renderer.createMark(definition, { channels: {} });

        renderer.render({
            items: [
                {
                    bounds: { x: 0, y: 0, width: 100, height: 0 },
                    items: [{ mark }],
                },
            ],
        });

        expect(renderer._renderFrame).toEqual([]);
        expect(program.draw).not.toHaveBeenCalled();
        expect(transientAcquires).toEqual([]);
    });

    test("clips nested groups to their parent before compositing", () => {
        const program = createProgram();
        const definition = Object.freeze({
            type: "custom",
            createProgram: () => program,
        });
        const { renderer, pass, transientAcquires } = createRendererHarness();
        const mark = renderer.createMark(definition, { channels: {} });

        renderer.render({
            items: [
                {
                    bounds: { x: 20, y: 10, width: 40, height: 20 },
                    opacity: 0.5,
                    items: [
                        {
                            bounds: { x: 10, y: 5, width: 30, height: 20 },
                            opacity: 0.5,
                            items: [{ mark }],
                        },
                    ],
                },
            ],
        });

        expect(transientAcquires).toEqual([
            expect.objectContaining({ width: 80, height: 40 }),
            expect.objectContaining({ width: 40, height: 30 }),
        ]);
        expect(pass.setScissorRect.mock.calls).toEqual([
            [0, 0, 40, 30],
            [0, 0, 40, 30],
            [40, 20, 80, 40],
        ]);
    });

    test("keeps ordinary frames on the direct single-sample path", () => {
        const program = createProgram();
        const definition = Object.freeze({
            type: "custom",
            createProgram: () => program,
        });
        const { renderer, renderPassDescriptors, transientAcquires } =
            createRendererHarness();
        const mark = renderer.createMark(definition, { channels: {} });

        renderer.render({ items: [{ mark }] });

        expect(transientAcquires).toEqual([]);
        expect(renderPassDescriptors).toHaveLength(1);
        expect(program.draw).toHaveBeenCalledWith(expect.anything(), {
            firstInstance: 0,
            instanceCount: 10,
            sampleCount: 1,
        });
    });

    test("rejects NaN render-scope opacity", () => {
        const { renderer } = createRendererHarness();
        expect(() =>
            renderer.render({
                items: [
                    {
                        bounds: { x: 0, y: 0, width: 10, height: 10 },
                        opacity: NaN,
                        items: [],
                    },
                ],
            })
        ).toThrow("opacity must be a number");
    });

    test("skips zero-sized scissors from empty clipped views", () => {
        const { renderer } = createRendererHarness();
        const program = createProgram();
        const definition = Object.freeze({
            type: "custom",
            createProgram: vi.fn(() => program),
        });
        const mark = renderer.createMark(definition, { channels: {} });

        expect(
            renderer._normalizeDraws([
                { mark, scissor: { x: 0, y: 0, width: 0, height: 50 } },
            ])
        ).toEqual([]);
    });

    test("normalizes grouped leaves directly with compact uniform indices", () => {
        const { renderer } = createRendererHarness();
        const definition = Object.freeze({
            type: "custom",
            createProgram: () => createProgram(),
        });
        const skipped = renderer.createMark(definition, { channels: {} });
        const visible = renderer.createMark(definition, { channels: {} });
        const normalizeDraws = vi.spyOn(renderer, "_normalizeDraws");

        const frame = renderer._normalizeRenderItems([
            {
                bounds: { x: 0, y: 0, width: 100, height: 50 },
                opacity: 0.5,
                items: [
                    {
                        mark: skipped,
                        scissor: { x: 0, y: 0, width: 0, height: 50 },
                    },
                    { mark: visible },
                ],
            },
        ]);

        expect(normalizeDraws).not.toHaveBeenCalled();
        expect(frame.draws).toHaveLength(1);
        expect(frame.draws[0].uniformIndex).toBe(0);
    });

    test("destroys owned resources exactly once and rejects later work", () => {
        const firstProgram = createProgram();
        const secondProgram = createProgram();
        const definition = Object.freeze({
            type: "custom",
            createProgram: vi
                .fn()
                .mockReturnValueOnce(firstProgram)
                .mockReturnValueOnce(secondProgram),
        });
        const { renderer } = createRendererHarness();
        renderer.createMark(definition, { channels: {} });
        renderer.createMark(definition, { channels: {} });
        const pickTexture =
            /** @type {GPUTexture & { destroy: ReturnType<typeof vi.fn> }} */ (
                /** @type {unknown} */ ({ destroy: vi.fn() })
            );
        const pickReadbackBuffer =
            /** @type {GPUBuffer & { destroy: ReturnType<typeof vi.fn> }} */ (
                /** @type {unknown} */ ({ destroy: vi.fn() })
            );
        renderer._pickTexture = pickTexture;
        renderer._pickReadbackBuffer = pickReadbackBuffer;

        renderer.destroy();
        renderer.destroy();

        expect(firstProgram.destroy).toHaveBeenCalledOnce();
        expect(secondProgram.destroy).toHaveBeenCalledOnce();
        expect(renderer._marks).toHaveLength(0);
        expect(renderer._globalUniformBuffer.destroy).toHaveBeenCalledOnce();
        expect(pickTexture.destroy).toHaveBeenCalledOnce();
        expect(pickReadbackBuffer.destroy).toHaveBeenCalledOnce();
        expect(renderer.context.unconfigure).toHaveBeenCalledOnce();
        expect(renderer.device.destroy).toHaveBeenCalledOnce();
        expect(() => renderer.render()).toThrow("Renderer has been destroyed.");
        expect(() => renderer.createMark(definition, { channels: {} })).toThrow(
            "Renderer has been destroyed."
        );
    });
});

function createRendererHarness() {
    const renderer = Object.create(Renderer.prototype);
    renderer._marks = new Map();
    renderer._placementSets = new Map();
    renderer._detachedTargets = new Set();
    renderer._fontResourceCache = new Map();
    renderer._nextMarkId = 1;
    renderer._state = "alive";
    renderer._deviceLossError = null;
    renderer._onDeviceLoss = vi.fn();
    renderer._onInvalidate = vi.fn();
    renderer._pickingDirty = false;
    renderer._pickQueue = [];
    renderer._activePick = null;
    renderer._renderFrame = null;
    renderer._pickingFrame = null;
    renderer.canvas = /** @type {HTMLCanvasElement} */ (
        /** @type {unknown} */ ({ width: 200, height: 100 })
    );
    renderer._globals = { width: 100, height: 50, dpr: 2 };
    renderer._globalUniformStride = 256;
    renderer._globalUniformCapacity = 4;
    renderer._globalUniformBuffer = { destroy: vi.fn() };
    const globalUniformData = new ArrayBuffer(
        renderer._globalUniformCapacity * renderer._globalUniformStride
    );
    renderer._globalUniformStaging = {
        buffer: globalUniformData,
        floats: new Float32Array(globalUniformData),
        integers: new Uint32Array(globalUniformData),
    };
    renderer._globalBindGroup = {};
    const pass = {
        draw: vi.fn(),
        end: vi.fn(),
        setPipeline: vi.fn(),
        setViewport: vi.fn(),
        setScissorRect: vi.fn(),
        setBindGroup: vi.fn(),
    };
    /** @type {GPUCommandEncoderDescriptor[]} */
    const commandEncoderDescriptors = [];
    /** @type {GPURenderPassDescriptor[]} */
    const renderPassDescriptors = [];
    renderer.device = {
        createBuffer: (/** @type {GPUBufferDescriptor} */ { size }) => ({
            size,
            destroy: vi.fn(),
        }),
        createBindGroup: vi.fn(() => ({})),
        createCommandEncoder: (descriptor = {}) => {
            commandEncoderDescriptors.push(descriptor);
            return {
                beginRenderPass: (
                    /** @type {GPURenderPassDescriptor} */ descriptor
                ) => {
                    renderPassDescriptors.push(descriptor);
                    return pass;
                },
                finish: vi.fn(),
            };
        },
        queue: { submit: vi.fn(), writeBuffer: vi.fn() },
        destroy: vi.fn(),
    };
    renderer.context = {
        getCurrentTexture: () => ({ createView: vi.fn() }),
        unconfigure: vi.fn(),
    };
    /** @type {{width: number, height: number, sampleCount: number, usage: number}[]} */
    const transientAcquires = [];
    let transientId = 0;
    renderer._textureCompositor = {
        prepare: vi.fn(),
        flush: vi.fn(),
        destroy: vi.fn(),
        pipeline: {},
        createBinding: vi.fn(() => ({})),
    };
    renderer._transientTextures = {
        acquire: vi.fn((width, height, sampleCount, usage) => {
            transientAcquires.push({ width, height, sampleCount, usage });
            return {
                key: `texture-${transientId++}`,
                texture: {},
                view: {},
                cost: width * height * sampleCount,
            };
        }),
        release: vi.fn(),
        destroyEvicted: vi.fn(),
        destroy: vi.fn(),
    };
    return {
        renderer: /** @type {Renderer} */ (renderer),
        pass,
        commandEncoderDescriptors,
        renderPassDescriptors,
        transientAcquires,
    };
}

/** @param {"shader" | "multisample"} [antialiasing] */
function createProgram(antialiasing = "shader") {
    const series = { replace: vi.fn() };
    return {
        antialiasing,
        count: 10,
        drawCount: 10,
        /**
         * @param {number} firstInstance
         * @param {number} instanceCount
         */
        resolveDrawRange: (firstInstance, instanceCount) => ({
            firstInstance,
            instanceCount,
        }),
        getSlotHandles: () => ({
            batchUpdates: vi.fn((update) => update()),
            series,
            scales: {},
            values: {},
            properties: {},
            extraValues: {},
            scalarSlots: {},
            selections: {},
        }),
        replaceSeries: series.replace,
        updateValues: vi.fn(),
        debugResources: vi.fn(),
        prepareDraw: vi.fn(),
        preparePick: vi.fn(),
        draw: vi.fn(),
        drawPick: vi.fn(),
        destroy: vi.fn(),
    };
}
