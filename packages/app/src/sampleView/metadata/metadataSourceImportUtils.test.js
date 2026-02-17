import { describe, expect, it } from "vitest";
import {
    classifyImportReadiness,
    parseColumnQueries,
} from "./metadataSourceImportUtils.js";

describe("parseColumnQueries", () => {
    it("tokenizes by line and deduplicates tokens", () => {
        const queries = parseColumnQueries("TP53\nMYC\nBRCA1\nTP53\n  EGFR  ");

        expect(queries).toEqual(["TP53", "MYC", "BRCA1", "EGFR"]);
    });
});

describe("classifyImportReadiness", () => {
    it("allows import with warnings when at least one column is resolvable", () => {
        const readiness = classifyImportReadiness({
            queries: ["TP53", "missing"],
            resolved: {
                columnIds: ["TP53"],
                missing: ["missing"],
                ambiguous: [],
            },
        });

        expect(readiness.blocking.noResolvableColumns).toBe(false);
        expect(readiness.blocking.overLimit).toBe(false);
        expect(readiness.warnings.missing).toEqual(["missing"]);
    });

    it("blocks import when the resolved column count exceeds the hard limit", () => {
        const readiness = classifyImportReadiness({
            queries: Array.from({ length: 101 }, (_, i) => "g" + i),
            resolved: {
                columnIds: Array.from({ length: 101 }, (_, i) => "g" + i),
                missing: [],
                ambiguous: [],
            },
        });

        expect(readiness.blocking.overLimit).toBe(true);
    });
});
