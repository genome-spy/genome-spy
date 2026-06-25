import { describe, expect, test } from "vitest";
import View from "../view/view.js";
import { createAndInitialize } from "../view/testUtils.js";
import { createParamDebugSnapshot } from "./paramDebugSnapshot.js";

describe("createParamDebugSnapshot", () => {
    test("summarizes configured and runtime params by view scope", async () => {
        const view = await createAndInitialize(
            {
                params: [
                    { name: "threshold", value: 2 },
                    { name: "doubleThreshold", expr: "threshold * 2" },
                ],
                data: { values: [{ x: 3 }] },
                mark: "point",
                encoding: {
                    x: { field: "x", type: "quantitative" },
                },
            },
            View
        );

        const snapshot = createParamDebugSnapshot(view, {
            getDebugId: () => "v1",
        });

        const rootScope = snapshot.scopes.find(
            (scope) => scope.viewPath === "viewRoot"
        );

        expect(rootScope?.params).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: "threshold",
                    kind: "base",
                    value: 2,
                    writable: true,
                    configured: true,
                }),
                expect.objectContaining({
                    name: "doubleThreshold",
                    kind: "derived",
                    value: 4,
                    writable: false,
                    configured: true,
                }),
            ])
        );
        expect(rootScope?.params.map((param) => param.name)).toContain(
            "zoomLevel"
        );
    });
});
