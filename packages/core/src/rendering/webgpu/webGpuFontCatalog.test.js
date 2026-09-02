import { describe, expect, test, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveThemeSelection } from "../../config/themes.js";

const loaders = vi.hoisted(() => ({
    loadDefaultFont: vi.fn(async () => ({ name: "Default Font" })),
    loadTrueTypeFont: vi.fn(async (url) => ({ url })),
}));

vi.mock("@genome-spy/webgpu-renderer/fonts/default", () => ({
    loadDefaultFont: loaders.loadDefaultFont,
}));

vi.mock("@genome-spy/webgpu-renderer/fonts/truetype", () => ({
    loadTrueTypeFont: loaders.loadTrueTypeFont,
}));

import {
    createOutlineFontPreparer,
    resolveExampleFontUrl,
} from "./webGpuFontCatalog.js";

describe("WebGPU example font catalog", () => {
    test("uses Default Font only for the implicit regular face", async () => {
        await createOutlineFontPreparer()({
            family: undefined,
            style: "normal",
            weight: 400,
            implicitFamily: true,
        });

        expect(loaders.loadDefaultFont).toHaveBeenCalledOnce();
        expect(loaders.loadTrueTypeFont).not.toHaveBeenCalled();
    });

    test("resolves non-default implicit variants to exact Lato faces", () => {
        expect(
            resolveExampleFontUrl({
                family: undefined,
                style: "normal",
                weight: 600,
                implicitFamily: true,
            })
        ).toContain("Lato-SemiBold.ttf");
    });

    test.each([
        ["Indie Flower", "normal", 400],
        ["Lato", "normal", 400],
        ["Lato", "italic", 400],
        ["Lato", "normal", 600],
        ["Lato", "normal", 700],
        ["Lato", "italic", 700],
        ["Lato", "normal", 900],
        ["Lobster", "normal", 400],
        ["Oswald", "normal", 400],
        ["Oswald", "normal", 700],
        ["Radley", "normal", 400],
        ["Roboto Condensed", "normal", 700],
        ["Source Sans Pro", "normal", 400],
        ["Source Sans Pro", "normal", 700],
        ["Teko", "normal", 400],
    ])("contains the example face %s %s %i", (family, style, weight) => {
        const url = resolveExampleFontUrl({
            family,
            style: /** @type {"normal" | "italic"} */ (style),
            weight,
            implicitFamily: false,
        });
        expect(url).toMatch(
            /^https:\/\/(fonts\.gstatic\.com\/s\/[^/]+\/v\d+\/|raw\.githubusercontent\.com\/google\/fonts\/[0-9a-f]{40}\/)/
        );
    });

    test("covers font variants declared by examples and built-in themes", () => {
        const examples = fileURLToPath(
            new URL("../../../../../examples", import.meta.url)
        );
        const documents = listJsonFiles(examples).map((filename) =>
            JSON.parse(readFileSync(filename, "utf8"))
        );
        documents.push(
            ...[
                "genomespy",
                "vegalite",
                "quartz",
                "dark",
                "fivethirtyeight",
                "urbaninstitute",
            ].map((name) => resolveThemeSelection(/** @type {any} */ (name)))
        );
        const requests = documents.flatMap(findFontRequests);

        expect(requests.length).toBeGreaterThan(0);
        expect(() => {
            for (const request of requests) {
                resolveExampleFontUrl(request);
            }
        }).not.toThrow();
    });

    test("fails instead of substituting an explicit missing variant", () => {
        expect(() =>
            resolveExampleFontUrl({
                family: "Lobster",
                style: "italic",
                weight: 400,
                implicitFamily: false,
            })
        ).toThrow("No WebGPU TrueType font");
    });

    test("loads only a requested application face", async () => {
        const catalog = Array.from({ length: 100 }, (_, index) => ({
            family: `Study Sans ${index}`,
            source: `https://example.test/study-sans-${index}.ttf`,
        }));
        const prepare = createOutlineFontPreparer(catalog);

        expect(loaders.loadTrueTypeFont).not.toHaveBeenCalled();
        await prepare({
            family: "Study Sans 42",
            style: "normal",
            weight: 400,
            implicitFamily: false,
        });

        expect(loaders.loadTrueTypeFont).toHaveBeenCalledOnce();
        expect(loaders.loadTrueTypeFont).toHaveBeenCalledWith(
            "https://example.test/study-sans-42.ttf"
        );
    });

    test("application faces override temporary catalog variants", async () => {
        const source = new URL("https://example.test/lato-bold.ttf");
        const prepare = createOutlineFontPreparer([
            { family: "Lato", weight: 700, source },
        ]);

        await prepare({
            family: undefined,
            style: "normal",
            weight: 700,
            implicitFamily: true,
        });

        expect(loaders.loadTrueTypeFont).toHaveBeenCalledWith(source);
    });

    test("validates catalog variants before loading", () => {
        expect(() =>
            createOutlineFontPreparer([
                { family: "Study Sans", source: "first.ttf" },
                { family: "Study Sans", source: "second.ttf" },
            ])
        ).toThrow("Duplicate font catalog entry");
        expect(() =>
            createOutlineFontPreparer([
                {
                    family: "Study Sans",
                    style: /** @type {any} */ ("oblique"),
                    source: "study-sans.ttf",
                },
            ])
        ).toThrow("Unsupported font catalog style");
    });
});

/** @param {string} directory @returns {string[]} */
function listJsonFiles(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            return listJsonFiles(filename);
        }
        return entry.isFile() && entry.name.endsWith(".json") ? [filename] : [];
    });
}

/**
 * @param {unknown} value
 * @returns {{family: string | undefined, style: "normal" | "italic", weight: number, implicitFamily: boolean}[]}
 */
function findFontRequests(value) {
    if (Array.isArray(value)) {
        return value.flatMap(findFontRequests);
    }
    if (!value || typeof value !== "object") {
        return [];
    }
    const object = /** @type {Record<string, unknown>} */ (value);
    const prefixes = new Set(
        Object.keys(object).flatMap((key) => {
            if (/^font(?:Style|Weight)?$/.test(key)) {
                return [""];
            }
            const match = /^(.*)Font(?:Style|Weight)?$/.exec(key);
            return match ? [match[1].toLowerCase()] : [];
        })
    );
    const requests = Array.from(prefixes, (prefix) => {
        const propertyPrefix = prefix === "" ? "font" : prefix + "Font";
        const familyValue = object[propertyPrefix];
        const family =
            typeof familyValue === "string" ? familyValue : undefined;
        const styleValue = object[propertyPrefix + "Style"] ?? "normal";
        const style = /** @type {"normal" | "italic"} */ (styleValue);
        const weightValue = object[propertyPrefix + "Weight"] ?? 400;
        const weight =
            typeof weightValue === "number"
                ? weightValue
                : normalizeNamedWeight(weightValue);
        const implicitFamily = family === undefined || family === "sans-serif";
        return {
            family: implicitFamily ? undefined : family,
            style,
            weight,
            implicitFamily,
        };
    });
    return requests.concat(Object.values(object).flatMap(findFontRequests));
}

/** @param {unknown} value */
function normalizeNamedWeight(value) {
    if (value === "normal" || value === "regular") {
        return 400;
    } else if (value === "bold") {
        return 700;
    }
    return NaN;
}
