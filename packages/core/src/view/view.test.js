import { describe, expect, test } from "vitest";
import UnitView from "./unitView.js";

import { create, createAndInitialize } from "./testUtils.js";
import { toRegularArray as r } from "../utils/domainArray.js";
import ConcatView from "./concatView.js";
import PointMark from "../marks/point.js";
import View from "./view.js";
import LayerView from "./layerView.js";

describe("Trivial creations and initializations", () => {
    test("Fails on empty spec", async () => {
        // @ts-expect-error
        expect(create({}, View)).rejects.toThrow();
    });

    test("Parses a trivial spec", () => {
        expect(create({ mark: "point" }, View)).resolves.toBeInstanceOf(
            UnitView
        );
        expect(create({ layer: [] }, View)).resolves.toBeInstanceOf(LayerView);
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
            expect(r(view.extractDataDomain("x", "quantitative"))).toEqual([
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
            expect(r(view.extractDataDomain("y", "quantitative"))).toEqual([
                1, 3,
            ])
        ));

    test("Extracts domain from conditional encoding", () =>
        createAndInitialize(
            {
                data: dataSpec,
                mark: "point",
                encoding: {
                    size: {
                        field: "a",
                        type: "quantitative",
                        condition: {
                            datum: 123,
                        },
                    },
                },
            },
            UnitView
        ).then((view) =>
            expect(r(view.extractDataDomain("size", "quantitative"))).toEqual([
                1, 123,
            ])
        ));
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
        ).then((view) => expect(view.getBaseUrl()).toEqual("blaa"));

        await createAndInitialize(
            {
                baseUrl: "https://site.com",
                layer: [],
            },
            LayerView
        ).then((view) => expect(view.getBaseUrl()).toEqual("https://site.com"));

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
                "https://site.com/blaa"
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
                "https://another-site.com"
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
                "https://site.com/blaa"
            )
        );
    });
});
