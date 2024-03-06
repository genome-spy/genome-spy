import { describe, expect, test } from "vitest";
import Collector from "../collector.js";
import SequenceSource from "./sequenceSource.js";
import { makeParamMediatorProvider } from "../flowTestUtils.js";

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
    const viewStub = /** @type {any} */ (makeParamMediatorProvider());

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
