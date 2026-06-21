import { expect, test, vi } from "vitest";

import Suspension from "./suspension.js";

test("Suspension resumes only after the outermost release", () => {
    const onResume = vi.fn();
    const suspension = new Suspension(onResume);

    const releaseA = suspension.suspend();
    const releaseB = suspension.suspend();

    expect(suspension.active).toBe(true);

    releaseA();

    expect(suspension.active).toBe(true);
    expect(onResume).not.toHaveBeenCalled();

    releaseB();

    expect(suspension.active).toBe(false);
    expect(onResume).toHaveBeenCalledTimes(1);
});

test("Suspension release is idempotent", () => {
    const onResume = vi.fn();
    const suspension = new Suspension(onResume);
    const release = suspension.suspend();

    release();
    release();

    expect(suspension.active).toBe(false);
    expect(onResume).toHaveBeenCalledTimes(1);
});
