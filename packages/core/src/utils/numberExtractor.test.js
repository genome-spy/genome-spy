import { expect, test } from "vitest";
import numberExtractor from "./numberExtractor.js";

test("NumberExtractor parses delimited integers", () => {
    expect([...numberExtractor("23,12345,2345")]).toEqual([23, 12345, 2345]);
});
