import { describe, expect, test } from "vitest";
import View from "../view/view.js";
import { createAndInitialize } from "../view/testUtils.js";
import { createMarkDebugSnapshot } from "./markDebugSnapshot.js";

describe("createMarkDebugSnapshot", () => {
    test("summarizes unit mark state", async () => {
        const view = await createAndInitialize(
            {
                data: { values: [{ x: 1, label: "alpha" }] },
                mark: { type: "point", size: 81 },
                encoding: {
                    x: { field: "x", type: "quantitative" },
                    search: { field: "label" },
                },
            },
            View
        );

        const snapshot = createMarkDebugSnapshot(view, {
            getDebugId: () => "v1",
        });

        expect(snapshot.marks).toHaveLength(1);
        expect(snapshot.marks[0]).toMatchObject({
            viewId: "v1",
            viewPath: "viewRoot",
            type: "point",
            ready: false,
            pickingParticipant: true,
            dataCount: 1,
            encodingChannels: expect.arrayContaining(["x", "search"]),
            encoderChannels: expect.arrayContaining(["x"]),
            searchFields: ["label"],
            properties: expect.objectContaining({
                size: 81,
            }),
        });
    });
});
