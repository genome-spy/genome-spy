// @ts-check
import { describe, expect, it, vi } from "vitest";

const showDialog = vi.fn(
    /**
     * @param {string} tagName
     * @param {(dialog: any) => void} init
     */
    (tagName, init) => {
        const dialog = {};
        init(dialog);
        return dialog;
    }
);

vi.mock("../../components/generic/baseDialog.js", async (importOriginal) => ({
    ...(await importOriginal()),
    showDialog,
}));

const { showRetainCategoriesByAttributeDialog } =
    await import("./retainCategoriesByAttributeDialog.js");

describe("showRetainCategoriesByAttributeDialog", () => {
    it("does not initialize a quantitative condition threshold", () => {
        showRetainCategoriesByAttributeDialog(
            /** @type {any} */ ({ attribute: "category" }),
            /** @type {any} */ ({ attribute: "value", type: "quantitative" }),
            /** @type {any} */ ({})
        );

        expect(showDialog).toHaveBeenCalledWith(
            "gs-retain-categories-by-attribute-dialog",
            expect.any(Function)
        );
        expect(showDialog.mock.results.at(-1)?.value).toEqual(
            expect.objectContaining({
                operator: "gt",
                operand: undefined,
            })
        );
    });
});
