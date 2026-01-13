import { describe, expect, test } from "vitest";
import DataFlow from "./dataFlow.js";
import DataSource from "./sources/dataSource.js";
import Collector from "./collector.js";

describe("DataFlow", () => {
    test("removes hosts and ignores observer callbacks", () => {
        const flow = new DataFlow();

        const sourceA = new DataSource(/** @type {any} */ ({}));
        const sourceB = new DataSource(/** @type {any} */ ({}));

        flow.addDataSource(sourceA, "a");
        flow.addDataSource(sourceB, "b");

        const collector = new Collector();
        flow.addCollector(collector, "c");

        let called = false;
        flow.addObserver(() => {
            called = true;
        }, "c");

        const dataSourceEntry = flow
            .getDataSourceEntries()
            .find(([key]) => key === "a");
        expect(dataSourceEntry).toBeDefined();
        expect(dataSourceEntry?.[1]).toBe(sourceA);

        const collectorEntry = flow
            .getCollectorEntries()
            .find(([key]) => key === "c");
        expect(collectorEntry).toBeDefined();
        expect(collectorEntry?.[1]).toBe(collector);
        expect(collector.observers.length).toBe(1);

        flow.removeHosts(["a", "c"]);

        expect(
            flow.getDataSourceEntries().find(([key]) => key === "a")
        ).toBeUndefined();
        expect(
            flow.getCollectorEntries().find(([key]) => key === "c")
        ).toBeUndefined();

        expect(collector.observers.length).toBe(0);
        expect(called).toBe(false);
        expect(flow.getDataSourcesForHosts(["b", "missing"])).toEqual([
            sourceB,
        ]);
    });
});
