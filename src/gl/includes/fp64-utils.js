// Adapted from luma.gl - https://github.com/uber/luma.gl

// Copyright (c) 2015 - 2017 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

/**
 * Calculate WebGL 64 bit float
 * 
 * @param {number} a the input float number
 * @param {number[]} [out] the output array. If not supplied, a new array is created.
 * @param {number} [startIndex] the index in the output array to fill from. Default 0.
 * @returns {number[]} the fp64 representation of the input number
 */
export function fp64ify(a, out = [], startIndex = 0) {
    const hiPart = Math.fround(a);
    const loPart = a - hiPart;
    out[startIndex] = hiPart;
    out[startIndex + 1] = loPart;
    return out;
}

/**
 * Calculate the low part of a WebGL 64 bit float
 * 
 * @param {number} a the input float number
 * @returns {number} the lower 32 bit of the number
 */
export function fp64LowPart(a) {
    return a - Math.fround(a);
}


export function getPlatformShaderDefines(gl) {
    const debugInfo = getContextInfo(gl);

    switch (debugInfo.gpuVendor.toLowerCase()) {
        case 'nvidia':
            return `\
  #define NVIDIA_GPU
  // Nvidia optimizes away the calculation necessary for emulated fp64
  #define LUMA_FP64_CODE_ELIMINATION_WORKAROUND 1
  `;

        case 'intel':
            return `\
  #define INTEL_GPU
  // Intel optimizes away the calculation necessary for emulated fp64
  #define LUMA_FP64_CODE_ELIMINATION_WORKAROUND 1
  // Intel's built-in 'tan' function doesn't have acceptable precision
  #define LUMA_FP32_TAN_PRECISION_WORKAROUND 1
  // Intel GPU doesn't have full 32 bits precision in same cases, causes overflow
  #define LUMA_FP64_HIGH_BITS_OVERFLOW_WORKAROUND 1
  `;

        case 'amd':
            // AMD Does not eliminate fp64 code
            return `\
  #define AMD_GPU
  `;

        default:
            // We don't know what GPU it is, could be that the GPU driver or
            // browser is not implementing UNMASKED_RENDERER constant and not
            // reporting a correct name
            return `\
  #define DEFAULT_GPU
  // Prevent driver from optimizing away the calculation necessary for emulated fp64
  #define LUMA_FP64_CODE_ELIMINATION_WORKAROUND 1
  // Intel's built-in 'tan' function doesn't have acceptable precision
  #define LUMA_FP32_TAN_PRECISION_WORKAROUND 1
  // Intel GPU doesn't have full 32 bits precision in same cases, causes overflow
  #define LUMA_FP64_HIGH_BITS_OVERFLOW_WORKAROUND 1
  `;
    }
}


const GL_VENDOR = 0x1f00;
const GL_RENDERER = 0x1f01;
const GL_VERSION = 0x1f02;
const GL_SHADING_LANGUAGE_VERSION = 0x8b8c;

export function getContextInfo(gl) {
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const vendor = gl.getParameter((info && info.UNMASKED_VENDOR_WEBGL) || GL_VENDOR);
    const renderer = gl.getParameter((info && info.UNMASKED_RENDERER_WEBGL) || GL_RENDERER);
    const gpuVendor = identifyGPUVendor(vendor, renderer);
    const gpuInfo = {
        gpuVendor,
        vendor,
        renderer,
        version: gl.getParameter(GL_VERSION),
        shadingLanguageVersion: gl.getParameter(GL_SHADING_LANGUAGE_VERSION)
    };
    return gpuInfo;
}

function identifyGPUVendor(vendor, renderer) {
    if (vendor.match(/NVIDIA/i) || renderer.match(/NVIDIA/i)) {
        return 'NVIDIA';
    }
    if (vendor.match(/INTEL/i) || renderer.match(/INTEL/i)) {
        return 'INTEL';
    }
    if (
        vendor.match(/AMD/i) ||
        renderer.match(/AMD/i) ||
        vendor.match(/ATI/i) ||
        renderer.match(/ATI/i)
    ) {
        return 'AMD';
    }
    return 'UNKNOWN GPU';
}