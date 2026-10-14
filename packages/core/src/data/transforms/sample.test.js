import { expect, test } from "vitest";
import SampleTransform from "./sample.js";
import { extent } from "d3-array";
import { createChain } from "../../view/flowBuilder.js";
import Collector from "../collector.js";
import CloneTransform from "./clone.js";

test("sampling restarts per facet and retains selected physical row shapes", () => {
    const sample = new SampleTransform({ type: "sample", size: 2 });
    const clone = new CloneTransform();
    const output = new Collector();
    sample.addChild(clone);
    clone.addChild(output);

    sample.beginBatch({ type: "facet", facetId: ["A"] });
    sample.beginBatch({ type: "file", url: "first" });
    sample.handle({ v: 1 });
    sample.beginBatch({ type: "file", url: "second" });
    sample.handle({ v: 3, extra: 9 });
    sample.beginBatch({ type: "facet", facetId: ["B"] });
    sample.handle({ v: 10 });
    sample.complete();

    // Each facet is at most reservoir size, so this regression is deterministic.
    expect(output.facetBatches.get(["A"])).toEqual([
        { v: 1 },
        { v: 3, extra: 9 },
    ]);
    expect(output.facetBatches.get(["B"])).toEqual([{ v: 10 }]);
});

test("SampleTransform produces roughly uniform distributions", () => {
    const size = 10;
    const n = 20;
    const rounds = 10000;

    const freqs = [];
    for (let i = 0; i < n; i++) {
        freqs[i] = 0;
    }

    const { dataSource, collector } = createChain(
        new SampleTransform({ type: "sample", size })
    );

    for (let r = 0; r < rounds; r++) {
        for (let i = 0; i < n; i++) {
            dataSource.handle({ data: i });
        }
        dataSource.complete();

        for (const datum of collector.getData()) {
            freqs[datum.data] = freqs[datum.data] + 1;
        }

        dataSource.reset();
    }

    const e = extent(freqs);

    // Not a deterministic test! TODO: Come up with some sensical testing method
    expect(e[0]).toBeGreaterThan(4800);
    expect(e[1]).toBeLessThan(5200);
});
