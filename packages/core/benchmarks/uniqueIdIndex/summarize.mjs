import { readFileSync, writeFileSync } from "node:fs";
import { summary } from "./measure.js";

const input =
    process.argv[2] ??
    "packages/core/benchmarks/uniqueIdIndex/results/node.jsonl";
const records = readFileSync(input, "utf8").trim().split("\n").map(JSON.parse);
const rows = records
    .filter((row) => row.status === "ok")
    .map((row) => {
        const result = {
            candidate: row.candidate,
            scenario: row.scenario,
            size: row.size,
            buildMs: summary(row.samples.map((s) => s.buildMs)),
            millionPerSecond: summary(
                row.samples.map((s) => s.millionPerSecond)
            ),
            lookup: {},
        };
        if (row.samples[0].retainedDeltaBytes !== undefined) {
            for (const field of [
                "retainedDeltaBytes",
                "peakObservedDeltaBytes",
                "peakRssBytes",
                "retainedPayloadBytes",
                "peakPayloadUpperBoundBytes",
            ]) {
                result[field] =
                    row.samples[0][field] === null
                        ? null
                        : summary(row.samples.map((s) => s[field]));
            }
        }
        for (const mode of ["hit", "miss", "mixed", "same", "nearby"]) {
            result.lookup[mode] = {
                raw: summary(row.samples.map((s) => s.lookup[mode].raw.ns)),
                full: summary(row.samples.map((s) => s.lookup[mode].full.ns)),
            };
        }
        return result;
    });
writeFileSync(
    input.replace(/\.jsonl$/, ".summary.json"),
    JSON.stringify(
        {
            metadata: records[0],
            rows,
            skipped: records.filter((row) => row.status === "skipped"),
            failures: records.filter((row) => row.status === "failed"),
        },
        null,
        2
    ) + "\n"
);
const columns = [
    "candidate",
    "scenario",
    "size",
    "build_ms_median",
    "build_ms_mad",
    "million_per_second",
    "retained_bytes_median",
    "peak_observed_bytes_median",
    ...["hit", "miss", "mixed", "same", "nearby"].flatMap((mode) => [
        mode + "_raw_ns",
        mode + "_full_ns",
    ]),
];
const csv = [
    columns.join(","),
    ...rows.map((r) =>
        [
            r.candidate,
            r.scenario,
            r.size,
            r.buildMs.median,
            r.buildMs.mad,
            r.millionPerSecond.median,
            r.retainedDeltaBytes?.median ?? "",
            r.peakObservedDeltaBytes?.median ?? "",
            ...["hit", "miss", "mixed", "same", "nearby"].flatMap((mode) => [
                r.lookup[mode].raw.median,
                r.lookup[mode].full.median,
            ]),
        ].join(",")
    ),
];
writeFileSync(input.replace(/\.jsonl$/, ".csv"), csv.join("\n") + "\n");
console.log(
    `${rows.length} successful, ${records.filter((row) => row.status === "skipped").length} skipped, ${records.filter((row) => row.status === "failed").length} failed`
);
