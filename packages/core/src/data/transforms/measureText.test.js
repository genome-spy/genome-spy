import { expect, test, vi } from "vitest";
import { makeParamRuntimeProvider, processData } from "../flowTestUtils.js";
import Collector from "../collector.js";
import MeasureTextTransform from "./measureText.js";

test("MeasureTextTransform uses configured font metrics", () => {
    const provider = makeParamRuntimeProvider();

    const textMetrics = /** @type {any} */ ({
        requestFont: (/** @type {any} */ config) => {
            expect(config).toMatchObject({
                font: "Roboto Condensed",
                fontStyle: "italic",
                fontWeight: "bold",
            });
            return {
                measureWidth: (
                    /** @type {string} */ text,
                    /** @type {number} */ size
                ) => text.length * size * 2,
                getHeight: () => 0,
            };
        },
    });
    provider.context = /** @type {any} */ ({ textMetrics });

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

test("MeasureTextTransform preserves style when using the default family", () => {
    const provider = makeParamRuntimeProvider();
    const requestFont = vi.fn(() => ({
        measureWidth: () => 10,
        getHeight: () => 0,
    }));
    provider.context = /** @type {any} */ ({
        textMetrics: {
            requestFont,
        },
    });

    const transform = new MeasureTextTransform(
        {
            type: "measureText",
            field: "label",
            fontStyle: "italic",
            fontWeight: "bold",
            fontSize: 5,
            as: "width",
        },
        provider
    );

    transform.initialize();

    expect(requestFont).toHaveBeenCalledWith(
        expect.objectContaining({ fontStyle: "italic", fontWeight: "bold" })
    );
});

test("MeasureTextTransform reacts to changed expression-backed font size", () => {
    const provider = makeParamRuntimeProvider();
    const setFontSize = provider.paramRuntime.allocateSetter("fontSize", 5);
    provider.context = /** @type {any} */ ({
        textMetrics: {
            requestFont: () => ({
                measureWidth: (
                    /** @type {string} */ text,
                    /** @type {number} */ size
                ) => text.length * size,
                getHeight: () => 0,
            }),
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
