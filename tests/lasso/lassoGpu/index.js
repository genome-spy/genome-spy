import runLassoScene from "../../../packages/webgpu-renderer/examples/lassoScene.js";
const status = document.getElementById("status");
const count = Number(
    new URLSearchParams(window.location.search).get("points") ?? 1000000
);
void runLassoScene(document.querySelector("canvas"), {
    count,
    onStatus: (value) => {
        status.textContent = value;
    },
})
    .then((cleanup) => {
        window.addEventListener("pagehide", cleanup, { once: true });
    })
    .catch((error) => {
        status.textContent =
            error instanceof Error ? error.message : String(error);
    });
