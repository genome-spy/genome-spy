import { describe, expect, test } from "vitest";
import UnitView from "./unitView.js";

import {
    create,
    createAndInitialize,
    createTestViewContext,
} from "./testUtils.js";
import { toRegularArray as r } from "../utils/domainArray.js";
import ConcatView from "./concatView.js";
import PointMark from "../marks/point.js";
import View from "./view.js";
import LayerView from "./layerView.js";
import {
    initializeViewSubtree,
    loadViewSubtreeData,
} from "../data/flowInit.js";

describe("Trivial creations and initializations", () => {
    test("Fails on empty spec", async () => {
        // @ts-expect-error
        await expect(create({}, View)).rejects.toThrow();
    });

    test("Parses a trivial spec", async () => {
        await expect(create({ mark: "point" }, View)).resolves.toBeInstanceOf(
            UnitView
        );
        await expect(create({ layer: [] }, View)).resolves.toBeInstanceOf(
            LayerView
        );
        await expect(
            create(
                {
                    multiscale: [{ mark: "point" }, { mark: "rect" }],
                    stops: [1000],
                },
                View
            )
        ).resolves.toBeInstanceOf(LayerView);
    });

    test("Wraps root multiscale into implicit grid root", async () => {
        const view = await create(
            {
                multiscale: [{ mark: "point" }, { mark: "rect" }],
                stops: [1000],
            },
            ConcatView,
            { wrapRoot: true }
        );

        expect(view).toBeInstanceOf(ConcatView);
        expect(view.children[0]).toBeInstanceOf(LayerView);
    });

    test("Parses a more comples spec", async () => {
        const view = await create(
            {
                hconcat: [
                    {
                        layer: [{ mark: "point" }, { mark: "rect" }],
                    },
                    { mark: "rect" },
                ],
            },
            ConcatView
        );

        expect(view).toBeInstanceOf(ConcatView);
        expect(view.children[0]).toBeInstanceOf(LayerView);
        // @ts-ignore
        expect(view.children[0].children[0]).toBeInstanceOf(UnitView);
        // @ts-ignore
        expect(view.children[0].children[0].mark).toBeInstanceOf(PointMark);
        expect(view.children[1]).toBeInstanceOf(UnitView);
        expect(view.children[2]).toBeUndefined();
    });

    test("Parses and initializes a trivial spec", () =>
        expect(
            createAndInitialize(
                {
                    data: { values: [1] },
                    mark: "point",
                    encoding: {
                        x: { field: "data", type: "quantitative" },
                        y: { field: "data", type: "quantitative" },
                    },
                },
                View
            )
        ).resolves.toBeInstanceOf(UnitView));

    test("Broadcast handler disposer unregisters listener", async () => {
        const view = await create({ mark: "point" }, View);

        let calls = 0;
        const disposer = view._addBroadcastHandler("layoutComputed", () => {
            calls += 1;
        });

        view.handleBroadcast({ type: "layoutComputed" });
        expect(calls).toBe(1);

        disposer();
        view.handleBroadcast({ type: "layoutComputed" });
        expect(calls).toBe(1);
    });

    test("Preserves inherited key channel in unit views", async () => {
        const view = await create(
            {
                encoding: { key: { field: "id" } },
                layer: [{ mark: "point" }],
            },
            LayerView
        );

        const unitView = view.children[0];
        expect(unitView).toBeInstanceOf(UnitView);
        expect(unitView.getEncoding().key).toEqual({ field: "id" });
    });

    test("Preserves inherited composite key channel in unit views", async () => {
        const view = await create(
            {
                encoding: {
                    key: [
                        { field: "sampleId" },
                        { field: "chrom" },
                        { field: "pos" },
                    ],
                },
                layer: [{ mark: "point" }],
            },
            LayerView
        );

        const unitView = view.children[0];
        expect(unitView).toBeInstanceOf(UnitView);
        expect(unitView.getEncoding().key).toEqual([
            { field: "sampleId" },
            { field: "chrom" },
            { field: "pos" },
        ]);
    });

    test("Initializes a unit view with a composite key channel", () =>
        expect(
            createAndInitialize(
                {
                    data: {
                        values: [
                            {
                                sampleId: "S1",
                                chrom: "chr1",
                                pos: 10,
                                value: 1,
                            },
                        ],
                    },
                    mark: "point",
                    encoding: {
                        key: [
                            { field: "sampleId" },
                            { field: "chrom" },
                            { field: "pos" },
                        ],
                        x: { field: "pos", type: "quantitative" },
                        y: { field: "value", type: "quantitative" },
                    },
                },
                UnitView
            )
        ).resolves.toBeInstanceOf(UnitView));

    test("Dynamic opacity channel auto averages x and y metrics", async () => {
        const view = await createAndInitialize(
            {
                data: {
                    values: [
                        { x: 0, y: 0 },
                        { x: 100, y: 900 },
                    ],
                },
                mark: "point",
                opacity: {
                    channel: "auto",
                    unitsPerPixel: [1, 0.01],
                    values: [0, 1],
                },
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    y: { field: "y", type: "quantitative" },
                },
            },
            UnitView
        );

        view.configureViewOpacity();

        expect(view.getEffectiveOpacity()).toBeCloseTo(0.1505, 3);
    });

    test("Dynamic opacity channel auto fails if no positional scales exist", async () => {
        const view = await create(
            {
                mark: "point",
                opacity: {
                    channel: "auto",
                    unitsPerPixel: [1000, 100],
                    values: [0, 1],
                },
            },
            UnitView
        );

        expect(() => view.configureViewOpacity()).toThrow(
            "Cannot find a resolved quantitative x or y scale for dynamic opacity!"
        );
    });
});

