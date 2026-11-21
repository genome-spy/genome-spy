import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

// Exercise actual compositing and per-draw uniform storage, not just WGSL text.
for (const matching of /** @type {const} */ (["first", "last"])) {
    test(`conditional order paints matching instances ${matching} and preserves picking`, async ({
        page,
    }) => {
        await ensureWebGPU(page);
        const result = await page.evaluate(async (matching) => {
            const [{ createReadbackRenderer }, { pointMark }, { linearScale }] =
                await Promise.all([
                    import("/tests/fixtures/rgbaReadback.js"),
                    import("/src/marks/point.js"),
                    import("/src/scales/linear.js"),
                ]);
            const { renderer, renderPixels, finish } =
                await createReadbackRenderer(128);
            const mark = renderer.createMark(pointMark, {
                count: 2,
                channels: {
                    uniqueId: { data: new Uint32Array([41, 42]), type: "u32" },
                    x: {
                        value: 64,
                        scale: linearScale({
                            domain: [0, 128],
                            range: [0, 128],
                        }),
                    },
                    y: {
                        value: 64,
                        scale: linearScale({
                            domain: [0, 128],
                            range: [0, 128],
                        }),
                    },
                    size: { value: 1600 },
                    fill: {
                        data: new Float32Array([1, 0, 0, 1, 0, 0, 1, 1]),
                        type: "f32",
                        components: 4,
                    },
                    fillOpacity: { value: 0.5 },
                    strokeWidth: { value: 0 },
                },
                order: {
                    when: { selection: "picked", type: "single", empty: false },
                    matching,
                },
            });
            const read = async () => (await renderPixels(mark, [[64, 64]]))[0];
            const empty = await read();
            mark.selections.picked.set(41);
            const promoted = await read();
            const implicitPicked = await renderer.pick(64, 64);
            renderer.renderPicking({ draws: [{ mark }] });
            const picked = await renderer.pick(64, 64);
            mark.selections.picked.set(0);
            const cleared = await read();
            const validation = await finish();
            return {
                empty,
                promoted,
                cleared,
                picked,
                implicitPicked,
                validation,
            };
        }, matching);
        expect(result.validation).toBeUndefined();
        expect(result.empty[2]).toBeGreaterThan(result.empty[0]);
        if (matching === "last") {
            expect(result.promoted[0]).toBeGreaterThan(result.promoted[2]);
        } else {
            expect(result.promoted).toEqual(result.empty);
        }
        expect(result.promoted[3]).toBe(result.empty[3]);
        expect(result.cleared).toEqual(result.empty);
        expect(result.picked).toBe(42);
        expect(result.implicitPicked).toBe(42);
    });
}

test("logical order combines two independently updated interval components", async ({
    page,
}) => {
    await ensureWebGPU(page);
    const result = await page.evaluate(async () => {
        const [{ createReadbackRenderer }, { pointMark }, { linearScale }] =
            await Promise.all([
                import("/tests/fixtures/rgbaReadback.js"),
                import("/src/marks/point.js"),
                import("/src/scales/linear.js"),
            ]);
        const { renderer, renderPixels, finish } =
            await createReadbackRenderer(128);
        const mark = renderer.createMark(pointMark, {
            count: 2,
            channels: {
                x: {
                    value: 64,
                    scale: linearScale({ domain: [0, 128], range: [0, 128] }),
                },
                y: {
                    value: 64,
                    scale: linearScale({ domain: [0, 128], range: [0, 128] }),
                },
                size: { value: 1600 },
                fill: {
                    data: new Float32Array([1, 0, 0, 1, 0, 0, 1, 1]),
                    type: "f32",
                    components: 4,
                },
                fillOpacity: { value: 0.5 },
                strokeWidth: { value: 0 },
            },
            inputs: {
                source: { data: new Float32Array([1, 2]), type: "f32" },
                target: { data: new Float32Array([5, 6]), type: "f32" },
            },
            order: {
                when: {
                    all: [
                        {
                            selection: "from",
                            type: "interval",
                            projections: [
                                { component: "range0", input: "source" },
                            ],
                        },
                        {
                            selection: "to",
                            type: "interval",
                            projections: [
                                { component: "range0", input: "target" },
                            ],
                        },
                    ],
                },
                matching: "last",
            },
        });
        const read = async () => (await renderPixels(mark, [[64, 64]]))[0];
        const empty = await read();
        mark.selections.from.set({ range0: [1, 2] });
        const fromOnly = await read();
        mark.selections.to.set({ range0: [5, 6] });
        const both = await read();
        mark.selections.from.set({});
        const toOnly = await read();
        mark.selections.to.set({});
        const cleared = await read();
        const validation = await finish();
        return {
            empty,
            fromOnly,
            both,
            toOnly,
            cleared,
            validation,
        };
    });
    expect(result.validation).toBeUndefined();
    expect(result.empty[2]).toBeGreaterThan(result.empty[0]);
    for (const pixel of [result.fromOnly, result.both, result.toOnly]) {
        expect(pixel[0]).toBeGreaterThan(pixel[2]);
    }
    expect(result.cleared).toEqual(result.empty);
});
