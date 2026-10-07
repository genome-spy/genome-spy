import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Regenerate with `node packages/core/scripts/generateTabixFixtures.mjs`.
// Requires bgzip and tabix from HTSlib; running the tests does not.
const directory = new URL("../testFixtures/tabix/", import.meta.url);
mkdirSync(directory, { recursive: true });

/**
 * @param {string} name
 * @param {string[]} lines
 * @param {string[]} indexOptions
 */
function writeFixture(name, lines, indexOptions) {
    const path = fileURLToPath(new URL(name + ".gz", directory));
    writeFileSync(
        path,
        execFileSync("bgzip", ["-c"], { input: lines.join("\n") + "\n" })
    );
    execFileSync("tabix", ["-f", ...indexOptions, path]);
}

const vcfHeader = [
    "##fileformat=VCFv4.3",
    "##contig=<ID=1,length=10000>",
    "##contig=<ID=chr1,length=10000>",
    '##INFO=<ID=END,Number=1,Type=Integer,Description="End position">',
    '##INFO=<ID=PAD,Number=1,Type=String,Description="BGZF chunk padding">',
    '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">',
    "#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tTUMOR",
];
writeFixture(
    "variants.vcf",
    [
        ...vcfHeader,
        "1\t101\tsnp\tA\tT\t.\tPASS\t.\tGT\t0/1",
        "1\t105\tdel\tAAA\tA\t.\tPASS\t.\tGT\t0/1",
        "1\t111\tsv\tN\t<DEL>\t.\tPASS\tEND=130\tGT\t0/1",
        // More than 400KB in one indexed chunk exercises the BGZF API mismatch.
        ...Array.from(
            { length: 500 },
            (_, i) =>
                `1\t${1001 + i}\tpad${i}\tA\tT\t.\tPASS\tPAD=${"A".repeat(1000)}\tGT\t0/1`
        ),
        "chr1\t101\tprefixed\tG\tC\t.\tPASS\t.\tGT\t0/1",
    ],
    ["-p", "vcf"]
);

writeFixture(
    "genes.gff3",
    [
        "##gff-version 3",
        "1\tfixture\tgene\t101\t120\t.\t+\t.\tID=gene1",
        "1\tfixture\tmRNA\t101\t120\t.\t+\t.\tID=tx1;Parent=gene1",
        "1\tfixture\texon\t101\t110\t.\t+\t.\tParent=tx1",
        "chr1\tfixture\tgene\t101\t120\t.\t-\t.\tID=gene2",
    ],
    ["-p", "gff"]
);

writeFixture(
    "intervals.tsv",
    ["#chrom\tstart\tend\tvalue", "1\t100\t110\talpha"],
    ["-0", "-s", "1", "-b", "2", "-e", "3"]
);

writeFixture(
    "prefixed.tsv",
    ["#chrom\tstart\tend\tvalue", "chr1\t100\t110\tbeta"],
    ["-0", "-s", "1", "-b", "2", "-e", "3"]
);
