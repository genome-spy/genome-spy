import { expect, test } from "vitest";
import parquet from "./parquet.js";
import { parquetExpectedRows, parquetFixture } from "./parquetTestData.js";

test("parses an in-memory Parquet file", async () => {
    expect(await parquet(parquetFixture)).toEqual(parquetExpectedRows);
});

test("reads only the addressed bytes of an offset view", async () => {
    const padding = 11;
    const padded = new Uint8Array(
        padding + parquetFixture.byteLength + padding
    );
    padded.set(parquetFixture, padding);

    expect(
        await parquet(
            new Uint8Array(padded.buffer, padding, parquetFixture.byteLength)
        )
    ).toEqual(parquetExpectedRows);
});
