// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

const { GenomeSpyMock } = vi.hoisted(() => ({
    GenomeSpyMock: vi.fn(function GenomeSpy() {
        this.viewFactory = {
            addViewType: vi.fn(),
        };
        this.viewVisibilityPredicate = () => true;
    }),
}));

vi.mock("@genome-spy/core/genomeSpy.js", () => ({
    default: GenomeSpyMock,
}));

import App from "./app.js";

describe("App embedded mode", () => {
    it("keeps a bookmark-free toolbar and omits the side-panel host", async () => {
        const container = document.createElement("div");
        const app = new App(container, {}, { embedMode: "embedded" });
        document.body.append(container);

        const toolbar =
            /** @type {import("./components/toolbar/toolbar.js").default} */ (
                container.querySelector("genome-spy-toolbar")
            );
        await toolbar.updateComplete;

        expect(app.isEmbedded()).toBe(true);
        expect(toolbar).not.toBeNull();
        expect(toolbar.querySelector("genome-spy-bookmark-button")).toBeNull();
        expect(
            container.querySelector(".genome-spy-side-panel-host")
        ).toBeNull();
        expect(app.localBookmarkDatabase).toBeUndefined();

        app.finalize();
        container.remove();
    });
});
