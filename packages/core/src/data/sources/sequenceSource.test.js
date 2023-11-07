import { expect, test } from "vitest";
import Collector from "../collector.js";
import SequenceSource from "./sequenceSource.js";

/**
 * @param {SequenceSource} source
 */
async function collectSource(source) {
    const collector = new Collector();
    source.addChild(collector);

    await source.load();

    return [...collector.getData()];
}

test("SequenceSource generates a sequence", async () => {
    expect(
        await collectSource(
            new SequenceSource({ sequence: { start: 0, stop: 3 } })
        )
    ).toEqual([{ data: 0 }, { data: 1 }, { data: 2 }]);
});

test("SequenceSource generates a sequence with a custom step", async () => {
    expect(
        await collectSource(
            new SequenceSource({ sequence: { start: 0, stop: 5, step: 2 } })
        )
    ).toEqual([{ data: 0 }, { data: 2 }, { data: 4 }]);
});

test("SequenceSource generates a sequence with a custom field name", async () => {
    expect(
        await collectSource(
            new SequenceSource({ sequence: { start: 0, stop: 3, as: "x" } })
        )
    ).toEqual([{ x: 0 }, { x: 1 }, { x: 2 }]);
});

test("SequenceSource throws on missing 'start' parameter", () => {
    expect(() => new SequenceSource({ sequence: { stop: 3 } })).toThrow();
});
test("SequenceSource throws on missing 'stop' parameter", () => {
    expect(() => new SequenceSource({ sequence: { start: 0 } })).toThrow();
});
