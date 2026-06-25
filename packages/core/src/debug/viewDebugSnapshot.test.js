import { describe, expect, test } from "vitest";
import View from "../view/view.js";
import { create } from "../view/testUtils.js";
import { createViewDebugSnapshot } from "./viewDebugSnapshot.js";

describe("createViewDebugSnapshot", () => {
    test("summarizes the live view hierarchy with stable ids", async () => {
        const view = await create(
            {
                vconcat: [
                    {
                        name: "top",
                        data: { values: [{ x: 1, y: 2 }] },
                        mark: "point",
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            y: { field: "y", type: "quantitative" },
                        },
                    },
                    {
                        name: "bottom",
                        data: { values: [{ x: 2, y: 3 }] },
                        mark: "rect",
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            y: { field: "y", type: "quantitative" },
                        },
                    },
                ],
            },
            View,
            { wrapRoot: true }
        );

        const ids = new WeakMap();
        let nextId = 0;
        const snapshot = createViewDebugSnapshot(view, {
            getDebugId: (object) => {
                if (!ids.has(object)) {
                    nextId += 1;
                    ids.set(object, "d" + String(nextId));
                }
                return ids.get(object);
            },
        });

        expect(snapshot.rootId).toBe("d1");
        expect(snapshot.nodes.map((node) => node.name)).toContain("top");
        expect(snapshot.nodes.map((node) => node.name)).toContain("bottom");
        expect(
            snapshot.nodes.find((node) => node.name === "top")
        ).toMatchObject({
            type: "unit",
            markType: "point",
            selector: { scope: [], view: "top" },
            encodings: {
                x: {
                    channel: "x",
                    field: "x",
                    type: "quantitative",
                },
            },
        });
    });

    test("keeps a node when optional debug fields fail", async () => {
        const view = await create(
            {
                name: "broken",
                data: { values: [{ x: 1 }] },
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                },
            },
            View
        );

        view.getSize = () => {
            throw new Error("Cannot use step-based size with null scale.");
        };

        const snapshot = createViewDebugSnapshot(view, {
            getDebugId: () => "view-id",
        });

        expect(snapshot.nodes).toHaveLength(1);
        expect(snapshot.nodes[0]).toMatchObject({
            name: "broken",
            size: undefined,
            debugErrors: expect.arrayContaining([
                expect.objectContaining({
                    field: "size",
                    message: "Cannot use step-based size with null scale.",
                }),
            ]),
        });
    });
});
