import { expect, onTestFinished, test, vi } from "vitest";
import { createHeadlessEngine } from "../../../genomeSpy/headlessBootstrap.js";

/** @param {Partial<import("../../../spec/view.js").LayerSpec>} [overrides]
 * @param {("x" | "y")[]} [channels]
 */
async function createGroups(overrides = {}, channels = ["x"]) {
    const xType = overrides.scales?.x?.type === "locus" ? "locus" : "index";
    const { view } = await createHeadlessEngine({
        params: [
            { name: "cuts", value: [10] },
            { name: "width", value: 6 },
        ],
        data: {
            values: [
                { x: 0, y: 0 },
                { x: 19, y: 9 },
            ],
        },
        scales: {
            x: {
                type: "index",
                gapPositions: { expr: "cuts" },
                gapWidth: { expr: "width" },
            },
        },
        layer: [
            {
                mark: "point",
                encoding: {
                    x: { field: "x", type: xType, axis: null },
                    y: { field: "y", type: "index", axis: null },
                },
            },
            {
                name: "groups",
                domainInert: true,
                data: { lazy: { type: "scaleGroups", channels } },
                mark: "rect",
                encoding: Object.fromEntries(
                    channels.flatMap((channel) => [
                        [
                            channel,
                            {
                                field: channel + "Start",
                                type: channel === "x" ? xType : "index",
                                band: 0,
                                axis: /** @type {null} */ (null),
                            },
                        ],
                        [channel + "2", { field: channel + "End", band: 0 }],
                    ])
                ),
            },
        ],
        ...overrides,
    });
    onTestFinished(() => view.disposeSubtree());
    const groups = /** @type {import("../../../view/unitView.js").default} */ (
        view.getDescendants().find((v) => v.name === "groups")
    );
    const rows = () =>
        Array.from(groups.getCollector().getData(), (row) =>
            channels.flatMap((channel) => [
                row[channel + "Start"],
                row[channel + "End"],
            ])
        );
    return { view, source: groups.flowHandle.dataSource, rows };
}

test("groups follow effective cuts and retain full bounds while zooming", async () => {
    const { view, source, rows } = await createGroups();
    expect(source.isDataReady()).toBe(true);
    expect(rows()).toEqual([
        [0, 10],
        [10, 20],
    ]);
    const publish = vi.spyOn(source, "complete");
    await view.getScaleResolution("x").zoomTo([5, 14]);
    view.paramRuntime.setValue("width", 12);
    view.paramRuntime.flushNow();
    expect(publish).not.toHaveBeenCalled();
    for (const [width, cuts, expected] of [
        [0, [10], [[0, 20]]],
        [
            6,
            [5],
            [
                [0, 5],
                [5, 20],
            ],
        ],
    ]) {
        view.paramRuntime.setValue("width", width);
        view.paramRuntime.setValue("cuts", cuts);
        view.paramRuntime.flushNow();
        expect(rows()).toEqual(expected);
    }
});

test("two-axis groups form a product without changing scale domains", async () => {
    const { view, rows } = await createGroups(
        {
            scales: {
                x: { type: "index", domain: [0, 19], gapPositions: [10] },
                y: { type: "index", domain: [0, 9], gapPositions: [5] },
            },
        },
        ["x", "y"]
    );
    expect(rows()).toEqual([
        [0, 10, 0, 5],
        [0, 10, 5, 10],
        [10, 20, 0, 5],
        [10, 20, 5, 10],
    ]);
    expect(view.getScaleResolution("x").getDomain()).toEqual([0, 20]);
    expect(view.getScaleResolution("y").getDomain()).toEqual([0, 10]);
});

test("locus groups span the assembly, including unloaded chromosomes", async () => {
    const { rows } = await createGroups({
        scales: {
            x: {
                type: "locus",
                gapPositions: "chromosomes",
                assembly: {
                    contigs: [
                        { name: "chr1", size: 10 },
                        { name: "chr2", size: 20 },
                    ],
                },
            },
        },
    });
    expect(rows()).toEqual([
        [0, 10],
        [10, 30],
    ]);
});
