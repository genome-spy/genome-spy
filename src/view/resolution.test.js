import { createAndInitialize } from './testUtils'
import {
    toRegularArray as r
} from '../utils/domainArray';

const spec = {
    data: { values: [] },
    layer: [
        {
            mark: "point",
            encoding: {
                y: {
                    field: "a",
                    type: "quantitative",
                    scale: { domain: [1, 2] }
                }
            }
        },
        {
            mark: "point",
            encoding: {
                y: {
                    field: "b",
                    type: "quantitative",
                    scale: { domain: [4, 5] }
                }
            }
        }
    ]
};

describe("Scales resolve with with non-trivial hierarchy", () => {

    test("Scales (domains) are shared by default on layers", () => {
        return createAndInitialize(spec).then(view =>
            expect(r(view.getResolution("y").getDomain())).toEqual([1, 5])
        );
    });

    test("Independent scales (domains) are not pulled up", () => {
        const independentSpec = {
            ...spec,
            resolve: { scale: { y: "independent" } }
        };

        return createAndInitialize(independentSpec).then(view => {
            expect(view.getResolution("y")).toBeUndefined();
            expect(r(view.children[0].getResolution("y").getDomain())).toEqual([1, 2]);
            expect(r(view.children[1].getResolution("y").getDomain())).toEqual([4, 5]);
        });

    });
});


describe("Titles resolve properly", () => {
    const sharedSpec = {
        ...spec,
        resolve: { scale: { y: "shared" } }
    };

    test("Shared scales have joined titles", () => {
        return createAndInitialize(sharedSpec).then(root =>
            expect(root.children[0].getResolution("y").getTitle()).toEqual("a, b")
        );
    });

    test("Title is taken from axis title, encoding title, and field name, in that order.", () => {

        return Promise.all([
            createAndInitialize({
                data: { values: [1] },
                mark: "point",
                encoding: {
                    y: {
                        field: "a",
                        type: "quantitative",
                    }
                }
            }).then(root =>
                expect(root.getResolution("y").getTitle()).toEqual("a")
            ),
        
            createAndInitialize({
                data: { values: [1] },
                mark: "point",
                encoding: {
                    y: {
                        field: "a",
                        title: "x",
                        type: "quantitative",
                    }
                }
            }).then(root =>
                expect(root.getResolution("y").getTitle()).toEqual("x")
            ),

            createAndInitialize({
                data: { values: [1] },
                mark: "point",
                encoding: {
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
            )]);

    });

    test.todo("Test legend titles when legends are implemented");
});