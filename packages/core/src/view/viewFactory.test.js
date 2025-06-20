import { expect, test } from "vitest";
import { ViewFactory } from "./viewFactory.js";

test("isViewSpec", () => {
    const factory = new ViewFactory();

    // @ts-ignore
    expect(factory.isViewSpec({})).toBeFalsy();

    expect(factory.isViewSpec({ mark: "rect" })).toBeTruthy();
    expect(factory.isViewSpec({ layer: [] })).toBeTruthy();
    expect(factory.isViewSpec({ hconcat: [] })).toBeTruthy();
    expect(factory.isViewSpec({ vconcat: [] })).toBeTruthy();
    expect(factory.isViewSpec({ concat: [], columns: 1 })).toBeTruthy();

    expect(() => factory.isViewSpec({ mark: "rect", layer: [] })).toThrow();
});

test("Throws if importing is not allowed", async () => {
    const factory = new ViewFactory({ allowImport: false });

    await expect(() =>
        factory.createOrImportView({ import: { url: "" } }, undefined)
    ).rejects.toThrow();
});
