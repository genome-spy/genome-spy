import { readFileSync, writeFileSync } from "node:fs";
import { summary } from "./measure.js";

/** @param {string} file */
function read(file) {
    return readFileSync(new URL("results/" + file, import.meta.url), "utf8")
        .trim()
        .split("\n")
        .map(JSON.parse);
}
const main = read("node.jsonl");
const larger = read("node20m.jsonl");
const browser = read("chromium.jsonl");
const browserWidth = read("chromiumWidth.jsonl");
const lookupRecords = read("nodeLookup.jsonl");
const node = [...main, ...larger].filter((r) => r.status === "ok");
const chrome = browser.filter((r) => r.status === "ok");
const allNames = main[0].candidates;

/** @param {object[]} rows @param {string} candidate @param {string} scenario @param {number} size */
function cell(rows, candidate, scenario, size) {
    return rows.find(
        (r) =>
            r.candidate === candidate &&
            r.scenario === scenario &&
            r.size === size
    );
}

/** @param {object} row @param {string} field */
function stats(row, field) {
    return summary(
        row.samples.map((s) => field.split(".").reduce((v, key) => v[key], s))
    );
}

/** @param {number} value @param {number} [digits] */
function num(value, digits = 1) {
    return value.toFixed(digits);
}

/** @param {object} row @param {string} [field] @param {number} [digits] */
function median(row, field = "buildMs", digits = 1) {
    return row ? num(stats(row, field).median, digits) : "—";
}

/** @param {string[]} headings @param {(string|number)[][]} rows */
function table(headings, rows) {
    return [
        "| " + headings.join(" | ") + " |",
        "| " + headings.map(() => "---").join(" | ") + " |",
        ...rows.map((row) => "| " + row.join(" | ") + " |"),
    ].join("\n");
}

let report = readFileSync(new URL("REPORT.md", import.meta.url), "utf8");
/** @param {string} name @param {string} content */
function section(name, content) {
    const pattern = new RegExp(
        `<!-- ${name}(?::start -->[\\s\\S]*?<!-- ${name}:end)? -->`
    );
    if (!pattern.test(report))
        throw new Error("Missing report section: " + name);
    report = report.replace(
        pattern,
        `<!-- ${name}:start -->\n${content}\n<!-- ${name}:end -->`
    );
}

const baseline10 = cell(node, "baseline", "shuffled", 1e7);
const typed10 = cell(node, "typed11", "shuffled", 1e7);
const wasm10 = cell(node, "wasm8", "shuffled", 1e7);
const block10 = cell(node, "blocks", "shuffled", 1e7);
const speedup =
    stats(baseline10, "buildMs").median / stats(typed10, "buildMs").median;
section(
    "headline",
    `**The smallest broadly applicable change supported by these measurements is a\nUint32 permutation/scratch radix sorter with 11-bit digits, preserving stable\nordering, safe-integer keys and the sorted-input early exit.** On this Node\nbuild, 10M shuffled rows took ${median(baseline10)} ms with the unchanged baseline\nand ${median(typed10)} ms with typed11 (${num(speedup, 2)}× construction speedup);\nretained index memory fell from ${num(stats(baseline10, "retainedDeltaBytes").median / 2 ** 20)}\nto ${num(stats(typed10, "retainedDeltaBytes").median / 2 ** 20)} MiB. Dense block\nlookup built in ${median(block10)} ms, and scalar Wasm in ${median(wasm10)} ms.\nNeither is a universal replacement: block memory depends strongly on density,\nand Wasm needs extra linear memory and an asset/loader integration.\nThe recommendation is a proposal only; no production implementation changed.`
);

section(
    "environment",
    `${main[0].cpu}, ${num(main[0].totalMemoryBytes / 2 ** 30, 0)} GiB RAM,\n${main[0].platform} ${main[0].release} ${main[0].arch}; Node ${main[0].node},\nV8 ${main[0].v8}. Source commit: \`${main[0].sourceCommit}\`.\nThe raw metadata includes the unchanged baseline SHA-256. Chromium\n${browser[0].browser} was measured separately, headless, with exposed GC and a\nfresh page per cell. All runs use seed 20261014. Only Chromium was available;\nFirefox and Safari were not measured. Browser memory was not measured.`
);

