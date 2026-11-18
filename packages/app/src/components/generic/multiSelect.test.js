// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MultiSelect from "./multiSelect.js";

beforeEach(() => {
    vi.useFakeTimers();
    HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
});

/**
 * @param {(query: string) => Promise<string[]>} search
 * @param {boolean} [allowUnknown]
 */
async function setup(search, allowUnknown = false) {
    const field = new MultiSelect();
    field.search = search;
    field.allowUnknown = allowUnknown;
    document.body.append(field);
    await field.updateComplete;

    const input = field.renderRoot.querySelector("input");
    input.focus();

    return {
        field,
        input,
        /** @param {string} query */
        type(query) {
            input.value = query;
            input.dispatchEvent(new Event("input"));
        },
        enter() {
            input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        },
        options() {
            return Array.from(
                field.renderRoot.querySelectorAll('[role="option"]'),
                (option) => option.textContent.trim()
            );
        },
        searchNow: () => vi.advanceTimersByTimeAsync(field.debounceMs),
    };
}

it.each([true, false])(
    "uses only the current query on fast Enter (allowUnknown: %s)",
    async (allowUnknown) => {
        const { field, input, type, enter, options, searchNow } = await setup(
            async (query) =>
                ["alpha", "beta"].filter((id) => id.startsWith(query)),
            allowUnknown
        );
        type("al");
        await searchNow();
        expect(options()).toEqual(["alpha"]);

        type("be");
        enter();
        await field.updateComplete;

        expect(field.value).toEqual(allowUnknown ? ["be"] : []);
        expect(input.hasAttribute("aria-activedescendant")).toBe(false);

        if (!allowUnknown) {
            expect(input.value).toBe("be");
            await searchNow();
            enter();
            expect(field.value).toEqual(["beta"]);
        }
    }
);

it("ignores a pending result when the query changes and then returns to the same text", async () => {
    const oldSearch = Promise.withResolvers();
    const search = vi
        .fn()
        .mockReturnValueOnce(oldSearch.promise)
        .mockResolvedValue(["alpha"]);
    const { type, options, searchNow } = await setup(search);
    type("al");
    await searchNow();
    expect(search).toHaveBeenCalledWith("al");

    type("be");
    type("al");
    // The old request finishes before the latest debounce timer fires.
    oldSearch.resolve(["alphabet"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(options()).toEqual([]);

    await searchNow();
    expect(options()).toEqual(["alpha"]);
});

it("keeps a new edit when a blur lookup finishes after refocusing", async () => {
    const blurLookup = Promise.withResolvers();
    const { field, input, type } = await setup(() => blurLookup.promise);
    type("alpha");
    input.blur();
    input.focus();
    type("be");

    blurLookup.resolve(["alpha"]);
    await vi.advanceTimersByTimeAsync(0);

    expect(field.value).toEqual([]);
    expect(input.value).toBe("be");
});
