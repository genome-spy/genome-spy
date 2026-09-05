import { describe, expect, test } from "vitest";
import { createDomainState, planDomainUpdate } from "./domainLifecycle.js";

/**
 * @typedef {import("./domainLifecycle.js").Domain} Domain
 * @typedef {import("./domainLifecycle.js").DomainPolicy} DomainPolicy
 * @typedef {import("./domainLifecycle.js").DomainSourceUpdate} DomainSourceUpdate
 * @typedef {import("./domainLifecycle.js").DomainUpdate} DomainUpdate
 */

/**
 * @param {Partial<DomainPolicy>} [overrides]
 * @param {Domain} [startup]
 */
function createModel(overrides = {}, startup = [0, 0]) {
    /** @type {DomainPolicy} */
    const policy = {
        zoomable: false,
        scaleKind: "continuous",
        rendered: true,
        animateChanges: true,
        selectionLinked: false,
        ...overrides,
    };
    let state = createDomainState(startup, startup);
    return {
        get state() {
            return state;
        },
        /** @param {DomainUpdate} update */
        send(update) {
            const plan = planDomainUpdate(state, update, policy);
            state = plan.state;
            return plan;
        },
    };
}

/**
 * A complete aggregation snapshot. Tests override the independent values when
 * exercising configured reset domains, pending inputs, or selection authority.
 *
 * @param {Domain | undefined} candidate
 * @param {Partial<DomainSourceUpdate>} [overrides]
 * @returns {DomainSourceUpdate}
 */
function data(candidate, overrides = {}) {
    return {
        type: "data",
        candidate,
        readiness: "ready",
        referenceDomain: candidate,
        resetDomain: candidate ?? [],
        dataExtent: candidate,
        ...overrides,
    };
}

