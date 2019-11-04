import filterTransform from './filter';

test("FilterTransform filter rows", () => {
    const data = [1, 2, 3, 4, 5, 6].map(x => ({ x }));
    const filterConfig = {
        type: "filter",
        expr: "datum.x > 3 && datum.x != 5"
    }

    expect(filterTransform(filterConfig, data))
        .toEqual([4, 6].map(x => ({ x })));
})