import { expect, test, onTestFinished } from "vitest";
import { createHeadlessEngine } from "./genomeSpy/headlessBootstrap.js";
import { parseCoordinates, formatCoordinates } from "./coordinates.js";

// Real encodings and two independent assemblies verify that validation and
// navigation use the addressed locus scale instead of a global default.
test("active assemblies, canonical encoding, navigation, and inclusive viewport labels", async () => {
    const { view } = await createHeadlessEngine({
        data: {
            values: ["a", "chra", "1"].map((chrom) => ({
                chrom,
                pos: 0,
                yChrom: "a",
            })),
        },
        mark: "point",
        encoding: {
            x: {
                chrom: "chrom",
                pos: "pos",
                type: "locus",
                scale: {
                    assembly: {
                        contigs: [
                            { name: "a", size: 10 },
                            { name: "chra", size: 20 },
                            { name: "1", size: 30 },
                        ],
                    },
                    zoom: true,
                },
            },
            y: {
                chrom: "yChrom",
                pos: "pos",
                type: "locus",
                scale: {
                    assembly: { contigs: [{ name: "a", size: 5 }] },
                    zoom: true,
                },
            },
        },
    });
    onTestFinished(() => view.disposeSubtree());
    const x = view.getScaleResolution("x");
    const y = view.getScaleResolution("y");
    const assembly = x.getAssembly();
    expect(parseCoordinates("a:6", y.getAssembly()).kind).toBe(
        "invalid-coordinate"
    );
    expect(parseCoordinates("a:6", assembly).kind).toBe("coordinate");
    for (const [chrom, offset] of [
        ["a", 0],
        ["chra", 10],
        ["1", 30],
    ]) {
        const unit = /** @type {import("./view/unitView.js").default} */ (view);
        const accessor = unit.getDataAccessor("x").asNumberAccessor();
        const datum = Array.from(unit.getCollector().getData()).find(
            (row) => row.chrom === chrom
        );
        expect(accessor(datum)).toBe(offset);
    }
    /** @type {[string, number[]][]} */
    const cases = [
        ["a:1", [0, 1]],
        ["a:10", [9, 10]],
        ["chra", [10, 30]],
        ["a:10-chra:1", [9, 11]],
    ];
    for (const [query, domain] of cases) {
        const result = parseCoordinates(query, assembly);
        if (result.kind !== "coordinate")
            throw new Error("Expected coordinates");
        const [begin, end] = result.interval;
        await x.zoomTo([begin, { chrom: end.chrom, pos: end.pos - 1 }]);
        expect(x.getDomain()).toEqual(domain);
        const [lower, upper] =
            /** @type {import("./types/coordinates.js").CoordinateLocus[]} */ (
                x.getComplexDomain()
            );
        expect(
            parseCoordinates(
                formatCoordinates([
                    lower,
                    { chrom: upper.chrom, pos: upper.pos + 1 },
                ]),
                assembly
            )
        ).toEqual(result);
    }
    // Set the native half-open domain to model fractional pan/zoom output.
    x.getScale().domain([9.75, 10.25]);
    expect(x.getComplexDomain()).toEqual([
        { chrom: "a", pos: 9 },
        { chrom: "chra", pos: 0 },
    ]);
    x.getScale().domain([0.75, 1.25]);
    expect(x.getComplexDomain()).toEqual([
        { chrom: "a", pos: 0 },
        { chrom: "a", pos: 1 },
    ]);
    // Mutation of a detached snapshot must not affect the active assembly.
    /** @type {{contigs: {name: string, size: number}[]}} */ (
        assembly
    ).contigs[0].size = 999;
    expect(x.getAssembly().contigs[0].size).toBe(10);
    view.disposeSubtree();
    expect(parseCoordinates("a:1", assembly).kind).toBe("coordinate");
});
