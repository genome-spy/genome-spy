import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { ensureWebGPU } from "./gpuTestUtils.js";

test.beforeEach(async ({ page }) => {
    await ensureWebGPU(page);
    for (const file of [
        "stories/sceneRunner.js",
        "examples/lassoScene.js",
        "src/utils/lassoImage.js",
    ])
        await page.route("**/" + file, async (route) =>
            route.fulfill({
                contentType: "text/javascript",
                body: await readFile(
                    new URL("../" + file, import.meta.url),
                    "utf8"
                ),
            })
        );
});

test("detaching during initial GPU completion cleans the obsolete lasso scene", async ({
    page,
}) => {
    const result = await page.evaluate(async () => {
        const { renderScene } = await import("/stories/sceneRunner.js");
        const { default: runLassoScene } =
            await import("/examples/lassoScene.js");
        const done = GPUQueue.prototype.onSubmittedWorkDone;
        let release;
        let reached;
        const started = new Promise((resolve) => {
            reached = resolve;
        });
        // Detach after allocation but before the async scene returns its cleanup.
        GPUQueue.prototype.onSubmittedWorkDone = function () {
            const completed = done.call(this);
            return new Promise((resolve, reject) => {
                release = () => completed.then(resolve, reject);
                reached();
            });
        };
        const destroy = GPUDevice.prototype.destroy;
        let destroyed = 0;
        GPUDevice.prototype.destroy = function () {
            destroyed++;
            destroy.call(this);
        };
        let finished;
        const cleaned = new Promise((resolve) => {
            finished = resolve;
        });
        const element = renderScene(
            async (canvas, args) => {
                const cleanup = await runLassoScene(canvas, args);
                return () => {
                    cleanup();
                    finished();
                };
            },
            { count: 1000 }
        );
        document.body.append(element);
        await started;
        element.remove();
        release();
        await cleaned;
        return {
            destroyed,
            outline: !!element.querySelector("svg"),
            cleanup: !!element._cleanup,
        };
    });
    expect(result).toEqual({ destroyed: 1, outline: false, cleanup: false });
});

test("restarts serialize canvas ownership and retain only the latest scene", async ({
    page,
}) => {
    const result = await page.evaluate(async () => {
        const { renderScene } = await import("/stories/sceneRunner.js");
        const events = [];
        let release;
        let ready;
        const firstStarted = new Promise((resolve) => {
            ready = resolve;
        });
        const element = renderScene(
            async (_canvas, args) => {
                events.push("start " + args.name);
                if (args.name === "first")
                    await new Promise((resolve) => {
                        release = resolve;
                        ready();
                    });
                return {
                    cleanup: () => events.push("cleanup " + args.name),
                    update: (next) => events.push("update " + next.name),
                };
            },
            { name: "first" }
        );
        document.body.append(element);
        await firstStarted;
        element.args = { name: "skipped" };
        element.args = { name: "latest" };
        await Promise.resolve();
        const whileBlocked = events.slice();
        release();
        // Wait for startup installation before exercising the retained update contract.
        while (!element._update)
            await new Promise((resolve) => requestAnimationFrame(resolve));
        element.args = { name: "updated" };
        element.remove();
        return { whileBlocked, events };
    });
    expect(result.whileBlocked).toEqual(["start first"]);
    expect(result.events).toEqual([
        "start first",
        "cleanup first",
        "start latest",
        "update updated",
        "cleanup latest",
    ]);
});
