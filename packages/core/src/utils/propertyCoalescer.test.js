import { expect, test } from "vitest";
import coalesceProperties from "./propertyCoalescer.js";

test("CoalesceProperties works as expected", () => {
    const defaults = { a: 10, b: 11 };
    const props = { a: 1, c: 2 };

    const coalesced = coalesceProperties(
        () => props,
        // @ts-expect-error
        () => defaults
    );

    expect(coalesced.a).toEqual(1);
    // @ts-expect-error
    expect(coalesced.b).toEqual(11);
    expect(coalesced.c).toEqual(2);
    // @ts-expect-error
    expect(coalesced.undef).toBeUndefined();

    expect("a" in coalesced).toBeTruthy();
    expect("b" in coalesced).toBeTruthy();
    expect("c" in coalesced).toBeTruthy();
    expect("undef" in coalesced).toBeFalsy();
});
