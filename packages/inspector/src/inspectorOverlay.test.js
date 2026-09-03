// @vitest-environment jsdom

import { describe, expect, test, vi } from "vitest";
import * as debugModules from "@genome-spy/core/debug/index.js";
import { attachInspectorOverlay, createInspectorPanel } from "./index.js";

describe("attachInspectorOverlay", () => {
    test("initializes once and reuses the snapshot when reconnected", async () => {
        // Count actual snapshot builds, not the cached debug-module load.
        const createViewDebugSnapshot = vi.fn(
            debugModules.createViewDebugSnapshot
        );
        const inspector = await attachInspectorOverlay({
            getViewRoot: () => undefined,
            getModules: async () => ({
                ...debugModules,
                createViewDebugSnapshot,
            }),
        });
        await inspector.panel.updateComplete;
        expect(createViewDebugSnapshot).toHaveBeenCalledOnce();
        expect(inspector.panel.snapshot).toBe(inspector.session.snapshot);

        expect(document.querySelector(".gs-inspector-overlay")).toBe(
            inspector.element
        );
        expect(inspector.panel.style.display).toBe("block");
        expect(inspector.panel.style.height).toBe("100%");

        // Full-window expansion disconnects and reconnects the same live panel.
        inspector.element.remove();
        document.body.append(inspector.element);
        await inspector.panel.updateComplete;
        expect(createViewDebugSnapshot).toHaveBeenCalledOnce();
        await inspector.session.refresh();
        expect(createViewDebugSnapshot).toHaveBeenCalledTimes(2);
        expect(inspector.panel.snapshot).toBe(inspector.session.snapshot);

        inspector.dispose();

        expect(document.querySelector(".gs-inspector-overlay")).toBeNull();
    });
    test("does not attach an overlay when its opening signal is aborted", async () => {
        const lifetime = new AbortController();
        const pending = attachInspectorOverlay(
            {
                getViewRoot: () => undefined,
                getModules: async () => debugModules,
            },
            { signal: lifetime.signal }
        );
        lifetime.abort();
        await expect(pending).rejects.toMatchObject({ name: "AbortError" });
        expect(document.querySelector(".gs-inspector-overlay")).toBeNull();
    });
});

test("creates a standalone panel with its initial snapshot ready", async () => {
    const createViewDebugSnapshot = vi.fn(debugModules.createViewDebugSnapshot);
    const inspector = await createInspectorPanel({
        getViewRoot: () => undefined,
        getModules: async () => ({ ...debugModules, createViewDebugSnapshot }),
    });
    expect(createViewDebugSnapshot).toHaveBeenCalledOnce();
    document.body.append(inspector.panel);
    await inspector.panel.updateComplete;
    expect(createViewDebugSnapshot).toHaveBeenCalledOnce();
    expect(inspector.panel.snapshot).toBe(inspector.session.snapshot);
    inspector.dispose();
});
