/**
 * Optional query annotations attach to a unit's existing layout placement.
 * Keeping the registry here avoids importing the optional controller in Core.
 * @type {WeakMap<import('./unitView.js').default, (context: import('./renderingContext/viewRenderingContext.js').default, coords: import('./layout/rectangle.js').default, options: import('../types/rendering.js').RenderingOptions) => void>}
 */
export const annotationPlacements = new WeakMap();
