import { test, expect } from "@playwright/test";

// Allow the local dev server's HMR connection in headless Chromium.
test.use({ permissions: ["local-network-access"] });

for (const mark of ["point", "text", "rect"]) {
    test(`renders keyed ${mark} selection with inheritance and picking disabled`, async ({
        page,
    }) => {
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
            if (message.type() === "error") errors.push(message.text());
        });
        // GPU attribute/texture setup must agree with the native CPU predicate.
        await page.route("**/embed-selection.json", (route) =>
            route.fulfill({
                json: {
                    params: [{ name: "selected", select: "point" }],
                    layer: [
                        {
                            name: "records",
                            width: 400,
                            height: 200,
                            data: {
                                values: [
                                    { id: "A", x: 1 },
                                    { id: "B", x: 2 },
                                ],
                            },
                            mark: { type: mark, tooltip: null },
                            encoding: {
                                key: { field: "id" },
                                x: {
                                    field: "x",
                                    type: "quantitative",
                                    scale: { domain: [0, 3] },
                                },
                                text: { field: "id" },
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
        await page.goto("/?spec=/embed-selection.json");
        await expect
            .poll(() =>
                page.evaluate(async () =>
                    Boolean((await import("/index.js")).getCurrentEmbedResult())
                )
            )
            .toBe(true);
        const observed = await page.evaluate(async () => {
            const api = (await import("/index.js")).getCurrentEmbedResult();
            const view = api.views.get({ scope: [], view: "records" });
            view.params.getSelection("selected").setValue([["B"]]);
            const svg = new globalThis.DOMParser().parseFromString(
                await (await api.imageExport.svg()).blob.text(),
                "image/svg+xml"
            );
            return {
                ids: view.params
                    .getSelection("selected")
                    .getValue()
                    .data.map((row) => row.id),
                highlighted: svg.querySelectorAll(
                    '[data-name="records"] [fill-opacity="1"]'
                ).length,
                faded: svg.querySelectorAll(
                    '[data-name="records"] [fill-opacity="0.2"]'
                ).length,
            };
        });
        expect(observed).toEqual({ ids: ["B"], highlighted: 1, faded: 1 });
        expect(errors).toEqual([]);
    });
}
