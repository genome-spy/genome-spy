/**
 * Recording-only adapter for the canvas pointer and standard tooltip table.
 * Reads the owning embed's DOM without modifying its tooltip or input handling.
 * Custom HTML and images are deliberately not reproduced.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {AbortSignal} signal Owns the passive pointer listeners.
 * @returns {(context: CanvasRenderingContext2D) => void}
 */
export default function recordingOverlay(canvas, signal) {
    /** @type {{x: number, y: number, fromX: number, fromY: number, targetX: number, targetY: number, time: number} | undefined} */
    let pointer;
    const tooltip = canvas
        .closest(".genome-spy")
        ?.querySelector(":scope > .gs-tooltip");
    canvas.addEventListener(
        "pointermove",
        (event) => {
            if (event.pointerType !== "touch") {
                pointer ??= {
                    x: event.clientX,
                    y: event.clientY,
                    fromX: event.clientX,
                    fromY: event.clientY,
                    targetX: event.clientX,
                    targetY: event.clientY,
                    time: performance.now(),
                };
                const now = performance.now();
                updatePointer(now);
                pointer.fromX = pointer.x;
                pointer.fromY = pointer.y;
                pointer.time = now;
                pointer.targetX = event.clientX;
                pointer.targetY = event.clientY;
            }
        },
        { signal, passive: true }
    );
    canvas.addEventListener(
        "pointerleave",
        () => {
            pointer = undefined;
        },
        { signal }
    );

    /** @param {number} now */
    function updatePointer(now) {
        // Retarget a 250 ms cubic ease-out from the current animated position.
        const progress = Math.min((now - pointer.time) / 250, 1);
        const alpha = 1 - (1 - progress) ** 3;
        pointer.x = pointer.fromX + (pointer.targetX - pointer.fromX) * alpha;
        pointer.y = pointer.fromY + (pointer.targetY - pointer.fromY) * alpha;
    }

    return (context) => {
        if (!pointer) return;
        const bounds = canvas.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        const x = pointer.targetX - bounds.left;
        const y = pointer.targetY - bounds.top;
        if (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height) return;

        context.save();
        context.scale(
            canvas.width / bounds.width,
            canvas.height / bounds.height
        );
        if (
            tooltip?.getClientRects().length &&
            tooltip.querySelector("table.attributes")
        ) {
            drawTooltip(context, tooltip, bounds);
        }
        updatePointer(performance.now());
        context.translate(pointer.x - bounds.left, pointer.y - bounds.top);
        context.beginPath();
        context.moveTo(0, 0);
        context.lineTo(0, 17);
        context.lineTo(4, 13);
        context.lineTo(8, 20);
        context.lineTo(11, 18);
        context.lineTo(7, 11);
        context.lineTo(13, 11);
        context.closePath();
        context.fillStyle = "#222";
        context.strokeStyle = "white";
        context.lineWidth = 1.5;
        context.fill();
        context.stroke();
        context.restore();
    };
}

/**
 * Paints only the standard tooltip, using its DOM layout in viewport coordinates.
 * The output canvas clips content outside the plot without moving the tooltip.
 * @param {CanvasRenderingContext2D} context
 * @param {Element} tooltip
 * @param {DOMRect} bounds
 */
