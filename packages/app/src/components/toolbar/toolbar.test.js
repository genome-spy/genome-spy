// @vitest-environment jsdom

import { createTestEmbed } from "@genome-spy/core/view/embedTestUtils.js";
import { createDatumSearch } from "@genome-spy/core/search";
import { expect, it, onTestFinished, vi } from "vitest";
import AppUiRegistry from "../../appUiRegistry.js";
import { lifecycleSlice } from "../../lifecycleSlice.js";
import setupStore from "../../state/setupStore.js";
import { dismissDropdownMenu } from "../../utils/ui/contextMenu.js";
import Toolbar from "./toolbar.js";

it("refreshes controls after insertion and closes stale settings during replacement", async () => {
    const highlightView = vi.fn();
    const { root, views } = await createTestEmbed(
        { vconcat: [] },
        { contextOptions: { highlightView } }
    );
    const store = setupStore();
    store.dispatch(lifecycleSlice.actions.setInitialized());
    const container = document.createElement("div");
    const app = {
        store,
        genomeSpy: { viewRoot: root },
        datumSearch: createDatumSearch(views),
        provenance: { isEnabled: () => false },
        ui: new AppUiRegistry(),
        rootSpec: {},
        appContainer: container,
        isEmbedded: () => true,
        getSampleView: () => undefined,
    };
    container.addEventListener(
        "query-dependency",
        (/** @type {CustomEvent} */ event) => {
            if (event.detail.name === "app") {
                event.detail.setter(app);
                event.stopPropagation();
            }
        }
    );
    const toolbar = new Toolbar();
    toolbar.app = /** @type {any} */ (app);
    container.append(toolbar);
    document.body.append(container);
    onTestFinished(() => {
        dismissDropdownMenu();
        container.remove();
    });
    await toolbar.updateComplete;
    const nav = toolbar.querySelector("nav");
    const settings = /** @type {import("lit").LitElement} */ (
        toolbar.querySelector("genome-spy-view-visibility")
    );
    await settings.updateComplete;
    expect(toolbar.querySelector("genome-spy-search-field")).toBeNull();
    expect(settings.style.display).toBe("none");

    const child = await views.insert(views.root(), {
        name: "Signals",
        params: [
            {
                name: "cutoff",
                value: 1,
                bind: { input: "range", min: 0, max: 5 },
            },
        ],
        data: { values: [{ x: 1 }] },
        mark: "point",
        encoding: {
            x: {
                field: "x",
                type: "locus",
                scale: {
                    assembly: { contigs: [{ name: "scaffold", size: 100 }] },
                    zoom: true,
                },
            },
        },
    });
    store.dispatch(lifecycleSlice.actions.hierarchyChanged());
    await toolbar.updateComplete;
    await settings.updateComplete;
    const search = /** @type {import("./searchField.js").default} */ (
        toolbar.querySelector("genome-spy-search-field")
    );
    await search.updateComplete;
    expect(search.querySelector("input").value).toBe("scaffold:1-100");
    expect(settings.style.display).toBe("block");

    settings.querySelector("button").click();
    const label = Array.from(document.querySelectorAll("label")).find((item) =>
        item.textContent.includes("Signals")
    );
    expect(label).toBeDefined();
    label.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    expect(highlightView).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: "Signals" })
    );
    document.querySelector("button[aria-label='Settings for Signals']").click();
    await vi.waitFor(() =>
        expect(document.querySelectorAll("[role='dialog']")).toHaveLength(2)
    );
    expect(document.body.textContent).toContain("cutoff");

    store.dispatch(lifecycleSlice.actions.setCohortTransitioning(true));
    await toolbar.updateComplete;
    expect(nav.hasAttribute("inert")).toBe(true);
    expect(nav.getAttribute("aria-busy")).toBe("true");
    expect(document.querySelector("[role='dialog']")).toBeNull();
    expect(highlightView).toHaveBeenLastCalledWith(null);

    await views.remove(child);
    store.dispatch(lifecycleSlice.actions.hierarchyChanged());
    store.dispatch(lifecycleSlice.actions.setCohortTransitioning(false));
    await toolbar.updateComplete;
    await settings.updateComplete;
    expect(toolbar.querySelector("nav")).toBe(nav);
    expect(toolbar.querySelector("genome-spy-view-visibility")).toBe(settings);
    expect(nav.hasAttribute("inert")).toBe(false);
    expect(toolbar.querySelector("genome-spy-search-field")).toBeNull();
    expect(settings.style.display).toBe("none");
});
