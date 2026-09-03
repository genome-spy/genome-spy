export default /* css */ `
    :host {
        position: absolute;
        top: 8px;
        right: 8px;
        z-index: 1;
        max-width: calc(100% - 16px);
        color: var(--gs-controls-color, #333);
        font: 12px system-ui, sans-serif;
        pointer-events: none;
    }
    :host([data-placement="top"]) {
        top: auto;
        bottom: 100%;
    }
    :host([data-placement="bottom"]) {
        top: 100%;
    }
    :host([data-placement="top"]) .buttons {
        padding-bottom: 4px;
    }
    :host([data-placement="bottom"]) .buttons {
        padding-top: 4px;
    }
    .buttons {
        display: flex;
        justify-content: flex-end;
        gap: 3px;
        opacity: 0;
        transition: opacity 250ms ease;
    }
    :host([data-container-active]) .buttons {
        opacity: var(--gs-controls-hover-opacity, 0.3);
        pointer-events: auto;
    }
    :host(:hover) .buttons,
    :host(:focus-within) .buttons,
    :host([data-visibility="always"]) .buttons {
        opacity: 1;
        pointer-events: auto;
    }
    @media (hover: none) {
        :host([data-visibility]) .buttons {
            opacity: 1;
            pointer-events: auto;
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .buttons {
            transition: none;
        }
    }
    button, a {
        display: inline-flex;
        box-sizing: border-box;
        align-items: center;
        justify-content: center;
        gap: 4px;
        min-width: 32px;
        min-height: 32px;
        padding: 5px 7px;
        border: 0;
        border-radius: 4px;
        background: var(--gs-controls-background, #fff);
        color: inherit;
        font: inherit;
        text-decoration: none;
        cursor: pointer;
    }
    button:hover, a:hover {
        outline: 1px solid #999;
    }
    button:focus-visible, a:focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
    }
    button:disabled {
        opacity: 0.6;
        cursor: wait;
    }
    .icon {
        display: inline-flex;
        flex-shrink: 0;
    }
    .icon, .icon > *, svg, img {
        width: 16px;
        height: 16px;
    }
    p {
        position: absolute;
        top: 100%;
        right: 0;
        pointer-events: auto;
        width: max-content;
        max-width: min(320px, calc(100vw - 16px));
        box-sizing: border-box;
        padding: 8px;
        margin: 4px 0 0;
        border: 1px solid #bbb;
        border-radius: 4px;
        background: var(--gs-controls-background, #fff);
        white-space: pre-line;
        overflow-wrap: anywhere;
    }
    :host([data-placement="bottom"]) p {
        top: auto;
        bottom: 100%;
        margin: 0 0 4px;
    }
`;

/**
 * Temporarily overrides only the supplied CSS properties.
 * Use longhands when a shorthand could erase independently set properties.
 *
 * @param {HTMLElement} element
 * @param {Record<string, string>} properties
 */
export function overrideStyle(element, properties) {
    const previous = Object.keys(properties).map((name) => ({
        name,
        value: element.style.getPropertyValue(name),
        priority: element.style.getPropertyPriority(name),
    }));
    for (const [name, value] of Object.entries(properties)) {
        element.style.setProperty(name, value, "important");
    }
    return () => {
        for (const { name, value, priority } of previous) {
            element.style.setProperty(name, value, priority);
        }
    };
}
