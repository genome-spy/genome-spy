import { isViewSpec } from "./viewUtils";

test("isViewSpec", () => {
    expect(isViewSpec({})).toBeFalsy();
    expect(isViewSpec({ mark: "rect" })).toBeTruthy();
    expect(isViewSpec({ layer: [] })).toBeTruthy();
    expect(isViewSpec({ hconcat: [] })).toBeTruthy();
    expect(isViewSpec({ vconcat: [] })).toBeTruthy();
    expect(isViewSpec({ concat: [] })).toBeTruthy();
    expect(isViewSpec({ table: [] })).toBeTruthy();
    expect(isViewSpec({ main: {} })).toBeTruthy();

    expect(() => isViewSpec({ mark: "rect", layer: [] })).toThrow();
});
