import { describe, expect, test } from "vitest";
import DataFlow from "./dataFlow.js";
import DataSource from "./sources/dataSource.js";
import Collector from "./collector.js";
import FlowNode from "./flowNode.js";

describe("DataFlow", () => {
    test("removes sources and collectors and clears observers", () => {
        const flow = new DataFlow();

        const sourceA = new DataSource(/** @type {any} */ ({}));
        const sourceB = new DataSource(/** @type {any} */ ({}));

        flow.addDataSource(sourceA);
        flow.addDataSource(sourceB);

        const collector = new Collector();
        flow.addCollector(collector);

        let called = false;
        collector.observe(() => {
            called = true;
        });

        expect(flow.dataSources).toContain(sourceA);
        expect(flow.collectors).toContain(collector);
        expect(collector.observers.size).toBe(1);

        flow.removeDataSource(sourceA);
        flow.removeCollector(collector);

        expect(flow.dataSources).not.toContain(sourceA);
        expect(flow.collectors).not.toContain(collector);

        expect(collector.observers.size).toBe(0);
        expect(called).toBe(false);
        expect(flow.dataSources).toContain(sourceB);
    });

    test("removeCollector disposes detached collector subtree", () => {
        const flow = new DataFlow();
        const source = new DataSource(/** @type {any} */ ({}));
        const collector = new Collector();
        const child = new FlowNode();

        source.addChild(collector);
        collector.addChild(child);
        flow.addDataSource(source);
        flow.addCollector(collector);

        let collectorDisposed = 0;
        let childDisposed = 0;
        collector.registerDisposer(() => {
            collectorDisposed += 1;
        });
        child.registerDisposer(() => {
            childDisposed += 1;
        });

        flow.removeCollector(collector);

        expect(collectorDisposed).toBe(1);
        expect(childDisposed).toBe(1);
        expect(source.children).toEqual([]);
    });

    test("pruneCollectorBranch disposes orphaned ancestors", () => {
        const flow = new DataFlow();
        const source = new DataSource(/** @type {any} */ ({}));
        const middle = new FlowNode();
        const collector = new Collector();

        source.addChild(middle);
        middle.addChild(collector);
        flow.addDataSource(source);
        flow.addCollector(collector);

        let middleDisposed = 0;
        middle.registerDisposer(() => {
            middleDisposed += 1;
        });

        flow.pruneCollectorBranch(collector);

        expect(middleDisposed).toBe(1);
        expect(flow.dataSources).not.toContain(source);
    });
});
