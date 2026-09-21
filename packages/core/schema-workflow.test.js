import { describe, expect, test } from "vitest";
import {
    getSchemaUrls,
    parseStableVersion,
    preparePublishedExample,
} from "../../scripts/schema-workflow.mjs";

const versions = { core: "0.88.1", app: "1.2.3" };

describe("schema publication workflow", () => {
    test("builds major, minor, and exact schema URLs", () => {
        expect(getSchemaUrls("core", "1.2.3")).toEqual({
            major: "https://genomespy.app/schema/core/v1.json",
            minor: "https://genomespy.app/schema/core/v1.2.json",
            exact: "https://genomespy.app/schema/core/v1.2.3.json",
        });
        expect(parseStableVersion("1.2.3")).toEqual({
            major: 1,
            minor: 2,
            patch: 3,
        });
        expect(() => parseStableVersion("1.2.3-next.1")).toThrow(
            "stable semantic version"
        );
    });

    test("injects the package major as the first property", () => {
        const source = '{\n  "description": "Example",\n  "mark": "point"\n}\n';

        expect(
            preparePublishedExample("core/example.json", source, versions)
        ).toBe(
            "{\n" +
                '  "$schema": "https://genomespy.app/schema/core/v0.json",\n' +
                "\n" +
                '  "description": "Example",\n' +
                '  "mark": "point"\n' +
                "}\n"
        );
        expect(
            preparePublishedExample("app/example.json", source, versions)
        ).toContain("https://genomespy.app/schema/app/v1.json");
    });

    test("rejects unexpected explicit schemas", () => {
        const source =
            '{\n  "$schema": "https://vega.github.io/schema/vega-lite/v5.json"\n}\n';

        expect(() =>
            preparePublishedExample("core/example.json", source, versions)
        ).toThrow("Unexpected explicit $schema");
    });

    test("leaves non-specification assets unchanged", () => {
        const source = '[{"name":"example"}]\n';

        expect(
            preparePublishedExample("data/catalog.json", source, versions)
        ).toBe(source);
    });
});
