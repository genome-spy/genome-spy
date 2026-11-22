// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import process from "node:process";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const srcDir = dirname(testDir);
const packageDir = dirname(srcDir);
const packagesDir = dirname(packageDir);
const repoRoot = dirname(packagesDir);
beforeAll(() => {
    if (process.env.GENOMESPY_TEST_PREBUILT_BUNDLES === "1") {
        return;
    }

    // Build the bundles when the smoke test runs on its own.
    const viteBin = resolve(repoRoot, "node_modules/vite/bin/vite.js");
    /** @type {import("node:child_process").ExecFileSyncOptions} */
    const buildOptions = {
        // Vitest sets NODE_ENV=test, which would enable Vite's dev-only code.
        env: { ...process.env, NODE_ENV: "production" },
        stdio: ["ignore", "ignore", "inherit"],
    };

    execFileSync(process.execPath, [viteBin, "build"], {
        cwd: resolve(repoRoot, "packages/app"),
        ...buildOptions,
    });
    execFileSync(
        process.execPath,
        [viteBin, "build", "--config", "vite.agent-subpaths.config.js"],
        {
            cwd: resolve(repoRoot, "packages/app"),
            ...buildOptions,
        }
    );
    execFileSync(process.execPath, [viteBin, "build"], {
        cwd: resolve(repoRoot, "packages/app-agent"),
        ...buildOptions,
    });
});

describe("bundled package split", () => {
    it("keeps app agent production imports on app subpath bundles", () => {
        const appDistFiles = readdirSync(
            resolve(repoRoot, "packages/app/dist")
        );
        const appAgentDistFiles = readdirSync(
            resolve(repoRoot, "packages/app-agent/dist")
        );

        expect(appDistFiles).toEqual(
            expect.arrayContaining([
                "app.es.js",
                "agentApi.es.js",
                "agentShared.es.js",
                "dialog.es.js",
            ])
        );
        expect(
            appAgentDistFiles.some((file) => file.startsWith("blosc-"))
        ).toBe(false);
        expect(appAgentDistFiles.some((file) => file.startsWith("zstd-"))).toBe(
            false
        );
        expect(
            appAgentDistFiles.some((file) => file.startsWith("parquetRead-"))
        ).toBe(false);
    });

    it("loads the packaged app and agent bundles together", async () => {
        const appEntry = resolve(repoRoot, "packages/app/dist/app.es.js");
        const appModule = await import(pathToFileURL(appEntry).href);
        const dialogModule = await import(
            pathToFileURL(resolve(repoRoot, "packages/app/dist/dialog.es.js"))
                .href
        );
        const uiModule = await import(
            pathToFileURL(
                createRequire(appEntry).resolve(
                    "@genome-spy/ui-components/dialog"
                )
            ).href
        );
        const appAgentModule = await import(
            pathToFileURL(
                resolve(repoRoot, "packages/app-agent/dist/index.es.js")
            ).href
        );

        expect(appModule.embed).toBeTypeOf("function");
        expect(appModule.createAgentApi).toBeTypeOf("function");
        expect(appModule.BaseDialog).toBe(dialogModule.BaseDialog);
        expect(appModule.BaseDialog).toBe(uiModule.default);

        const launchSpy = vi
            .spyOn(appModule.GenomeSpyApp.prototype, "launch")
            .mockResolvedValue(true);
        const destroySpy = vi
            .spyOn(appModule.GenomeSpy.prototype, "destroy")
            .mockImplementation(() => {});

        const plugin = appAgentModule.appAgent({
            baseUrl: "http://127.0.0.1:8001",
        });

        const originalInstall = plugin.install;
        plugin.install = vi.fn(async (app) => {
            const wrapRegister = (register) =>
                vi.fn((...args) => {
                    const dispose = register(...args);
                    return () => {
                        dispose();
                        disposeUi();
                    };
                });

            app.ui.registerToolbarButton = wrapRegister(
                app.ui.registerToolbarButton.bind(app.ui)
            );
            app.ui.registerToolbarMenuItem = wrapRegister(
                app.ui.registerToolbarMenuItem.bind(app.ui)
            );

            return originalInstall(app);
        });

        const disposeUi = vi.fn();
        const element = document.createElement("div");
        document.body.appendChild(element);

        const handle = await appModule.embed(
            element,
            {},
            { plugins: [plugin] }
        );

        expect(plugin.install).toHaveBeenCalledTimes(1);
        const app = plugin.install.mock.calls[0][0];
        expect(app.getAgentApi).toBeTypeOf("function");
        expect(app.ui.registerToolbarButton).toHaveBeenCalledTimes(1);
        expect(app.ui.registerToolbarMenuItem).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ label: "Clear chat history" })
        );

        handle.finalize();

        expect(disposeUi).toHaveBeenCalledTimes(2);
        expect(launchSpy).toHaveBeenCalledTimes(1);
        expect(destroySpy).toHaveBeenCalledTimes(1);
    });
});
