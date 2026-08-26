export const RENDERER_GPU_OWNER = "webgpu-renderer";

/**
 * Build a stable WebGPU object label from its logical owner and resource role.
 *
 * @param {string} owner
 * @param {string} role
 * @returns {string}
 */
export function gpuLabel(owner, role) {
    return owner + ": " + role;
}