const skipped = main.filter((r) => r.status === "skipped");
const failures = [
    ...main,
    ...larger,
    ...browser,
    ...browserWidth,
    ...lookupRecords,
].filter((r) => r.status === "failed");
section(
    "coverage",
    `${main.filter((r) => r.status === "ok").length} of 780 main Node cells completed;\n${skipped.length} cells were explicitly skipped by the resource policy.\n${larger.filter((r) => r.status === "ok").length} selected 20M-row cells,\nthree additional 262,144-query cells, and\n${chrome.length} Chromium cells completed, followed by two targeted seven-trial\nradix-width reruns. There were ${failures.length} recorded failures.\nMap is intentionally capped at 1M. Dense block directories at sufficiently low\noccupancy exceed the 768 MiB projected index budget; the largest sparse hybrid\ncases also exceed it. The 20M shortlist used a 1536 MiB projected index budget\nafter the 10M run demonstrated practical process memory. Larger than 20M and\nMap capacity limits were not tested. No speedup is inferred for skipped cells.\n\n` +
        table(
            ["Candidate", "Skipped sizes / distributions", "Reason"],
            [...new Set(skipped.map((r) => r.candidate))].map((name) => [
                name,
                skipped
                    .filter((r) => r.candidate === name)
                    .map((r) => `${r.size / 1e6}M ${r.scenario}`)
                    .join("; "),
                name === "map"
                    ? "limited reference"
                    : "projected allocation budget",
            ])
        )
);

section(
    "construction",
    `Shuffled contiguous IDs; construction milliseconds **median ± MAD**, including\nID extraction and conversions. — means the comparison was not run.\n\n` +
        table(
            ["Candidate", "10K", "100K", "1M", "10M", "20M"],
            allNames.map((name) => [
                name,
                ...[1e4, 1e5, 1e6, 1e7, 2e7].map((n) => {
                    const row = cell(node, name, "shuffled", n);
                    if (!row) return "—";
                    const s = stats(row, "buildMs");
                    return `${num(s.median, n < 1e6 ? 2 : 1)} ± ${num(s.mad, n < 1e6 ? 2 : 1)}`;
                }),
            ])
        ) +
        `\n\nConstruction throughput, million retained rows/second:\n\n` +
        table(
            [
                "Rows",
                "baseline",
                "typed8",
                "typed11",
                "pairs8",
                "wasm8",
                "blocks",
            ],
            [1e4, 1e5, 1e6, 1e7, 2e7].map((n) => [
                n.toLocaleString("en-US"),
                ...[
                    "baseline",
                    "typed8",
                    "typed11",
                    "pairs8",
                    "wasm8",
                    "blocks",
                ].map((c) =>
                    median(cell(node, c, "shuffled", n), "millionPerSecond")
                ),
            ])
        ) +
        `\n\nSelected 10M distribution comparisons, median construction ms:\n\n` +
        table(
            [
                "Distribution",
                "baseline",
                "typed8",
                "typed11",
                "pairs8",
                "wasm8",
                "blocks",
                "hash70",
            ],
            main[0].scenarios.map((s) => [
                s,
                ...[
                    "baseline",
                    "typed8",
                    "typed11",
                    "pairs8",
                    "wasm8",
                    "blocks",
                    "hash70",
                ].map((c) => median(cell(node, c, s, 1e7))),
            ])
        ) +
        `\n\nThe sorted/retained-in-source-order workloads take the early exit; increasing\nradix width does not help them. Baseline-to-typed improvements there come from\nindex initialization, buffer representation and combined scanning. Shuffled\nlarge inputs reward fewer passes. Moving keys with positions adds bandwidth\nand allocation at small sizes but avoids repeated random \`ids[index]\` reads\non large inputs. Interleaving stores positions as Float64, increasing scratch\ntraffic and requiring output extraction. Fixed 11-bit radix can reduce passes\nfurther, but its 2048-bucket scatter and arithmetic digit crossing bit 31 are\na different cache/CPU trade-off; results do not justify adaptive dispatch. At 1M contiguous IDs, 11-bit radix\nuses two passes versus three for 8-bit; at 10M both use three. That latter\ntime difference cannot be explained by pass count alone. Hardware cache/CPU\ncounters were not collected, so the locality explanations are interpretations\nof the measured representation and scaling, not proven microarchitectural causes.\n\n![Measured construction throughput and retained memory](results/overview.svg)`
);

