import { expect, test } from "vitest";
import createIndexer from "./indexer.js";

test("Index values one by one", () => {
    const indexer = createIndexer();

    expect(indexer("a")).toEqual(0);
    expect(indexer("b")).toEqual(1);
    expect(indexer("c")).toEqual(2);
    expect(indexer("a")).toEqual(0);
    expect(indexer("c")).toEqual(2);
});

test("Index multiple values (predefined domain)", () => {
    const indexer = createIndexer();

    indexer.addAll(["a", "b", "c"]);

    expect(indexer("d")).toEqual(3);
    expect(indexer("a")).toEqual(0);
    expect(indexer("b")).toEqual(1);
    expect(indexer("c")).toEqual(2);
    expect(indexer("d")).toEqual(3);
});

test("Indexer inverts index numbers", () => {
    const indexer = createIndexer();

    indexer.addAll(["a", "b", "c"]);

    expect(indexer.invert(0)).toEqual("a");
    expect(indexer.invert(1)).toEqual("b");
    expect(indexer.invert(2)).toEqual("c");
    expect(indexer.invert(3)).toBeUndefined();
});

test("Indexer return correct domain", () => {
    const indexer = createIndexer();

    expect(indexer("a")).toEqual(0);
    expect(indexer("b")).toEqual(1);
    expect(indexer("c")).toEqual(2);
    expect(indexer("a")).toEqual(0);
    expect(indexer("c")).toEqual(2);

    expect(indexer.domain()).toEqual(["a", "b", "c"]);
});
