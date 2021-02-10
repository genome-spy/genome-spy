import createCloner from "./cloner";

const template = {
    a: 1,
    b: "xyzzy",
    "3": "iddqd"
};

test("Cloner clones object properly", () => {
    const makeClone = createCloner(template);

    expect(makeClone(template)).toEqual(template);
    expect(makeClone(template)).not.toBe(template);

    const another = {
        a: 2,
        b: "idkfa",
        "3": "hello"
    };

    expect(makeClone(another)).toEqual(another);
    expect(makeClone(another)).not.toBe(another);
});