section(
    "memory",
    `10M shuffled rows; MiB. Observed peaks count heap and backing stores; for Wasm\nthe accounted peak adds its explicit linear allocation, which this V8 version\nomits. These are sampled allocation deltas, not exact live-allocation peaks.\n\n` +
        table(
            [
                "Candidate",
                "Retained",
                "Observed/accounted peak",
                "Logical peak payload",
                "Process peak RSS (input included)",
            ],
            allNames
                .filter((c) => c !== "map")
                .map((name) => {
                    const row = cell(node, name, "shuffled", 1e7);
                    const linear =
                        row.samples[0].detail?.linearMemoryBytes ?? 0;
                    return [
                        name,
                        num(stats(row, "retainedDeltaBytes").median / 2 ** 20),
                        num(
                            (stats(row, "peakObservedDeltaBytes").median +
                                linear) /
                                2 ** 20
                        ),
                        row.samples[0].peakPayloadUpperBoundBytes === null
                            ? "unmodeled"
                            : num(
                                  stats(row, "peakPayloadUpperBoundBytes")
                                      .median /
                                      2 ** 20
                              ),
                        num(stats(row, "peakRssBytes").median / 2 ** 20),
                    ];
                })
        ) +
        `\n\nAt 1M retained rows, memory versus ID density (MiB):\n\n` +
        table(
            [
                "Distribution",
                "baseline",
                "typed8",
                "blocks",
                "hybridBlocks",
                "hash70",
                "map",
            ],
            [
                "shuffled",
                "retain90",
                "retain50",
                "retain10",
                "retain1",
                "sparseBlocks",
                "largeIntegers",
            ].map((s) => [
                s,
                ...[
                    "baseline",
                    "typed8",
                    "blocks",
                    "hybridBlocks",
                    "hash70",
                    "map",
                ].map((c) => {
                    const row = cell(node, c, s, 1e6);
                    return row
                        ? num(stats(row, "retainedDeltaBytes").median / 2 ** 20)
                        : "—";
                }),
            ])
        ) +
        `\n\nThe typed permutation retains exactly 4 bytes per row independent of key\nrange or density. A dense block has 40,000 bytes even with one retained row:\nits payload is 4/occupancy bytes per row, before directory overhead. Hybrid\nblocks bound slot waste, but per-block Maps/objects/typed-array headers and\ntemporary pairs remain substantial for many sparse blocks. Dense blocks at\n0.1% occupancy would require about 3.73 GiB per million rows in position\npayload alone, so the large cases were skipped. Map memory also grows when\nlarge Number keys require boxed values; no very-large-Map viability is claimed.\n\nThe nominal radix storage formulas understate allocation churn from \`ids.push\`\nand ordinary-array growth: old backing stores can await GC while new ones are\nallocated. Raw checkpoints and natural GC events record those effects.\nRetained memory is the stronger, less noisy comparison here; precise allocator\npeaks would require profiling beyond these checkpoints. In this matrix the\nsampled typed11 peak is not lower than baseline, despite halving retained\nstorage; no peak-memory reduction is promised. Hybrid construction and Map\npayload models are explicitly null/unmodeled in raw results; their actual\nmeasured allocation deltas are retained.`
);

