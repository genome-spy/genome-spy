export interface QuantitativeFieldSummary {
    nonMissingCount: number;
    missingCount: number;
    min?: number;
    max?: number;
    mean?: number;
    median?: number;
    p05?: number;
    p95?: number;
    q1?: number;
    q3?: number;
    iqr?: number;
}

export interface CategoryCountSummary {
    value: unknown;
    count: number;
    share: number;
}

export interface CategoricalFieldSummary {
    nonMissingCount: number;
    missingCount: number;
    distinctCount: number;
    categories: CategoryCountSummary[];
    truncated: boolean;
    otherCount?: number;
    otherShare?: number;
}

export declare function buildQuantitativeFieldSummary(
    values: unknown[]
): QuantitativeFieldSummary;

export declare function buildCategoricalFieldSummary(
    values: unknown[]
): CategoricalFieldSummary;

export declare function buildCategoricalCountsSummary(
    counts: Map<unknown, number>,
    nonMissingCount: number,
    missingCount: number,
    maxCategories?: number
): CategoricalFieldSummary;

export declare function buildTopCategorySummary(
    counts: Map<unknown, number>,
    nonMissingCount: number
): CategoryCountSummary | undefined;
