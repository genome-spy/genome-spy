import { expect, onTestFinished, test } from "vitest";
import { createHeadlessEngine } from "../../../genomeSpy/headlessBootstrap.js";
import BigWigSource from "./bigWigSource.js";

/** @returns {import("../../../spec/view.js").UnitSpec} */
function lazySpec() {
    return {
        data: { lazy: { type: "bigwig", url: "unused.bw" } },
        transform: [{ type: "values", field: "start", param: "positions" }],
        mark: "point",
        encoding: {
            x: {
                chrom: "chrom",
                pos: "start",
                type: "locus",
                scale: { domain: [0, 10] },
                axis: null,
            },
        },
    };
}

test.each([false, true])(
    "rejects implicit lazy domain feedback (computed alias: %s)",
    async (indirect) => {
        const spec = lazySpec();
        if (indirect) {
            spec.params = [
                {
                    name: "requested",
                    expr: "length(positions) ? positions : [0, 10]",
                },
            ];
        }
        const x =
            /** @type {import("../../../spec/channel.js").PositionFieldDef} */ (
                spec.encoding.x
            );
        x.scale.domain = {
            expr: indirect
                ? "requested"
                : "length(positions) ? positions : [0, 10]",
        };
        await expect(createHeadlessEngine(spec)).rejects.toThrow(
            'cannot consume transform output parameter "positions"'
        );
    }
);

test.each(["own", "ancestor", "shared member"])(
    "rejects BigWig resolution feedback through %s sizing",
    async (placement) => {
        const spec = /** @type {any} */ (lazySpec());
        const width = { expr: "100 + length(positions)" };
        if (placement === "own") {
            spec.width = width;
        } else {
            const unit = {
                mark: spec.mark,
                encoding: spec.encoding,
                ...(placement === "shared member" ? { width } : {}),
            };
            delete spec.mark;
            delete spec.encoding;
            spec.layer = [unit];
            if (placement === "ancestor") spec.width = width;
        }
        await expect(createHeadlessEngine(spec)).rejects.toThrow(
            'cannot consume transform output parameter "positions"'
        );
    }
);

test("tracks rebinding and member additions, while permitting independent visual consumers", async () => {
    const spec = /** @type {any} */ (lazySpec());
    const { mark, encoding } = spec;
    delete spec.mark;
    delete spec.encoding;
    spec.layer = [
        { name: "signal", mark, encoding },
        {
            name: "message",
            data: { values: [{}] },
            mark: { type: "text", text: { expr: "length(positions)" } },
        },
    ];
    const { view } = await createHeadlessEngine(spec);
    onTestFinished(() => view.disposeSubtree());
    const resolution = view.getScaleResolution("x");
    const runtime = view.paramRuntime;
    const positions = runtime.getParamRef("positions");
    const dependency = resolution.getAxisLengthDependencyRef();

    expect(view.flowHandle.dataSource).toBeInstanceOf(BigWigSource);
    expect(() =>
        runtime.setValidationDependencies(dependency, [positions])
    ).toThrow("cannot consume transform output");
    const layer = /** @type {import("../../../view/layerView.js").default} */ (
        view
    );
    await expect(
        layer.addChildSpec({
            name: "feedback",
            width: { expr: "100 + length(positions)" },
            data: { values: [{ chrom: "chr1", start: 0 }] },
            mark,
            encoding,
        })
    ).rejects.toThrow("cannot consume transform output");
    expect(layer.children.map((child) => child.name)).toEqual([
        "signal",
        "message",
    ]);

    // A separate eager producer may drive visual properties beside a lazy track.
    await layer.addChildSpec({
        name: "independent",
        data: { values: [{ label: "A" }] },
        transform: [{ type: "values", field: "label", param: "labels" }],
        mark: { type: "text", text: { expr: "labels[0]" } },
    });
    expect(layer.children.at(-1).paramRuntime.getValue("labels")).toEqual([
        "A",
    ]);
});

test("rejects a later configured domain that consumes an output", async () => {
    const spec = lazySpec();
    const x =
        /** @type {import("../../../spec/channel.js").PositionFieldDef} */ (
            spec.encoding.x
        );
    delete x.scale;
    spec.scales = { x: { type: "locus", domain: [0, 10] } };
    const { view } = await createHeadlessEngine(spec);
    onTestFinished(() => view.disposeSubtree());

    expect(() =>
        view.getScaleResolution("x").attachViewLevelScaleProps(view, {
            type: "locus",
            domain: { expr: "length(positions) ? positions : [0, 10]" },
        })
    ).toThrow('cannot consume transform output parameter "positions"');
});