section(
    "lookup",
    `1M shuffled rows; nanoseconds/query. Full paths resolve the actual datum, and\nraw direct/hash paths return its current physical position.\n\n` +
        table(
            [
                "Candidate",
                "Raw hit",
                "Raw miss",
                "Full hit",
                "Full miss",
                "Full mixed",
                "Full same",
                "Full nearby",
            ],
            [
                "baseline",
                "typed8",
                "typed11",
                "pairs8",
                "wasm8",
                "blocks",
                "hybridBlocks",
                "hash50",
                "hash70",
                "hash85",
                "map",
            ].map((c) => {
                const row = cell(node, c, "shuffled", 1e6);
                return [
                    c,
                    ...[
                        "hit.raw",
                        "miss.raw",
                        "hit.full",
                        "miss.full",
                        "mixed.full",
                        "same.full",
                        "nearby.full",
                    ].map((f) => median(row, "lookup." + f + ".ns", 0)),
                ];
            })
        ) +
        `\n\n10M shuffled rows, full datum resolution (ns/query):\n\n` +
        table(
            ["Candidate", "Hit", "Miss", "Mixed", "Same", "Nearby"],
            [
                "baseline",
                "typed8",
                "typed11",
                "pairs8",
                "wasm8",
                "blocks",
                "hash50",
                "hash70",
                "hash85",
            ].map((c) => [
                c,
                ...["hit", "miss", "mixed", "same", "nearby"].map((m) =>
                    median(
                        cell(node, c, "shuffled", 1e7),
                        `lookup.${m}.full.ns`,
                        0
                    )
                ),
            ])
        ) +
        `\n\nPermutation sort variants do not materially change lookup's algorithm: their\nrow/facet binary search is identical. Differences among those rows also reflect\nJIT and measurement variability and should not be sold as lookup improvements.\nDirect/hash indexes remove that repeated binary search. Higher hash occupancy\nreduces memory but generally increases probing, especially for misses; this\nimplementation's modulo capacity and exact Float64 comparisons are included.\nLocal queries have different cache behavior from random queries. The current\nper-query bisector/closure allocations remain in all sorted-candidate timings.\n\nThe default random batch contains 8192 IDs and is reused to reach the timer\nminimum; it is a warm-working-set measurement, not a single cold pick. A\nfocused 10M-row rerun uses 262,144 queries (32 times as many), with these full\nlookup medians (ns/query):\n\n` +
        table(
            ["Candidate", "8K hit", "262K hit", "8K mixed", "262K mixed"],
            lookupRecords
                .filter((r) => r.status === "ok")
                .map((r) => {
                    const original = cell(node, r.candidate, "shuffled", 1e7);
                    return [
                        r.candidate,
                        median(original, "lookup.hit.full.ns", 0),
                        median(r, "lookup.hit.full.ns", 0),
                        median(original, "lookup.mixed.full.ns", 0),
                        median(r, "lookup.mixed.full.ns", 0),
                    ];
                })
        ) +
        `\n\nThis sensitivity check reinforces the broad lookup advantage of direct/hash\nindexes, but changes the absolute cost. It does not establish cold-cache\nlatency; JIT and desktop noise also differ across runs. Raw and full timings\nare independently warmed code paths, so subtracting them is not a reliable\nmeasurement of facet-resolution overhead. The amortization estimates below\nuse the main matrix, and are conditional on its query mix/working set.`
);

