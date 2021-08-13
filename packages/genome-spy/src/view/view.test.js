import UnitView from "./unitView";
import LayerView from "./layerView";

import { create, createAndInitialize } from "./testUtils";
import { toRegularArray as r } from "../utils/domainArray";
import ConcatView from "./concatView";
import PointMark from "../marks/pointMark";
import View from "./view";

describe("Trivial creations and initializations", () => {
    test("Fails on empty spec", () => {
        // @ts-ignore
        expect(() => create({}, View)).toThrow();
    });

    test("Parses a trivial spec", () => {
        expect(create({ mark: "point" }, View)).toBeInstanceOf(UnitView);
        expect(create({ layer: [] }, View)).toBeInstanceOf(LayerView);
    });

    test("Parses a more comples spec", () => {
        const view = create(
            {
                concat: [
                    {
                        layer: [{ mark: "point" }, { mark: "rect" }]
                    },
                    { mark: "rect" }
                ]
            },
            ConcatView
        );

        expect(view).toBeInstanceOf(ConcatView);
        expect(view.children[0]).toBeInstanceOf(LayerView);
        expect(view.children[0].children[0]).toBeInstanceOf(UnitView);
        expect(view.children[0].children[0].mark).toBeInstanceOf(PointMark);
        expect(view.children[1]).toBeInstanceOf(UnitView);
        expect(view.children[2]).toBeUndefined();
    });

    test("Parses and initializes a trivial spec", () => {
        const spec = {
            data: { values: [1] },
            mark: "point",
            encoding: {
                x: { field: "data", type: "quantitative" },
                y: { field: "data", type: "quantitative" }
            }
        };

        expect(createAndInitialize(spec, View)).resolves.toBeInstanceOf(
            UnitView
        );
    });
});

describe("Test domain handling", () => {
    const dataSpec = {
        values: [
            { a: 1, b: 3 },
            { a: 2, b: 4 },
            { a: 3, b: 5 }
        ]
    };

    test("Uses domain from the scale properties", () => {
        const spec = {
            data: dataSpec,
            mark: "point",
            encoding: {
                x: { field: "a", type: "quantitative" },
                y: {
                    field: "a",
                    type: "quantitative",
                    scale: { domain: [0, 1000] }
                }
            }
        };

        return createAndInitialize(spec, UnitView).then(view =>
            expect(r(view.getConfiguredDomain("y"))).toEqual([0, 1000])
        );
    });

    test("Includes a constant in the data domain", () => {
        const spec = {
            data: dataSpec,
            mark: "point",
            encoding: {
                x: { datum: 123, type: "quantitative" },
                y: { field: "a", type: "quantitative" }
            }
        };

        return createAndInitialize(spec, UnitView).then(view =>
            expect(r(view.extractDataDomain("x"))).toEqual([123, 123])
        );
    });

    test("Extracts domain from the data", () => {
        const spec = {
            data: dataSpec,
            mark: "point",
            encoding: {
                x: { field: "a", type: "quantitative" },
                y: { field: "a", type: "quantitative" }
            }
        };

        return createAndInitialize(spec, UnitView).then(view =>
            expect(r(view.extractDataDomain("y"))).toEqual([1, 3])
        );
    });

    test("Extracts domain from the data when a secondary channel is being used", () => {
        const spec = {
            data: dataSpec,
            mark: "rect",
            encoding: {
                x: { field: "a", type: "quantitative" },
                y: { field: "a", type: "quantitative" },
                y2: { field: "b", type: "quantitative" }
            }
        };

        return createAndInitialize(spec, UnitView).then(view =>
            expect(r(view.extractDataDomain("y"))).toEqual([1, 5])
        );
    });
});

describe("Utility methods", () => {
    test("BaseUrl is handled correctly", async () => {
        createAndInitialize(
            {
                layer: []
            },
            LayerView
        ).then(view => expect(view.getBaseUrl()).toBeUndefined());

        await createAndInitialize(
            {
                baseUrl: "blaa",
                layer: []
            },
            LayerView
        ).then(view => expect(view.getBaseUrl()).toEqual("blaa"));

        await createAndInitialize(
            {
                baseUrl: "https://site.com",
                layer: []
            },
            LayerView
        ).then(view => expect(view.getBaseUrl()).toEqual("https://site.com"));

        await createAndInitialize(
            {
                baseUrl: "https://site.com",
                layer: [
                    {
                        baseUrl: "blaa",
                        layer: []
                    }
                ]
            },
            LayerView
        ).then(view =>
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
                        layer: []
                    }
                ]
            },
            LayerView
        ).then(view =>
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
                                layer: []
                            }
                        ]
                    }
                ]
            },
            LayerView
        ).then(view =>
            expect(view.children[0].children[0].getBaseUrl()).toEqual(
                "https://site.com/blaa"
            )
        );
    });
});
