import { expect, test } from "vitest";
import createCloner, { getAllProperties } from "./cloner.js";

const template = {
    1: "iddqd",
    a: 1,
    c: "xyzzy",
    b: "idclip",
};

test("Cloner clones object properly", () => {
    const makeClone = createCloner(template);

    expect(makeClone(template)).toEqual(template);
    expect(makeClone(template)).not.toBe(template);

    const another = {
        1: "hello",
        a: 2,
        c: "idkfa",
        b: "idclip",
    };

    expect(makeClone(another)).toEqual(another);
    expect(makeClone(another)).not.toBe(another);
});

test("Cloner copies only configured properties", () => {
    const makeClone = createCloner(template, { copyFields: ["1", "c"] });

    expect(makeClone(template)).toEqual({
        1: "iddqd",
        c: "xyzzy",
    });
    expect(makeClone.properties).toEqual(["1", "c"]);
});

test("getAllProperties", () => {
    expect(getAllProperties(template)).toEqual(["1", "a", "c", "b"]);

    const obj = Object.create(template);
    obj.d = 42;

    expect(getAllProperties(obj)).toEqual(["d", "1", "a", "c", "b"]);
});