section(
    "amortization",
    `Compare to typed11 using successful full lookups. Break-even queries are\n\`max(0, extra build ms) * 1e6 / saved ns per query\`; memory costs still apply.\nZero means the alternative already built faster in that cell.\n\n` +
        table(
            [
                "Rows / distribution",
                "Alternative",
                "Extra build ms",
                "Saved ns/hit",
                "Break-even hits",
            ],
            [
                [1e6, "sorted"],
                [1e6, "shuffled"],
                [1e7, "sorted"],
                [1e7, "shuffled"],
                [1e6, "retain1"],
            ].flatMap(([n, scenario]) =>
                [
                    "blocks",
                    "hash70",
                    ...(scenario === "retain1" ? ["hybridBlocks"] : []),
                ].map((c) => {
                    const a = cell(node, "typed11", scenario, n);
                    const b = cell(node, c, scenario, n);
                    const extra =
                        stats(b, "buildMs").median - stats(a, "buildMs").median;
                    const saved =
                        stats(a, "lookup.hit.full.ns").median -
                        stats(b, "lookup.hit.full.ns").median;
                    return [
                        `${n / 1e6}M ${scenario}`,
                        c,
                        num(extra),
                        num(saved, 0),
                        saved > 0
                            ? Math.ceil(
                                  (Math.max(0, extra) * 1e6) / saved
                              ).toLocaleString("en-US")
                            : "no break-even",
                    ];
                })
            )
        ) +
        `\n\nA collector with comparatively few picks should prioritize construction and\nretained memory. These thresholds show when an O(1) index may pay for itself\nin CPU time, but do not remove hash/block memory costs. Dense block lookup can\nwin both construction and queries on shuffled dense data; adopting it globally\nstill fails the sparse-memory requirement. The measured hybrid is especially\nexpensive to construct after random reordering and does not justify automatic\nhybrid selection over a simpler general-purpose permutation.`
);

section(
    "browser",
    `Chromium construction medians (ms), with the corresponding Node medians.\nThe browser includes all copies but excludes Node's memory checkpoint overhead.\n\n` +
        table(
            ["Rows / distribution", "Candidate", "Node", "Chromium"],
            [
                [1e6, "sorted"],
                [1e6, "shuffled"],
                [1e6, "largeIntegers"],
                [1e6, "sparseBlocks"],
                [1e7, "shuffled"],
            ].flatMap(([n, scenario]) =>
                [
                    "baseline",
                    "typed8",
                    "typed11",
                    "pairs8",
                    "wasm8",
                    "blocks",
                    "hash70",
                ]
                    .filter((c) => cell(chrome, c, scenario, n))
                    .map((c) => [
                        `${n / 1e6}M ${scenario}`,
                        c,
                        median(cell(node, c, scenario, n)),
                        median(cell(chrome, c, scenario, n)),
                    ])
            )
        ) +
        `\n\nBoth runtimes use V8, but Node timings are not browser timing predictions.\nAbsolute times and fine rankings can differ with engine version, tiering,\npointer compression and embedding. This focused browser run validates the\nmeasured data/index path, not a full visualization loading/rendering session.\nChromium's SIMD feature probe returned **${browser[0].simdAvailable}**. The kernel\ndoes not require SIMD; no claim about current Firefox/Safari performance or\nSIMD compatibility follows from testing one Chromium version. All browser\nlookup modes and repetitions are in the browser CSV/raw samples.\n\nBecause the first 10M radix-width comparison was noisy, a targeted seven-trial\nrerun was recorded separately (ms):\n\n` +
        table(
            ["Width", "Median", "MAD", "Min", "Max"],
            browserWidth
                .filter((r) => r.status === "ok")
                .map((r) => {
                    const v = stats(r, "buildMs");
                    return [
                        r.candidate,
                        num(v.median),
                        num(v.mad),
                        num(v.min),
                        num(v.max),
                    ];
                })
        ) +
        `\n\nThe rerun supports choosing 11-bit radix, while its change in absolute timings\nalso reinforces the limitations of a shared-desktop microbenchmark. No precise\nbrowser-wide speedup is promised.\n`
);

