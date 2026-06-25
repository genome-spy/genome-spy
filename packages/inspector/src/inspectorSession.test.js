import { describe, expect, test } from "vitest";
import { getViewIdentityRegistry } from "@genome-spy/core/view/viewIdentityRegistry.js";
import InspectorSession from "./inspectorSession.js";

describe("InspectorSession", () => {
    test("refreshes through a root-view embedder host without App shape", async () => {
        const session = new InspectorSession({
            getRootView: () => undefined,
        });
        let snapshotEvents = 0;
        session.addEventListener("snapshot", () => {
            snapshotEvents += 1;
        });

        await session.refresh();

        expect(snapshotEvents).toBe(1);
        expect(session.snapshot.rootId).toBeUndefined();
        expect(session.snapshot.nodes).toEqual([]);
    });

    test("uses core runtime view ids for view nodes", async () => {
        const view = createFakeView();
        const session = new InspectorSession({
            getRootView: () => view,
        });

        await session.refresh();

        expect(session.snapshot.rootId).toBe(
            getViewIdentityRegistry(view).getId(view)
        );
        expect(session.snapshot.rootId).toBe("view-0");
    });
});

function createFakeView() {
    const view = {
        name: "root",
        explicitName: "root",
        defaultName: "root",
        spec: { name: "root" },
        coords: undefined,
        resolutions: {
            scale: {},
            axis: {},
            legend: {},
        },
        context: {
            dataFlow: undefined,
            addBroadcastListener: () => undefined,
            removeBroadcastListener: () => undefined,
            highlightView: () => undefined,
        },
        paramRuntime: {
            paramConfigs: new Map(),
            getDebugState: () => ({
                scopeId: "root",
                disposed: false,
                params: [],
            }),
        },
        flowHandle: {},
        visit: (visitor) => visitor(view),
        getPathString: () => "root",
        isVisible: () => true,
        isConfiguredVisible: () => true,
        isVisibleInSpec: () => true,
        getDataInitializationState: () => "none",
        getSize: () => ({ width: 100, height: 100 }),
        getViewportSize: () => ({ width: 100, height: 100 }),
        getEncoding: () => ({}),
    };

    return /** @type {any} */ (view);
}
