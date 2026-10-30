// @vitest-environment jsdom

import { expect, test, vi } from "vitest";

const dialog = vi.hoisted(() => ({
    /** @type {(result: { ok: boolean, data?: unknown }) => unknown} */
    mapResult: undefined,
}));

vi.mock("../../components/generic/baseDialog.js", async (importOriginal) => ({
    ...(await importOriginal()),
    showDialogAndMap: (
        /** @type {string} */ _tag,
        /** @type {unknown} */ _initialize,
        /** @type {typeof dialog.mapResult} */ map
    ) => {
        dialog.mapResult = map;
    },
}));

import { showUploadMetadataDialog } from "./uploadMetadataDialog.js";

test("upload completion gates a live cohort and discards results for a disposed cohort", () => {
    const dispatch = vi.fn();
    const sampleView = {
        disposed: false,
        runCohortOperation: vi.fn((operation) => operation()),
        intentExecutor: { dispatch },
        actions: {
            addMetadata: (payload) => ({
                type: "sampleView/addMetadata",
                payload,
            }),
        },
    };
    showUploadMetadataDialog(/** @type {any} */ (sampleView));
    const data = { columnarMetadata: { sample: ["s1"], status: ["A"] } };

    expect(dialog.mapResult({ ok: true, data })).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
        type: "sampleView/addMetadata",
        payload: data,
    });
    expect(sampleView.runCohortOperation).toHaveBeenCalledOnce();

    sampleView.disposed = true;
    expect(dialog.mapResult({ ok: true, data })).toBe(false);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(sampleView.runCohortOperation).toHaveBeenCalledOnce();
});