section(
    "wasm",
    `Node Wasm phase medians in ms (phase checkpoints included):\n\n` +
        table(
            [
                "Rows / distribution",
                "Total",
                "Extract IDs",
                "Allocate/instantiate",
                "Copy in",
                "Kernel",
                "Copy out",
                "Linear MiB",
            ],
            [
                [1e6, "shuffled"],
                [1e7, "shuffled"],
                [1e7, "largeIntegers"],
                [2e7, "shuffled"],
            ].map(([n, scenario]) => {
                const r = cell(node, "wasm8", scenario, n);
                return [
                    `${n / 1e6}M ${scenario}`,
                    median(r),
                    ...[
                        "materializeMs",
                        "allocateInstantiateMs",
                        "copyInMs",
                        "kernelMs",
                        "copyOutMs",
                    ].map((f) => median(r, "detail." + f, 2)),
                    num(r.samples[0].detail.linearMemoryBytes / 2 ** 20),
                ];
            })
        ) +
        `\n\nThe single boundary call is inside kernel timing and amortized over the whole\nindex, rather than paid per row. New memory is lazily committed by the runtime,\nso a small allocation/instantiation time does not mean that memory is free:\ntouching pages is charged to copying and sorting. Growth count was zero.\nWasm's benefit here includes key/position locality and native uint64 digit\noperations, not a demonstrated SIMD effect. A fair comparison is total\nconstruction against JS pair sorting as well as the indirect JS permutation;\nkernel-only versus complete JS construction would exaggerate the gain.`
);

section(
    "recommendation",
    `Propose replacing only \`radixSortIntoLookupArray\`'s permutation and scratch\nbuffers with Uint32Array and using stable 11-bit LSD passes, while preserving\nordinary Number keys and arithmetic extraction for digits crossing bit 31\n(including the 11-bit digit beginning at bit 22), and for higher digits. Combine\nthe maximum/sortedness scan and initialize indexes with a simple loop, as in\nthe measured candidate. Keep Collector's current flattened positions and lookup\nsemantics. Do not alter the general \`radixSort()\` or identifier allocation.\n\nOn this Node build, the concrete expected benefit is the measured ${num(speedup, 2)}×\nconstruction improvement for 10M shuffled rows and about 38 MiB less retained\nindex memory. Sorted-input savings come from initialization/scanning, not radix\npasses. The retained cost is 4n bytes; unsorted construction needs another 4n\nscratch bytes plus 2048 counters (8 KiB), in addition to the existing temporary\nIDs. Full lookup remains O(log n log f); this change does not promise faster\nhover resolution. Exact speedups on other machines/engines remain unmeasured.\n\nThis is smaller than adding a density policy, a sparse/dense block protocol,\nan open-addressed table or a Wasm asset/loader. Fixed 11-bit radix uses the same small sorter structure and retained memory as\n8-bit radix, with 7 KiB more counters. It reduces the maximum safe-integer\npass count from seven to five and wins the measured large Node workloads.\nEight-bit radix is still a credible conservative alternative with simpler byte\nextraction; it should not be selected on an assumed advantage over measured\n11-bit radix. The browser comparison and its variability are reported above.\nPair/Wasm sorting is faster in some large cells, but adds conversion/storage\nand integration work beyond this smallest change.\n\nCompatibility work for that future change: update the internal permutation\ntype and tests expecting ordinary Arrays, keep first-current-position duplicate\nsemantics, explicitly retain the unsigned-safe-integer key contract, and enforce\nthe Uint32 position/sentinel count limit at the chosen boundary. Keys must\nnever be coerced wholesale to Uint32. There is no public spec/API migration\nexpected, and no change to the separate 32-bit GPU picking limitation.\n\nDo not introduce the measured hybrid by default: its construction and metadata\ncosts do not establish a broad win. Dense block lookup is compelling only when\nlocal occupancy is known high; the current allocation scheme alone does not\nestablish that. Hash50/70/85 provide cheap queries at a measured larger memory\ncost and can require thousands of lookups to repay construction on already\nsorted rows. Wasm is a viable second-stage option for very large unsorted\ncollectors, supported by measurements rather than SIMD assumptions, but needs\na loader/asset decision and broader browser validation before production use.`
);

writeFileSync(new URL("REPORT.md", import.meta.url), report);
