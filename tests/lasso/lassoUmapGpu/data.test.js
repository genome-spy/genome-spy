import { expect, it } from "vitest";
import { parseUmap, projectUmap, compareSelection } from "./data.js";

const csv = "cell_label,x,y\nmin,0,1\na,9,16\nb,9,36\nc,9,30.25\nmax,99,100\n";
const polygon = [
    [0, 0],
    [1, 0],
    [0, 1],
];

it("projects mixed log/sqrt axes before containment and reports differing IDs", () => {
    const rows = parseUmap(csv);
    const linear = projectUmap(rows, "linear", "linear");
    const nonlinear = projectUmap(rows, "log", "sqrt");
    expect(nonlinear.data.x[1]).toBe(0.5);
    expect(nonlinear.data.y[3]).toBe(0.5);
    expect(
        compareSelection(rows, linear.scales, {
            polygon,
            ids: new Uint32Array([1, 2, 3, 4]),
        })
    ).toEqual({ cpu: 4, gpu: 4, missing: 0, extra: 0 });
    expect(
        compareSelection(rows, nonlinear.scales, {
            polygon,
            ids: new Uint32Array([1, 2, 4]),
        })
    ).toEqual({ cpu: 3, gpu: 3, missing: 0, extra: 0 });
    expect(
        compareSelection(rows, nonlinear.scales, {
            polygon,
            ids: new Uint32Array([1, 2, 3]),
        })
    ).toEqual({ cpu: 3, gpu: 3, missing: 1, extra: 1 });
});

it("rejects invalid coordinates and repeated cell labels instead of fabricating cells", () => {
    expect(() => parseUmap("cell_label,x,y\na,,2\n")).toThrow("finite");
    expect(() => parseUmap("cell_label,x,y\na, ,2\n")).toThrow("finite");
    expect(() => parseUmap("cell_label,x,y\na,1,2\na,2,3\n")).toThrow(
        "uniquely"
    );
    expect(() =>
        projectUmap(parseUmap("cell_label,x,y\na,1,2\n"), "linear", "sqrt")
    ).toThrow("spans");
});

it("exposes f32 boundary collapse instead of treating real-data agreement as universal", () => {
    const rows = parseUmap(
        "cell_label,x,y\nmin,0,1\nnear,9.00000005,30.25\nmax,99,100\n"
    );
    const projected = projectUmap(rows, "log", "sqrt");
    expect(projected.data.x[1]).toBe(0.5);
    expect(projected.data.y[1]).toBe(0.5);
    // The original point lies outside x+y<=1; its f32 projection lands on the edge.
    expect(
        compareSelection(rows, projected.scales, {
            polygon,
            ids: new Uint32Array([1, 2]),
        })
    ).toEqual({ cpu: 1, gpu: 2, missing: 0, extra: 1 });
});
