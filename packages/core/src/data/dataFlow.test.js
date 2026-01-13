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

        expect(flow.findDataSourceByKey("a")).toBe(sourceA);
        expect(flow.findCollectorByKey("c")).toBe(collector);
        expect(collector.observers.length).toBe(1);

        flow.removeHosts(["a", "c"]);

        expect(flow.findDataSourceByKey("a")).toBeUndefined();
        expect(flow.findCollectorByKey("c")).toBeUndefined();

        expect(collector.observers.length).toBe(0);
        expect(called).toBe(false);
        expect(flow.getDataSourcesForHosts(["b", "missing"])).toEqual([
            sourceB,
        ]);
    });
});
