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
    const collector = new Collector({
        type: "collect",
        sort: { field: ["x"] }
    });

    for (const d of data) {
        collector.handle(d);
    }
    collector.complete();

    expect([...collector.getData()]).toEqual([1, 2, 3, 4, 5].map(x => ({ x })));
});

test("Collector collects, groups, and sorts data", () => {
    const collector = new Collector({
        type: "collect",
        sort: { field: ["x"] },
        groupby: ["a", "b"]
    });

    const data = [
        { a: 1, b: 1, x: 1 },
        { a: 1, b: 2, x: 2 },
        { a: 1, b: 2, x: 3 },
        { a: 2, b: 1, x: 4 },
        { a: 2, b: 1, x: 5 },
        { a: 2, b: 2, x: 6 }
    ];

    for (const d of data) {
        collector.handle(d);
    }
    collector.complete();

    const cd = [...collector.getData()];

    expect(cd.map(d => ({ x: d.x }))).toEqual(
        [1, 2, 3, 4, 5, 6].map(x => ({ x }))
    );

    /** @param {any[]} group*/
    const getGroupX = group =>
        cd.slice(...collector.groupExtentMap.get(group)).map(d => d.x);

    expect(getGroupX([1, 1])).toEqual([1]);
    expect(getGroupX([1, 2])).toEqual([2, 3]);
    expect(getGroupX([2, 1])).toEqual([4, 5]);
    expect(getGroupX([2, 2])).toEqual([6]);

    expect(new Set(collector.groupExtentMap.keys())).toEqual(
        new Set([
            [1, 1],
            [1, 2],
            [2, 1],
            [2, 2]
        ])
    );
});

test("Collector throws on incomplete flow", () => {
    const collector = new Collector();

    expect(() => collector.getData()).toThrow();
});
