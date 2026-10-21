// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render } from "lit";
import { renderScene } from "./sceneRunner.js";

/** @type {HTMLDivElement} */
let host;

beforeEach(() => {
    // The runner owns GPU setup; these tests exercise its DOM lifecycle with fake scenes.
    vi.stubGlobal("navigator", { gpu: {} });
    host = document.createElement("div");
    document.body.append(host);
});

afterEach(() => {
    host.remove();
    vi.unstubAllGlobals();
});

test("control changes update the scene without replacing its canvas", async () => {
    const cleanup = vi.fn();
    const update = vi.fn();
    const runScene = vi.fn(async () => ({ cleanup, update }));
    render(renderScene(runScene, { size: 32 }), host);
    await Promise.resolve();
    const canvas = host.querySelector("canvas");

    for (let size = 33; size <= 52; size++) {
        render(renderScene(runScene, { size }), host);
    }

    expect(host.querySelector("canvas")).toBe(canvas);
    expect(runScene).toHaveBeenCalledExactlyOnceWith(canvas, { size: 32 });
    expect(update).toHaveBeenCalledTimes(20);
    expect(update).toHaveBeenLastCalledWith({ size: 52 });
    expect(cleanup).not.toHaveBeenCalled();

    host.remove();
    expect(cleanup).toHaveBeenCalledOnce();
});

test("scenes without an update callback restart on the same canvas", async () => {
    const cleanup = vi.fn();
    const runScene = vi.fn(async () => cleanup);
    render(renderScene(runScene, { backend: "wgsl" }), host);
    await Promise.resolve();
    const canvas = host.querySelector("canvas");

    render(renderScene(runScene, { backend: "msdfgen" }), host);
    await Promise.resolve();

    expect(host.querySelector("canvas")).toBe(canvas);
    expect(runScene).toHaveBeenCalledTimes(2);
    expect(runScene).toHaveBeenLastCalledWith(canvas, { backend: "msdfgen" });
    expect(cleanup).toHaveBeenCalledOnce();

    host.remove();
    expect(cleanup).toHaveBeenCalledTimes(2);
});

test("changes during initialization apply the latest args without parallel setup", async () => {
    const pending = Promise.withResolvers();
    const cleanup = vi.fn();
    const update = vi.fn();
    const runScene = vi.fn(() => pending.promise);
    render(renderScene(runScene, { size: 32 }), host);
    render(renderScene(runScene, { size: 48 }), host);
    render(renderScene(runScene, { size: 64 }), host);

    pending.resolve({ cleanup, update });
    await Promise.resolve();

    expect(runScene).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledExactlyOnceWith({ size: 64 });
    expect(cleanup).not.toHaveBeenCalled();
});

test("a scene that finishes initialization after removal is cleaned up", async () => {
    const pending = Promise.withResolvers();
    const cleanup = vi.fn();
    const update = vi.fn();
    render(
        renderScene(() => pending.promise),
        host
    );
    host.remove();

    pending.resolve({ cleanup, update });
    await Promise.resolve();

    expect(cleanup).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
});

test("a replacement runner waits for pending setup to be cleaned up", async () => {
    const pending = Promise.withResolvers();
    const order = [];
    const cleanup = vi.fn();
    const initialRunner = vi.fn(() => pending.promise);
    const nextRunner = vi.fn(async () => {
        order.push("start replacement");
        return cleanup;
    });
    render(renderScene(initialRunner, { size: 32 }), host);
    const canvas = host.querySelector("canvas");

    render(renderScene(nextRunner, { size: 64 }), host);
    expect(nextRunner).not.toHaveBeenCalled();

    pending.resolve(() => order.push("clean up initial"));
    await vi.waitFor(() => expect(nextRunner).toHaveBeenCalledOnce());

    expect(order).toEqual(["clean up initial", "start replacement"]);
    expect(nextRunner).toHaveBeenCalledWith(canvas, { size: 64 });

    host.remove();
    expect(cleanup).toHaveBeenCalledOnce();
});
