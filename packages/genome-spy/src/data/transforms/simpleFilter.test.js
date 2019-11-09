import * as dm from "../dataMapper";
import { createFilter } from "./simpleFilter";

test("CreateFilter", () => {
    const filter = createFilter(
        /** @type {import('./simpleFilter').SimpleFilterConfig } */ {
            field: "x",
            operator: "lte",
            value: 5
        }
    );

    // Not very good coverage here, but the cases are trivial

    expect(filter({ x: "4" })).toBeTruthy();
});
