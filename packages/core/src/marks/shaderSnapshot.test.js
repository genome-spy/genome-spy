import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import View from "../view/view.js";
import UnitView from "../view/unitView.js";
import { createAndInitialize } from "../view/testUtils.js";

const VERTEX_SHADER = 0x8b31;
const FRAGMENT_SHADER = 0x8b30;

/**
 * @param {string} relativePath
 */
function loadSpec(relativePath) {
    return JSON.parse(
        readFileSync(new URL(relativePath, import.meta.url), "utf8")
    );
}

function createFakeGlHelper() {
    const captured = new Map();

    const gl = {
        VERTEX_SHADER,
        FRAGMENT_SHADER,
        LINK_STATUS: 0x8b82,
        COMPILE_STATUS: 0x8b81,
        createProgram: () => ({}),
        attachShader: () => undefined,
        linkProgram: () => undefined,
        getProgramParameter: () => true,
        getProgramInfoLog: () => "",
        getShaderParameter: () => true,
        getShaderInfoLog: () => "",
        getShaderSource: (shader) => shader.source,
        deleteShader: () => undefined,
        deleteProgram: () => undefined,
    };

    return {
        gl,
        rangeTextures: new WeakMap(),
        selectionTextures: new WeakMap(),
        createSelectionTexture(selection) {
            this.selectionTextures.set(selection, { selection });
        },
        compileShader(type, glsl) {
            const source = Array.isArray(glsl) ? glsl.join("\n\n") : glsl;
            captured.set(type, source);
            return { type, source };
        },
        getCapturedSources() {
            return {
                vertex: captured.get(VERTEX_SHADER),
                fragment: captured.get(FRAGMENT_SHADER),
            };
        },
    };
}

/**
 * @param {import("../view/view.js").default} root
 * @param {string} [name]
 * @returns {UnitView}
 */
function findUnitView(root, name) {
    /** @type {UnitView | undefined} */
    let found;

    root.visit((view) => {
        if (!(view instanceof UnitView)) {
            return;
        }
        if (name && view.explicitName !== name) {
            return;
        }
        found ??= view;
    });

    if (!found) {
        throw new Error(
            name
                ? `Could not find unit view "${name}".`
                : "Could not find a unit view."
        );
    }

    return found;
}

/**
 * @param {import("../spec/root.js").RootSpec} spec
 * @param {string} [unitName]
 */
async function captureShaderSources(spec, unitName) {
    const root = await createAndInitialize(spec, View);
    const unitView = findUnitView(root, unitName);
    const glHelper = createFakeGlHelper();

    unitView.context.glHelper = /** @type {any} */ (glHelper);

    await unitView.mark.initializeGraphics();

    return glHelper.getCapturedSources();
}

describe("generated shader snapshots", () => {
    test("point mark control spec", async () => {
        const sources = await captureShaderSources({
            data: {
                values: [
                    { x: 1, y: 2, group: "A" },
                    { x: 2, y: 3, group: "B" },
                ],
            },
            mark: "point",
            encoding: {
                x: { field: "x", type: "quantitative" },
                y: { field: "y", type: "quantitative" },
                color: { field: "group", type: "nominal" },
            },
        });

        expect(sources).toMatchSnapshot();
    });

    test("interval selection example", async () => {
        const sources = await captureShaderSources(
            loadSpec("../../../../examples/docs/grammar/parameters/interval-selection.json")
        );

        expect(sources).toMatchSnapshot();
    });

    test("point selection example", async () => {
        const sources = await captureShaderSources(
            loadSpec("../../../../examples/docs/grammar/parameters/point-selection.json")
        );

        expect(sources).toMatchSnapshot();
    });

    test("penguins scatter plot example", async () => {
        const sources = await captureShaderSources(
            loadSpec("../../../../examples/docs/grammar/parameters/penguins.json"),
            "scatterPlot"
        );

        expect(sources).toMatchSnapshot();
    });
});
