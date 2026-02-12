// @vitest-environment jsdom
import { render } from "lit";
import { expect, test } from "vitest";
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
        rows: [
            { key: "chrom", value: "chr1" },
            { key: "start", value: 10 },
            { key: "score", value: 5 },
        ],
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
