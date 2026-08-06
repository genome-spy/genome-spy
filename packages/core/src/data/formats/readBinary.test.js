import { tableFromArrays, tableToIPC } from "@uwdata/flechette";
import { expect, test } from "vitest";
import "./arrow.js";
import { readBinaryData } from "./readBinary.js";

test("normalizes an offset DataView for the registered reader", async () => {
    const ipc = tableToIPC(
        tableFromArrays({ sample: ["S1", "S2"], value: [10, 20] }),
        { format: "stream" }
    );
    const padding = 17;
    const padded = new Uint8Array(padding + ipc.byteLength + padding);
    padded.set(ipc, padding);
    const view = new DataView(padded.buffer, padding, ipc.byteLength);

    await expect(readBinaryData(view, { type: "arrow" })).resolves.toEqual([
        { sample: "S1", value: 10 },
        { sample: "S2", value: 20 },
    ]);
});

test("rejects unsupported binary formats", async () => {
    await expect(
        readBinaryData(new ArrayBuffer(0), /** @type {any} */ ({ type: "csv" }))
    ).rejects.toThrow("Unsupported binary data format: csv");
});

test("rejects non-buffer inputs", async () => {
    await expect(
        readBinaryData(/** @type {any} */ ("not binary"), { type: "arrow" })
    ).rejects.toThrow("ArrayBuffer or ArrayBufferView");
});
