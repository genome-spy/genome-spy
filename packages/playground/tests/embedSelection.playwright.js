import { test, expect } from "@playwright/test";

// Software WebGL makes the GPU shader/texture path available in headless runs.
test.use({
    permissions: ["local-network-access"],
    launchOptions: {
        args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
});

for (const renderer of ["webgl", "canvas"]) {
    for (const [mark, toggle] of [
        ["point", true],
        ["text", true],
        ["rect", true],
        ["point", false],
    ]) {
        test(`${renderer}: keyed ${mark} ${toggle ? "multi" : "single"} selection without picking`, async ({
            page,
        }) => {
            const errors = [];
            page.on("pageerror", (error) => errors.push(error.message));
            page.on("console", (message) => {
                if (message.type() === "error") errors.push(message.text());
            });
            await page.route("**/embed-selection.json", (route) =>
                route.fulfill({
                    json: {
                        params: [
                            {
                                name: "selected",
                                select: { type: "point", toggle },
                            },
                        ],
                        layer: [
                            {
                                name: "records",
                                width: 400,
                                height: 160,
                                data: {
                                    values: [
                                        { id: "A", x: 1, end: 1.2 },
                                        { id: "B", x: 2, end: 2.2 },
                                    ],
                                },
                                mark: {
                                    type: mark,
                                    tooltip: null,
                                    size: 500,
                                    fontSize: 40,
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
                                        ? {
                                              x2: { field: "end" },
                                              y2: { value: 0.7 },
                                          }
                                        : {}),
                                    y: { value: 0.5 },
                                    text: { field: "id" },
                                    color: { value: "#ff0000" },
                                    opacity: {
                                        condition: {
                                            param: "selected",
                                            empty: false,
                                            value: 1,
                                        },
                                        value: 0.2,
                                    },
                                },
                            },
                        ],
                    },
                })
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
            const observed = await page.evaluate(
                async ({ toggle }) => {
                    const api = (
                        await import("/index.js")
                    ).getCurrentEmbedResult();
                    const view = api.views.get({ scope: [], view: "records" });
                    const selection = view.params.getSelection("selected");
                    const memberships = [
                        [],
                        [["A"]],
                        [["B"]],
                        [],
                        ...(toggle ? [[["A"], ["B"]]] : []),
                    ];
                    const frames = [];
                    for (const keys of memberships) {
                        selection.setValue(keys);
                        // Flush reactive membership and complete the renderer's export.
                        await new Promise((resolve) =>
                            globalThis.requestAnimationFrame(() =>
                                globalThis.requestAnimationFrame(resolve)
                            )
                        );
                        const raster = await api.imageExport.raster({
                            background: null,
                            pixelRatio: 1,
                        });
                        const bitmap = await globalThis.createImageBitmap(
                            raster.blob
                        );
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
                        const ink = [0, 0];
                        for (let i = 0; i < data.length; i += 4) {
                            // Integrate red glyph/mark pixels separately in each half;
                            // normalization below avoids glyph shape and antialiasing assumptions.
                            if (
                                data[i] > data[i + 1] &&
                                data[i] > data[i + 2]
                            ) {
                                const half =
                                    (i / 4) % canvas.width < canvas.width / 2
                                        ? 0
                                        : 1;
                                ink[half] +=
                                    ((data[i] -
                                        Math.max(data[i + 1], data[i + 2])) *
                                        data[i + 3]) /
                                    255;
                            }
                        }
                        const svg = new globalThis.DOMParser().parseFromString(
                            await (await api.imageExport.svg()).blob.text(),
                            "image/svg+xml"
                        );
                        frames.push({
                            ids: selection.getValue().data.map((row) => row.id),
                            ink,
                            highlighted: svg.querySelectorAll(
                                '[data-name="records"] [fill-opacity="1"]'
                            ).length,
                        });
                    }
                    const bounds = api.views.getLayoutBounds(view);
                    const pick = await view.marks.pick({
                        x: bounds.x + bounds.width / 3,
                        y: bounds.y + 80,
                    });
                    return { frames, pick: pick.status };
                },
                { toggle }
            );
            const memberships = [
                [],
                ["A"],
                ["B"],
                [],
                ...(toggle ? [["A", "B"]] : []),
            ];
            const initial = observed.frames[0].ink;
            expect(
                initial.every((value) => value > 0),
                JSON.stringify(observed)
            ).toBe(true);
            for (const [index, frame] of observed.frames.entries()) {
                expect(frame.ids).toEqual(memberships[index]);
                expect(frame.highlighted).toBe(memberships[index].length);
                for (const [half, id] of ["A", "B"].entries()) {
                    const ratio = frame.ink[half] / initial[half];
                    if (memberships[index].includes(id)) {
                        // Compare membership, not backend-specific alpha compositing.
                        expect(ratio).toBeGreaterThan(3);
                    } else {
                        expect(ratio).toBeCloseTo(1, 1);
                    }
                }
            }
            expect(observed.pick).toBe("empty");
            expect(errors).toEqual([]);
        });
    }
}
