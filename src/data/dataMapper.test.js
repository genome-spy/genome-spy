import * as dm from './dataMapper';

test("CreateFilter", () => {
    const filter = dm.createFilter(/** @type {import('./dataMapper').SimpleFilterConfig } */{
        field: "x",
        operator: "lte",
        value: 5
    });

    // Not very good coverage here, but the cases are trivial

    expect(filter({ x: "4" })).toBeTruthy();
})