import addBaseUrl from "./addBaseUrl";

test("addBaseUrl adds baseUrl when needed", () => {
    expect(addBaseUrl("foo.html", "https://site.com/")).toEqual(
        "https://site.com/foo.html"
    );
    expect(addBaseUrl("foo.html", "https://site.com")).toEqual(
        "https://site.com/foo.html"
    );
    expect(addBaseUrl("bar/foo.html", "https://site.com/")).toEqual(
        "https://site.com/bar/foo.html"
    );
    expect(addBaseUrl("../foo.html", "https://site.com/bar/")).toEqual(
        "https://site.com/bar/../foo.html"
    );
});

test("addBaseUrl doesn't add baseUrl when not needed", () => {
    expect(addBaseUrl("/foo.html", "https://site.com/")).toEqual("/foo.html");
    expect(addBaseUrl("foo.html", undefined)).toEqual("foo.html");
});
