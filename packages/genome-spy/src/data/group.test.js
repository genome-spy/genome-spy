import { DataGroup, GroupGroup } from "./group.js";

function createGroups() {
    return new GroupGroup("root", [
        new DataGroup("a", [1, 2, 3]),
        new DataGroup("b", [4, 5])
    ]);
}

function createDeepGroups() {
    return new GroupGroup("root", [
        new GroupGroup("x", [
            new DataGroup("a", [1, 2, 3]),
            new DataGroup("b", [4, 5])
        ]),
        new GroupGroup("y", [
            new DataGroup("a", [6, 7]),
            new DataGroup("b", [8, 9, 10])
        ])
    ]);
}

test("Ungroup ungroups", () => {
    expect(createGroups().ungroup()).toEqual(
        new DataGroup("root", [1, 2, 3, 4, 5])
    );

    expect(createDeepGroups().ungroup()).toEqual(
        new GroupGroup("root", [
            new DataGroup("x", [1, 2, 3, 4, 5]),
            new DataGroup("y", [6, 7, 8, 9, 10])
        ])
    );
});

test("UngroupAll ungroups", () => {
    expect(createGroups().ungroupAll()).toEqual(
        new DataGroup("root", [1, 2, 3, 4, 5])
    );

    expect(createDeepGroups().ungroupAll()).toEqual(
        new DataGroup("root", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    );
});

test("FlatData iterable yields correctly", () => {
    expect([...createDeepGroups().flatData()]).toEqual([
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10
    ]);
});
