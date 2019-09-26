import formulaTransform from './formula';

test("CalculateTransform", () => {
    const data = [{ a: 2 }, { a: 3 }];

    expect(formulaTransform({
        type: "formula",
        expr: "datum.a * 2",
        as: "b"
    }, data))
    .toEqual([{ a: 2, b : 4 }, { a: 3, b: 6 }]);
})