import { expect, test } from "vitest";
/*!
 * Adapted from vega-encode:
 * https://github.com/vega/vega/blob/master/packages/vega-encode/test/scale-test.js
 *
 * Copyright (c) 2015-2018, University of Washington Interactive Data Lab
 * All rights reserved.
 *
 * BSD-3-Clause License: https://github.com/vega/vega-lite/blob/master/LICENSE
 */

/* eslint-disable */

import { validTicks } from "./ticks.js";

test("validTicks uses count correctly", function () {
    var data = [0, 1, 2, 3, 4, 5, 6, 7];

    var identity = function (x) {
        return x;
    };
    identity.range = function () {
        return [0, 10];
    };

    var t1 = validTicks(identity, data, 5);
    expect(t1).toEqual([0, 2, 4, 6]);

    // don't change ticks if count is large
    var t2 = validTicks(identity, data, 100);
    expect(t2).toEqual(data);

    // special case for low number of ticks
    var t3 = validTicks(identity, data, 3);
    expect(t3).toEqual([0, 7]);

    // single tick should pass through
    var t5 = validTicks(identity, [1], 5);
    expect(t5).toEqual([1]);
});
