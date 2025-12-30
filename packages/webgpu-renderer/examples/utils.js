export function setupResize(canvas, renderer, onResize) {
    const resize = () => {
        const dpr = window.devicePixelRatio ?? 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));

        renderer.updateGlobals({
            width: canvas.width,
            height: canvas.height,
            dpr,
        });

        if (onResize) {
            onResize({ width: canvas.width, height: canvas.height, dpr });
        }

        renderer.render();
    };

    resize();
    window.addEventListener("resize", resize);

    return () => {
        window.removeEventListener("resize", resize);
    };
}
