import { group } from "d3-array";
import iterateNestedMaps from "./iterateNestedMaps";

const data = [
    { name: "jim", amount: "34.0", date: "11/12/2015" },
    { name: "carl", amount: "120.11", date: "11/12/2015" },
    { name: "stacy", amount: "12.01", date: "01/04/2016" },
    { name: "stacy", amount: "34.05", date: "01/04/2016" },
    { name: "stacy", amount: "1.5", date: "02/04/2016" }
];

const groups = group(
    data,
    d => d.name,
    d => d.date
);

test("iterateNestedMaps iterates correctly", () => {
    const expected = [
        [["jim", "11/12/2015"], [data[0]]],
        [["carl", "11/12/2015"], [data[1]]],
        [
            ["stacy", "01/04/2016"],
            [data[2], data[3]]
        ],
        [["stacy", "02/04/2016"], [data[4]]]
    ];

    const result = [...iterateNestedMaps(groups)];

    expect(result).toEqual(expected);
});