describe("Test domain handling", () => {
    const dataSpec = {
        values: [
            { a: 1, b: 3 },
            { a: 2, b: 4 },
            { a: 3, b: 5 },
        ],
    };

    /** -- This should be moved to ScaleResolution's test
    test("Uses domain from the scale properties", () => {
        const spec = {
            data: dataSpec,
            mark: "point",
            encoding: {
                x: { field: "a", type: "quantitative" },
                y: {
                    field: "a",
                    type: "quantitative",
                    scale: { domain: [0, 1000] },
                },
            },
        };

        return createAndInitialize(spec, UnitView).then((view) =>
            expect(r(view.getConfiguredDomain("y"))).toEqual([0, 1000])
        );
    });
    */

    test("Includes a constant in the data domain", () =>
        createAndInitialize(
            {
                data: dataSpec,
                mark: "point",
                encoding: {
                    x: { datum: 123, type: "quantitative" },
                    y: { field: "a", type: "quantitative" },
                },
            },
            UnitView
        ).then((view) =>
            expect(r(view.getScaleResolution("x").getDataDomain())).toEqual([
                123, 123,
            ])
        ));

    test("Extracts domain from the data", () =>
        createAndInitialize(
            {
                data: dataSpec,
                mark: "point",
                encoding: {
                    x: { field: "a", type: "quantitative" },
                    y: { field: "a", type: "quantitative" },
                },
            },
            UnitView
        ).then((view) =>
            expect(r(view.getScaleResolution("y").getDataDomain())).toEqual([
                1, 3,
            ])
        ));

    test("Extracts domain from conditional encoding", () =>
        createAndInitialize(
            {
                params: [{ name: "p" }],
                data: dataSpec,
                mark: "point",
                encoding: {
                    size: {
                        field: "a",
                        type: "quantitative",
                        condition: {
                            param: "p",
                            datum: 123,
                        },
                    },
                },
            },
            UnitView
        ).then((view) =>
            expect(r(view.getScaleResolution("size").getDataDomain())).toEqual([
                1, 123,
            ])
        ));

    test("domainInert views do not contribute to shared domains", () =>
        createAndInitialize(
            {
                data: dataSpec,
                resolve: {
                    scale: { x: "shared" },
                },
                layer: [
                    {
                        mark: "point",
                        encoding: {
                            x: { field: "a", type: "quantitative" },
                        },
                    },
                    {
                        domainInert: true,
                        mark: "point",
                        encoding: {
                            x: { field: "b", type: "quantitative" },
                        },
                    },
                ],
            },
            LayerView
        ).then((view) =>
            expect(
                r(view.children[0].getScaleResolution("x").getDataDomain())
            ).toEqual([1, 3])
        ));

    test("domainInert is inherited by child views", () =>
        createAndInitialize(
            {
                domainInert: true,
                layer: [
                    {
                        data: dataSpec,
                        mark: "point",
                        encoding: {
                            x: { field: "a", type: "quantitative" },
                        },
                    },
                ],
            },
            LayerView
        ).then((view) => expect(view.children[0].isDomainInert()).toBe(true)));
});