describe("domain lifecycle policy", () => {
    test("shared initial contributions apply without animating, including ready-empty completion", () => {
        const model = createModel();
        const first = model.send(data([0, 2], { readiness: "pending" }));
        expect(first.domainChanged).toBe(true);
        expect(first.transition.type).toBe("none");
        expect(model.state.phase).toBe("collecting");

        model.send(data([0, 8], { readiness: "pending" }));
        // The remaining lookup completes empty: union unchanged, readiness new.
        const complete = model.send(data([0, 8]));
        expect(complete.domainChanged).toBe(false);
        expect(complete.transition.type).toBe("none");
        expect(model.state.phase).toBe("ready");
        expect(model.state.initialReference).toEqual([0, 8]);

        const reload = model.send(data([0, 12]));
        expect(reload.transition.type).toBe("start");
        expect(model.state.visibleDomain).toEqual([0, 8]);
    });

    test.each([[[]], [[0, 0]]])(
        "readiness does not depend on domain contents: %j",
        (domain) => {
            const model = createModel({}, domain);
            model.send(data(domain, { readiness: "pending" }));
            expect(model.state.phase).toBe("collecting");
            const completed = model.send(data(domain));
            expect(model.state.phase).toBe("ready");
            expect(model.state.initialReference).toEqual(domain);
            expect(completed.domainChanged).toBe(false);
        }
    );

    test("early navigation protects the display while the initial reference finishes collecting", () => {
        const model = createModel({ zoomable: true });
        model.send(data([0, 10], { readiness: "pending" }));
        model.send({ type: "navigate", domain: [2, 4], duration: 0 });
        expect(model.state.phase).toBe("interacted");

        const late = model.send(data([0, 30], { readiness: "pending" }));
        expect(late.domainChanged).toBe(false);
        expect(model.state.visibleDomain).toEqual([2, 4]);
        expect(model.state.initialReference).toEqual([0, 30]);
        expect(model.state.phase).toBe("interacted");

        model.send(data([0, 30]));
        model.send(data([0, 50]));
        expect(model.state.phase).toBe("ready");
        expect(model.state.initialReference).toEqual([0, 30]);
        expect(model.state.dataExtent).toEqual([0, 50]);
        expect(model.state.visibleDomain).toEqual([2, 4]);
    });

    test("MSA reset interval, initial reference, and loaded data extent stay independent", () => {
        const model = createModel({ zoomable: true });
        const configured = data([190, 231], {
            resetDomain: [190, 231],
            referenceDomain: [190, 231],
            dataExtent: [0, 400],
        });
        model.send(configured);
        model.send({ type: "navigate", domain: [200, 211], duration: 0 });
        model.send({ ...configured, dataExtent: [0, 500] });
        expect(model.state.visibleDomain).toEqual([200, 211]);
        expect(model.state.dataExtent).toEqual([0, 500]);
        const reset = model.send({ type: "reset" });
        expect(reset.state.visibleDomain).toEqual([190, 231]);
        expect(reset.state.initialReference).toEqual([190, 231]);
        expect(reset.state.dataExtent).toEqual([0, 500]);
    });

    test.each([true, false])(
        "finalized zoomable domains preserve data refresh with animateChanges=%s",
        (animateChanges) => {
            const model = createModel({ zoomable: true, animateChanges });
            model.send(data([0, 10]));
            const refreshed = model.send(data([0, 40]));
            expect(refreshed.domainChanged).toBe(false);
            expect(model.state.visibleDomain).toEqual([0, 10]);
            expect(model.state.dataExtent).toEqual([0, 40]);
        }
    );

    test("member insertion and removal cannot reopen the initial lifecycle", () => {
        const model = createModel({ zoomable: true });
        model.send(data([0, 10]));
        model.send(data([0, 20], { type: "membership", readiness: "pending" }));
        model.send(data([0, 20], { type: "membership" }));
        model.send(data([0, 5], { type: "membership" }));
        expect(model.state.phase).toBe("ready");
        expect(model.state.initialReference).toEqual([0, 10]);
        expect(model.state.visibleDomain).toEqual([0, 10]);
        expect(model.state.dataExtent).toEqual([0, 5]);
    });

    test("viewport coverage gates candidates and ready-empty viewports preserve the display", () => {
        const model = createModel();
        model.send(data([0, 20]));
        const pending = model.send(
            data([0, 3], { type: "viewport", readiness: "pending" })
        );
        expect(pending.domainChanged).toBe(false);
        expect(pending.transition.type).toBe("none");
        const empty = model.send(data(undefined, { type: "viewport" }));
        expect(empty.domainChanged).toBe(false);
        expect(model.state.visibleDomain).toEqual([0, 20]);
        const ready = model.send(data([0, 8], { type: "viewport" }));
        expect(ready.transition.type).toBe("start");
        expect(model.state.visibleDomain).toEqual([0, 20]);
    });

    test("selection authority survives navigation, refresh, and clearing", () => {
        const model = createModel({ zoomable: true, selectionLinked: true });
        expect(model.send(data([20, 40])).syncSelection).toBe(true);
        const navigation = model.send({
            type: "navigate",
            domain: [30, 50],
            duration: 0,
        });
        expect(navigation.syncSelection).toBe(true);
        const refresh = model.send(data([30, 50], { dataExtent: [0, 200] }));
        expect(refresh.domainChanged).toBe(false);
        const clear = model.send(data([0, 200], { type: "selection" }));
        expect(clear.state.visibleDomain).toEqual([0, 200]);
        expect(clear.transition.type).toBe("none");
    });

    test("a linked initial domain seeds selection even when the display already matches", () => {
        const model = createModel(
            { zoomable: true, selectionLinked: true },
            [20, 40]
        );
        const seeded = model.send(data([20, 40]));
        expect(seeded.domainChanged).toBe(false);
        expect(seeded.syncSelection).toBe(true);
    });

    test("one-way selection links do not write back", () => {
        const model = createModel({ selectionLinked: true });
        const linked = model.send(data([2, 8], { type: "selection" }));
        expect(linked.domainChanged).toBe(true);
        expect(linked.syncSelection).toBe(false);
    });

    test("calibrated configuration updates follow effective frames without a second animation", () => {
        const primary = createModel();
        const calibrated = createModel({ animateChanges: false });
        primary.send(data([0, 4]));
        calibrated.send(data([0.1, 56.148]));
        primary.send(data([0, 2], { type: "viewport" }));
        const id = primary.state.transition.id;
        for (const upper of [3.5, 3, 2.5, 2]) {
            const frame = primary.send({
                type: "frame",
                id,
                domain: [0, upper],
            });
            expect(frame.domainChanged).toBe(true);
            const result = calibrated.send(
                data([0.1, upper * 14.012 + 0.1], { type: "configuration" })
            );
            expect(result.transition.type).toBe("none");
            expect(result.state.visibleDomain[1]).toBeCloseTo(
                upper * 14.012 + 0.1
            );
        }
        const finished = primary.send({ type: "finish", id });
        expect(finished.domainChanged).toBe(false);
        expect(primary.state.transition).toBeUndefined();
    });

    test("same-target refreshes do not restart transitions and replacement rejects old callbacks", () => {
        const model = createModel();
        model.send(data([0, 10]));
        model.send(data([0, 20]));
        const first = model.state.transition.id;
        model.send({ type: "frame", id: first, domain: [0, 12] });
        expect(model.send(data([0, 20])).transition.type).toBe("none");
        expect(model.state.transition.id).toBe(first);

        const replaced = model.send(data([0, 30]));
        expect(replaced.transition).toMatchObject({
            type: "start",
            from: [0, 12],
            to: [0, 30],
        });
        const second = model.state.transition.id;
        expect(second).not.toBe(first);
        expect(
            model.send({ type: "frame", id: first, domain: [0, 18] })
                .domainChanged
        ).toBe(false);
        model.send({ type: "finish", id: first });
        expect(model.state.visibleDomain).toEqual([0, 12]);
        model.send({ type: "finish", id: second });
        expect(model.state.visibleDomain).toEqual([0, 30]);
    });

    test("navigation cancels an automatic transition and old completion cannot overwrite it", () => {
        const model = createModel();
        model.send(data([0, 10]));
        model.send(data([0, 20]));
        const id = model.state.transition.id;
        const navigation = model.send({
            type: "navigate",
            domain: [4, 6],
            duration: 0,
        });
        expect(navigation.transition.type).toBe("cancel");
        model.send({ type: "finish", id });
        expect(model.state.visibleDomain).toEqual([4, 6]);
    });

    test.each(
        /** @type {Partial<DomainPolicy>[]} */ ([
            { scaleKind: "index" },
            { scaleKind: "discrete" },
            { rendered: false },
            { animateChanges: false },
        ])
    )("automatic changes apply immediately under %j", (policy) => {
        const model = createModel(policy);
        model.send(data([0, 10]));
        const change = model.send(data([0, 20]));
        expect(change.state.visibleDomain).toEqual([0, 20]);
        expect(change.transition.type).toBe("none");
    });

    test("discrete domains update without numeric interval assumptions", () => {
        const model = createModel({ scaleKind: "discrete" }, []);
        model.send(data(["A", "C", "G", "T"]));
        const update = model.send(data(["A", "C"]));
        expect(update.state.visibleDomain).toEqual(["A", "C"]);
        expect(update.domainChanged).toBe(true);
    });

    test("index domains allow explicit animated navigation without automatic lane animation", () => {
        const model = createModel({ scaleKind: "index", zoomable: true });
        model.send(data([0, 400]));
        const navigation = model.send({
            type: "navigate",
            domain: [190, 231],
            duration: 700,
        });
        expect(navigation.transition).toMatchObject({
            type: "start",
            duration: 700,
        });
        expect(model.state.visibleDomain).toEqual([0, 400]);
    });

    test("an authoritative selection cancels an animation even when its target matches", () => {
        const model = createModel({ zoomable: true, selectionLinked: true });
        model.send(data([0, 100]));
        model.send({ type: "navigate", domain: [20, 40], duration: 700 });
        const id = model.state.transition.id;
        const brush = model.send(data([20, 40], { type: "selection" }));
        expect(brush.transition.type).toBe("cancel");
        expect(model.state.visibleDomain).toEqual([20, 40]);
        model.send({ type: "frame", id, domain: [10, 70] });
        expect(model.state.visibleDomain).toEqual([20, 40]);
    });

    test("selection echoes of committed animation frames do not cancel the linked zoom", () => {
        const model = createModel({ zoomable: true, selectionLinked: true });
        model.send(data([0, 100]));
        model.send({ type: "navigate", domain: [20, 40], duration: 700 });
        const id = model.state.transition.id;
        const frame = model.send({ type: "frame", id, domain: [10, 70] });
        expect(frame.syncSelection).toBe(true);
        const echo = model.send(data([10, 70], { type: "selection-sync" }));
        expect(echo.transition.type).toBe("none");
        expect(model.state.transition.id).toBe(id);
        model.send({ type: "finish", id });
        expect(model.state.visibleDomain).toEqual([20, 40]);
    });

    test.each(
        /** @type {DomainSourceUpdate["type"][]} */ (["data", "membership"])
    )(
        "passive %s refresh does not interrupt linked bookmark navigation",
        (type) => {
            const model = createModel({
                zoomable: true,
                selectionLinked: true,
            });
            model.send(data([0, 100]));
            model.send({ type: "navigate", domain: [20, 40], duration: 700 });
            const id = model.state.transition.id;
            model.send({ type: "frame", id, domain: [10, 70] });
            const refresh = model.send(
                data([10, 70], { type, dataExtent: [0, 200] })
            );
            expect(refresh.transition.type).toBe("none");
            expect(model.state.transition.id).toBe(id);
            expect(model.state.dataExtent).toEqual([0, 200]);
            model.send({ type: "finish", id });
            expect(model.state.visibleDomain).toEqual([20, 40]);
        }
    );

    test.each(
        /** @type {DomainSourceUpdate["type"][]} */ ([
            "selection",
            "configuration",
        ])
    )(
        "%s can cancel navigation to the current displayed fallback before the first frame",
        (type) => {
            const model = createModel({
                zoomable: true,
                selectionLinked: true,
            });
            model.send(data([0, 100]));
            model.send({ type: "navigate", domain: [20, 40], duration: 700 });
            const id = model.state.transition.id;
            const clear = model.send(data([0, 100], { type }));
            expect(clear.domainChanged).toBe(false);
            expect(clear.transition.type).toBe("cancel");
            expect(model.state.transition).toBeUndefined();
            model.send({ type: "finish", id });
            expect(model.state.visibleDomain).toEqual([0, 100]);
        }
    );

    test("explicit configuration can replace a zoomable domain without data gaining authority", () => {
        const model = createModel({ zoomable: true, animateChanges: false });
        model.send(data([0, 10]));
        model.send({ type: "navigate", domain: [2, 4], duration: 0 });
        const updated = model.send(data([0, 20], { type: "configuration" }));
        expect(updated.state.visibleDomain).toEqual([0, 20]);
        model.send(data([0, 30]));
        expect(model.state.visibleDomain).toEqual([0, 20]);
    });

    test("planning does not mutate input state or domain snapshots", () => {
        const initial = Object.freeze(
            createDomainState(Object.freeze([0, 0]), Object.freeze([0, 10]))
        );
        const update = Object.freeze(data(Object.freeze([0, 10])));
        /** @type {DomainPolicy} */
        const policy = {
            zoomable: false,
            scaleKind: "continuous",
            rendered: true,
            animateChanges: true,
            selectionLinked: false,
        };
        const plan = planDomainUpdate(initial, update, policy);
        expect(initial.visibleDomain).toEqual([0, 0]);
        expect(initial.phase).toBe("collecting");
        expect(plan.state.visibleDomain).toEqual([0, 10]);
        expect(plan.state.phase).toBe("ready");
    });
});
