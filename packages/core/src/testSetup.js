import { beforeEach, expect, vi } from "vitest";
import "./data/formats/parquet.js";
import "./data/formats/arrow.js";
import "./data/formats/bed.js";
import "./data/formats/bedpe.js";
import "./data/formats/fasta.js";
import "./data/formats/wig.js";
import "./data/formats/vcf.js";
import "./data/sources/lazy/registerBuiltInLazySources.js";

beforeEach(() => {
    /** @type {unknown[][]} */
    const unexpectedErrors = [];
    const originalError = console.error;
    // Keep the recorder outside Vitest's mock registry so restoreAllMocks()
    // cannot remove it before a test's remaining cleanup has finished.
    console.error = (...args) => {
        unexpectedErrors.push(args);
    };

    // Check after test cleanup: production code may catch a throwing logger,
    // and tests may restore their mocks before this check runs. Error-path
    // tests must install their own console spy and assert the expected calls.
    return () => {
        const error = console.error;
        if (vi.isMockFunction(error)) error.mockRestore();
        console.error = originalError;
        expect(unexpectedErrors, "Unexpected console.error calls").toEqual([]);
    };
});
