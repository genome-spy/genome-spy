// Illustrative scores and invented pathway memberships, not statistical results.
export const contrastA = [
    {
        gene: "IFN01",
        pathway: "Interferon",
        log2FoldChange: 2.4,
        negLog10Padj: 6,
    },
    {
        gene: "IFN02",
        pathway: "Interferon",
        log2FoldChange: -1.8,
        negLog10Padj: 4,
    },
    {
        gene: "IFN03",
        pathway: "Interferon",
        log2FoldChange: 0.4,
        negLog10Padj: 3,
    },
    {
        gene: "IFN04",
        pathway: "Interferon",
        log2FoldChange: 1.3,
        negLog10Padj: 1.2,
    },
    {
        gene: "CYC01",
        pathway: "Cell cycle",
        log2FoldChange: 1.6,
        negLog10Padj: 5,
    },
    {
        gene: "CYC02",
        pathway: "Cell cycle",
        log2FoldChange: -2.1,
        negLog10Padj: 5,
    },
    {
        gene: "CYC03",
        pathway: "Cell cycle",
        log2FoldChange: 0.2,
        negLog10Padj: 0.8,
    },
    {
        gene: "CYC04",
        pathway: "Cell cycle",
        log2FoldChange: -0.6,
        negLog10Padj: 2.5,
    },
    {
        gene: "MET01",
        pathway: "Metabolism",
        log2FoldChange: -1.5,
        negLog10Padj: 3.5,
    },
    {
        gene: "MET02",
        pathway: "Metabolism",
        log2FoldChange: 1.2,
        negLog10Padj: 2.5,
    },
    {
        gene: "MET03",
        pathway: "Metabolism",
        log2FoldChange: 0.5,
        negLog10Padj: 4,
    },
    {
        gene: "MET04",
        pathway: "Metabolism",
        log2FoldChange: -1.8,
        negLog10Padj: 1,
    },
];

export const contrastB = contrastA.map((row) =>
    row.gene === "IFN01" ? { ...row, negLog10Padj: 1.5 } : row
);
