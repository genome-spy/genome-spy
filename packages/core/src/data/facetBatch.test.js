import { expect, test } from "vitest";
import Collector from "./collector.js";
import CoverageTransform from "./transforms/coverage.js";
import SetIntersectionTransform from "./transforms/setIntersection.js";

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
