import AccessorFactory from './accessor';

const af = new AccessorFactory();

const datum = {
    a: 1,
    b: 2,
    c: 3
}

test("Creates a field accessor", () => {
    expect(af.createAccessor({ field: "a" })(datum)).toEqual(1);
});

test("Creates an expression accessor", () => {
    expect(af.createAccessor({ expr: "datum.b + datum.c" })(datum)).toEqual(5);
});

test("Creates a constant accessor", () => {
    const accessor = af.createAccessor({ constant: 0 }); 
    expect(accessor(datum)).toEqual(0);
    expect(accessor.constant).toBeDefined();
});

test("Throws on incomplete encoding spec", () => {
    expect(() => af.createAccessor({})).toThrow();
    expect(() => af.createAccessor({}, true)).not.toThrow();
})

test("Registers and creates a custom accessor", () => {
    const af = new AccessorFactory();
    af.register(encoding => {
        if (encoding.iddqd && encoding.idkfa) {
            return datum => `${datum[encoding.iddqd]}-${datum[encoding.idkfa]}`;
        }
    });

    expect(af.createAccessor({ iddqd: "a", idkfa: "b"})(datum)).toEqual("1-2");
});