import { expect, test } from "vitest";
import { concatUrl, getDirectory, resolveUrl } from "./url.js";

test("getDirectory", () => {
    expect(getDirectory("foo")).toBeUndefined();
    expect(getDirectory("foo/")).toBe("foo/");
    expect(getDirectory("foo/index")).toBe("foo/");
    expect(getDirectory("http://example.com")).toBe("http://example.com/");
    expect(getDirectory("http://example.com/")).toBe("http://example.com/");
    expect(getDirectory("http://example.com/a")).toBe("http://example.com/");
    expect(getDirectory("http://example.com/a/")).toBe("http://example.com/a/");
});

test("concatUrl", () => {
    expect(concatUrl("http://example.com", "foo")).toEqual(
        "http://example.com/foo"
    );
    expect(concatUrl(() => "http://example.com", "foo")).toEqual(
        "http://example.com/foo"
    );
    expect(concatUrl("http://example.com/", "http://genomespy.app/")).toEqual(
        "http://genomespy.app/"
    );
    expect(concatUrl("foo/", "bar")).toEqual("foo/bar");
    expect(concatUrl("foo/baz", "bar")).toEqual("foo/bar");
    expect(concatUrl(undefined, "bar")).toEqual("bar");
    expect(concatUrl("bar", undefined)).toEqual("bar");
});

test("resolveUrl", () => {
    expect(
        resolveUrl(
            "private/foo123/",
            "metadata/source.json",
            "https://host.example/app/index.html"
        )
    ).toEqual("https://host.example/app/private/foo123/metadata/source.json");

    expect(
        resolveUrl(
            "https://example.org/spec/metadata/source.json",
            "../data/samples.tsv",
            null
        )
    ).toEqual("https://example.org/spec/data/samples.tsv");

    expect(resolveUrl("foo/", "bar", null)).toEqual("foo/bar");
});
