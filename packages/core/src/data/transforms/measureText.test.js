import { expect, test } from "vitest";
import { makeParamRuntimeProvider, processData } from "../flowTestUtils.js";
import MeasureTextTransform from "./measureText.js";

test("MeasureTextTransform uses configured font metrics", () => {
    const provider = makeParamRuntimeProvider();

    const fontManager = /** @type {any} */ ({
        getFont: (
            /** @type {string} */ family,
            /** @type {import("../../spec/font.js").FontStyle | undefined} */ style,
            /** @type {import("../../spec/font.js").FontWeight | undefined} */ weight
        ) => {
            expect(family).toBe("Roboto Condensed");
            expect(style).toBe("italic");
            expect(weight).toBe("bold");
            return {
                texture: /** @type {WebGLTexture | undefined} */ (undefined),
                metrics: /** @type {any} */ ({
                    /** Match the signature used by bmFont metrics. */
                    measureWidth: (
                        /** @type {string} */ text,
                        /** @type {number} */ size
                    ) => text.length * size * 2,
                }),
            };
        },
        getDefaultFont: () => {
            throw new Error("Default font should not be used.");
        },
    });
    provider.context = /** @type {any} */ ({ fontManager });

    const transform = new MeasureTextTransform(
        {
            type: "measureText",
            field: "label",
            font: "Roboto Condensed",
            fontStyle: "italic",
            fontWeight: "bold",
            fontSize: 5,
            as: "width",
        },
        provider
    );

    transform.initialize();

    expect(processData(transform, [{ label: "abc" }])).toEqual([
        { label: "abc", width: 30 },
    ]);
});
