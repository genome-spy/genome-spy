/**
 * Resolves canonical names before unambiguous chr-prefix aliases. Ordinal
 * chromosome numbers are deliberately outside this named-contig contract.
 *
 * @template {{ name: string, size: number }} T
 * @param {readonly T[]} contigs
 * @returns {Map<string, T>}
 */
export function createContigLookup(contigs) {
    /** @type {Map<string, T>} */
    const names = new Map();
    let totalSize = 0;
    for (const contig of contigs) {
        if (!contig.name || names.has(contig.name)) {
            throw new Error("Contig names must be nonempty and unique.");
        }
        totalSize += contig.size;
        if (
            !Number.isSafeInteger(contig.size) ||
            contig.size <= 0 ||
            !Number.isSafeInteger(totalSize)
        ) {
            throw new Error(
                "Contig sizes and their sum must be positive safe integers."
            );
        }
        names.set(contig.name, contig);
    }

    /** @type {Map<string, T | null>} */
    const aliases = new Map();
    for (const contig of contigs) {
        const plain = contig.name.replace(/^chr/i, "");
        for (const alias of [
            plain,
            "chr" + plain,
            "CHR" + plain,
            "Chr" + plain,
        ]) {
            if (names.has(alias)) continue;
            if (aliases.has(alias) && aliases.get(alias) !== contig) {
                aliases.set(alias, null);
            } else {
                aliases.set(alias, contig);
            }
        }
    }
    for (const [alias, contig] of aliases) {
        if (contig) names.set(alias, contig);
    }
    return names;
}
