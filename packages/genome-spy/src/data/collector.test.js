import Collector from "./collector";

const data = [1, 5, 2, 4, 3].map(x => ({ x }));

test("Collector collects data", () => {
    const collector = new Collector();

    for (const d of data) {
        collector.handle(d);
    }
    collector.complete();

    expect(collector.getData()).toEqual(data);
});

test("Collector collects and sorts data", () => {
    const collector = new Collector({ type: "sort", sort: { field: ["x"] } });

    for (const d of data) {
        collector.handle(d);
    }
    collector.complete();

    expect(collector.getData()).toEqual([1, 2, 3, 4, 5].map(x => ({ x })));
});

test("Collector throws on incomplete flow", () => {
    const collector = new Collector();

    expect(() => collector.getData()).toThrow();
});
