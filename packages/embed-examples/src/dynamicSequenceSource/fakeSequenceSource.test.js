import { expect, test } from "vitest";

import { getFakeSequence } from "./fakeSequenceSource.js";

test("generates repeatable sequence windows", async () => {
    const first = await getFakeSequence("chr3", 100, 120);
    const second = await getFakeSequence("chr3", 100, 120);

    expect(second).toEqual(first);
    expect(first.sequence).toMatch(/^[ACGT]+$/);
    expect(first.sequence).toHaveLength(20);
    expect((await getFakeSequence("chr3", 101, 120)).sequence).toBe(
        first.sequence.slice(1)
    );
});

test("does not produce a visible repeating base pattern", async () => {
    const { sequence } = await getFakeSequence("chr3", 100, 200);

    expect(sequence).not.toMatch(/^(ACGT|CGTA|GTAC|TACG)+$/);
    expect(new Set(sequence).size).toBe(4);
});
