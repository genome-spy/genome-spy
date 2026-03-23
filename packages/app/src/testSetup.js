import { vi } from "vitest";
import "@genome-spy/core/data/formats/parquet.js";
import "@genome-spy/core/data/formats/bed.js";
import "@genome-spy/core/data/formats/bedpe.js";
import "@genome-spy/core/data/formats/fasta.js";
import "@genome-spy/core/data/sources/lazy/registerBuiltInLazySources.js";

function createFontAwesomeSvgCoreMock() {
    return {
        icon: () => ({ node: [""] }),
        dom: { css: () => "" },
    };
}

/**
 * @param {(specifier?: string) => Promise<any>} importOriginal
 */
async function createFontAwesomeFreeSolidIconsMock(importOriginal) {
    return {
        __esModule: true,
        ...(await importOriginal()),
    };
}

vi.mock("@fortawesome/fontawesome-svg-core", createFontAwesomeSvgCoreMock);

vi.mock(
    "@fortawesome/free-solid-svg-icons",
    createFontAwesomeFreeSolidIconsMock
);
