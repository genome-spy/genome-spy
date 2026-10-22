// @vitest-environment jsdom

import { expect, onTestFinished, test } from "vitest";
import { createHeadlessEngine } from "../genomeSpy/headlessBootstrap.js";
import InteractionDispatcher from "../genomeSpy/interactionDispatcher.js";
import Point from "../view/layout/point.js";
import { renderToLayout } from "../view/testUtils.js";

test.each([false, true])(
    "shared rulers retain the new cursor across direct plot handoffs, inherited=%s",
    async (inherited) => {
        /** @type {import("../spec/parameter.js").RulerParameter} */
        const ruler = {
            name: "cursor",
            ruler: { encodings: ["y"], snap: false },
        };
        const { view } = await createHeadlessEngine({
            params: inherited ? [ruler] : [{ name: "cursor" }],
            data: { values: [{ y: 0 }, { y: 100 }] },
            encoding: {
                y: {
                    field: "y",
                    type: "quantitative",
                    scale: { domain: [0, 100] },
                    axis: null,
                },
            },
            resolve: { scale: { y: "shared" } },
            spacing: 20,
            hconcat: ["first", "second"].map((name) => ({
                name,
                width: 100,
                height: 100,
                ...(inherited
                    ? {}
                    : {
                          params: [
                              {
                                  ...ruler,
                                  push: /** @type {const} */ ("outer"),
                              },
                          ],
                      }),
                // Parallel layers exercise multiple controllers for each declaration.
                layer: [{ mark: "point" }, { mark: "rule" }],
            })),
        });
        onTestFinished(() => view.disposeSubtree());
        renderToLayout(view);

        const plots = ["first", "second"].map((name) =>
            view.getDescendants().find((child) => child.name === name)
        );
        const dispatcher = new InteractionDispatcher({ viewRoot: view });
        /** @param {number} index @param {number} fraction */
        const move = (index, fraction) => {
            const { x, y, width, height } = plots[index].coords;
            dispatcher.dispatch(
                new Point(x + width / 2, y + height * fraction),
                new MouseEvent("mousemove")
            );
        };
        const coordinate = () => view.paramRuntime.findValue("cursor").values.y;

        move(0, 0.25);
        expect(coordinate()).toBeCloseTo(75);
        // No intermediate gap event: the old plot leaves after the new plot writes.
        move(1, 0.75);
        expect(coordinate()).toBeCloseTo(25);
        move(0, 0.4);
        expect(coordinate()).toBeCloseTo(60);

        if (!inherited) {
            const [first, second] = plots.map((plot) => plot.coords);
            dispatcher.dispatch(
                new Point(
                    (first.x2 + second.x) / 2,
                    first.y + first.height / 2
                ),
                new MouseEvent("mousemove")
            );
            expect(coordinate()).toBeNull();
            move(1, 0.25);
            expect(coordinate()).toBeCloseTo(75);
        }

        dispatcher.handlePointerLeave(new MouseEvent("mouseout"));
        expect(coordinate()).toBeNull();
    }
);
