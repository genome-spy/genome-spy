import Genome from "./genome";

describe("Human genome, chromosome names prefixed with 'chr'", () => {
    // Actually, the chromosomes are just named as in hg38, for example
    const chromosomes = [
        { name: "chr1", size: 10 },
        { name: "chr2", size: 20 },
        { name: "chr3", size: 30 },
        { name: "chrX", size: 40 },
    ];

    const g = new Genome({ name: "random", contigs: chromosomes });

    test("Maps chromosome names to continuous", () => {
        expect(() => g.toContinuous("chr0", 2)).toThrow();
        expect(g.toContinuous("chr1", 0)).toEqual(0);
        expect(g.toContinuous("chr1", 2)).toEqual(2);
        expect(g.toContinuous("chr2", 2)).toEqual(12);
        expect(g.toContinuous("chrX", 2)).toEqual(62);
        // TODO: Should this throw to alert about invalid data..?
        // TODO: expect(m.toContinuous("chrX", 40)).toBeUndefined();
    });

    test("Maps chromosome numbers to continuous", () => {
        expect(() => g.toContinuous(0, 2)).toThrow();
        expect(g.toContinuous(1, 2)).toEqual(2);
        expect(g.toContinuous(2, 2)).toEqual(12);
        expect(g.toContinuous(4, 2)).toEqual(62);
        expect(() => g.toContinuous(5, 2)).toThrow();
    });

    test("Maps unprefixed names to continuous", () => {
        expect(() => g.toContinuous("0", 2)).toThrow();
        expect(g.toContinuous("1", 2)).toEqual(2);
        expect(g.toContinuous("2", 2)).toEqual(12);
        expect(g.toContinuous("X", 2)).toEqual(62);
        expect(() => g.toContinuous("Y", 2)).toThrow();
    });

    test("Maps string positions to continuous", () => {
        expect(g.toContinuous("2", /** @type {any} */ ("2"))).toEqual(12);
    });

    test("Maps continuous to chromosome and locus", () => {
        expect(g.toChromosomal(-1)).toBeUndefined();
        expect(g.toChromosomal(0)).toEqual({ chrom: "chr1", pos: 0 });
        expect(g.toChromosomal(12)).toEqual({ chrom: "chr2", pos: 2 });
        expect(g.toChromosomal(29)).toEqual({ chrom: "chr2", pos: 19 });
        expect(g.toChromosomal(30)).toEqual({ chrom: "chr3", pos: 0 });
        expect(g.toChromosomal(62)).toEqual({ chrom: "chrX", pos: 2 });
        expect(g.toChromosomal(99)).toEqual({ chrom: "chrX", pos: 39 });
        expect(g.toChromosomal(100)).toBeUndefined();
    });

    // Testing half-open intervals
    test("Maps continuous interval to chromosomal interval", () => {
        expect(g.toChromosomalInterval([0, 10])).toEqual([
            { chrom: "chr1", pos: 0 },
            { chrom: "chr1", pos: 10 },
        ]);
        expect(g.toChromosomalInterval([10, 100])).toEqual([
            { chrom: "chr2", pos: 0 },
            { chrom: "chrX", pos: 40 },
        ]);
        expect(g.toChromosomalInterval([0, 100])).toEqual([
            { chrom: "chr1", pos: 0 },
            { chrom: "chrX", pos: 40 },
        ]);
    });

    test("Maps interval with fractional parts to chromosomal interval", () => {
        expect(g.toChromosomalInterval([0.1, 99.9])).toEqual([
            { chrom: "chr1", pos: 0 },
            { chrom: "chrX", pos: 40 },
        ]);
        expect(g.toChromosomalInterval([0.6, 99.4])).toEqual([
            { chrom: "chr1", pos: 1 },
            { chrom: "chrX", pos: 39 },
        ]);
    });

    test("Maps chromosomal interval to continuous interval", () => {
        expect(
            g.toContinuousInterval([
                { chrom: "chr1", pos: 0 },
                { chrom: "chr1", pos: 10 },
            ])
        ).toEqual([0, 10]);
        expect(
            g.toContinuousInterval([
                { chrom: "chr1", pos: 1 },
                { chrom: "chr1", pos: 9 },
            ])
        ).toEqual([1, 9]);
        expect(
            g.toContinuousInterval([
                { chrom: "chr2", pos: 0 },
                { chrom: "chrX", pos: 40 },
            ])
        ).toEqual([10, 100]);
        expect(
            g.toContinuousInterval([
                { chrom: "chr1", pos: 0 },
                { chrom: "chrX", pos: 40 },
            ])
        ).toEqual([0, 100]);
    });

    test("Maps chromosomal interval without positions to continuous interval", () => {
        expect(
            g.toContinuousInterval([{ chrom: "chr1" }, { chrom: "chr1" }])
        ).toEqual([0, 10]);
        expect(
            g.toContinuousInterval([{ chrom: "chr2" }, { chrom: "chrX" }])
        ).toEqual([10, 100]);
    });

    test("Returns a properly annotated chromosomes array", () => {
        expect(g.chromosomes[1]).toEqual({
            name: "chr2",
            size: 20,
            index: 1,
            number: 2,
            continuousStart: 10,
            continuousEnd: 30,
            continuousInterval: [10, 30],
            odd: false,
        });
    });
});

describe("C. elegans genome, chromosome names prefixed with 'chr'", () => {
    const chromosomes = [
        { name: "chrI", size: 15072434 },
        { name: "chrII", size: 15279421 },
        { name: "chrIII", size: 13783801 },
        { name: "chrIV", size: 17493829 },
        { name: "chrV", size: 20924180 },
        { name: "chrX", size: 17718942 },
        { name: "chrM", size: 13794 },
    ];

    const g = new Genome({ name: "random", contigs: chromosomes });

    test("Maps chromosome names to continuous", () => {
        expect(g.toContinuous("chrIII", 10)).toEqual(30351865);
    });

    test("Maps unprefixed names to continuous", () => {
        expect(g.toContinuous("III", 10)).toEqual(30351865);
    });
});
