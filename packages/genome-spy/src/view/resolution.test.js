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
    test("Scales (domains) are shared and merged by default on layers", async () => {
        const view = await createAndInitialize(spec);

        expect(r(view.getScaleResolution("y").getDataDomain())).toEqual([1, 5]);
        expect(
            r(view.children[0].getScaleResolution("y").getDataDomain())
        ).toEqual([1, 5]);
        expect(
            r(view.children[1].getScaleResolution("y").getDataDomain())
        ).toEqual([1, 5]);
    });

    /*
    // The following hangs Jest for some reason.
    // https://github.com/facebook/jest/issues/10577

    test("Independent scales (domains) are not pulled up", async () => {
        const independentSpec = {
            ...spec,
            resolve: { scale: { y: "independent" } }
        };

        const view = await createAndInitialize(independentSpec);
        // TODO: expect(view.getScaleResolution("x")).toBeUndefined();
        expect(
            r(view.children[0].getScaleResolution("y").getDataDomain())
        ).toEqual([1, 2]);
        expect(
            r(view.children[1].getScaleResolution("y").getDataDomain())
        ).toEqual([4, 5]);
    });
    */

    test("Channels with just values (no fields or scales) do not resolve", async () => {
        const view = await createAndInitialize(spec);
        expect(view.getScaleResolution("color")).toBeUndefined();
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

        let r = view.getScaleResolution("x");
        expect([...r.getDataDomain()]).toEqual([-1, 1]);
        expect(r.getScale().domain()).toEqual([-1, 1]);

        r.setDomain(createDomain("quantitative", [0, 2]));
        expect([...r.getDataDomain()]).toEqual([0, 2]);
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
                .getScaleResolution(channel)
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
                .getScaleResolution(channel)
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
                .getScaleResolution(channel)
                .getScale()
                .domain();

        expect(d("x")).toEqual([2, 3]);
        expect(d("y")).toEqual([2, 3]);
    });
});

describe("Axes resolve properly", () => {
    const sharedSpec = {
        ...spec,
        resolve: { scale: { y: "shared" }, axis: { y: "shared" } }
    };

    test("Shared axes have joined titles", async () => {
        const view = await createAndInitialize(sharedSpec);
        expect(view.children[0].getAxisResolution("y").getTitle()).toEqual(
            "a, b"
        );
    });

    test("Title is taken from axis title, encoding title, and field name, in that order.", async () => {
        let view = await createAndInitialize({
            data: { values: [1] },
            mark: "point",
            encoding: {
                x: { field: "a" },
                y: {
                    field: "a",
                    type: "quantitative"
                }
            }
        });
        expect(view.getAxisResolution("y").getTitle()).toEqual("a");

        view = await createAndInitialize({
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
        });
        expect(view.getAxisResolution("y").getTitle()).toEqual("x");

        view = await createAndInitialize({
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
        });
        expect(view.getAxisResolution("y").getTitle()).toEqual("z");
    });

    test.todo("Test legend titles when legends are implemented");
});
