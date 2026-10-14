import { readFileSync, writeFileSync } from "node:fs";
import { scaleLinear, scaleLog } from "d3-scale";
import { summary } from "./measure.js";

/** @param {string} name */
function read(name) {
    return readFileSync(new URL("results/" + name, import.meta.url), "utf8")
        .trim()
        .split("\n")
        .map(JSON.parse)
        .filter((r) => r.status === "ok");
}
const rows = [...read("node.jsonl"), ...read("node20m.jsonl")];
const colors = ["#215fad", "#b34b08", "#268052", "#893ab1", "#b82b47"];
const parts = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1240" height="500" viewBox="0 0 1240 500" role="img" aria-label="Measured construction throughput and retained memory">',
    '<rect width="1240" height="500" fill="white"/>',
    '<g font-family="Arial, sans-serif" font-size="12" fill="#20252b">',
];

/** @param {number} x @param {number} y @param {string} value @param {string} [anchor] */
function label(x, y, value, anchor = "middle") {
    parts.push(
        `<text x="${x}" y="${y}" text-anchor="${anchor}">${value}</text>`
    );
}

/** @param {number} left @param {(x: number) => number} x @param {(y: number) => number} y @param {number[]} xticks @param {number[]} yticks @param {(x: number) => string} format */
function axes(left, x, y, xticks, yticks, format) {
    for (const tick of yticks) {
        parts.push(
            `<path d="M${left},${y(tick)}h460" stroke="#d9dee5" fill="none"/>`
        );
        label(left - 10, y(tick) + 4, String(tick), "end");
    }
    parts.push(`<path d="M${left},90v300h460" stroke="#56616e" fill="none"/>`);
    for (const tick of xticks) label(x(tick), 411, format(tick));
}

/** @param {{x: number, y: number}[]} points @param {string} color */
function series(points, color) {
    parts.push(
        `<polyline points="${points.map((p) => `${p.x},${p.y}`).join(" ")}" stroke="${color}" stroke-width="2.2" fill="none"/>`
    );
    for (const p of points)
        parts.push(`<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="${color}"/>`);
}

/** @param {number} left @param {string[]} names */
function legend(left, names) {
    names.forEach((name, i) => {
        const x = left + (i % 3) * 155;
        const y = 451 + Math.floor(i / 3) * 22;
        parts.push(
            `<path d="M${x},${y - 4}h20" stroke="${colors[i]}" stroke-width="2.5"/>`
        );
        label(x + 27, y, name, "start");
    });
}

const construction = ["baseline", "typed11", "wasm8", "blocks", "hash70"];
const xBuild = scaleLog().domain([1e4, 2e7]).range([75, 535]);
const selected = rows.filter(
    (r) => r.scenario === "shuffled" && construction.includes(r.candidate)
);
const maxThroughput =
    Math.ceil(
        Math.max(
            ...selected.map(
                (r) => summary(r.samples.map((s) => s.millionPerSecond)).median
            )
        ) / 10
    ) * 10;
const yBuild = scaleLinear().domain([0, maxThroughput]).range([390, 90]);
label(305, 32, "Construction throughput: shuffled contiguous IDs");
label(75, 67, "Million rows/s", "start");
axes(75, xBuild, yBuild, [1e4, 1e5, 1e6, 1e7, 2e7], yBuild.ticks(5), (n) =>
    n < 1e6 ? n / 1000 + "K" : n / 1e6 + "M"
);
construction.forEach((name, i) =>
    series(
        selected
            .filter((r) => r.candidate === name)
            .sort((a, b) => a.size - b.size)
            .map((r) => ({
                x: xBuild(r.size),
                y: yBuild(
                    summary(r.samples.map((s) => s.millionPerSecond)).median
                ),
            })),
        colors[i]
    )
);
label(305, 432, "Retained rows (log scale)");
legend(75, construction);

const memory = ["baseline", "typed11", "hybridBlocks", "blocks", "hash70"];
const densities = [
    ["shuffled", 100],
    ["retain90", 90],
    ["retain50", 50],
    ["retain10", 10],
    ["retain1", 1],
    ["sparseBlocks", 0.1],
];
const xMem = scaleLog().domain([100, 0.1]).range([705, 1165]);
const yMem = scaleLog().domain([1, 1000]).range([390, 90]);
label(935, 32, "Retained index memory: 1M retained rows");
label(705, 67, "MiB (log scale)", "start");
axes(705, xMem, yMem, [100, 10, 1, 0.1], [1, 10, 100, 1000], (n) => n + "%");
memory.forEach((name, i) =>
    series(
        densities.flatMap(([scenario, density]) => {
            const r = rows.find(
                (r) =>
                    r.candidate === name &&
                    r.scenario === scenario &&
                    r.size === 1e6
            );
            return r
                ? [
                      {
                          x: xMem(density),
                          y: yMem(
                              summary(
                                  r.samples.map((s) => s.retainedDeltaBytes)
                              ).median /
                                  2 ** 20
                          ),
                      },
                  ]
                : [];
        }),
        colors[i]
    )
);
label(935, 432, "Nominal local block occupancy (log scale)");
legend(705, memory);
parts.push("</g></svg>");
writeFileSync(
    new URL("results/overview.svg", import.meta.url),
    parts.join("\n") + "\n"
);
