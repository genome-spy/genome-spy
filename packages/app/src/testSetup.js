import { vi } from "vitest";

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
