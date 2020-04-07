import AccessorFactory from "./accessor";

const af = new AccessorFactory();

const datum = {
    a: 1,
    b: 2,
    "x.c": 3
};

test("Creates a field accessor", () => {
    const a = af.createAccessor({ field: "a" });
    expect(a(datum)).toEqual(1);
    expect(a.constant).toBeFalsy();
    expect(a.fields).toEqual(["a"]);
});

test("Creates an expression accessor", () => {
    const a = af.createAccessor({ expr: `datum.b + datum['x\.c']` });
    expect(a(datum)).toEqual(5);
    expect(a.constant).toBeFalsy();
    expect(a.fields.sort()).toEqual(["b", "x.c"].sort());
});

test("Creates a constant accessor", () => {
    const a = af.createAccessor({ datum: 0 });
    expect(a(datum)).toEqual(0);
    expect(a.constant).toBeTruthy();
    expect(a.fields).toEqual([]);
});

test("Returns undefined on incomplete encoding spec", () => {
    expect(af.createAccessor({})).toBeUndefined();
});

test("Registers and creates a custom accessor", () => {
    const af = new AccessorFactory();
    af.register(encoding => {
        if (encoding.iddqd && encoding.idkfa) {
            return datum => `${datum[encoding.iddqd]}-${datum[encoding.idkfa]}`;
        }
    });

    expect(af.createAccessor({ iddqd: "a", idkfa: "b" })(datum)).toEqual("1-2");
});
