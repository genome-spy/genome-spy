export { createRenderer } from "@genome-spy/webgpu-renderer";

export const customIdentityMark = Object.freeze({
    type: "custom",
    createProgram() {
        throw new Error("This fixture only measures package composition.");
    },
});
