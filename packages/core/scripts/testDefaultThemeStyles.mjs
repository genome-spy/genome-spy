/* global console, document, window, requestAnimationFrame, DOMParser */

import assert from "node:assert/strict";
import { testRenderers } from "./testRenderers.mjs";

// Exercise real scoped CSS: DOM emulators cannot resolve light-dark() or @scope.
await testRenderers([{ deviceScaleFactor: 1 }], async (page, renderer) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.evaluate(async (renderer) => {
        const { embed } = await import("/index.js");
        document.body.replaceChildren();
        document.documentElement.style.colorScheme = "normal";
        const stylesheet = document.createElement("style");
        stylesheet.textContent = `
            .appearance-host.custom {
                --genome-spy-foreground: #59391d;
                --genome-spy-background: #fff0d8;
            }
            [data-appearance="accent"] { --genome-spy-foreground: #175b49; }
        `;
        document.head.append(stylesheet);
        const frame = () =>
            new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve))
            );
        const spec = {
            name: "plot",
            width: 260,
            height: 120,
            params: [
                { name: "alpha", value: 1 },
                {
                    name: "brush",
                    select: { type: "interval", encodings: ["x"] },
                    value: { x: [2, 7] },
                },
            ],
            data: { values: [{ x: 4, y: 3 }] },
            mark: { type: "text", text: "Palette", opacity: { expr: "alpha" } },
            encoding: {
                x: {
                    field: "x",
                    type: "quantitative",
                    scale: { name: "x", domain: [0, 10], zoom: true },
                },
                y: { field: "y", type: "quantitative" },
            },
        };
        async function create(extra = {}, parent = document.body) {
            const ancestor = document.createElement("section");
            ancestor.className = "appearance-host";
            const host = document.createElement("div");
            host.style.cssText = "width:360px;height:220px";
            ancestor.append(host);
            parent.append(ancestor);
            const api = await embed(
                host,
                typeof extra === "string" ? extra : { ...spec, ...extra },
                { renderer }
            );
            return {
                ancestor,
                host,
                api,
                canvas: host.querySelector("canvas"),
            };
        }
        async function snapshot(instance, options = { background: null }) {
            await frame();
            const result = await instance.api.imageExport.svg(options);
            const svg = new DOMParser().parseFromString(
                await result.blob.text(),
                "image/svg+xml"
            );
            return {
                palette: instance.api.params
                    .get("defaultThemeColors")
                    .getValue(),
                foreground: svg
                    .querySelector('[data-name="plot"] [data-mark-type="text"]')
                    .getAttribute("fill"),
                brush: svg
                    .querySelector('[data-name="selectionRectRect"] [stroke]')
                    .getAttribute("stroke"),
                background:
                    svg
                        .querySelector("[data-export-background]")
                        ?.getAttribute("fill") ?? null,
                sameCanvas:
                    instance.canvas === instance.host.querySelector("canvas"),
                domain: instance.api.getScaleResolutionByName("x").getDomain(),
                selection: instance.api.params.getSelection("brush").getValue(),
            };
        }
        const main = await create();
        await main.api.getScaleResolutionByName("x").zoomTo([1, 9]);
        window.appearanceTest = {
            create,
            snapshot,
            main,
            frame,
            stylesheet,
            spec,
        };
    }, renderer);

    const read = () =>
        page.evaluate(() => {
            const state = window.appearanceTest;
            return state.snapshot(state.main);
        });
    const light = await read();
    assert.equal(light.foreground, "rgb(0, 0, 0)");
    assert.equal(light.brush, light.foreground);
    assert.equal(light.palette.background, null);
    assert.equal(light.background, null);

    await page.emulateMedia({ colorScheme: "dark" });
    assert.equal((await read()).foreground, light.foreground);
    const unconfigured = await page.evaluate(async () => {
        const { create, snapshot } = window.appearanceTest;
        const instance = await create();
        const result = await snapshot(instance);
        instance.api.finalize();
        return result;
    });
    assert.equal(unconfigured.foreground, light.foreground);
    // Only a host that declares dark support should follow browser preference.
    await page.evaluate(() => {
        document.documentElement.style.colorScheme = "light dark";
    });
    const dark = await read();
    assert.equal(dark.foreground, "rgb(229, 235, 241)");
    assert.equal(dark.brush, dark.foreground);
    assert.equal(dark.palette.background, null);
    assert.equal(dark.background, null);
    assert.equal(dark.sameCanvas, true);
    assert.deepEqual(dark.domain, light.domain);
    assert.deepEqual(dark.selection, light.selection);

    const cases = await page.evaluate(async () => {
        const { main, create, snapshot, frame, stylesheet } =
            window.appearanceTest;
        const second = await create();
        const initialDark = await snapshot(second);
        main.ancestor.style.colorScheme = "light";
        const inheritedLight = await snapshot(main);
        main.host.style.colorScheme = "dark";
        const localDark = await snapshot(main);
        main.host.style.removeProperty("color-scheme");
        main.ancestor.style.removeProperty("color-scheme");
        main.ancestor.classList.add("custom");
        const custom = await snapshot(main, {});
        const independent = await snapshot(second);
        main.ancestor.classList.remove("custom");
        main.ancestor.setAttribute("data-appearance", "accent");
        const attribute = await snapshot(main);
        main.ancestor.removeAttribute("data-appearance");
        main.host.style.setProperty("--genome-spy-foreground", "#2431a7");
        const localOverride = await snapshot(main);
        main.host.style.removeProperty("--genome-spy-foreground");
        await frame();

        // CSSOM rule changes produce no observed attribute mutation.
        stylesheet.sheet.insertRule(
            ".appearance-host { --genome-spy-grid: #abcdef; }"
        );
        const beforeRefresh = main.api.params
            .get("defaultThemeColors")
            .getValue().grid;
        main.api.refreshStyles();
        const refreshed = await snapshot(main);

        // Ordinary parameter-driven rendering must not inspect CSS or republish it.
        let reads = 0;
        let publications = 0;
        const original = window.getComputedStyle;
        window.getComputedStyle = (...args) => {
            if (args[0] === main.host || args[0].closest(".gs-theme-colors"))
                reads++;
            return original(...args);
        };
        const unsubscribe = main.api.params
            .get("defaultThemeColors")
            .subscribe(() => publications++);
        main.api.params.get("alpha").setValue(0.8);
        await frame();
        unsubscribe();
        window.getComputedStyle = original;

        // Keep the second instance alive for a post-finalization preference event.
        main.api.finalize();
        let finalizedError;
        try {
            main.api.refreshStyles();
        } catch (error) {
            finalizedError = error.message;
        }
        main.ancestor.classList.add("custom");
        await frame();
        window.appearanceTest.second = second;
        return {
            initialDark,
            inheritedLight,
            localDark,
            custom,
            independent,
            attribute,
            localOverride,
            beforeRefresh,
            refreshed,
            reads,
            publications,
            finalizedError,
            probeRemoved: !main.host.querySelector(".gs-theme-colors"),
        };
    });
    assert.equal(cases.initialDark.foreground, dark.foreground);
    assert.equal(cases.inheritedLight.foreground, light.foreground);
    assert.equal(cases.localDark.foreground, dark.foreground);
    assert.equal(cases.custom.foreground, "rgb(89, 57, 29)");
    assert.equal(cases.custom.background, "rgb(255, 240, 216)");
    assert.equal(cases.independent.foreground, dark.foreground);
    assert.equal(cases.attribute.foreground, "rgb(23, 91, 73)");
    assert.equal(cases.localOverride.foreground, "rgb(36, 49, 167)");
    assert.notEqual(cases.beforeRefresh, "rgb(171, 205, 239)");
    assert.equal(cases.refreshed.palette.grid, "rgb(171, 205, 239)");
    assert.equal(cases.reads, 0);
    assert.equal(cases.publications, 0);
    assert.match(cases.finalizedError, /finalized|destroyed/i);
    assert.equal(cases.probeRemoved, true);

    await page.emulateMedia({ colorScheme: "light" });
    const precedence = await page.evaluate(async () => {
        const { create, snapshot, second } = window.appearanceTest;
        const afterFinalize = await snapshot(second);
        const authoredColors = {
            foreground: "purple",
            stroke: "gray",
            grid: "lightgray",
            chromosomeTick: "#989898",
            symbolStroke: "#888",
            background: null,
        };
        const authored = await create({
            params: [
                { name: "alpha", value: 1 },
                {
                    name: "brush",
                    select: { type: "interval", encodings: ["x"] },
                    value: { x: [2, 7] },
                },
                { name: "authoredColors", value: authoredColors },
                { name: "defaultThemeColors", expr: "authoredColors" },
            ],
        });
        authored.ancestor.classList.add("custom");
        const explicitPalette = await snapshot(authored);
        const optedOut = !authored.host.querySelector(".gs-theme-colors");
        authored.api.refreshStyles();
        const fixed = await create({ theme: "vegalite" });
        fixed.ancestor.classList.add("custom");
        const fixedTheme = await snapshot(fixed, {});
        const explicit = await create({ background: "navy" });
        explicit.ancestor.classList.add("custom");
        const explicitBackground = await snapshot(explicit, {});
        const exportBackground = await snapshot(explicit, {
            background: "orange",
        });
        const transparentExport = await snapshot(explicit, {
            background: null,
        });
        const fallbackExport = await snapshot(second, {});
        for (const instance of [authored, fixed, explicit, second])
            instance.api.finalize();
        let authoredFinalizedError;
        try {
            authored.api.refreshStyles();
        } catch (error) {
            authoredFinalizedError = error.message;
        }
        return {
            afterFinalize,
            explicitPalette,
            optedOut,
            fixedTheme,
            explicitBackground,
            exportBackground,
            transparentExport,
            fallbackExport,
            authoredFinalizedError,
        };
    });
    assert.equal(precedence.afterFinalize.foreground, light.foreground);
    assert.equal(precedence.explicitPalette.foreground, "purple");
    assert.equal(precedence.optedOut, true);
    assert.equal(precedence.fixedTheme.foreground, "black");
    assert.equal(precedence.fixedTheme.background, "white");
    assert.equal(precedence.explicitBackground.background, "navy");
    assert.equal(precedence.exportBackground.background, "orange");
    assert.equal(precedence.transparentExport.background, null);
    assert.equal(precedence.fallbackExport.background, "white");
    assert.match(precedence.authoredFinalizedError, /finalized|destroyed/i);

    const loadedSpec = await page.evaluate(() => ({
        ...window.appearanceTest.spec,
        params: [
            ...window.appearanceTest.spec.params,
            {
                name: "defaultThemeColors",
                value: {
                    foreground: "teal",
                    stroke: "gray",
                    grid: "lightgray",
                    chromosomeTick: "#989898",
                    symbolStroke: "#888",
                    background: null,
                },
            },
        ],
    }));
    await page.route("**/authored-palette.json", (route) =>
        route.fulfill({
            json: loadedSpec,
        })
    );
    const loaded = await page.evaluate(async () => {
        const { create, snapshot } = window.appearanceTest;
        const instance = await create("/authored-palette.json");
        instance.ancestor.classList.add("custom");
        const result = await snapshot(instance);
        instance.api.finalize();
        return result;
    });
    assert.equal(loaded.foreground, "teal");

    const invalid = await page.evaluate(async () => {
        const { create, frame } = window.appearanceTest;
        const ancestor = document.createElement("div");
        ancestor.style.setProperty(
            "--genome-spy-foreground",
            "oklch(60% 0.15 50)"
        );
        document.body.append(ancestor);
        // Startup errors are expected here and otherwise count as smoke failures.
        const original = console.error;
        console.error = () => {};
        let failure;
        try {
            await create({}, ancestor);
        } catch (error) {
            failure = error.message;
        } finally {
            console.error = original;
        }
        ancestor.style.removeProperty("--genome-spy-foreground");
        await frame();
        return {
            failure,
            probeRemoved: !ancestor.querySelector(".gs-theme-colors"),
        };
    });
    assert.match(invalid.failure, /Unsupported CSS color.*foreground/);
    assert.equal(invalid.probeRemoved, true);
    console.log(
        `${renderer}: automatic appearance, overrides, exports, and cleanup passed.`
    );
});
