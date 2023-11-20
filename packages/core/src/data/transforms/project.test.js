import { expect, test } from "vitest";
import { processData } from "../flowTestUtils.js";
import ProjectTransform from "./project.js";

test("Project", () => {
    const data = [
        {
            foo: "FOO",
            bar: "BAR",
            baz: { a: "A" },
        },
    ];

    /** @param {import("./project.js").ProjectParams} params */
    const p = (params) => processData(new ProjectTransform(params), data);

    expect(p({ type: "project", fields: ["bar"] })).toEqual([{ bar: "BAR" }]);

    expect(
        p({ type: "project", fields: ["bar", "foo"], as: ["xBar", "xFoo"] })
    ).toEqual([{ xBar: "BAR", xFoo: "FOO" }]);

    expect(p({ type: "project", fields: ["baz.a"] })).toEqual([
        { "baz.a": "A" },
    ]);

    expect(p({ type: "project", fields: ["baz.a"], as: ["a"] })).toEqual([
        { a: "A" },
    ]);

    expect(() => p({ type: "project", fields: ["bar"], as: [] })).toThrow();
});
