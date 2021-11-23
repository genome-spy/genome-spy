import kWayMerge from "./kWayMerge";

test("k-way merge merges multiple sorted arrays", () => {
    /** @type {{a: number}[][]} */
    const arrays = [];

    for (let a = 0; a < 20; a++) {
        /** @type {{a: number}[]} */
        const array = [];
        arrays.push(array);

        let x = 0;
        for (let i = 0; i < a; i++) {
            x += Math.floor(Math.random() * 10);
            array.push({ a: x });
        }
    }

    const sorted = arrays.flat().sort((a, b) => a.a - b.a);

    /** @type {function(any):number} */
    const accessor = (d) => d.a;

    expect([...kWayMerge(arrays, accessor)]).toEqual(sorted);
});
