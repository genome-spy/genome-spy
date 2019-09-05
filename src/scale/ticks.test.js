/*
 * Adapted from vega-encode:
 * https://github.com/vega/vega/blob/master/packages/vega-encode/test/scale-test.js
 * 
 * Copyright (c) 2015-2018, University of Washington Interactive Data Lab
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer.
 * 
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 
 * 3. Neither the name of the copyright holder nor the names of its contributors
 *   may be used to endorse or promote products derived from this software
 *   without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 * 
 */

/* eslint-disable */

import { validTicks } from './ticks';
import { timeInterval } from 'vega-scale';

test('validTicks uses count correctly', function () {
    var data = [0, 1, 2, 3, 4, 5, 6, 7];

    var identity = function (x) { return x; };
    identity.range = function () { return [0, 10]; };

    var t1 = validTicks(identity, data, 5);
    expect(t1).toEqual([0, 2, 4, 6]);

    // don't change ticks if count is large
    var t2 = validTicks(identity, data, 100);
    expect(t2).toEqual(data);

    // special case for low number of ticks
    var t3 = validTicks(identity, data, 3);
    expect(t3).toEqual([0, 7]);

    // validTicks ignores interval function
    var t4 = validTicks(identity, data, timeInterval('hour'));
    expect(t4).toEqual(data);

    // single tick should pass through
    var t5 = validTicks(identity, [1], 5);
    expect(t5).toEqual([1]);
});
