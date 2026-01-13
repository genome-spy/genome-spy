import { describe, expect, test } from "vitest";
import DataFlow from "./dataFlow.js";
import DataSource from "./sources/dataSource.js";
import Collector from "./collector.js";

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
        collector.observers.push(() => {
            called = true;
        });

        expect(flow.dataSources).toContain(sourceA);
        expect(flow.collectors).toContain(collector);
        expect(collector.observers.length).toBe(1);

        flow.removeDataSource(sourceA);
        flow.removeCollector(collector);

        expect(flow.dataSources).not.toContain(sourceA);
        expect(flow.collectors).not.toContain(collector);

        expect(collector.observers.length).toBe(0);
        expect(called).toBe(false);
        expect(flow.dataSources).toContain(sourceB);
    });
});
