// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const srcDir = dirname(testDir);
const packageDir = dirname(srcDir);
const packagesDir = dirname(packageDir);
const repoRoot = dirname(packagesDir);
const defineCustomElement = customElements.define.bind(customElements);

vi.spyOn(customElements, "define").mockImplementation(
    /** @type {typeof customElements.define} */ (
        name,
        constructor,
        options
    ) => {
        if (customElements.get(name)) {
            return;
        }

        defineCustomElement(name, constructor, options);
    }
);

beforeAll(() => {
    // Build the bundled JS entry points so the smoke test imports dist files.
    const viteBin = resolve(repoRoot, "node_modules/vite/bin/vite.js");

    execFileSync(process.execPath, [viteBin, "build"], {
        cwd: resolve(repoRoot, "packages/app"),
        stdio: "inherit",
    });
    execFileSync(process.execPath, [viteBin, "build"], {
        cwd: resolve(repoRoot, "packages/app-agent"),
        stdio: "inherit",
    });
});

afterAll(() => {
    vi.restoreAllMocks();
});

describe("bundled package split", () => {
    it("loads the packaged app and agent bundles together", async () => {
        const appModule = await import(
            pathToFileURL(resolve(repoRoot, "packages/app/dist/index.es.js"))
                .href
        );
        const appAgentModule = await import(
            pathToFileURL(
                resolve(repoRoot, "packages/app-agent/dist/index.es.js")
            ).href
        );

        expect(appModule.embed).toBeTypeOf("function");
        expect(appModule.createAgentApi).toBeTypeOf("function");
        expect(appModule.BaseDialog).toBeTypeOf("function");

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
        expect(app.ui.registerToolbarMenuItem).toHaveBeenCalledTimes(3);

        handle.finalize();

        expect(disposeUi).toHaveBeenCalledTimes(3);
        expect(launchSpy).toHaveBeenCalledTimes(1);
        expect(destroySpy).toHaveBeenCalledTimes(1);
    });
});
