// @vitest-environment jsdom
/* global document, HTMLDivElement */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { appEmbed, appFinalize, coreEmbed, coreFinalize } = vi.hoisted(() => ({
    appEmbed: vi.fn(),
    appFinalize: vi.fn(),
    coreEmbed: vi.fn(),
    coreFinalize: vi.fn(),
}));

vi.mock("@genome-spy/core", () => ({
    embed: coreEmbed,
}));

vi.mock("./appEmbedRuntime.js", () => ({
    appStyles: ".genome-spy-app { color: red; }",
    embed: appEmbed,
}));

import "./index.js";

class TestIntersectionObserver {
    /** @type {TestIntersectionObserver[]} */
    static instances = [];

    /** @param {IntersectionObserverCallback} callback */
    constructor(callback) {
        this.callback = callback;
        this.unobserve = vi.fn();
        this.disconnect = vi.fn();
        TestIntersectionObserver.instances.push(this);
    }

    /** @param {Element} target */
    observe(target) {
        this.callback([{ isIntersecting: true, target }], this);
    }
}

/**
 * @param {string} runtime
 */
async function mountEmbed(runtime) {
    const element = document.createElement("genome-spy-doc-embed");
    element.runtime = runtime;
    element.innerHTML = `<pre>{"mark":"point"}</pre>`;
    document.body.append(element);
    await element.updateComplete;
    await vi.advanceTimersByTimeAsync(80);
    await Promise.resolve();

    return element;
}

describe("GenomeSpyDocEmbed", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
        TestIntersectionObserver.instances = [];
        appEmbed.mockResolvedValue({ finalize: appFinalize });
        coreEmbed.mockResolvedValue({ finalize: coreFinalize });

        const baseUrl = document.createElement("meta");
        baseUrl.name = "base_url";
        baseUrl.content = "/docs";
        document.head.append(baseUrl);
    });

    afterEach(() => {
        document.body.replaceChildren();
        document.head.querySelector("meta[name='base_url']")?.remove();
        document.head.querySelector("#genome-spy-app-embed-styles")?.remove();
        vi.clearAllMocks();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("loads App lazily in embedded mode and finalizes it on disconnect", async () => {
        const element = await mountEmbed("app");

        expect(appEmbed).toHaveBeenCalledWith(
            expect.any(HTMLDivElement),
            { baseUrl: "/docs/examples/", mark: "point" },
            { embedMode: "embedded" }
        );
        expect(element.appStyles).toBe(".genome-spy-app { color: red; }");
        expect(
            document.getElementById("genome-spy-app-embed-styles")
        ).not.toBeNull();

        element.remove();

        expect(appFinalize).toHaveBeenCalledTimes(1);
        expect(coreEmbed).not.toHaveBeenCalled();
    });

    it("uses Core by default", async () => {
        const element = await mountEmbed("core");

        expect(coreEmbed).toHaveBeenCalledWith(expect.any(HTMLDivElement), {
            baseUrl: "/docs/examples/",
            mark: "point",
        });

        element.remove();

        expect(coreFinalize).toHaveBeenCalledTimes(1);
        expect(appEmbed).not.toHaveBeenCalled();
    });

    it("renders an error for an unknown runtime", async () => {
        const element = await mountEmbed("unknown");

        expect(element.embedResult).toBeUndefined();
        expect(element.shadowRoot.textContent).toContain(
            "Unknown GenomeSpy embed runtime: unknown"
        );
    });
});