test("rejects resolution feedback through a sibling viewport allocation", async () => {
    const spec = lazySpec();
    const x =
        /** @type {import("../../../spec/channel.js").PositionFieldDef} */ (
            spec.encoding.x
        );
    delete x.scale;
    const result = createHeadlessEngine({
        width: 500,
        data: spec.data,
        transform: spec.transform,
        scales: { x: { type: "locus", domain: [0, 10] } },
        resolve: { scale: { x: "shared" } },
        hconcat: [
            { width: { grow: 1 }, mark: spec.mark, encoding: spec.encoding },
            {
                width: 200,
                viewportWidth: { expr: "50 + length(positions) * 10" },
                data: { values: [{}] },
                mark: "point",
            },
        ],
    });
    await expect(result).rejects.toThrow(
        'cannot consume transform output parameter "positions"'
    );
});

test("rejects a sibling's semantic width even when its width parameter is shadowed", async () => {
    const spec = lazySpec();
    const result = createHeadlessEngine({
        width: 500,
        data: spec.data,
        transform: spec.transform,
        resolve: { scale: { x: "shared" } },
        hconcat: [
            { width: { grow: 1 }, mark: spec.mark, encoding: spec.encoding },
            {
                params: [{ name: "width", value: 0 }],
                width: { expr: "50 + length(positions) * 10" },
                data: { values: [{}] },
                mark: "point",
            },
        ],
    });
    await expect(result).rejects.toThrow(
        'cannot consume transform output parameter "positions"'
    );
});

test("revalidates independent sibling mutations before reading lazy resolution", async () => {
    const spec = lazySpec();
    const { view } = await createHeadlessEngine({
        width: 500,
        data: spec.data,
        transform: spec.transform,
        resolve: { scale: { x: "shared" } },
        hconcat: [
            { width: { grow: 1 }, mark: spec.mark, encoding: spec.encoding },
        ],
    });
    onTestFinished(() => view.disposeSubtree());
    const concat =
        /** @type {import("../../../view/concatView.js").default} */ (view);
    await concat.addChildSpec({
        width: { expr: "50 + length(positions) * 10" },
        data: { values: [{}] },
        mark: "point",
    });
    expect(() => view.getScaleResolution("x").getAxisLength()).toThrow(
        'cannot consume transform output parameter "positions"'
    );
});

test.each(["domain", "disable"])(
    "rejects output-dependent legend %s that changes lazy plot allocation",
    async (property) => {
        const spec = lazySpec();
        spec.encoding.color = {
            field: "score",
            type: "quantitative",
            scale: {
                domain:
                    property === "domain"
                        ? { expr: "[0, 10 + length(positions)]" }
                        : [0, 10],
            },
            legend: property === "disable" ? undefined : {},
        };
        if (property === "disable") {
            spec.config = {
                legend: { disable: { expr: "length(positions) === 0" } },
            };
        }
        await expect(createHeadlessEngine({ vconcat: [spec] })).rejects.toThrow(
            'cannot consume transform output parameter "positions"'
        );
    }
);

test("rejects another axis's measured labels feeding lazy binning", async () => {
    const spec = lazySpec();
    spec.encoding.y = {
        field: "score",
        type: "quantitative",
        scale: { domain: { expr: "[0, 10 + length(positions)]" } },
    };
    await expect(createHeadlessEngine({ vconcat: [spec] })).rejects.toThrow(
        'cannot consume transform output parameter "positions"'
    );
});

test("permits output-dependent paint-only legend styling", async () => {
    const spec = lazySpec();
    spec.encoding.color = {
        field: "score",
        type: "quantitative",
        scale: { domain: [0, 10] },
    };
    spec.config = {
        legend: { labelColor: { expr: "length(positions) ? 'red' : 'black'" } },
    };
    const { view } = await createHeadlessEngine({ vconcat: [spec] });
    onTestFinished(() => view.disposeSubtree());
    expect(
        view
            .getDescendants()
            .some(
                (child) => child.flowHandle?.dataSource instanceof BigWigSource
            )
    ).toBe(true);
});

test.each(["fixed axis", "inside legend"])(
    "permits output-dependent guides with no effect on allocated plot space: %s",
    async (guide) => {
        const spec = lazySpec();
        if (guide === "fixed axis") {
            spec.encoding.y = {
                field: "score",
                type: "quantitative",
                scale: { domain: { expr: "[0, 10 + length(positions)]" } },
                axis: { minExtent: 40, maxExtent: 40 },
            };
        } else {
            spec.encoding.color = {
                field: "score",
                type: "quantitative",
                scale: { domain: [0, 10] },
            };
            spec.config = {
                legend: {
                    orient: "top-right",
                    disable: { expr: "length(positions) === 0" },
                },
            };
        }
        const { view } = await createHeadlessEngine({ vconcat: [spec] });
        onTestFinished(() => view.disposeSubtree());
    }
);
