import {
    create, createAndInitialize
} from './testUtils'

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
}

describe("Scales resolve with with non-trivial hierarchy", () => {

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


describe("Titles resolve properly", () => {
    const sharedSpec = {
        ...spec,
        resolve: { scale: { y: "shared" } }
    };

    test("Shared scales have joined titles", () => {
        return createAndInitialize(sharedSpec).then(root=>
            expect(root.children[0].getResolution("y").getTitle()).toEqual("a, b")
        );
    });

    test.todo("Test that title is taken from axis title, encoding title, field name.")

});