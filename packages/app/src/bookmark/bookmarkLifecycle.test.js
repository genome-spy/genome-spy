// @vitest-environment jsdom

import { expect, test, vi } from "vitest";

const dialog = vi.hoisted(() => ({
    /** @type {() => void} */
    close: undefined,
}));

vi.mock("../components/dialogs/bookmarkInfoBox.js", () => ({}));
vi.mock("../components/generic/baseDialog.js", async (importOriginal) => ({
    ...(await importOriginal()),
    showDialog: (
        /** @type {string} */ tag,
        /** @type {(element: HTMLElement) => void} */ configure
    ) => {
        const element = document.createElement(tag);
        document.body.append(element);
        configure(element);
        return new Promise((resolve) => {
            dialog.close = () => resolve({ ok: false });
        });
    },
}));

import { showBookmarkInfoBox } from "./bookmark.js";

test("a removed cohort's tour and navigation callbacks cannot restore a bookmark", async () => {
    const sampleView = { disposed: false };
    const database = {
        getNames: async () => ["After tour"],
        get: vi.fn(),
    };
    const app = {
        getSampleView: () => sampleView,
        runCohortOperation: vi.fn((operation) => operation()),
        genomeSpy: { spec: {} },
    };

    try {
        await showBookmarkInfoBox(
            { name: "Tour step" },
            /** @type {any} */ (app),
            {
                mode: "tour",
                database: /** @type {any} */ (database),
                afterTourBookmark: "After tour",
            }
        );
        sampleView.disposed = true;
        document.querySelector("gs-bookmark-info-box").dispatchEvent(
            new CustomEvent("gs-jump-to-bookmark", {
                detail: { name: "After tour" },
            })
        );
        dialog.close();
        await Promise.resolve();

        expect(app.runCohortOperation).not.toHaveBeenCalled();
        expect(database.get).not.toHaveBeenCalled();
    } finally {
        document.body.replaceChildren();
    }
});
