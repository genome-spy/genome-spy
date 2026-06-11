import { describe, expect, it } from "vitest";
import { getRemoteBookmarkBaseUrl } from "./app.js";

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
