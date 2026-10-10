import { expect, test } from "vitest";
import Collector from "./collector.js";
import AggregateTransform from "./transforms/aggregate.js";
import LookupTransform from "./transforms/lookup.js";
import WindowTransform from "./transforms/window.js";
import CloneTransform from "./transforms/clone.js";
import CoverageTransform from "./transforms/coverage.js";
import SetIntersectionTransform from "./transforms/setIntersection.js";

test("logical facets span physical files through lookup, window, and aggregate", () => {
    const lookup = new LookupTransform({
        type: "lookup",
        from: { source: "input" },
        key: "id",
        fields: ["peer"],
        values: ["value"],
        as: ["other"],
    });
    const window = new WindowTransform({
        type: "window",
        ops: ["row_number"],
        as: ["rank"],
    });
    const clone = new CloneTransform();
    const intermediate = new Collector();
    const aggregate = new AggregateTransform({
        type: "aggregate",
        fields: ["other", "rank"],
        ops: ["mean", "sum"],
        as: ["mean", "ranks"],
    });
    const output = new Collector();
    lookup.addChild(window);
    window.addChild(clone);
    clone.addChild(intermediate);
    intermediate.addChild(aggregate);
    aggregate.addChild(output);

    for (const [facet, values] of /** @type {[string, number[]][]} */ ([
        ["A", [1, 3]],
        ["B", [10, 20]],
    ])) {
        lookup.beginBatch({ type: "facet", facetId: [facet] });
        lookup.beginBatch({ type: "file", url: "first" });
        lookup.handle({ id: "one", peer: "two", value: values[0] });
        lookup.beginBatch({ type: "file", url: "second" });
        lookup.handle({ id: "two", peer: "one", value: values[1], extra: 9 });
    }
    lookup.complete();

    expect(intermediate.facetBatches.get(["A"])).toEqual([
        { id: "one", peer: "two", value: 1, other: 3, rank: 1 },
        { id: "two", peer: "one", value: 3, extra: 9, other: 1, rank: 2 },
    ]);
    expect(output.facetBatches.get(["A"])).toEqual([{ mean: 2, ranks: 3 }]);
    expect(output.facetBatches.get(["B"])).toEqual([{ mean: 15, ranks: 3 }]);
});

test("coverage combines files within a facet and restarts at the next facet", () => {
    const coverage = new CoverageTransform({
        type: "coverage",
        start: "start",
        end: "end",
    });
    coverage.initialize();
    const output = new Collector();
    coverage.addChild(output);

    coverage.beginBatch({ type: "facet", facetId: ["A"] });
    coverage.beginBatch({ type: "file" });
    coverage.handle({ start: 0, end: 10 });
    coverage.beginBatch({ type: "file" });
    coverage.handle({ start: 2, end: 5 });
    coverage.beginBatch({ type: "facet", facetId: ["B"] });
    coverage.handle({ start: 0, end: 1 });
    coverage.complete();

    expect(output.facetBatches.get(["A"])).toEqual([
        { start: 0, end: 2, coverage: 1 },
        { start: 2, end: 5, coverage: 2 },
        { start: 5, end: 10, coverage: 1 },
    ]);
    expect(output.facetBatches.get(["B"])).toEqual([
        { start: 0, end: 1, coverage: 1 },
    ]);
});

test("set memberships span files but stay local to their facet", () => {
    const intersection = new SetIntersectionTransform({
        type: "setIntersection",
        element: "element",
        set: "set",
    });
    const output = new Collector();
    intersection.addChild(output);

    intersection.beginBatch({ type: "facet", facetId: ["A"] });
    intersection.beginBatch({ type: "file" });
    intersection.handle({ element: "x", set: "first" });
    intersection.beginBatch({ type: "file" });
    intersection.handle({ element: "x", set: "second" });
    intersection.beginBatch({ type: "facet", facetId: ["B"] });
    intersection.handle({ element: "x", set: "second" });
    intersection.complete();

    expect(output.facetBatches.get(["A"]).map((d) => d.profileKey)).toEqual([
        "11",
        "11",
    ]);
    expect(output.facetBatches.get(["B"]).map((d) => d.profileKey)).toEqual([
        "1",
    ]);
});

test("an existing facet can aggregate to count zero", () => {
    const aggregate = new AggregateTransform({ type: "aggregate" });
    const output = new Collector();
    aggregate.addChild(output);

    aggregate.beginBatch({ type: "facet", facetId: ["A"] });
    aggregate.beginBatch({ type: "file" });
    aggregate.beginBatch({ type: "facet", facetId: ["B"] });
    aggregate.handle({ value: 1 });
    aggregate.complete();

    expect(output.facetBatches.get(["A"])).toEqual([{ count: 0 }]);
    expect(output.facetBatches.get(["B"])).toEqual([{ count: 1 }]);
});
