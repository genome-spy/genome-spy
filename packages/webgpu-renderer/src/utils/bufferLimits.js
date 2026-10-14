/**
 * Validate a whole storage binding before allocating its CPU/GPU backing data.
 *
 * @param {GPUDevice} device
 * @param {number} bytes
 * @param {string} label
 */
export function validateStorageBufferSize(device, bytes, label) {
    for (const limit of /** @type {const} */ ([
        "maxStorageBufferBindingSize",
        "maxBufferSize",
    ])) {
        if (bytes > device.limits[limit]) {
            throw new Error(
                `${label} requires ${bytes} bytes; ${limit} allows ${device.limits[limit]} bytes.`
            );
        }
    }
}
