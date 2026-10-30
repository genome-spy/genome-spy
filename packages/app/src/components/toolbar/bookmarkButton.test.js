// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import "./bookmarkButton.js";
import { dismissDropdownMenu } from "../../utils/ui/contextMenu.js";

describe("bookmark toolbar menu", () => {
    afterEach(() => {
        dismissDropdownMenu();
        document.body.replaceChildren();
    });

    it("tracks a bookmark from lookup through navigation", async () => {
        /** @type {PromiseWithResolvers<any>} */
        const lookup = Promise.withResolvers();
        /** @type {PromiseWithResolvers<void>} */
        const navigation = Promise.withResolvers();
        /** @type {Promise<void>} */
        let operation;
        /** @type {string[]} */
        const order = [];
        const zoomTo = vi.fn(() => navigation.promise);
        /** @type {any} */
        const element = document.createElement("genome-spy-bookmark-button");
        element.app = {
            runCohortOperation: (/** @type {() => Promise<void>} */ run) => {
                order.push("admitted");
                operation = run();
                return operation;
            },
            localBookmarkDatabase: {
                getNames: async () => ["Saved locus"],
                get: () => {
                    order.push("lookup");
                    return lookup.promise;
                },
            },
            genomeSpy: {
                getNamedScaleResolutions: () =>
                    new Map([["locus", { zoomTo }]]),
            },
            store: { dispatch: vi.fn() },
        };
        document.body.append(element);
        await element.updateComplete;
        element.querySelector("button[title='Bookmarks']").click();
        await vi.waitFor(() => {
            expect(
                document.querySelector("[role='menu']")?.textContent
            ).toContain("Saved locus");
        });
        const item = Array.from(
            document.querySelectorAll("[role='menuitem']")
        ).find((item) => item.textContent.trim() === "Saved locus");
        /** @type {HTMLElement} */ (item).click();
        expect(order).toEqual(["admitted", "lookup"]);
        lookup.resolve({
            name: "Saved locus",
            scaleDomains: { locus: [1, 2] },
        });
        await vi.waitFor(() => expect(zoomTo).toHaveBeenCalledOnce());
        let complete = false;
        void operation.then(() => {
            complete = true;
        });
        expect(complete).toBe(false);
        navigation.resolve();
        await operation;
        expect(complete).toBe(true);
    });

    it("shows local bookmarks while the server list is pending or fails", async () => {
        /** @type {(error: Error) => void} */
        let rejectServer;
        /** @type {any} */
        const element = document.createElement("genome-spy-bookmark-button");
        element.app = {
            globalBookmarkDatabase: {
                getNames: vi.fn(
                    () =>
                        new Promise((resolve, reject) => {
                            rejectServer = reject;
                        })
                ),
            },
            localBookmarkDatabase: {
                getNames: vi.fn().mockResolvedValue(["Local bookmark"]),
            },
        };
        document.body.append(element);
        await element.updateComplete;

        element.querySelector("button[title='Bookmarks']").click();
        await vi.waitFor(() => {
            const menu = document.querySelector("[role='menu']");
            expect(menu?.textContent).toContain("Local bookmark");
            expect(menu?.textContent).toContain("Loading...");
        });

        document
            .querySelector("button[aria-label='Actions for Local bookmark']")
            .click();
        expect(document.querySelectorAll("[role='menu']")).toHaveLength(2);

        rejectServer(new Error("Unavailable"));
        await vi.waitFor(() => {
            const menu = document.querySelector("[role='menu']");
            expect(menu?.textContent).toContain("Local bookmark");
            expect(menu?.textContent).toContain("Could not load bookmarks.");
        });
        expect(document.querySelectorAll("[role='menu']")).toHaveLength(1);
        expect(document.activeElement).toBe(
            document.querySelector("[role='menuitem']")
        );
    });
});
