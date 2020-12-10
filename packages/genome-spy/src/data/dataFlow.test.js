import Collector from "./collector";
import DataFlow from "./dataFlow";
import InlineSource from "./sources/inlineSource";
import UrlSource from "./sources/urlSource";

describe("DataFlow", () => {
    test("Merges identical data sources", () => {
        /** @type {DataFlow<string>} */
        const dataFlow = new DataFlow();

        const a = new UrlSource({ url: "http://genomespy.app/" });
        const ac = new Collector();
        a.addChild(ac);

        const b = new UrlSource({ url: "http://genomespy.app/" });
        const bc = new Collector();
        b.addChild(bc);

        const c = new UrlSource({ url: "http://helsinki.fi/" });
        const cc = new Collector();
        c.addChild(cc);

        dataFlow.addDataSource(a, "a");
        dataFlow.addDataSource(b, "b");
        dataFlow.addDataSource(c, "c");

        dataFlow.addCollector(ac, "a");
        dataFlow.addCollector(bc, "b");
        dataFlow.addCollector(cc, "c");

        expect(dataFlow.dataSources.length).toEqual(2);

        expect(dataFlow.findDataSource("a")).toBe(a);
        expect(dataFlow.findDataSource("b")).toBe(a); // Merged!
        expect(dataFlow.findDataSource("c")).toBe(c);

        expect(new Set(a.children)).toEqual(new Set([ac, bc]));
        expect(c.children[0]).toBe(cc);

        for (const dataSource of dataFlow.dataSources) {
            // Cheat that we loaded something
            dataSource.complete();
        }

        expect(ac.completed).toBeTruthy();
        expect(bc.completed).toBeTruthy();
        expect(cc.completed).toBeTruthy();
    });

    test("Does not merge data sources with undefined identifier", () => {
        /** @type {DataFlow<string>} */
        const dataFlow = new DataFlow();

        const a = new InlineSource({ values: [1, 2, 3] });
        const b = new InlineSource({ values: [1, 2, 3] });

        dataFlow.addDataSource(a, "a");
        dataFlow.addDataSource(b, "b");

        expect(dataFlow.findDataSource("a")).toBe(a);
        expect(dataFlow.findDataSource("b")).toBe(b);
    });
});
