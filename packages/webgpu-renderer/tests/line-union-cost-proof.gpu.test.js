/* global document, navigator, GPUAdapter, GPUBufferUsage, GPUMapMode */
import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { ensureWebGPU } from "./gpuTestUtils.js";

test("bounded line union point cost", async ({ page }, testInfo) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter.features.has("timestamp-query"))
            throw Error("timestamp-query unavailable");
        const info = {
            vendor: adapter.info.vendor,
            architecture: adapter.info.architecture,
            device: adapter.info.device,
            description: adapter.info.description,
            userAgent: navigator.userAgent,
        };
        const originalRequest = GPUAdapter.prototype.requestDevice;
        GPUAdapter.prototype.requestDevice = function (descriptor = {}) {
            return originalRequest.call(this, {
                ...descriptor,
                requiredFeatures: [
                    ...new Set([
                        ...(descriptor.requiredFeatures ?? []),
                        "timestamp-query",
                    ]),
                ],
            });
        };
        const [
            { createRenderer },
            { lineUnionAreaPointMark },
            { identityScale },
        ] = await Promise.all([
            import("/src/index.js"),
            import("/tests/fixtures/lineUnionAreaPointMark.js"),
            import("/src/scales/identity.js"),
        ]);
        const horizontal = [-0.5, 0, 0.5, 0],
            vertical = [0, -0.5, 0, 0.5];
        const shapes = [
            [horizontal, vertical],
            [horizontal, vertical, [-0.5, -0.4, 0.5, 0.4]],
            [
                horizontal,
                vertical,
                [-0.5, -0.5, 0.5, 0.5],
                [-0.5, 0.5, 0.5, -0.5],
                [-0.5, -0.1, 0.5, 0.3],
                [-0.4, -0.5, 0.2, 0.5],
            ],
        ];
        const rows = [];
        const summary = (values) => {
            const sorted = values.slice().sort((a, b) => a - b);
            return {
                median: sorted[Math.floor(sorted.length * 0.5)],
                p95: sorted[Math.floor(sorted.length * 0.95)],
            };
        };
        for (const dpr of [1, 2]) {
            const canvas = document.createElement("canvas");
            canvas.width = 320 * dpr;
            canvas.height = 64 * dpr;
            document.body.append(canvas);
            const r = await createRenderer(canvas, { format: "rgba8unorm" });
            r.updateGlobals({ width: 320, height: 64, dpr });
            r.device.pushErrorScope("validation");
            try {
                for (const count of [1000, 10000])
                    for (const segments of shapes) {
                        const channels = {
                            x: {
                                data: Float32Array.from(
                                    { length: count },
                                    (_, i) => 3 + (i % 80) * 4
                                ),
                                type: "f32",
                                scale: identityScale(),
                            },
                            y: {
                                data: Float32Array.from(
                                    { length: count },
                                    (_, i) => 3 + (Math.floor(i / 80) % 15) * 4
                                ),
                                type: "f32",
                                scale: identityScale(),
                            },
                            size: { value: 16 },
                            angle: { value: 17 },
                            strokeWidth: { value: 2 },
                            stroke: { value: [0.2, 0.5, 0.9, 0.5] },
                            strokeOpacity: { value: 1 },
                        };
                        const variants = {},
                            preparation = {};
                        for (const kind of segments.length === 3
                            ? ["area", "approximate"]
                            : ["approximate", "area"]) {
                            const begin = performance.now();
                            const mark = r.createMark(lineUnionAreaPointMark, {
                                count,
                                proofSegments: segments,
                                proofApproximate: kind === "approximate",
                                channels,
                            });
                            const created = performance.now();
                            r.render({
                                items: [{ mark }],
                                clearColor: { r: 0, g: 0, b: 0, a: 0 },
                            });
                            await r.device.queue.onSubmittedWorkDone();
                            preparation[kind] = {
                                createMilliseconds: created - begin,
                                firstUseMilliseconds:
                                    performance.now() - created,
                            };
                            variants[kind] = mark;
                        }
                        const draw = (kind) =>
                            r.render({
                                items: [{ mark: variants[kind] }],
                                clearColor: { r: 0, g: 0, b: 0, a: 0 },
                            });
                        const wall = { approximate: [], area: [] };
                        for (let i = 0; i < 45; i++)
                            for (const kind of i % 2
                                ? ["area", "approximate"]
                                : ["approximate", "area"]) {
                                const start = performance.now();
                                draw(kind);
                                await r.device.queue.onSubmittedWorkDone();
                                if (i >= 5)
                                    wall[kind].push(performance.now() - start);
                            }
                        const device = r.device,
                            queries = device.createQuerySet({
                                type: "timestamp",
                                count: 2,
                            });
                        const resolved = device.createBuffer({
                            size: 256,
                            usage:
                                GPUBufferUsage.QUERY_RESOLVE |
                                GPUBufferUsage.COPY_SRC,
                        });
                        const read = device.createBuffer({
                            size: 16,
                            usage:
                                GPUBufferUsage.COPY_DST |
                                GPUBufferUsage.MAP_READ,
                        });
                        const originalCreate = device.createCommandEncoder,
                            create = originalCreate.bind(device);
                        let passes = 0;
                        device.createCommandEncoder = function (descriptor) {
                            const encoder = create(descriptor),
                                begin = encoder.beginRenderPass.bind(encoder);
                            encoder.beginRenderPass = function (descriptor) {
                                passes++;
                                return begin({
                                    ...descriptor,
                                    timestampWrites: {
                                        querySet: queries,
                                        beginningOfPassWriteIndex: 0,
                                        endOfPassWriteIndex: 1,
                                    },
                                });
                            };
                            return encoder;
                        };
                        const gpu = { approximate: [], area: [] };
                        try {
                            for (let i = 0; i < 45; i++)
                                for (const kind of i % 2
                                    ? ["area", "approximate"]
                                    : ["approximate", "area"]) {
                                    await device.queue.onSubmittedWorkDone();
                                    passes = 0;
                                    draw(kind);
                                    if (passes !== 1)
                                        throw Error(
                                            "Expected one render pass, got " +
                                                passes
                                        );
                                    const encoder = create();
                                    encoder.resolveQuerySet(
                                        queries,
                                        0,
                                        2,
                                        resolved,
                                        0
                                    );
                                    encoder.copyBufferToBuffer(
                                        resolved,
                                        0,
                                        read,
                                        0,
                                        16
                                    );
                                    device.queue.submit([encoder.finish()]);
                                    await read.mapAsync(GPUMapMode.READ);
                                    const ts = new BigUint64Array(
                                            read.getMappedRange()
                                        ),
                                        elapsed = Number(ts[1] - ts[0]) / 1e6;
                                    read.unmap();
                                    if (i >= 5) gpu[kind].push(elapsed);
                                }
                        } finally {
                            device.createCommandEncoder = originalCreate;
                            queries.destroy();
                            resolved.destroy();
                            read.destroy();
                        }
                        const stats = {
                            wall: {
                                approximate: summary(wall.approximate),
                                area: summary(wall.area),
                            },
                            gpu: {
                                approximate: summary(gpu.approximate),
                                area: summary(gpu.area),
                            },
                        };
                        const gates = [];
                        for (const path of ["wall", "gpu"])
                            for (const metric of ["median", "p95"]) {
                                const baseline =
                                        stats[path].approximate[metric],
                                    candidate = stats[path].area[metric];
                                gates.push({
                                    path,
                                    metric,
                                    baseline,
                                    candidate,
                                    pass: !(
                                        candidate > baseline * 2 &&
                                        candidate - baseline > 2
                                    ),
                                });
                            }
                        rows.push({
                            dpr,
                            count,
                            segments: segments.length,
                            preparation,
                            stats,
                            gates,
                            raw: { wall, gpu },
                        });
                        for (const mark of Object.values(variants))
                            r.destroyMark(mark.markId);
                    }
                const validation = await r.device.popErrorScope();
                if (validation) throw Error(validation.message);
            } finally {
                r.destroy();
                canvas.remove();
            }
        }
        GPUAdapter.prototype.requestDevice = originalRequest;
        return { info, rows };
    });
    await writeFile(
        testInfo.outputPath("cost-results.json"),
        JSON.stringify(result, null, 2)
    );
    console.log(
        JSON.stringify({
            ...result,
            rows: result.rows.map(({ raw, ...row }) => row),
        })
    );
    for (const row of result.rows)
        for (const gate of row.gates)
            expect(
                gate.pass,
                JSON.stringify({
                    dpr: row.dpr,
                    count: row.count,
                    segments: row.segments,
                    ...gate,
                })
            ).toBe(true);
});
