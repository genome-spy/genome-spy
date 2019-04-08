import { calculateTransform } from './calculate';

test("CalculateTransform", () => {
    const data = [{ a: 2 }, { a: 3 }];

    expect(calculateTransform({
        type: "calculate",
        calculate: "datum.a * 2",
        as: "b"
    }, data))
    .toEqual([{ a: 2, b : 4 }, { a: 3, b: 6 }]);
})