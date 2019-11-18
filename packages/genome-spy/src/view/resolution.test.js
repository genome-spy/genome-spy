import { createAndInitialize } from "./testUtils";
import createDomain, {
    toRegularArray as r,
    QuantitativeDomain
} from "../utils/domainArray";

const spec = {
    data: { values: [] },
    layer: [
        {
            mark: "point",
            encoding: {
                x: { field: "a" },
                y: {
                    field: "a",
                    type: "quantitative",
                    scale: { domain: [1, 2] }
                },
                color: { value: "red" }
            }
        },
        {
            mark: "point",
            encoding: {
                x: { field: "a" },
                y: {
                    field: "b",
                    type: "quantitative",
                    scale: { domain: [4, 5] }
                },
                color: { value: "green" }
            }
        }
    ]
};

describe("Scales resolve with with non-trivial hierarchy", () => {
    test("Scales (domains) are shared and merged by default on layers", () => {
        return createAndInitialize(spec).then(view => {
            expect(r(view.getResolution("y").getDomain())).toEqual([1, 5]);
            expect(r(view.children[0].getResolution("y").getDomain())).toEqual([
                1,
                5
            ]);
            expect(r(view.children[1].getResolution("y").getDomain())).toEqual([
                1,
                5
            ]);
        });
    });

    test("Independent scales (domains) are not pulled up", () => {
        const independentSpec = {
            ...spec,
            resolve: { scale: { y: "independent" } }
        };

        return createAndInitialize(independentSpec).then(view => {
            // TODO: expect(view.getResolution("x")).toBeUndefined();
            expect(r(view.children[0].getResolution("y").getDomain())).toEqual([
                1,
                2
            ]);
            expect(r(view.children[1].getResolution("y").getDomain())).toEqual([
                4,
                5
            ]);
        });
    });

    test("Channels with just values (no fields or scales) do not resolve", () => {
        return createAndInitialize(spec).then(view =>
            expect(view.getResolution("color")).toBeUndefined()
        );
    });
});

describe("Defaults", () => {
    test("Y channel has trivial band scale as default", async () => {
        const view = await createAndInitialize({
            data: { values: [] },
            layer: []
        });

        const scale = view.getResolution("y").getScale();

        expect(scale.type).toBe("band");
        expect(scale.domain()).toStrictEqual([undefined]);
    });
});

describe("Domain handling", () => {
    test("The domain of a resolution can be overridden", async () => {
        const view = await createAndInitialize({
            data: { values: [-1, 1] },
            mark: "point",
            encoding: {
                x: { field: "data", type: "quantitative" }
            }
        });

        let r = view.getResolution("x");
        expect([...r.getDomain()]).toEqual([-1, 1]);
        expect(r.getScale().domain()).toEqual([-1, 1]);

        r.setDomain(createDomain("quantitative", [0, 2]));
        expect([...r.getDomain()]).toEqual([0, 2]);
        expect(r.getScale().domain()).toEqual([0, 2]);
    });

    test("Channels with quantitative fields include zero in their scale domain by default", async () => {
        const view = await createAndInitialize({
            data: { values: [2, 3] },
            mark: "point",
            encoding: {
                x: { field: "data", type: "quantitative" },
                y: { field: "data", type: "quantitative" }
            }
        });

        const d = /** @param {string} channel*/ channel =>
            view
                .getResolution(channel)
                .getScale()
                .domain();

        expect(d("x")).toEqual([0, 3]);
        expect(d("y")).toEqual([0, 3]);
    });

    test("Channels with quantitative fields do not include zero in their scale domain if the domain has been defined explicitly", async () => {
        const view = await createAndInitialize({
            data: { values: [2, 3] },
            mark: "point",
            encoding: {
                x: {
                    field: "data",
                    type: "quantitative",
                    scale: { domain: [1, 4] }
                },
                y: {
                    field: "data",
                    type: "quantitative",
                    scale: { domain: [1, 4] }
                }
            }
        });

        const d = /** @param {string} channel*/ channel =>
            view
                .getResolution(channel)
                .getScale()
                .domain();

        expect(d("x")).toEqual([1, 4]);
        expect(d("x")).toEqual([1, 4]);
    });

    test("Channels with quantitative fields do not include zero in their scale domain if zero is explicitly false", async () => {
        const view = await createAndInitialize({
            data: { values: [2, 3] },
            mark: "point",
            encoding: {
                x: {
                    field: "data",
                    type: "quantitative",
                    scale: { zero: false }
                },
                y: {
                    field: "data",
                    type: "quantitative",
                    scale: { zero: false }
                }
            }
        });

        const d = /** @param {string} channel*/ channel =>
            view
                .getResolution(channel)
                .getScale()
                .domain();

        expect(d("x")).toEqual([2, 3]);
        expect(d("y")).toEqual([2, 3]);
    });
});

describe("Titles resolve properly", () => {
    const sharedSpec = {
        ...spec,
        resolve: { scale: { y: "shared" } }
    };

    test("Shared scales have joined titles", () => {
        return createAndInitialize(sharedSpec).then(root =>
            expect(root.children[0].getResolution("y").getTitle()).toEqual(
                "a, b"
            )
        );
    });

    test("Title is taken from axis title, encoding title, and field name, in that order.", () => {
        return Promise.all([
            createAndInitialize({
                data: { values: [1] },
                mark: "point",
                encoding: {
                    x: { field: "a" },
                    y: {
                        field: "a",
                        type: "quantitative"
                    }
                }
            }).then(root =>
                expect(root.getResolution("y").getTitle()).toEqual("a")
            ),

            createAndInitialize({
                data: { values: [1] },
                mark: "point",
                encoding: {
                    x: { field: "a" },
                    y: {
                        field: "a",
                        title: "x",
                        type: "quantitative"
                    }
                }
            }).then(root =>
                expect(root.getResolution("y").getTitle()).toEqual("x")
            ),

            createAndInitialize({
                data: { values: [1] },
                mark: "point",
                encoding: {
                    x: { field: "a" },
                    y: {
                        field: "a",
                        title: "x",
                        type: "quantitative",
                        axis: {
                            title: "z"
                        }
                    }
                }
            }).then(root =>
                expect(root.getResolution("y").getTitle()).toEqual("z")
            )
        ]);
    });

    test.todo("Test legend titles when legends are implemented");
});
