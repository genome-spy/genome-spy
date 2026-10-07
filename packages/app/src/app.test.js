// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { getRemoteBookmarkBaseUrl } from "./app.js";
import { embed, GenomeSpy } from "./index.js";

// jsdom cannot parse @scope; check the error box's appearance in the browser.
vi.mock("@genome-spy/core/styles/genome-spy.css.js", () => ({ default: "" }));

it("preserves startup errors when the App container is reused", async () => {
    const error = new Error("Core initialization failed");
    const element = document.createElement("div");
    document.body.appendChild(element);
    const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
    // Exercise real App construction and Lit cleanup without requiring a GPU.
    const launch = vi
        .spyOn(GenomeSpy.prototype, "launch")
        .mockImplementation(async function () {
            this.options.onError(error, this.container);
            return false;
        });

    try {
        for (let attempt = 0; attempt < 2; attempt++) {
            const onError = vi.fn();
            await expect(
                embed(
                    element,
                    { mark: "point", data: { values: [] } },
                    { embedMode: "embedded", onError }
                )
            ).rejects.toBe(error);
            expect(onError).toHaveBeenCalledOnce();
            expect(
                element.querySelector(".message-box > div").textContent
            ).toBe(String(error));
            expect(element.querySelectorAll(".message-box")).toHaveLength(1);
            expect(element.querySelectorAll("style")).toHaveLength(1);
            expect(element.querySelector(".genome-spy-app")).toBeNull();
        }
        expect(launch).toHaveBeenCalledTimes(2);
    } finally {
        launch.mockRestore();
        consoleError.mockRestore();
        element.remove();
    }
});

describe("remote bookmark base URL", () => {
    it("uses the directory containing the remote bookmark file", () => {
        /** @type {import("./spec/appSpec.js").AppRootSpec} */
        const rootSpec = {
            baseUrl: "specs/",
            bookmarks: {
                remote: {
                    url: "../bookmarks.json",
                },
            },
        };

        expect(getRemoteBookmarkBaseUrl(rootSpec)).toBe("specs/../");
    });
});
