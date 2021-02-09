import kWayMerge from "./kWayMerge";

test("k-way merge merges multiple sorted and concatenated arrays", () => {
    /** @type {{a: number}[]} */
    const array = [];
    /** @type {[number, number][]} */
    const extents = [];

    for (let a = 0; a < 20; a++) {
        extents.push([array.length, array.length + a]);
        let x = 0;
        for (let i = 0; i < a; i++) {
            x += Math.floor(Math.random() * 10);
            array.push({ a: x });
        }
    }

    const sorted = array.sort((a, b) => a.a - b.a);

    /** @type {function(any):number} */
    const accessor = d => d.a;

    expect([...kWayMerge(array, extents, accessor)]).toEqual(sorted);
});
