import { describe, expect, test } from "vitest";

import { createTestViewContext } from "../view/testUtils.js";
import { buildDataFlow } from "../view/flowBuilder.js";
import { optimizeDataFlow } from "./flowOptimizer.js";
import { syncFlowHandles } from "./flowInit.js";

describe("flowInit", () => {
    test("syncs handles to canonical data sources after merge", async () => {
        const context = createTestViewContext();
        context.getNamedDataFromProvider = () => [];
        context.addBroadcastListener = () => undefined;
        context.removeBroadcastListener = () => undefined;

        /** @type {import("../spec/view.js").ConcatSpec} */
        const spec = {
            hconcat: [
                {
                    data: { name: "shared" },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
                {
                    data: { name: "shared" },
                    mark: "point",
                    encoding: {
                        x: { field: "x", type: "quantitative" },
                    },
                },
            ],
        };

        const root = await context.createOrImportView(spec, null, null, "root");

        const flow = buildDataFlow(root, context.dataFlow);
        const canonicalBySource = optimizeDataFlow(flow);
        syncFlowHandles(root, canonicalBySource);

        const left = root.children[0];
        const right = root.children[1];

        expect(left.flowHandle.dataSource).toBeDefined();
        expect(right.flowHandle.dataSource).toBeDefined();
        expect(left.flowHandle.dataSource).toBe(right.flowHandle.dataSource);

        const sharedSources = flow.dataSources.filter(
            (source) => source.identifier === "shared"
        );
        expect(sharedSources).toEqual([left.flowHandle.dataSource]);
    });
});
