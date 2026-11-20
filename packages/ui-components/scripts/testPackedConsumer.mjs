import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { chromium } from "playwright";
import { expect } from "playwright/test";
import { build } from "vite";

const packageDir = fileURLToPath(new URL("..", import.meta.url));
const repoDir = resolve(packageDir, "../..");
const consumerDir = await mkdtemp(join(tmpdir(), "genomespy-ui-consumer-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

try {
    const [pack] = JSON.parse(
        execFileSync(
            npm,
            ["pack", "--json", "--pack-destination", consumerDir],
            {
                cwd: packageDir,
                encoding: "utf8",
            }
        )
    );
    const installed = join(consumerDir, "node_modules", pack.name);
    await mkdir(installed, { recursive: true });
    execFileSync("tar", [
        "-xf",
        join(consumerDir, pack.filename),
        "-C",
        installed,
        "--strip-components=1",
    ]);

    // Reuse npm ci's dependencies while resolving the library from the archive.
    const manifest = JSON.parse(
        await readFile(join(installed, "package.json"))
    );
    for (const name of Object.keys({
        ...manifest.dependencies,
        ...manifest.peerDependencies,
    })) {
        const local = join(packageDir, "node_modules", name);
        const source = existsSync(local)
            ? local
            : join(repoDir, "node_modules", name);
        const destination = join(consumerDir, "node_modules", name);
        await mkdir(dirname(destination), { recursive: true });
        await symlink(source, destination, "junction");
    }

    await cp(join(packageDir, "scripts/packed-consumer"), consumerDir, {
        recursive: true,
    });
    execFileSync(
        process.execPath,
        [
            fileURLToPath(import.meta.resolve("typescript/bin/tsc")),
            "--ignoreConfig",
            "--strict",
            "--noEmit",
            "--noUncheckedSideEffectImports",
            "--target",
            "es2022",
            "--module",
            "esnext",
            "--moduleResolution",
            "bundler",
            "main.ts",
        ],
        { cwd: consumerDir, stdio: "inherit" }
    );
    await build({ configFile: false, root: consumerDir, logLevel: "warn" });

    const browser = await chromium.launch({
        channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL,
    });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const origin = "http://ui-components.local";
        await page.route(origin + "/**", (route) => {
            const { pathname } = new URL(route.request().url());
            return route.fulfill({
                path: join(
                    consumerDir,
                    "dist",
                    pathname === "/" ? "index.html" : pathname
                ),
            });
        });
        await page.goto(origin);

        await expect(page.getByLabel("Dataset name")).toHaveCSS(
            "border-top-color",
            "rgb(18, 52, 86)"
        );
        await expect(
            page.getByRole("button", { name: "Display mode: Tracks" })
        ).toBeVisible();
        await expect(
            page.getByRole("spinbutton", { name: "Maximum reads" })
        ).toBeVisible();

        const search = page.getByRole("combobox", { name: "Find samples" });
        await search.fill("unavailable");
        await expect(
            page.getByText("Search failed.", { exact: false })
        ).toBeVisible();
        await expect(page.getByText("No matches")).toHaveCount(0);
        await search.fill("group");
        await expect(
            page.getByRole("option", { name: "Group A" })
        ).toBeVisible();

        const region = page.getByRole("region", { name: "Import preview" });
        const table = region.getByRole("table");
        await expect(table).toHaveCount(1);
        await expect(table).toHaveAttribute("aria-rowcount", "201");
        const header = table.getByRole("columnheader", { name: "Sample" });
        await expect(header).toBeInViewport();
        await region.focus();
        await page.keyboard.press("End");
        await expect(
            table.getByRole("cell", { name: "Sample 200" })
        ).toBeInViewport();
        await expect(header).toBeInViewport();

        await page.getByRole("button", { name: "Open dialog" }).click();
        await page.getByRole("button", { name: "Close dialog" }).click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(page.locator("#dialog-result")).toHaveText("cancel");

        const opener = page.getByRole("button", { name: "Open menu" });
        await opener.click();
        const menu = page.getByRole("menu", { name: "Dataset actions" });
        await expect(menu).toHaveCSS("position", "fixed");
        await expect(
            menu.getByRole("menuitem", { name: "Import" })
        ).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await expect(
            menu.getByRole("menuitem", { name: "Export" })
        ).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(menu).toHaveCount(0);
        await expect(opener).toBeFocused();

        expect(errors).toEqual([]);
        process.stdout.write(
            "Packed UI components passed consumer type and browser checks.\n"
        );
    } finally {
        await browser.close();
    }
} finally {
    await rm(consumerDir, { recursive: true, force: true });
}
