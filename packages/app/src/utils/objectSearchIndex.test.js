import { describe, expect, it } from "vitest";
import ObjectSearchIndex from "./objectSearchIndex.js";

describe("ObjectSearchIndex", () => {
    it("sorts objects by key case-insensitively and returns prefix matches", () => {
        const index = new ObjectSearchIndex(
            [
                { id: "beta" },
                { id: "Alpine" },
                { id: "alphabet" },
                { id: "Alpha" },
            ],
            (item) => item.id
        );

        const results = Array.from(
            index.searchByPrefix("alp"),
            (item) => item.id
        );
        expect(results).toEqual(["Alpha", "alphabet", "Alpine"]);
    });

    it("finds first match with binary lower-bound semantics", () => {
        // Non-obvious setup: prefix "br" must skip "alpha*" entries efficiently.
        const index = new ObjectSearchIndex(
            [
                { id: "alpha" },
                { id: "alphabet" },
                { id: "bravo" },
                { id: "brisk" },
                { id: "charlie" },
            ],
            (item) => item.id
        );

        const results = Array.from(
            index.searchByPrefix("br"),
            (item) => item.id
        );
        expect(results).toEqual(["bravo", "brisk"]);
    });

    it("supports replacing backing array", () => {
        const index = new ObjectSearchIndex(
            [{ id: "alpha" }],
            (item) => item.id
        );

        index.replace([{ id: "zeta" }, { id: "beta" }]);
        const results = Array.from(
            index.searchByPrefix("b"),
            (item) => item.id
        );

        expect(results).toEqual(["beta"]);
    });

    it("returns an iterator/generator", () => {
        const index = new ObjectSearchIndex(
            [{ id: "alpha" }],
            (item) => item.id
        );
        const iterator = index.searchByPrefix("a");
        expect(typeof iterator.next).toBe("function");
        expect(typeof iterator[Symbol.iterator]).toBe("function");
    });

    it("keeps iterator results stable when index is replaced mid-iteration", () => {
        const index = new ObjectSearchIndex(
            [{ id: "alpha" }, { id: "alpine" }, { id: "alps" }, { id: "beta" }],
            (item) => item.id
        );

        const iterator = index.searchByPrefix("al");

        const first = iterator.next();
        expect(first.value.id).toBe("alpha");
        expect(first.done).toBe(false);

        // Non-obvious setup: replacement should not affect an already-started iterator.
        index.replace([{ id: "alto" }, { id: "azure" }]);

        const rest = Array.from(iterator, (item) => item.id);
        expect(rest).toEqual(["alpine", "alps"]);
    });
});
