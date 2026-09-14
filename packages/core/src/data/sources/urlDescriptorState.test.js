import { describe, expect, it, vi } from "vitest";
import UrlDescriptorState, {
    updateUrlDescriptorState,
} from "./urlDescriptorState.js";

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

    it("does not activate descriptors whose handle creation was skipped", async () => {
        const state = new UrlDescriptorState();

        await state.update(
            [{ url: "a.bw" }, { url: "missing.bw" }],
            async (descriptor) =>
                descriptor.url == "missing.bw"
                    ? undefined
                    : { url: descriptor.url }
        );
        state.markLoaded();

        expect(state.handles).toEqual([{ url: "a.bw" }]);
        expect(state.activeSetLoaded).toBe(true);
    });

    it("commits only the latest overlapping update", async () => {
        const state = new UrlDescriptorState();
        const a = deferred();
        const b = deferred();
        const create = (/** @type {{ url: string }} */ descriptor) =>
            descriptor.url == "a.bw" ? a.promise : b.promise;

        const revisionA = state.beginUpdate();
        const updateA = state.update([{ url: "a.bw" }], create, revisionA);
        const revisionB = state.beginUpdate();
        const updateB = state.update([{ url: "b.bw" }], create, revisionB);

        expect(state.activeSetLoaded).toBe(false);
        b.resolve({ url: "b.bw" });
        await updateB;
        a.resolve({ url: "a.bw" });
        await updateA;

        expect(state.activeRevision).toBe(revisionB);
        expect(state.handles).toEqual([{ url: "b.bw" }]);
    });

    it("shares pending handle creation and retries failures", async () => {
        const state = new UrlDescriptorState();
        const pending = deferred();
        const create = vi.fn(() => pending.promise);

        const first = state.update([{ url: "a.bw" }], create);
        const second = state.update([{ url: "a.bw" }], create);
        pending.resolve({ url: "a.bw" });
        await Promise.all([first, second]);

        expect(create).toHaveBeenCalledOnce();
        expect(state.handles).toEqual([{ url: "a.bw" }]);

        const failing = vi
            .fn()
            .mockRejectedValueOnce(new Error("boom"))
            .mockResolvedValueOnce({ url: "b.bw" });
        await expect(state.update([{ url: "b.bw" }], failing)).rejects.toThrow(
            "boom"
        );
        await state.update([{ url: "b.bw" }], failing);
        expect(failing).toHaveBeenCalledTimes(2);
    });

    it("invalidates pending updates on disposal", async () => {
        const state = new UrlDescriptorState();
        const pending = deferred();
        const update = state.update([{ url: "a.bw" }], () => pending.promise);

        state.dispose();
        pending.resolve({ url: "a.bw" });
        await update;

        expect(state.activeRevision).toBeUndefined();
        expect(state.handles).toEqual([]);
    });

    it("ignores stale initialization errors and status", async () => {
        const state = new UrlDescriptorState();
        /** @type {(error: Error) => void} */
        let rejectA = () => undefined;
        /** @type {Promise<import("./urlDescriptor.js").UrlDescriptor[]>} */
        const normalizeA = new Promise((_, reject) => {
            rejectA = reject;
        });
        /** @type {import("../../types/viewContext.js").DataLoadingStatus[]} */
        const statuses = [];
        const clearData = vi.fn();
        const options = {
            state,
            clearData,
            setLoadingStatus: (
                /** @type {import("../../types/viewContext.js").DataLoadingStatus} */ status
            ) => statuses.push(status),
            loadModules: /** @returns {Promise<undefined>} */ async () =>
                undefined,
            createHandle: async (/** @type {{ url: string }} */ descriptor) =>
                descriptor,
        };

        const revisionA = state.beginUpdate();
        const updateA = updateUrlDescriptorState({
            ...options,
            normalize: () => normalizeA,
            revision: revisionA,
        });
        const revisionB = state.beginUpdate();
        await updateUrlDescriptorState({
            ...options,
            normalize: async () => [{ url: "b.bw" }],
            revision: revisionB,
        });
        rejectA(new Error("stale"));
        await updateA;

        expect(clearData).not.toHaveBeenCalled();
        expect(statuses).toEqual(["loading", "loading", "complete"]);
        expect(state.handles).toEqual([{ url: "b.bw" }]);
    });
});

function deferred() {
    /** @type {(value: { url: string }) => void} */
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    return { promise, resolve };
}
