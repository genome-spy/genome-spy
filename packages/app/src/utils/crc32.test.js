import { expect, test } from "vitest";
import { crc32, crc32hex } from "./crc32.js";

test("crc32 returns correct value for an ASCII string", () => {
    expect(crc32('GenomeSpy: {foo: "0123456789"}')).toEqual(0x00d2bf7c);
});

test("crc32hex returns correct value for an ASCII string", () => {
    expect(crc32hex('GenomeSpy: {foo: "0123456789"}')).toEqual("00d2bf7c");
});
