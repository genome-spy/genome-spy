import { css, svg } from "lit";

/** Baseline sizing for inline Font Awesome SVGs in a shadow root. */
export const faStyles = css`
    .svg-inline--fa {
        display: var(--fa-display, inline-block);
        height: 1em;
        overflow: visible;
        vertical-align: -0.125em;
        box-sizing: content-box;
    }
`;

/**
 * Render a decorative icon from its Font Awesome path data.
 *
 * @param {import("@fortawesome/free-solid-svg-icons").IconDefinition} definition
 * @returns {import("lit").SVGTemplateResult}
 */
export function renderIcon({ prefix, iconName, icon }) {
    const [width, height, , , paths] = icon;
    return svg`<svg
        aria-hidden="true"
        focusable="false"
        data-prefix=${prefix}
        data-icon=${iconName}
        class=${"svg-inline--fa fa-" + iconName}
        role="img"
        viewBox=${`0 0 ${width} ${height}`}
    >
        ${
            typeof paths === "string"
                ? svg`<path fill="currentColor" d=${paths}></path>`
                : svg`<g class="fa-duotone-group">
                      ${paths.map((path, index) => {
                          const layer = index === 0 ? "secondary" : "primary";
                          const opacity = index === 0 ? 0.4 : 1;
                          return svg`<path
                              class=${"fa-" + layer}
                              fill=${`var(--fa-${layer}-color, currentColor)`}
                              opacity=${`var(--fa-${layer}-opacity, ${opacity})`}
                              d=${path}
                          ></path>`;
                      })}
                  </g>`
        }
    </svg>`;
}