function drawTooltip(context, tooltip, bounds) {
    context.save();
    context.translate(-bounds.left, -bounds.top);
    const box = tooltip.getBoundingClientRect();
    const style = getComputedStyle(tooltip);
    // Standard tooltips use one outer shadow. Canvas shadows use device pixels.
    const shadow = style.boxShadow.match(
        /^(.*?) (-?[\d.]+)px (-?[\d.]+)px ([\d.]+)px 0px$/
    );
    if (shadow) {
        const scale = context.getTransform().a;
        context.shadowColor = shadow[1];
        context.shadowOffsetX = Number(shadow[2]) * scale;
        context.shadowOffsetY = Number(shadow[3]) * scale;
        context.shadowBlur = Number(shadow[4]) * scale;
    }
    context.fillStyle = style.backgroundColor;
    context.fillRect(box.left, box.top, box.width, box.height);
    context.shadowColor = "transparent";
    context.beginPath();
    context.rect(box.left, box.top, box.width, box.height);
    context.clip();

    const title = tooltip.querySelector(".title");
    if (title) {
        const rect = title.getBoundingClientRect();
        const style = getComputedStyle(title);
        context.strokeStyle = style.borderBottomColor;
        const border = parseFloat(style.borderBottomWidth);
        context.lineWidth = border;
        context.setLineDash(style.borderBottomStyle === "dashed" ? [3, 3] : []);
        context.beginPath();
        context.moveTo(rect.left, rect.bottom - context.lineWidth / 2);
        context.lineTo(rect.right, rect.bottom - context.lineWidth / 2);
        if (border) context.stroke();
        context.setLineDash([]);
    }

    for (const cell of tooltip.querySelectorAll(
        ".title, table.attributes, table.attributes tr, table.attributes th, table.attributes td"
    )) {
        const rect = cell.getBoundingClientRect();
        const style = getComputedStyle(cell);
        context.fillStyle = style.backgroundColor;
        context.fillRect(rect.left, rect.top, rect.width, rect.height);
        // Collapsed table borders sit on the cell boundaries.
        if (cell.matches("th, td") && parseFloat(style.borderTopWidth)) {
            context.lineWidth = parseFloat(style.borderTopWidth);
            context.strokeStyle = style.borderTopColor;
            context.strokeRect(rect.left, rect.top, rect.width, rect.height);
        }
        if (!cell.matches(".title, th, td")) continue;
        const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            drawText(context, /** @type {Text} */ (walker.currentNode));
        }
    }
    for (const swatch of tooltip.querySelectorAll(
        "table.attributes .color-legend"
    )) {
        const rect = swatch.getBoundingClientRect();
        const style = getComputedStyle(swatch);
        context.fillStyle = style.backgroundColor;
        context.fillRect(rect.left, rect.top, rect.width, rect.height);
        const border = parseFloat(style.borderTopWidth);
        if (border) {
            context.strokeStyle = style.borderTopColor;
            context.lineWidth = border;
            context.strokeRect(
                rect.left + border / 2,
                rect.top + border / 2,
                rect.width - border,
                rect.height - border
            );
        }
    }
    context.restore();
}

/**
 * DOM ranges preserve text placement, including nested formatting and wrapping.
 * @param {CanvasRenderingContext2D} context
 * @param {Text} node
 */
function drawText(context, node) {
    const text = node.data;
    const start = text.search(/[^ \t\r\n\f]/);
    if (start < 0) return;
    const end = text.replace(/[ \t\r\n\f]+$/, "").length;
    const style = getComputedStyle(node.parentElement);
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    context.fillStyle = style.color;
    context.textBaseline = "alphabetic";
    const metrics = context.measureText(node.textContent);
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    /** @param {string} text @param {DOMRect} rect */
    const paint = (text, rect) =>
        context.fillText(
            text.replace(/[ \t\r\n\f]+/g, " ").replace(/^ | $/g, ""),
            rect.left,
            rect.top +
                (rect.height +
                    metrics.fontBoundingBoxAscent -
                    metrics.fontBoundingBoxDescent) /
                    2
        );
    if (range.getClientRects().length === 1) {
        paint(text.slice(start, end), range.getBoundingClientRect());
    } else {
        // Group wrapped text by visual line; the usual single-line case is cheap.
        let text = "";
        let line = new DOMRect();
        for (let i = start; i < end; i++) {
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            const rect = range.getBoundingClientRect();
            if (text && rect.top !== line.top) {
                paint(text, line);
                text = "";
            }
            if (!text) line = rect;
            text += node.data[i];
        }
        if (text) paint(text, line);
    }
}
