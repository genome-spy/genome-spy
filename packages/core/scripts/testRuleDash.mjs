import assert from "node:assert/strict";
import { testRenderers } from "./testRenderers.mjs";

// Compare the actual GPU paths with independently rasterized vector SVG contours.
await testRenderers(
    [{ deviceScaleFactor: 1 }, { deviceScaleFactor: 2 }],
    async (page, renderer, { deviceScaleFactor: dpr }) => {
        if (renderer === "canvas") return;

        const result = await page.evaluate(renderRules, { renderer, dpr });
        assert.deepEqual(result.loadingErrors, []);
        assert.deepEqual(result.warnings, []);
        assert.deepEqual(result.rasterized, []);
        for (const row of result.rows) {
            assert(
                row.checked > 200,
                `${renderer}: ${row.name}: reference coverage`
            );
            if (!["empty butt dots", "short gap"].includes(row.name)) {
                assert(
                    row.painted > 5,
                    `${renderer}: ${row.name}: reference ink`
                );
            }
            assert.equal(
                row.mismatches,
                0,
                `${renderer} DPR ${dpr}: ${row.name}: ${JSON.stringify(row.firstMismatch)}`
            );
        }
        assert(
            Math.abs(result.thinCoverage.fill - 0.5) <= 2 / 255,
            `${renderer} DPR ${dpr}: thin dashed body coverage`
        );
        assert(
            Math.abs(result.thinCoverage.outer - (6 * dpr + 0.5)) <= 2 / 255,
            `${renderer} DPR ${dpr}: thin dashed outside coverage`
        );
        // Picking intentionally follows the retained extruded quad through dash gaps.
        assert.deepEqual(result.picked, ["hit", "empty"]);
    }
);

