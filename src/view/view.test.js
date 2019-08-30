import { createView, initializeViewHierarchy } from "./viewUtils";
import UnitView from './unitView';
import LayerView from './layerView';
import DataSource from '../data/dataSource';
import { VisualMapperFactory } from "../data/visualEncoders";

/**
 * 
 * @param {import("./viewUtils").Spec} spec 
 */
function create(spec) {
    const context = {
        /** @param {object} config */
        getDataSource: config => new DataSource(config, "."),
        visualMapperFactory: new VisualMapperFactory()
    };

    return createView(spec, context);
}

/**
 * 
 * @param {import("./viewUtils").Spec} spec 
 */
async function createAndInitialize(spec) {
    const view = create(spec);
    await initializeViewHierarchy(view);
    return view;
}

describe("Trivial creations and initializations", () => {
    test("Fails on empty spec", () => {
        expect(() => create({})).toThrow();
    });

    test("Parses a trivial spec", () => {
        expect(create({ mark: "point" })).toBeInstanceOf(UnitView);
        expect(create({ layer: [] })).toBeInstanceOf(LayerView);
    });

    test("Parses and initializes a trivial spec", () => {
        const spec = {
            data: { values: [1] },
            mark: "point"
        };
        
        expect(createAndInitialize(spec)).resolves.toBeInstanceOf(UnitView);
    });
});


describe("Test domain handling", () => {
    const dataSpec = {
        values: [
            { a: 1, b: 3 },
            { a: 2, b: 4 },
            { a: 3, b: 5 },
        ]
    };

    test("Uses domain from the scale properties", () => {
        const spec = {
            data: dataSpec,
            mark: "point",
            encoding: {
                y: {
                    field: "a",
                    type: "quantitative",
                    scale: {
                        domain: [0, 1000]
                    }
                }
            }
        };

        return createAndInitialize(spec).then(root =>
            expect(root.getResolution("y").getDomain().toArray()).toEqual([0, 1000])
        );

    });

    test("Extracts domain from the data", () => {
        const spec = {
            data: dataSpec,
            mark: "point",
            encoding: {
                y: {
                    field: "a",
                    type: "quantitative"
                }
            }
        };

        return createAndInitialize(spec).then(root =>
            expect(root.getResolution("y").getDomain().toArray()).toEqual([1, 3])
        );

    });

    test("Extracts domain from the data when a secondary channel is being used", () => {
        const spec = {
            data: dataSpec, 
            mark: "rect",
            encoding: {
                y: {
                    field: "a",
                    type: "quantitative"
                },
                y2: {
                    field: "b"
                }
            }
        };

        return createAndInitialize(spec).then(unitView =>
            expect(unitView.getResolution("y").getDomain().toArray()).toEqual([1, 5])
        );
    });

});


describe("Test scale resolutions with non-trivial hierarchy", () => {
    const spec = {
        data: { values: [] },
        layer: [
            {
                mark: "point",
                encoding: {
                    y: {
                        field: "data",
                        type: "quantitative",
                        scale: { domain: [1, 2] }
                    }
                }
            },
            {
                mark: "point",
                encoding: {
                    y: {
                        field: "data",
                        type: "quantitative",
                        scale: { domain: [4, 5] }
                    }
                }
            }
        ]
    }

    test("Scales (domains) are shared by default on layers", () => {
        return createAndInitialize(spec).then(view =>
            expect(view.getResolution("y").getDomain().toArray()).toEqual([1, 5])
        );
    });

    test("Independent scales (domains) are not pulled up", () => {
        const independentSpec = {
            ...spec,
            resolve: { scale: { y: "independent" } }
        };

        return createAndInitialize(independentSpec).then(view => {
            expect(view.getResolution("y")).toBeUndefined();
            expect(view.children[0].getResolution("y").getDomain().toArray()).toEqual([1, 2]);
            expect(view.children[1].getResolution("y").getDomain().toArray()).toEqual([4, 5]);
        });

    });
});