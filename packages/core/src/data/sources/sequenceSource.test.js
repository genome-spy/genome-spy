import { describe, expect, test, vi } from "vitest";
import Collector from "../collector.js";
import SequenceSource from "./sequenceSource.js";
import { makeParamRuntimeProvider } from "../flowTestUtils.js";

/**
 * @param {SequenceSource} source
 */
async function collectSource(source) {
    const collector = new Collector();
    source.addChild(collector);

    await source.load();

    return [...collector.getData()];
}

describe("SequenceSource", () => {
    /** @type {import("../../view/view.js").default} */
    const viewStub = /** @type {any} */ (makeParamRuntimeProvider());

    test("generates a sequence", () =>
        expect(
            collectSource(
                new SequenceSource(
                    { sequence: { start: 0, stop: 3 } },
                    viewStub
                )
            )
        ).resolves.toEqual([{ data: 0 }, { data: 1 }, { data: 2 }]));

    test("generates a sequence with a custom step", () =>
        expect(
            collectSource(
                new SequenceSource(
                    { sequence: { start: 0, stop: 5, step: 2 } },
                    viewStub
                )
            )
        ).resolves.toEqual([{ data: 0 }, { data: 2 }, { data: 4 }]));

    test("generates a sequence with a custom field name", () =>
        expect(
            collectSource(
                new SequenceSource(
                    { sequence: { start: 0, stop: 3, as: "x" } },
                    viewStub
                )
            )
        ).resolves.toEqual([{ x: 0 }, { x: 1 }, { x: 2 }]));

    test("accepts ExprRef parameters", async () =>
        expect(
            collectSource(
                new SequenceSource(
                    {
                        sequence: {
                            start: { expr: "0" },
                            stop: { expr: "1 + 2" },
                            step: { expr: "1" },
                            as: "x",
                        },
                    },
                    viewStub
                )
            )
            // TODO: Test that the sequence is regenerated when the parameters change
        ).resolves.toEqual([{ x: 0 }, { x: 1 }, { x: 2 }]));

    test("reloads once with final values from a transaction", async () => {
        const view = /** @type {any} */ (makeParamRuntimeProvider());
        const setStart = view.paramRuntime.registerParam({
            name: "start",
            value: 0,
        });
        const setStop = view.paramRuntime.registerParam({
            name: "stop",
            value: 4,
        });
        const setStep = view.paramRuntime.registerParam({
            name: "step",
            value: 1,
        });
        const source = new SequenceSource(
            {
                sequence: {
                    start: { expr: "start" },
                    stop: { expr: "stop" },
                    step: { expr: "step" },
                },
            },
            view
        );
        const collector = new Collector();
        source.addChild(collector);
        source.loadSynchronously();
        const load = vi.spyOn(source, "loadSynchronously");

        view.paramRuntime.runInTransaction(() => {
            setStart(2);
            setStop(9);
            setStep(3);
        });
        await view.paramRuntime.whenPropagated();

        expect(load).toHaveBeenCalledOnce();
        expect(collector.getData()).toEqual([
            { data: 2 },
            { data: 5 },
            { data: 8 },
        ]);
    });

    test("does not reload when the effective value is unchanged", () => {
        const view = /** @type {any} */ (makeParamRuntimeProvider());
        const setStop = view.paramRuntime.registerParam({
            name: "stop",
            value: 3.1,
        });
        const source = new SequenceSource(
            { sequence: { start: 0, stop: { expr: "floor(stop)" } } },
            view
        );
        const load = vi.spyOn(source, "loadSynchronously");

        setStop(3.2);

        expect(load).not.toHaveBeenCalled();
    });

    test("throws on missing 'start' parameter", () =>
        expect(
            // @ts-expect-error
            () => new SequenceSource({ sequence: { stop: 3 } }, viewStub)
        ).toThrow());

    test("throws on missing 'stop' parameter", () =>
        expect(
            // @ts-expect-error
            () => new SequenceSource({ sequence: { start: 0 } }, viewStub)
        ).toThrow());
});