/** @param {{renderer: "webgl" | "webgpu", dpr: number}} options */
async function renderRules({ renderer, dpr }) {
    const { embed } = await import("/index.js");
    await import("/rendering/webgpu/register.js");
    const width = 340;
    const rowHeight = 40;
    const x = 24;
    const cases = [
        { name: "butt border", cap: "butt", border: 3 },
        { name: "square body", cap: "square", border: 0 },
        { name: "round body", cap: "round", border: 0 },
        { name: "round border", cap: "round", border: 3 },
        { name: "hollow round", cap: "round", border: 3, hollow: true },
        {
            name: "overlapping round union",
            cap: "round",
            border: 3,
            dash: [10, 8],
            hollow: true,
        },
        {
            name: "overlapping square union",
            cap: "square",
            border: 3,
            dash: [10, 8],
            hollow: true,
        },
        {
            name: "round dots",
            cap: "round",
            border: 3,
            dash: [0, 28],
            span: 252,
            hollow: true,
        },
        { name: "square dots", cap: "square", border: 0, dash: [0, 28] },
        { name: "empty butt dots", cap: "butt", border: 3, dash: [0, 28] },
        {
            name: "butt dots beside body",
            cap: "butt",
            border: 6,
            dash: [2, 3, 0, 12],
        },
        {
            name: "positive wrapped phase",
            cap: "round",
            border: 3,
            offset: 89.25,
        },
        {
            name: "negative wrapped phase",
            cap: "square",
            border: 3,
            offset: -61.5,
        },
        {
            name: "finite fragment",
            cap: "round",
            border: 3,
            span: 17,
            offset: -4,
        },
        { name: "short gap", cap: "round", border: 3, span: 2, offset: 23 },
        { name: "zero gap", cap: "round", border: 3, dash: [8, 0, 0, 20] },
        {
            name: "diagonal",
            cap: "round",
            border: 3,
            span: 40,
            rise: 10,
            offset: -8.5,
        },
        {
            name: "thin square dash with border",
            cap: "square",
            border: 3,
            size: 0.5 / dpr,
        },
    ];
    const height = cases.length * rowHeight;
    const api = await embed(
        globalThis.document.body,
        {
            width,
            height,
            padding: 0,
            config: {
                background: null,
                view: { stroke: null, strokeWidth: 0 },
            },
            data: { values: [{}] },
            layer: cases.map((item, index) => {
                const y = index * rowHeight + rowHeight / 2;
                return {
                    mark: {
                        type: "rule",
                        size: item.size ?? 14,
                        fill: "red",
                        fillOpacity: item.hollow ? 0 : 1,
                        stroke: "blue",
                        strokeWidth: item.border,
                        strokeCap: item.cap,
                        strokeDash: item.dash ?? [18, 24],
                        strokeDashOffset: item.offset ?? 0,
                    },
                    encoding: {
                        x: { value: x / width },
                        x2: { value: (x + (item.span ?? 270)) / width },
                        y: { value: 1 - y / height },
                        y2: { value: 1 - (y + (item.rise ?? 0)) / height },
                    },
                };
            }),
        },
        { renderer }
    );
    try {
        await api.awaitVisibleLazyData(globalThis.AbortSignal.timeout(10_000));
        const loadingErrors = api.dataLoading
            .getSnapshot()
            .filter((entry) => entry.status === "error")
            .map((entry) => entry.message);
        const raster = await api.imageExport.raster({
            background: "white",
            pixelRatio: dpr,
        });
        const vector = await api.imageExport.svg({ background: "white" });

        /** @param {Blob} blob */
        async function pixels(blob) {
            const url = globalThis.URL.createObjectURL(blob);
            try {
                const image = new globalThis.Image();
                image.src = url;
                await image.decode();
                const canvas = new globalThis.OffscreenCanvas(
                    width * dpr,
                    height * dpr
                );
                const context = canvas.getContext("2d");
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                return context.getImageData(0, 0, canvas.width, canvas.height)
                    .data;
            } finally {
                globalThis.URL.revokeObjectURL(url);
            }
        }
        const actual = await pixels(raster.blob);
        const expected = await pixels(vector.blob);
        const physicalWidth = width * dpr;
        const rows = cases.map((item, index) => {
            let checked = 0;
            let painted = 0;
            let mismatches = 0;
            let firstMismatch;
            for (
                let py = (index * rowHeight + 1) * dpr;
                py < ((index + 1) * rowHeight - 1) * dpr;
                py++
            ) {
                for (let px = dpr; px < physicalWidth - dpr; px++) {
                    const at = (py * physicalWidth + px) * 4;
                    // A logical-pixel margin allows native edge filtering and pixel alignment.
                    const color = expected.slice(at, at + 4);
                    if (color.some((value) => value !== 0 && value !== 255))
                        continue;
                    if (
                        color[0] !== 255 ||
                        color[1] !== 255 ||
                        color[2] !== 255
                    )
                        painted++;
                    let stable = true;
                    for (let dy = -dpr; dy <= dpr; dy++) {
                        for (let dx = -dpr; dx <= dpr; dx++) {
                            const neighbor = at + (dy * physicalWidth + dx) * 4;
                            if (
                                color.some(
                                    (value, channel) =>
                                        Math.abs(
                                            expected[neighbor + channel] - value
                                        ) > 2
                                )
                            )
                                stable = false;
                        }
                    }
                    if (!stable) continue;
                    checked++;
                    if (
                        color.some(
                            (value, channel) =>
                                Math.abs(actual[at + channel] - value) > 12
                        )
                    ) {
                        mismatches++;
                        firstMismatch ??= {
                            x: px / dpr,
                            y: py / dpr,
                            expected: Array.from(color),
                            actual: Array.from(actual.slice(at, at + 4)),
                        };
                    }
                }
            }
            return {
                name: item.name,
                checked,
                painted,
                mismatches,
                firstMismatch,
            };
        });
        // The red body and blue outside band share coverage over an opaque white export.
        const thinCoverage = { fill: 0, outer: 0 };
        const thinY = (cases.length - 0.5) * rowHeight;
        for (let py = (thinY - 10) * dpr; py < (thinY + 10) * dpr; py++) {
            const at = (py * physicalWidth + (x + 8) * dpr) * 4;
            thinCoverage.fill += (actual[at] - actual[at + 1]) / 255;
            thinCoverage.outer += (255 - actual[at + 1]) / 255;
        }
        const picked = [];
        for (const point of [
            { x: x + 30, y: 20 },
            { x: x + 30, y: 2 },
        ]) {
            picked.push((await api.views.root().marks.pick(point)).status);
        }
        return {
            rows,
            thinCoverage,
            picked,
            loadingErrors,
            warnings: vector.warnings,
            rasterized: vector.rasterized,
        };
    } finally {
        api.finalize();
    }
}
