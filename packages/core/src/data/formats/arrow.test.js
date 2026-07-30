import { tableFromArrays, tableToIPC } from "@uwdata/flechette";
import { expect, test } from "vitest";
import arrow from "./arrow.js";

const columns = {
    sample: ["S1", "S2", "S3"],
    value: [1.5, null, 3.5],
    selected: [true, false, true],
};

test.each(/** @type {("file" | "stream")[]} */ (["file", "stream"]))(
    "parses Arrow IPC %s data",
    async (format) => {
        const ipc = tableToIPC(tableFromArrays(columns), { format });

        expect(await arrow(ipc)).toEqual([
            { sample: "S1", value: 1.5, selected: true },
            { sample: "S2", value: null, selected: false },
            { sample: "S3", value: 3.5, selected: true },
        ]);
    }
);

test("materializes mutable, enumerable row objects", async () => {
    const ipc = tableToIPC(tableFromArrays(columns), { format: "file" });
    const [row] = await arrow(ipc);

    row.derived = 42;

    expect(Object.keys(row)).toEqual([
        "sample",
        "value",
        "selected",
        "derived",
    ]);
    expect(structuredClone(row)).toEqual({
        sample: "S1",
        value: 1.5,
        selected: true,
        derived: 42,
    });
});

test("requests binary response data", () => {
    expect(arrow.responseType).toBe("arrayBuffer");
});
