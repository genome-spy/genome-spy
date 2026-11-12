// Run from the repository root with:
// node --expose-gc packages/core/scripts/benchmarkTransforms.mjs [window|aggregate|stack|collect]
import assert from "node:assert/strict";
import console from "node:console";
import { performance } from "node:perf_hooks";
import process from "node:process";
import Collector from "../src/data/collector.js";
import FlowNode, { BEHAVIOR_MODIFIES } from "../src/data/flowNode.js";
import createTransform from "../src/data/transforms/transformFactory.js";
import { UNIQUE_ID_KEY } from "../src/data/transforms/identifier.js";

const size = 100_000;
const categories = 64;
const warmups = 4;
const samples = 9;
const target = process.argv[2];

// A deterministic permutation produces unsorted values and predictable ties.
const rows = Array.from({ length: size }, (_, i) => ({
    [UNIQUE_ID_KEY]: 10_000 + i,
    group: "sample-" + (i % categories),
    chromosome: "chr" + (i % 23),
    position: i,
    value: ((Math.imul(i, 2654435761) >>> 0) % 10007) / 10,
}));

/** @typedef {import("../src/data/flowNode.js").Datum} Datum */

/**
 * @param {string} name
 * @param {number} rowCount
 * @param {() => number} run
 */
function measure(name, rowCount, run) {
    const durations = [];
    for (let i = -warmups; i < samples; i++) {
        const elapsed = run();
        if (i >= 0) {
            durations.push(elapsed);
        }
    }

    durations.sort((a, b) => a - b);
    console.log(
        `${name.padEnd(29)} ${String(rowCount).padStart(7)} rows  ${durations[Math.floor(samples / 2)].toFixed(2).padStart(8)} ms`
    );
}

/**
 * @param {string} name
 * @param {import("../src/spec/transform.js").TransformParams} params
 * @param {number} [expectedCount]
 * @param {Datum[]} [input]
 */
function benchmark(name, params, expectedCount, input = rows) {
    if (target && !name.startsWith(target + "/")) {
        return;
    }

    const node = createTransform(params);
    if (!(node instanceof Collector)) {
        node.addChild(new FlowNode());
    }
    node.initializeOnce();

    measure(name, input.length, () => {
        const data =
            node.behavior & BEHAVIOR_MODIFIES
                ? input.map((row) => ({ ...row }))
                : input;
        // Keep fixture allocation and garbage from prior runs out of the timer.
        globalThis.gc?.();
        const start = performance.now();
        node.reset();
        node.beginBatch({ type: "file" });
        for (let j = 0; j < data.length; j++) {
            node.handle(data[j]);
        }
        node.complete();
        const elapsed = performance.now() - start;

        assert.equal(
            node instanceof Collector ? node.getItemCount() : node.stats.count,
            expectedCount ?? input.length
        );
        return elapsed;
    });
}

if (target && !["window", "aggregate", "stack", "collect"].includes(target)) {
    throw new Error("Expected window, aggregate, stack, or collect");
}

console.log(
    `Node ${process.version} (${process.arch}), median of ${samples} runs after ${warmups} warmups`
);

benchmark("window/grouped ranks", {
    type: "window",
    groupby: ["group"],
    sort: { field: "value" },
    ops: ["row_number", "rank", "cume_dist"],
});
benchmark("window/moving sum", {
    type: "window",
    frame: [-511, 0],
    fields: ["value"],
    ops: ["sum"],
});
benchmark("window/moving median", {
    type: "window",
    frame: [-24_999, 0],
    fields: ["value"],
    ops: ["median"],
});
benchmark("window/ordered running median", {
    type: "window",
    fields: ["position"],
    ops: ["median"],
});
benchmark("window/whole quantiles", {
    type: "window",
    frame: [null, null],
    fields: ["value", "value", "value"],
    ops: ["q1", "median", "q3"],
});

benchmark("aggregate/count", { type: "aggregate" }, 1);
benchmark(
    "aggregate/grouped stats",
    {
        type: "aggregate",
        groupby: ["group"],
        fields: ["value", "value", "value", "value"],
        ops: ["sum", "mean", "min", "max"],
    },
    categories
);
benchmark(
    "aggregate/compound groups",
    {
        type: "aggregate",
        groupby: ["chromosome", "group"],
    },
    23 * categories
);
benchmark(
    "aggregate/quartiles",
    {
        type: "aggregate",
        fields: ["value", "value", "value"],
        ops: ["q1", "median", "q3"],
    },
    1
);

benchmark("stack/ungrouped", { type: "stack", field: "value", groupby: [] });
benchmark("stack/grouped", {
    type: "stack",
    groupby: ["group", "chromosome"],
    field: "value",
});
benchmark("stack/sorted normalized", {
    type: "stack",
    groupby: ["group"],
    sort: { field: "value" },
    field: "value",
    offset: "normalize",
});

benchmark("collect/ordered ids", { type: "collect" });
benchmark("collect/grouped", { type: "collect", groupby: ["group"] });
benchmark("collect/grouped and sorted", {
    type: "collect",
    groupby: ["group", "chromosome"],
    sort: { field: "value" },
});
benchmark(
    "collect/sparse ids",
    { type: "collect", sort: { field: "value" } },
    size,
    rows.map((row) => ({
        ...row,
        [UNIQUE_ID_KEY]: row[UNIQUE_ID_KEY] * 131_071,
    }))
);

if (!target || target === "collect") {
    const collector = new Collector({ type: "collect", groupby: ["group"] });
    for (const row of rows) {
        collector.handle(row);
    }
    collector.complete();

    const ids = rows.map(
        (_, i) => rows[(i * 21701) % rows.length][UNIQUE_ID_KEY]
    );
    const expected = ids.reduce((sum, id) => sum + id, 0);
    measure("collect/faceted id lookups", rows.length, () => {
        globalThis.gc?.();
        let sum = 0;
        const start = performance.now();
        for (const id of ids) {
            sum += collector.findDatumByUniqueId(id)[UNIQUE_ID_KEY];
        }
        const elapsed = performance.now() - start;
        assert.equal(sum, expected);
        return elapsed;
    });
}
