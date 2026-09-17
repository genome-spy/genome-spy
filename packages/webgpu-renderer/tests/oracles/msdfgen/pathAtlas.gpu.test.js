import { expect, test } from "@playwright/test";

test("canonical msdfgen oracle initializes in a module worker", async ({
    page,
}) => {
    await page.goto("/");
    const result = await page.evaluate(async () => {
        const moduleUrl =
            location.origin + "/tests/oracles/msdfgen/pathAtlas.js";
        const source = `
            import { buildPathAtlas } from ${JSON.stringify(moduleUrl)};
            self.onmessage = () => {
                const atlas = buildPathAtlas(["M-1-1H1V1H-1Z"], {
                    tileSize: 32,
                    spread: 8,
                    shapePadding: 10,
                    gutter: 1,
                });
                self.postMessage({ width: atlas.width, height: atlas.height });
            };
        `;
        const worker = new Worker(
            URL.createObjectURL(
                new Blob([source], { type: "text/javascript" })
            ),
            { type: "module" }
        );
        try {
            return await new Promise((resolve, reject) => {
                worker.onmessage = (event) => resolve(event.data);
                worker.onerror = reject;
                worker.postMessage(null);
            });
        } finally {
            worker.terminate();
        }
    });

    expect(result).toEqual({ width: 34, height: 34 });
});
