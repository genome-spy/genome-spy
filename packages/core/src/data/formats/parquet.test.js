import { expect, test } from "vitest";
import parquet from "./parquet.js";

// Small deterministic, uncompressed Parquet file with two rows.
const fixture = Uint8Array.from(
    atob(
        "UEFSMRUAFSQVJCwVBBUAFQYVBgAAAgAAAAQBAgAAAFMxAgAAAFMyFQAVHBUc" +
            "LBUEFQAVBhUGAAACAAAABAEKAAAAFAAAABUCGTw1ABgNZHVja2RiX3NjaGVt" +
            "YRUEABUMJQIYBnNhbXBsZSUAABUCJQIYBXZhbHVlJSIAFgQZHBksJgAcFQwZ" +
            "FQAZGAZzYW1wbGUVABYEFkYWRiYIPBgCUzIYAlMxFgAoAlMyGAJTMRERAAAA" +
            "JgAcFQIZFQAZGAV2YWx1ZRUAFgQWPhY+Jk48GAQUAAAAGAQKAAAAFgAoBBQA" +
            "AAAYBAoAAAAREQAAABaEARYEJggWhAEAKChEdWNrREIgdmVyc2lvbiB2MS41" +
            "LjAgKGJ1aWxkIDNhMzk2N2FhODEpGSwcAAAcAAAA5gAAAFBBUjE="
    ),
    (character) => character.charCodeAt(0)
);

const expectedRows = [
    { sample: "S1", value: 10 },
    { sample: "S2", value: 20 },
];

test("parses an in-memory Parquet file", async () => {
    expect(await parquet(fixture)).toEqual(expectedRows);
});

test("reads only the addressed bytes of an offset view", async () => {
    const padding = 11;
    const padded = new Uint8Array(padding + fixture.byteLength + padding);
    padded.set(fixture, padding);

    expect(
        await parquet(
            new Uint8Array(padded.buffer, padding, fixture.byteLength)
        )
    ).toEqual(expectedRows);
});
