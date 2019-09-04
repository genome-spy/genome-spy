import createDomainBuilder, { isDomainArray, annotateDomain } from './domainBuilder';

describe("Build quantitative domains", () => {

    test("Empty domain", () => {
        const b = createDomainBuilder("quantitative");
        expect("" + b.toArray()).toEqual("" + []);
    });

    test("Extends by one value at a time", () => {
        const b = createDomainBuilder("quantitative");
        b.extend(2);
        b.extend(1);
        b.extend(null);
        b.extend(undefined);
        b.extend(5);
        b.extend(4);
        expect("" + b.toArray()).toEqual("" + [1, 5]);
    });

    test("Extends with an iterable", () => {
        const b = createDomainBuilder("quantitative");
        b.extendAll([2, 1, null, undefined, 5, 4]);
        expect("" + b.toArray()).toEqual("" + [1, 5]);
    });


    test("Throws on a non-numeric scalar", () => {
        const b = createDomainBuilder("quantitative");
        expect(() => b.extend("hello!")).toThrow();
    });
});

describe("Build ordinal domains", () => {
    // Note: nominal is an unordered abstraction of ordinal. Testing just ordinal is enough.

    test("Empty domain", () => {
        const b = createDomainBuilder("ordinal");
        expect("" + b.toArray()).toEqual("" + []);
    });

    test("Extends by one value at a time, preserves order", () => {
        const b = createDomainBuilder("ordinal");
        b.extend("a");
        b.extend("b");
        b.extend("c");
        b.extend("b");
        b.extend(null);
        b.extend(undefined);
        b.extend("d");
        expect("" + b.toArray()).toEqual("" + ["a", "b", "c", "d"]);
    });
});

describe("Annotations", () => {
    test("Annotator annotates",
        () => expect(annotateDomain([], "xyzzy").type).toEqual("xyzzy"));

    test("Quantitative domain is annotated",
        () => expect(createDomainBuilder("quantitative").toArray().type).toEqual("quantitative"));

    test("Ordinal domain is annotated",
        () => expect(createDomainBuilder("ordinal").toArray().type).toEqual("ordinal"));

    test("Nominal domain is annotated",
        () => expect(createDomainBuilder("nominal").toArray().type).toEqual("nominal"));
    
    test("isDomainArray returns true for domain arrays", () => 
        expect(isDomainArray(createDomainBuilder("nominal").toArray())).toBeTruthy());

    test("isDomainArray returns false for non-domain arrays", () => 
         expect(isDomainArray([])).toBeFalsy());
    
});
