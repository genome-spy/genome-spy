import { nestPaths } from "./nestPaths";

test("nestPaths nests paths properly", () => {
    // prettier-ignore
    const items = [
    "r/a",
    "r/a/b",
    "r/a/b/c",
    "r/a/b/c2",
    "r/a/b2",
    "r/a2/b3/c3"
].map((path) =>
    path.split("/")
);

    /**
     * @type {import("./nestPaths").NestedItem<string>}
     */
    const result = {
        item: "r",
        children: [
            {
                item: "a",
                children: [
                    {
                        item: "b",
                        children: [
                            { item: "c", children: [] },
                            { item: "c2", children: [] },
                        ],
                    },
                    { item: "b2", children: [] },
                ],
            },
            {
                item: "a2",
                children: [
                    { item: "b3", children: [{ item: "c3", children: [] }] },
                ],
            },
        ],
    };

    expect(nestPaths(items)).toEqual(result);
});
