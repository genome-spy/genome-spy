import numberExtractor from "./numberExtractor";

test("NumberExtractor parses delimited integers", () => {
    expect([...numberExtractor("23,12345,2345")]).toEqual([23, 12345, 2345]);
});
