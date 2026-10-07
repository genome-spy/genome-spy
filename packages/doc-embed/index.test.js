// @vitest-environment jsdom
/* global console, document, HTMLDivElement */

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
import CoreGenomeSpy from "@genome-spy/core/genomeSpy.js";
import { createEmbed } from "@genome-spy/core/embedFactory.js";
import { embed as embedApp } from "../app/src/index.js";

// jsdom cannot parse scoped CSS; these assertions cover the rendered error content.
vi.mock("@genome-spy/core/styles/genome-spy.css.js", () => ({ default: "" }));

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
 * @param {boolean} [specHidden]
 */
async function mountEmbed(runtime, specHidden = false) {
    const element = document.createElement("genome-spy-doc-embed");
    element.runtime = runtime;
    element.specHidden = specHidden;
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
        vi.resetAllMocks();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it("loads App lazily in embedded mode and finalizes it on disconnect", async () => {
        appEmbed.mockImplementation((container) => {
            expect(
                container.getRootNode().querySelector("style")?.textContent
            ).toContain(".genome-spy-app { color: red; }");
            return Promise.resolve({ finalize: appFinalize });
        });

        const element = await mountEmbed("app");

        expect(appEmbed).toHaveBeenCalledWith(
            expect.any(HTMLDivElement),
            { baseUrl: "/docs/example-specs/", mark: "point" },
            { embedMode: "embedded", onError: expect.any(Function) }
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

        expect(coreEmbed).toHaveBeenCalledWith(
            expect.any(HTMLDivElement),
            { baseUrl: "/docs/example-specs/", mark: "point" },
            { onError: expect.any(Function) }
        );

        element.remove();

        expect(coreFinalize).toHaveBeenCalledTimes(1);
        expect(appEmbed).not.toHaveBeenCalled();
    });

    it("toggles a hidden specification", async () => {
        const element = await mountEmbed("core", true);

        const getToggle = () =>
            /** @type {HTMLAnchorElement} */ (
                element.shadowRoot.querySelector(".embed-links a")
            );
        const getSpec = () =>
            /** @type {HTMLElement} */ (
                element.shadowRoot.querySelector(".embed-spec")
            );

        expect(getToggle().textContent).toBe("Show JSON specification");
        expect(getSpec().style.display).toBe("none");

        getToggle().click();
        await element.updateComplete;

        expect(getToggle().textContent).toBe("Hide JSON specification");
        expect(getSpec().style.display).toBe("block");

        getToggle().click();
        await element.updateComplete;

        expect(getToggle().textContent).toBe("Show JSON specification");
        expect(getSpec().style.display).toBe("none");
    });

    it("links to a curated Python example beside the existing controls", async () => {
        const element = await mountEmbed("core", true);
        element.playgroundUrl = "/playground/?spec=example.json";
        element.pythonUrl =
            "https://genomespy.app/genome-spy-python/gallery/ascat_fitting.html";
        await element.updateComplete;

        const links = Array.from(
            element.shadowRoot.querySelectorAll(".embed-links a")
        );

        expect(
            links.map((link) => link.textContent.trim().replace(/\s+/g, " "))
        ).toEqual([
            "Show JSON specification",
            "Edit this example in Playground",
            "View Python example",
        ]);
        expect(links[2].getAttribute("href")).toBe(element.pythonUrl);
    });

    it("renders an error for an unknown runtime", async () => {
        const element = await mountEmbed("unknown");

        expect(element.embedResult).toBeUndefined();
        expect(
            element.shadowRoot.querySelector(".embed-container pre").textContent
        ).toContain("Unknown GenomeSpy embed runtime: unknown");
    });

    it.each(["core", "app"])(
        "shows a failed %s embed error only once",
        async (runtime) => {
            const error = new Error("Invalid visualization");
            vi.spyOn(console, "error").mockImplementation(() => {});
            vi.spyOn(CoreGenomeSpy.prototype, "launch").mockImplementation(
                async function () {
                    // Use the real embed failure handler and cleanup without starting a renderer.
                    this.options.onError(error, this.container);
                    return false;
                }
            );
            coreEmbed.mockImplementation(createEmbed(CoreGenomeSpy));
            appEmbed.mockImplementation(embedApp);

            const element = await mountEmbed(runtime);
            const container =
                element.shadowRoot.querySelector(".embed-container");

            expect(element.embedResult).toBeUndefined();
            expect(container.querySelectorAll(".message-box")).toHaveLength(1);
            expect(container.querySelector(".message-box").textContent).toBe(
                String(error)
            );
            expect(container.querySelector("pre")).toBeNull();
        }
    );
});