describe("Step sizing and domain updates", () => {
    test("Layer view width updates when discrete domain grows", async () => {
        // Non-obvious: step sizing depends on the x-scale domain, which is owned
        // by a child unit view. Ensure the parent layer size updates on data changes.
        const context = createTestViewContext();
        context.getNamedDataFromProvider = () => [{ x: "a" }, { x: "b" }];

        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            width: { step: 10 },
            height: 10,
            data: { name: "data" },
            layer: [
                {
                    mark: "rect",
                    encoding: {
                        x: { field: "x", type: "nominal" },
                        y: { value: 0 },
                        y2: { value: 1 },
                    },
                },
            ],
        };

        const view = await context.createOrImportView(spec, null, null, "root");
        expect(view).toBeInstanceOf(LayerView);

        view.visit((v) => {
            if (v instanceof UnitView) {
                v.mark.initializeEncoders();
            }
        });

        const { dataSources } = initializeViewSubtree(view, context.dataFlow);
        await loadViewSubtreeData(view, dataSources);

        const initialWidth = view.getSize().width.px;
        const named = context.dataFlow.findNamedDataSource("data");
        named.dataSource.updateDynamicData([
            { x: "a" },
            { x: "b" },
            { x: "c" },
        ]);

        const updatedWidth = view.getSize().width.px;
        expect(updatedWidth).toBeGreaterThan(initialWidth);
    });

    test("Layer view width updates when group depth changes", async () => {
        // Non-obvious: mirrors SampleGroupView (encoding on LayerView, data via named source).
        const context = createTestViewContext();
        context.getNamedDataFromProvider = () => [
            { _index: 0, _depth: 1, name: "A", title: "A" },
            { _index: 1, _depth: 2, name: "B", title: "B" },
        ];

        /** @type {import("../spec/view.js").LayerSpec} */
        const spec = {
            width: { step: 22 },
            height: 10,
            data: { name: "groups" },
            transform: [
                { type: "filter", expr: "datum._depth > 0" },
                { type: "formula", as: "_y1", expr: "datum._index * 2" },
                { type: "formula", as: "_y2", expr: "datum._index * 2 + 1" },
                {
                    type: "formula",
                    as: "_title",
                    expr: "datum.title || datum.name",
                },
                { type: "formula", as: "_NA", expr: "datum._title === null" },
                {
                    type: "formula",
                    as: "_title",
                    expr: "datum._title !== null ? datum._title: 'NA'",
                },
            ],
            encoding: {
                x: {
                    field: "_depth",
                    type: "ordinal",
                    scale: { align: 0, padding: 0.2272727 },
                    axis: null,
                },
                y: {
                    field: "_y1",
                    type: "nominal",
                    scale: { type: "ordinal", domain: [0, 1, 2, 3] },
                    axis: null,
                },
                y2: { field: "_y2" },
            },
            layer: [
                { mark: { type: "rect" } },
                {
                    mark: { type: "text" },
                    encoding: { text: { field: "_title" } },
                },
            ],
        };

        const view = await context.createOrImportView(spec, null, null, "root");
        expect(view).toBeInstanceOf(LayerView);

        view.visit((v) => {
            if (v instanceof UnitView) {
                v.mark.initializeEncoders();
            }
        });

        const { dataSources } = initializeViewSubtree(view, context.dataFlow);
        await loadViewSubtreeData(view, dataSources);

        const initialWidth = view.getSize().width.px;

        const named = context.dataFlow.findNamedDataSource("groups");
        named.dataSource.updateDynamicData([
            { _index: 0, _depth: 1, name: "A", title: "A" },
            { _index: 1, _depth: 2, name: "B", title: "B" },
            { _index: 2, _depth: 3, name: "C", title: "C" },
        ]);

        const updatedWidth = view.getSize().width.px;
        expect(updatedWidth).toBeGreaterThan(initialWidth);
    });
});

describe("Utility methods", () => {
    test("BaseUrl is handled correctly", async () => {
        createAndInitialize(
            {
                layer: [],
            },
            LayerView
        ).then((view) => expect(view.getBaseUrl()).toBeUndefined());

        await createAndInitialize(
            {
                baseUrl: "blaa",
                layer: [],
            },
            LayerView
        ).then((view) => expect(view.getBaseUrl()).toEqual("blaa/"));

        await createAndInitialize(
            {
                baseUrl: "blaa/",
                layer: [],
            },
            LayerView
        ).then((view) => expect(view.getBaseUrl()).toEqual("blaa/"));

        await createAndInitialize(
            {
                baseUrl: "https://site.com",
                layer: [],
            },
            LayerView
        ).then((view) =>
            expect(view.getBaseUrl()).toEqual("https://site.com/")
        );

        await createAndInitialize(
            {
                baseUrl: "https://site.com",
                layer: [
                    {
                        baseUrl: "blaa",
                        layer: [],
                    },
                ],
            },
            LayerView
        ).then((view) =>
            expect(view.children[0].getBaseUrl()).toEqual(
                "https://site.com/blaa/"
            )
        );

        await createAndInitialize(
            {
                baseUrl: "https://site.com",
                layer: [
                    {
                        baseUrl: "https://another-site.com",
                        layer: [],
                    },
                ],
            },
            LayerView
        ).then((view) =>
            expect(view.children[0].getBaseUrl()).toEqual(
                "https://another-site.com/"
            )
        );

        await createAndInitialize(
            {
                baseUrl: "https://site.com",
                layer: [
                    {
                        layer: [
                            {
                                baseUrl: "blaa",
                                layer: [],
                            },
                        ],
                    },
                ],
            },
            LayerView
        ).then((view) =>
            // @ts-ignore
            expect(view.children[0].children[0].getBaseUrl()).toEqual(
                "https://site.com/blaa/"
            )
        );
    });
});
