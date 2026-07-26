import { describe, expect, test } from "vitest";
import {
    addUploadedDatasets,
    findMissingNamedData,
} from "./uploadedDatasets.js";

describe("uploaded datasets", () => {
    test("adds uploaded files without overriding authored datasets", () => {
        const authoredRows = [{ value: "authored" }];
        const uploadedRows = [{ value: "uploaded" }];
        const otherRows = [{ value: "other" }];
        /** @type {import("@genome-spy/core/spec/root.js").RootSpec} */
        const spec = {
            mark: "point",
            datasets: {
                results: authoredRows,
            },
        };

        addUploadedDatasets(spec, {
            results: { data: uploadedRows },
            "other.csv": { data: otherRows },
        });

        expect(spec.datasets).toEqual({
            results: authoredRows,
            "other.csv": otherRows,
        });
    });

    test("finds unresolved view and lookup data references", () => {
        const spec = {
            datasets: {
                declared: /** @type {any[]} */ ([]),
            },
            layer: [
                { data: { name: "uploaded.csv" } },
                { data: { name: "missing.csv" } },
                {
                    data: {
                        name: "declared",
                        transform: [
                            {
                                type: "lookup",
                                from: { name: "lookup.csv" },
                                key: "id",
                                fields: ["id"],
                            },
                        ],
                    },
                },
            ],
        };

        const missing = findMissingNamedData(spec, {
            "uploaded.csv": { data: [] },
        });

        expect(missing).toEqual(new Set(["missing.csv", "lookup.csv"]));
    });

    test("does not interpret inline rows as specification fragments", () => {
        const spec = {
            data: {
                values: [{ data: { name: "a datum field" } }],
            },
        };

        expect(findMissingNamedData(spec, {})).toEqual(new Set());
    });
});
