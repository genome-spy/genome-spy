import { describe, expect, test } from "vitest";
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
});
