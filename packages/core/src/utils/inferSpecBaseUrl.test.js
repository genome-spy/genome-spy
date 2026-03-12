import { expect, test } from "vitest";
import inferSpecBaseUrl, {
    getCuratedExampleBaseUrl,
} from "./inferSpecBaseUrl.js";

test("inferSpecBaseUrl uses examples root for curated local examples", () => {
    expect(inferSpecBaseUrl("examples/core/first.json")).toBe("examples/");
    expect(
        inferSpecBaseUrl("examples/docs/index/interactive-overview.json")
    ).toBe("examples/");
    expect(inferSpecBaseUrl("/examples/app/demo.json")).toBe("/examples/");
});

test("inferSpecBaseUrl uses docs examples root for staged docs examples", () => {
    expect(
        inferSpecBaseUrl(
            "/docs/examples/docs/grammar/mark/point/point-mark.json"
        )
    ).toBe("/docs/examples/");
    expect(
        inferSpecBaseUrl(
            "https://genomespy.app/docs/examples/docs/index/interactive-overview.json"
        )
    ).toBe("https://genomespy.app/docs/examples/");
});

test("inferSpecBaseUrl falls back to the spec directory for non-curated specs", () => {
    expect(inferSpecBaseUrl("private/project/spec.json")).toBe(
        "private/project/"
    );
    expect(inferSpecBaseUrl("/examples/OCAC/ocac.json")).toBe(
        "/examples/OCAC/"
    );
    expect(
        inferSpecBaseUrl(
            "https://genomespy.app/examples/OCAC/ocac.json?foo=bar"
        )
    ).toBe("https://genomespy.app/examples/OCAC/");
});

test("getCuratedExampleBaseUrl detects curated example prefixes only", () => {
    expect(getCuratedExampleBaseUrl("/examples/core/first.json")).toBe(
        "/examples/"
    );
    expect(
        getCuratedExampleBaseUrl("/examples/OCAC/ocac.json")
    ).toBeUndefined();
});
