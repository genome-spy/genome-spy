import { expect, test, vi } from "vitest";
import { makeParamRuntimeProvider, processData } from "../flowTestUtils.js";
import Collector from "../collector.js";
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

test("MeasureTextTransform reacts to changed expression-backed font size", () => {
    const provider = makeParamRuntimeProvider();
    const setFontSize = provider.paramRuntime.allocateSetter("fontSize", 5);
    provider.context = /** @type {any} */ ({
        fontManager: {
            getFont: () => ({
                texture: /** @type {WebGLTexture | undefined} */ (undefined),
                metrics: {
                    measureWidth: (
                        /** @type {string} */ text,
                        /** @type {number} */ size
                    ) => text.length * size,
                },
            }),
            getDefaultFont: () => {
                throw new Error("Default font should not be used.");
            },
        },
    });

    const source = new Collector();
    const transform = new MeasureTextTransform(
        {
            type: "measureText",
            field: "label",
            font: "Roboto Condensed",
            fontSize: { expr: "fontSize % 10" },
            as: "width",
        },
        provider
    );
    const output = new Collector();
    source.addChild(transform);
    transform.addChild(output);
    transform.initialize();
    source.handle({ label: "abc" });
    source.complete();

    expect([...output.getData()]).toEqual([{ label: "abc", width: 15 }]);

    const repropagate = vi.spyOn(source, "repropagate");
    setFontSize(15);

    expect(repropagate).not.toHaveBeenCalled();
    expect([...output.getData()]).toEqual([{ label: "abc", width: 15 }]);

    setFontSize(10);

    expect(repropagate).toHaveBeenCalledOnce();
    expect([...output.getData()]).toEqual([{ label: "abc", width: 0 }]);
});
