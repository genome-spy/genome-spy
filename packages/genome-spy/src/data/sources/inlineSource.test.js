import Collector from "../collector";
import InlineSource from "./inlineSource";

/**
 * @param {InlineSource} source
 */
async function collectSource(source) {
    const collector = new Collector();
    source.addChild(collector);

    await source.load();

    return collector.getData();
}

test("InlineSource propagates an object", async () => {
    expect(
        await collectSource(new InlineSource({ values: { x: 1 } }))
    ).toEqual([{ x: 1 }]);
});

test("InlineSource propagates an array of objects", async () => {
    expect(
        await collectSource(new InlineSource({ values: [{ x: 1 }, { x: 2 }] }))
    ).toEqual([{ x: 1 }, { x: 2 }]);
});

test("InlineSource wraps scalars to objects", async () => {
    expect(await collectSource(new InlineSource({ values: [1, 2] }))).toEqual([
        { data: 1 },
        { data: 2 }
    ]);
});

test("InlineSource parses a string", async () => {
    expect(
        await collectSource(
            new InlineSource({
                values: "a\n1\n2\n3",
                format: {
                    type: "csv"
                }
            })
        )
    ).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
});

test("InlineSource throws on a string and a missing format specifier", () => {
    expect(
        () =>
            new InlineSource({
                values: "a\n1\n2\n3"
            })
    ).toThrow();
});
