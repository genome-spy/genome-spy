import { test, expect } from "@playwright/test";

// Software WebGL exercises the real shader/texture path in headless runs.
test.use({
    permissions: ["local-network-access"],
    launchOptions: {
        args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
});

/**
 * The selection is inherited so tooltip:null still disables picking.
 * @param {"point" | "text" | "rect"} mark
 * @param {boolean} toggle
 * @returns {import("../../core/src/spec/root.js").RootSpec}
 */
function selectionSpec(mark, toggle) {
    return {
        width: 400,
        height: 160,
        params: [{ name: "selected", select: { type: "point", toggle } }],
        data: {
            values: [
                { id: "A", x: 1, end: 1.2 },
                { id: "B", x: 2, end: 2.2 },
            ],
        },
        layer: [
            {
                name: "records",
                mark: {
                    type: mark,
                    tooltip: null,
                    size: mark === "text" ? 40 : 500,
                },
                encoding: {
                    key: { field: "id" },
                    x: {
                        field: "x",
                        type: "quantitative",
                        scale: { domain: [0, 3] },
                        axis: null,
                    },
                    ...(mark === "rect"
                        ? { x2: { field: "end" }, y2: { value: 0.7 } }
                        : {}),
                    y: { value: 0.5 },
                    text: { field: "id" },
                    color: {
                        condition: {
                            param: "selected",
                            empty: false,
                            value: "red",
                        },
                        value: "blue",
                    },
                },
            },
        ],
    };
}

for (const renderer of ["webgl", "canvas"]) {
    for (const [mark, toggle] of /** @type {const} */ ([
        ["point", true],
        ["text", true],
        ["rect", true],
        ["point", false],
    ])) {
        test(`${renderer}: keyed ${mark} ${toggle ? "multi" : "single"} selection without picking`, async ({
            page,
        }) => {
            const errors = [];
            page.on("pageerror", (error) => errors.push(error.message));
            page.on("console", (message) => {
                if (message.type() === "error") errors.push(message.text());
            });
            await page.route("**/embed-selection.json", (route) =>
                route.fulfill({ json: selectionSpec(mark, toggle) })
            );
            await page.goto(
                `/?renderer=${renderer}&spec=/embed-selection.json`
            );
            await expect
                .poll(() =>
                    page.evaluate(async () =>
                        Boolean(
                            (await import("/index.js")).getCurrentEmbedResult()
                        )
                    )
                )
                .toBe(true);

            const memberships = [
                [],
                ["A"],
                ["B"],
                [],
                ...(toggle ? [["A", "B"]] : []),
            ];
            const observed = await page.evaluate(async (memberships) => {
                const api = (await import("/index.js")).getCurrentEmbedResult();
                const view = api.views.get({ scope: [], view: "records" });
                const selection = view.params.getSelection("selected");
                const frames = [];
                for (const ids of memberships) {
                    selection.setValue(ids.map((id) => [id]));
                    await new Promise((resolve) =>
                        globalThis.requestAnimationFrame(() =>
                            globalThis.requestAnimationFrame(resolve)
                        )
                    );
                    const { blob } = await api.imageExport.raster({
                        background: null,
                        pixelRatio: 1,
                    });
                    const bitmap = await globalThis.createImageBitmap(blob);
                    const canvas = new globalThis.OffscreenCanvas(
                        bitmap.width,
                        bitmap.height
                    );
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(bitmap, 0, 0);
                    bitmap.close();
                    const { data } = ctx.getImageData(
                        0,
                        0,
                        canvas.width,
                        canvas.height
                    );
                    const colors = [new Set(), new Set()];
                    // Each half contains one record. Ignore neutral pixels and
                    // faint antialiased edges when reading the red/blue color.
                    for (let i = 0; i < data.length; i += 4) {
                        if (Math.abs(data[i] - data[i + 2]) < 128) continue;
                        const half =
                            (i / 4) % canvas.width < canvas.width / 2 ? 0 : 1;
                        colors[half].add(
                            data[i] > data[i + 2] ? "red" : "blue"
                        );
                    }
                    const svg = new globalThis.DOMParser().parseFromString(
                        await (await api.imageExport.svg()).blob.text(),
                        "image/svg+xml"
                    );
                    frames.push({
                        ids: selection.getValue().data.map((row) => row.id),
                        colors: colors.map((set) => Array.from(set)),
                        highlighted: svg.querySelectorAll(
                            '[data-name="records"] [fill="red"]'
                        ).length,
                    });
                }
                const bounds = api.views.getLayoutBounds(view);
                const pick = await view.marks.pick({
                    x: bounds.x + bounds.width / 3,
                    y: bounds.y + bounds.height / 2,
                });
                return { frames, pick: pick.status };
            }, memberships);
            for (const [index, frame] of observed.frames.entries()) {
                expect(frame.ids).toEqual(memberships[index]);
                expect(frame.colors).toEqual(
                    ["A", "B"].map((id) => [
                        memberships[index].includes(id) ? "red" : "blue",
                    ])
                );
                expect(frame.highlighted).toBe(memberships[index].length);
            }
            expect(observed.pick).toBe("empty");
            expect(errors).toEqual([]);
        });
    }
}

test("retained WebGL marks follow shared scales across view mutations", async ({
    page,
}) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/retained-scale.json", (route) =>
        route.fulfill({
            json: {
                name: "tracks",
                width: 400,
                params: [{ name: "shift", value: 0 }],
                scales: {
                    x: {
                        name: "position",
                        type: "linear",
                        domain: [0, 100],
                        zoom: true,
                    },
                    xOffset: {
                        type: "linear",
                        domain: [0, 1],
                        range: [0, { expr: "shift" }],
                    },
                },
                resolve: { scale: { x: "shared", xOffset: "shared" } },
                vconcat: [
                    {
                        name: "retained",
                        height: 80,
                        data: { values: [{ start: 20, end: 40 }] },
                        mark: { type: "rect", color: "red" },
                        encoding: {
                            x: {
                                field: "start",
                                type: "quantitative",
                                axis: null,
                            },
                            x2: { field: "end" },
                            xOffset: { datum: 1, type: "quantitative" },
                        },
                    },
                ],
            },
        })
    );
    await page.goto("/?renderer=webgl&spec=/retained-scale.json");
    await expect
        .poll(() =>
            page.evaluate(async () =>
                Boolean((await import("/index.js")).getCurrentEmbedResult())
            )
        )
        .toBe(true);

    const frames = await page.evaluate(async () => {
        const api = (await import("/index.js")).getCurrentEmbedResult();
        const retained = api.views.get({ scope: [], view: "retained" });
        const scale = api.getScaleResolutionByName("position");

        // Read actual GPU output: SVG uses CPU encoders and missed this regression.
        const sampleFrame = async () => {
            await new Promise((resolve) =>
                globalThis.requestAnimationFrame(() =>
                    globalThis.requestAnimationFrame(resolve)
                )
            );
            const { blob } = await api.imageExport.raster({ pixelRatio: 1 });
            const bitmap = await globalThis.createImageBitmap(blob);
            const canvas = new globalThis.OffscreenCanvas(
                bitmap.width,
                bitmap.height
            );
            const context = canvas.getContext("2d");
            context.drawImage(bitmap, 0, 0);
            bitmap.close();
            const bounds = api.views.getLayoutBounds(retained);
            return [0.125, 0.375, 0.625].map((fraction) => {
                const pixel = context.getImageData(
                    Math.floor(bounds.x + bounds.width * fraction),
                    Math.floor(bounds.y + bounds.height / 2),
                    1,
                    1
                ).data;
                return pixel[0] > 200 && pixel[1] < 50 && pixel[2] < 50;
            });
        };

        const frames = [await sampleFrame()];
        const inserted = await api.views.insert(
            api.views.get({ scope: [], view: "tracks" }),
            {
                name: "inserted",
                height: 80,
                data: { values: [{ start: 50, end: 60 }] },
                mark: { type: "rect", color: "blue" },
                encoding: {
                    x: { field: "start", type: "quantitative", axis: null },
                    x2: { field: "end" },
                    xOffset: { datum: 1, type: "quantitative" },
                },
            }
        );
        await scale.zoomTo([20, 60]);
        frames.push(await sampleFrame());
        // xOffset moves the rectangle's start edge, independently of x2.
        api.getParam("shift").setValue(100);
        frames.push(await sampleFrame());
        await api.views.remove(inserted);
        api.getParam("shift").setValue(0);
        await scale.zoomTo([0, 40]);
        frames.push(await sampleFrame());
        return frames;
    });

    expect(frames).toEqual([
        [false, true, false],
        [true, true, false],
        [false, true, false],
        [false, false, true],
    ]);
    expect(errors).toEqual([]);
});
