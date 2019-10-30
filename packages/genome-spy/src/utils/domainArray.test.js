import createDomain, {
    toRegularArray as r, PiecewiseDomain
} from './domainArray';

describe("Build quantitative domains", () => {

    test("Empty domain", () => {
        const b = createDomain("quantitative");
        expect(r(b)).toEqual([]);
    });

    test("Extends by one value at a time", () => {
        const b = createDomain("quantitative");
        b.extend(2);
        b.extend(1);
        b.extend(null);
        b.extend(undefined);
        b.extend(5);
        b.extend(4);
        expect(r(b)).toEqual([1, 5]);
    });

    test("Extends with an iterable", () => {
        const b = createDomain("quantitative");
        b.extendAll([2, 1, null, undefined, 5, 4]);
        expect(r(b)).toEqual([1, 5]);
    });

    test("Coerces to number", () => {
        const b = createDomain("quantitative");
        expect(r(b.extend("123"))).toEqual([123, 123]);
    });
});

describe("Build ordinal domains", () => {
    // Note: nominal is an unordered abstraction of ordinal. Testing just ordinal is enough.

    test("Empty domain", () => {
        const b = createDomain("ordinal");
        expect(r(b)).toEqual([]);
    });

    test("Extends by one value at a time, preserves order", () => {
        const b = createDomain("ordinal");
        b.extend("a");
        b.extend("b");
        b.extend("c");
        b.extend("b");
        b.extend(null);
        b.extend(undefined);
        b.extend("d");
        expect(r(b)).toEqual(["a", "b", "c", "d"]);
    });
});

describe("Build piecewise domains", () => {
    test("Creates a piecewise domain", () => {
        expect(createDomain("quantitative", [1])).toBeInstanceOf(PiecewiseDomain);
        expect(createDomain("quantitative", [1, 2, 3])).toBeInstanceOf(PiecewiseDomain);
        expect(createDomain("quantitative", [3, 2, 1])).toBeInstanceOf(PiecewiseDomain);
        expect(r(createDomain("quantitative", [3, 2, 1]))).toEqual([3, 2, 1]);
    });

    test("Throws on domain that is not stricly increasing or decreasing", () => {
        expect(() => createDomain("quantitative", [2, 1, 3])).toThrow();
        expect(() => createDomain("quantitative", [2, 3, 1])).toThrow();
        expect(() => createDomain("quantitative", [3, 0, 2])).toThrow();
        expect(() => createDomain("quantitative", [0, 3, 2])).toThrow();
        expect(() => createDomain("quantitative", [1, 2, 2, 3])).toThrow();
    });

    test("Throws on mutation attempts", () => {
        expect(() => createDomain("quantitative", [1, 2, 3]).extend(2)).toThrow();
    });

});

describe("Annotations", () => {
    test("Quantitative domain is annotated",
        () => expect(createDomain("quantitative").type).toEqual("quantitative"));

    test("Ordinal domain is annotated",
        () => expect(createDomain("ordinal").type).toEqual("ordinal"));

    test("Nominal domain is annotated",
        () => expect(createDomain("nominal").type).toEqual("nominal"));
    
});

describe("Other stuff", () => {
    test("Throws on extending by other type of domain array", () => 
        expect(() => createDomain("quantitative").extendAll(createDomain("nominal")))
            .toThrow());
})
