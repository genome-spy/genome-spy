import { describe, expect, it } from "vitest";
import UrlDescriptorState from "./urlDescriptorState.js";

describe("UrlDescriptorState", () => {
    it("reuses cached handles for reordered descriptors", async () => {
        const state = new UrlDescriptorState();
        /** @type {string[]} */
        const created = [];

        await state.update(
            [
                { url: "a.bw", fields: { sample: "A" } },
                { url: "b.bw", fields: { sample: "B" } },
            ],
            async (descriptor) => {
                created.push(descriptor.url);
                return { url: descriptor.url };
            }
        );
        state.markLoaded();

        await state.update(
            [
                { url: "b.bw", fields: { sample: "B" } },
                { url: "a.bw", fields: { sample: "A" } },
            ],
            async (descriptor) => {
                created.push(descriptor.url);
                return { url: descriptor.url };
            }
        );

        expect(created).toEqual(["a.bw", "b.bw"]);
        expect(state.handles).toEqual([{ url: "b.bw" }, { url: "a.bw" }]);
        expect(state.activeSetLoaded).toBe(true);
    });

    it("reports restored descriptors as unloaded after a narrower set was marked loaded", async () => {
        const state = new UrlDescriptorState();

        await state.update(
            [
                { url: "a.bw", fields: { sample: "A" } },
                { url: "b.bw", fields: { sample: "B" } },
            ],
            async (descriptor) => ({ url: descriptor.url })
        );
        state.markLoaded();

        await state.update(
            [{ url: "a.bw", fields: { sample: "A" } }],
            async (descriptor) => ({ url: descriptor.url })
        );
        state.markLoaded();

        await state.update(
            [
                { url: "a.bw", fields: { sample: "A" } },
                { url: "b.bw", fields: { sample: "B" } },
            ],
            async (descriptor) => ({ url: descriptor.url })
        );

        expect(state.activeSetLoaded).toBe(false);
    });
});
