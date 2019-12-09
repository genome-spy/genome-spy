import ChromMapper from "./chromMapper";
import Interval from "../utils/interval";

describe("Human genome, chromosome names prefixed with 'chr'", () => {
    // Actually, the chromosomes are just named as in hg38, for example
    const chromosomes = [
        { name: "chr1", size: 10 },
        { name: "chr2", size: 20 },
        { name: "chr3", size: 30 },
        { name: "chrX", size: 40 }
    ];

    const m = new ChromMapper(chromosomes);

    test("Maps chromosome names to continuous", () => {
        expect(m.toContinuous("chr0", 2)).toBeUndefined();
        expect(m.toContinuous("chr1", 0)).toEqual(0);
        expect(m.toContinuous("chr1", 2)).toEqual(2);
        expect(m.toContinuous("chr2", 2)).toEqual(12);
        expect(m.toContinuous("chrX", 2)).toEqual(62);
        // TODO: expect(m.toContinuous("chrX", 40)).toBeUndefined();
    });

    test("Maps chromosome numbers to continuous", () => {
        expect(m.toContinuous(0, 2)).toBeUndefined();
        expect(m.toContinuous(1, 2)).toEqual(2);
        expect(m.toContinuous(2, 2)).toEqual(12);
        expect(m.toContinuous(4, 2)).toEqual(62);
        expect(m.toContinuous(5, 2)).toBeUndefined();
    });

    test("Maps unprefixed names to continuous", () => {
        expect(m.toContinuous("0", 2)).toBeUndefined();
        expect(m.toContinuous("1", 2)).toEqual(2);
        expect(m.toContinuous("2", 2)).toEqual(12);
        expect(m.toContinuous("X", 2)).toEqual(62);
        expect(m.toContinuous("Y", 2)).toBeUndefined();
    });

    test("Maps continuous to chromosome and locus", () => {
        expect(m.toChromosomal(-1)).toBeUndefined();
        expect(m.toChromosomal(0)).toEqual({ chromosome: "chr1", pos: 0 });
        expect(m.toChromosomal(12)).toEqual({ chromosome: "chr2", pos: 2 });
        expect(m.toChromosomal(29)).toEqual({ chromosome: "chr2", pos: 19 });
        expect(m.toChromosomal(30)).toEqual({ chromosome: "chr3", pos: 0 });
        expect(m.toChromosomal(62)).toEqual({ chromosome: "chrX", pos: 2 });
        expect(m.toChromosomal(99)).toEqual({ chromosome: "chrX", pos: 39 });
        expect(m.toChromosomal(100)).toBeUndefined();
    });

    test("Returns a properly annotated chromosomes array", () => {
        expect(m.getChromosomes()[1]).toEqual({
            name: "chr2",
            size: 20,
            index: 1,
            number: 2,
            continuousStart: 10,
            continuousEnd: 30,
            continuousInterval: new Interval(10, 30),
            odd: false
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
        { name: "chrM", size: 13794 }
    ];

    const m = new ChromMapper(chromosomes);

    test("Maps chromosome names to continuous", () => {
        expect(m.toContinuous("chrIII", 10)).toEqual(30351865);
    });

    test("Maps unprefixed names to continuous", () => {
        expect(m.toContinuous("III", 10)).toEqual(30351865);
    });
});
