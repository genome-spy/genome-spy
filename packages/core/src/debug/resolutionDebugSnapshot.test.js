import { describe, expect, test } from "vitest";
import View from "../view/view.js";
import { createAndInitialize } from "../view/testUtils.js";
import { createResolutionDebugSnapshot } from "./resolutionDebugSnapshot.js";

describe("createResolutionDebugSnapshot", () => {
    test("summarizes shared scale resolution members", async () => {
        const view = await createAndInitialize(
            {
                layer: [
                    {
                        name: "points",
                        data: { values: [{ x: 1, category: "a" }] },
                        mark: "point",
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            color: { field: "category", type: "nominal" },
                        },
                    },
                    {
                        name: "morePoints",
                        data: { values: [{ x: 2, category: "b" }] },
                        mark: "point",
                        encoding: {
                            x: { field: "x", type: "quantitative" },
                            color: { field: "category", type: "nominal" },
                        },
                    },
                ],
            },
            View
        );

        const ids = new WeakMap();
        let nextId = 0;
        const snapshot = createResolutionDebugSnapshot(view, {
            getDebugId: (object) => {
                if (!ids.has(object)) {
                    nextId += 1;
                    ids.set(object, "d" + String(nextId));
                }
                return ids.get(object);
            },
        });

        const color = snapshot.scales.find(
            (resolution) => resolution.channel === "color"
        );

        expect(color).toMatchObject({
            channel: "color",
            type: "nominal",
        });
        expect(color.members).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    viewPath: "viewRoot/points",
                    channel: "fill",
                    field: "category",
                    contributesToDomain: true,
                }),
                expect.objectContaining({
                    viewPath: "viewRoot/morePoints",
                    channel: "fill",
                    field: "category",
                    contributesToDomain: true,
                }),
            ])
        );
    });
});
