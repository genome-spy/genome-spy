// @vitest-environment jsdom
import { scaleOrdinal } from "d3-scale";
import { render } from "lit";
import { expect, test } from "vitest";
import { createConditionalAccessors } from "../encoder/accessor.js";
import { createSimpleOrConditionalEncoder } from "../encoder/encoder.js";
import ViewParamRuntime from "../paramRuntime/viewParamRuntime.js";
import { createIntervalSelection } from "../selection/selection.js";
import dataTooltipHandler from "./dataTooltipHandler.js";

/**
 * @param {import("lit").TemplateResult | string | HTMLElement | undefined} content
 */
function toContainer(content) {
    const container = document.createElement("div");
    if (content) {
        render(content, container);
    }
    return container;
}

test("Renders genomic rows first and hides configured raw rows", async () => {
    const datum = {
        chrom: "chr1",
        start: 10,
        score: 5,
    };

    const mark = /** @type {any} */ ({
        encoders: {},
        unitView: {
            getTitleText: () => "",
        },
    });

    const context = {
        genomicRows: [{ key: "locus", value: "chr1:11" }],
        hiddenRowKeys: ["chrom", "start"],
    };

    const content = await dataTooltipHandler(
        datum,
        mark,
        undefined,
        /** @type {any} */ (context)
    );
    const container = toContainer(content);

    const keys = Array.from(container.querySelectorAll("th")).map((el) =>
        el.textContent?.trim()
    );
    expect(keys).toEqual(["locus", "score"]);
});

test("Falls back to datum flattening when no context is provided", async () => {
    const datum = {
        sample: "S1",
        nested: { value: 42 },
        _internal: "skip",
    };

    const mark = /** @type {any} */ ({
        encoders: {},
        unitView: {
            getTitleText: () => "",
        },
    });

    const content = await dataTooltipHandler(datum, mark);
    const container = toContainer(content);

    const keys = Array.from(container.querySelectorAll("th")).map((el) =>
        el.textContent?.trim()
    );
    expect(keys).toEqual(["sample", "nested.value"]);
});

test("Matches color legend fields that use bracket notation", async () => {
    const datum = {
        category: "A",
    };

    const fillEncoder = /** @type {any} */ (
        Object.assign(() => "#ff0000", {
            dataAccessor: {
                fields: ["['category']"],
            },
        })
    );

    const mark = /** @type {any} */ ({
        encoders: {
            fill: fillEncoder,
        },
        unitView: {
            getTitleText: () => "",
        },
    });

    const content = await dataTooltipHandler(datum, mark);
    const container = toContainer(content);
    const legend = container.querySelector(".color-legend");
    expect(legend).not.toBeNull();
});

test("Shows an empty swatch when color scale returns null for a present value", async () => {
    const datum = {
        category: "C",
    };

    /**
     * @returns {null}
     */
    const fillEncoderFn = () => null;
    const fillEncoder = /** @type {any} */ (
        Object.assign(fillEncoderFn, {
            dataAccessor: {
                fields: ["category"],
            },
        })
    );

    const mark = /** @type {any} */ ({
        encoders: {
            fill: fillEncoder,
        },
        unitView: {
            getTitleText: () => "",
        },
    });

    const content = await dataTooltipHandler(datum, mark);
    const container = toContainer(content);
    const legend = container.querySelector(".color-legend-unmapped");
    expect(legend).not.toBeNull();
});

test("Does not show swatch for null value when color scale returns null", async () => {
    /** @type {{ category: string | null }} */
    const datum = {
        category: null,
    };

    /**
     * @returns {null}
     */
    const fillEncoderFn = () => null;
    const fillEncoder = /** @type {any} */ (
        Object.assign(fillEncoderFn, {
            dataAccessor: {
                fields: ["category"],
            },
        })
    );

    const mark = /** @type {any} */ ({
        encoders: {
            fill: fillEncoder,
        },
        unitView: {
            getTitleText: () => "",
        },
    });

    const content = await dataTooltipHandler(datum, mark);
    const container = toContainer(content);
    const legend = container.querySelector(".color-legend");
    expect(legend).toBeNull();
});

test("Uses the active conditional color branch for point tooltip legends", async () => {
    const datum = {
        Species: "Gentoo",
        "Beak Length (mm)": 47,
        "Beak Depth (mm)": 17,
    };

    const colorEncoding = {
        condition: {
            param: "brush",
            field: "Species",
            type: "nominal",
            scale: {
                domain: ["Chinstrap", "Adelie", "Gentoo"],
                range: ["#BF5CCA", "#FF6C02", "#0F7574"],
            },
        },
        value: "lightgrey",
    };

    const paramRuntime = new ViewParamRuntime();
    const setBrush = paramRuntime.allocateSetter(
        "brush",
        createIntervalSelection(["x", "y"])
    );
    setBrush({
        type: "interval",
        intervals: {
            x: [40, 50],
            y: [15, 20],
        },
    });

    const colorScale = Object.assign(
        scaleOrdinal()
            .domain(colorEncoding.condition.scale.domain)
            .range(colorEncoding.condition.scale.range),
        {
            type: "ordinal",
        }
    );

    const colorEncoder = createSimpleOrConditionalEncoder(
        createConditionalAccessors("color", colorEncoding, paramRuntime),
        () => colorScale
    );

    const mark = /** @type {any} */ ({
        encoding: {
            x: {
                field: "Beak Length (mm)",
                type: "quantitative",
            },
            y: {
                field: "Beak Depth (mm)",
                type: "quantitative",
            },
            color: colorEncoding,
        },
        encoders: {
            color: colorEncoder,
        },
        getType: () => "point",
        unitView: {
            getTitleText: () => "",
            paramRuntime,
        },
    });

    const content = await dataTooltipHandler(datum, mark);
    const container = toContainer(content);
    const legends = Array.from(container.querySelectorAll(".color-legend"));

    expect(legends).toHaveLength(1);
    expect(legends[0].getAttribute("style")).toContain("#0F7574");
});
