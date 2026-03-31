import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import View from "../view/view.js";
import UnitView from "../view/unitView.js";
import { createAndInitialize } from "../view/testUtils.js";

const VERTEX_SHADER = 0x8b31;
const FRAGMENT_SHADER = 0x8b30;

/**
 * @param {string} relativePath
 * @returns {import("../spec/root.js").RootSpec}
 */
function loadSpec(relativePath) {
    return JSON.parse(
        readFileSync(new URL(relativePath, import.meta.url), "utf8")
    );
}

/**
 * @typedef {{ type: number, source: string }} FakeShader
 */

/**
 * @returns {{
 *   gl: {
 *     VERTEX_SHADER: number,
 *     FRAGMENT_SHADER: number,
 *     LINK_STATUS: number,
 *     COMPILE_STATUS: number,
 *     createProgram: () => object,
 *     attachShader: () => void,
 *     linkProgram: () => void,
 *     getProgramParameter: () => boolean,
 *     getProgramInfoLog: () => string,
 *     getShaderParameter: () => boolean,
 *     getShaderInfoLog: () => string,
 *     getExtension: (name: string) => object | null,
 *     getShaderSource: (shader: FakeShader) => string,
 *     deleteShader: () => void,
 *     deleteProgram: () => void,
 *   },
 *   rangeTextures: WeakMap<object, object>,
 *   selectionTextures: WeakMap<object, object>,
 *   createSelectionTexture: (selection: object) => void,
 *   compileShader: (type: number, glsl: string | string[]) => FakeShader,
 *   getCapturedSources: () => { vertex: string | undefined, fragment: string | undefined },
 * }}
 */
function createFakeGlHelper() {
    /** @type {Map<number, string>} */
    const captured = new Map();

    const gl =
        /** @type {{
         *   VERTEX_SHADER: number,
         *   FRAGMENT_SHADER: number,
         *   LINK_STATUS: number,
         *   COMPILE_STATUS: number,
         *   createProgram: () => object,
         *   attachShader: () => void,
         *   linkProgram: () => void,
         *   getProgramParameter: () => boolean,
         *   getProgramInfoLog: () => string,
         *   getShaderParameter: () => boolean,
         *   getShaderInfoLog: () => string,
         *   getExtension: (name: string) => object | null,
         *   getShaderSource: (shader: FakeShader) => string,
         *   deleteShader: () => void,
         *   deleteProgram: () => void,
         * }} */
        ({
            VERTEX_SHADER,
            FRAGMENT_SHADER,
            LINK_STATUS: 0x8b82,
            COMPILE_STATUS: 0x8b81,
            createProgram() {
                return {};
            },
            attachShader() {},
            linkProgram() {},
            getProgramParameter() {
                return true;
            },
            getProgramInfoLog() {
                return "";
            },
            getShaderParameter() {
                return true;
            },
            getShaderInfoLog() {
                return "";
            },
            getExtension() {
                return null;
            },
            /** @param {FakeShader} shader */
            getShaderSource(shader) {
                return shader.source;
            },
            deleteShader() {},
            deleteProgram() {},
        });

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
            loadSpec(
                "../../../../examples/docs/grammar/parameters/interval-selection.json"
            )
        );

        expect(sources).toMatchSnapshot();
    });

    test("point selection example", async () => {
        const sources = await captureShaderSources(
            loadSpec(
                "../../../../examples/docs/grammar/parameters/point-selection.json"
            )
        );

        expect(sources).toMatchSnapshot();
    });

    test("link mark control spec", async () => {
        const sources = await captureShaderSources({
            data: {
                values: [{ x: 2, x2: 8, y: 3 }],
            },
            resolve: {
                scale: { x: "shared", y: "shared" },
            },
            mark: {
                type: "link",
                linkShape: "arc",
                orient: "vertical",
            },
            encoding: {
                x: { field: "x", type: "quantitative" },
                x2: { field: "x2" },
                y: { field: "y", type: "quantitative" },
                y2: { field: "y" },
            },
        });

        expect(sources).toMatchSnapshot();
    });

    test("penguins scatter plot example", async () => {
        const sources = await captureShaderSources(
            loadSpec(
                "../../../../examples/docs/grammar/parameters/penguins.json"
            ),
            "scatterPlot"
        );

        expect(sources).toMatchSnapshot();
    });
});
