// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import "./bookmarkButton.js";
import { dismissDropdownMenu } from "../../utils/ui/contextMenu.js";

describe("bookmark toolbar menu", () => {
    afterEach(() => {
        dismissDropdownMenu();
        document.body.replaceChildren();
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
