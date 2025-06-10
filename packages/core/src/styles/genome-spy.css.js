const css = `
.genome-spy {
  font-family: system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
  position: relative;
  display: flex;
  flex-direction: column;
}
.genome-spy .canvas-wrapper {
  position: relative;
  flex-grow: 1;
  overflow: hidden;
}
.genome-spy canvas {
  display: block;
  transform: scale(1, 1);
  opacity: 1;
  transition: transform 0.6s, opacity 0.6s;
}
.genome-spy canvas:focus, .genome-spy canvas:focus-visible {
  outline: none;
}
.genome-spy .loading-message {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.genome-spy .loading-message .message {
  color: #666;
  opacity: 0;
  transition: opacity 0.7s;
}
.genome-spy .loading > canvas {
  transform: scale(0.95, 0.95);
  opacity: 0;
}
.genome-spy .loading > .loading-message .message {
  opacity: 1;
}
.genome-spy .loading > .loading-message .message .ellipsis {
  animation: blinker 1s linear infinite;
}
@keyframes blinker {
  50% {
    opacity: 0;
  }
}
.genome-spy .loading-indicators {
  position: absolute;
  inset: 0;
  user-select: none;
  pointer-events: none;
}
.genome-spy .loading-indicators div {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
}
.genome-spy .loading-indicators div > div {
  font-size: 11px;
  transition: opacity 0.2s;
  background: white;
  padding: 2px 5px;
  display: flex;
  border-radius: 3px;
  gap: 0.5em;
  opacity: 0;
}
.genome-spy .loading-indicators div > div.loading {
  opacity: 0.5;
}
.genome-spy .loading-indicators div > div.error {
  opacity: 0.8;
  color: firebrick;
}
.genome-spy .loading-indicators div > div > * {
  display: block;
}
.genome-spy .loading-indicators div > div img {
  width: 1.5em;
  height: 1.5em;
}
.genome-spy .tooltip {
  position: absolute;
  max-width: 450px;
  overflow: hidden;
  background: #f6f6f6;
  padding: 10px;
  font-size: 12px;
  box-shadow: 0px 3px 15px 0px rgba(0, 0, 0, 0.21);
  transition: outline-color 0.3s ease-in-out, box-shadow 0.3s ease-in-out;
  outline: 0px solid transparent;
  z-index: 100;
}
.genome-spy .tooltip:not(.sticky) {
  pointer-events: none;
}
.genome-spy .tooltip.sticky {
  outline: 2px solid black;
  box-shadow: 0px 3px 18px 0px rgba(0, 0, 0, 0.3);
}
.genome-spy .tooltip > :last-child {
  margin-bottom: 0;
}
.genome-spy .tooltip > .title {
  padding-bottom: 5px;
  margin-bottom: 5px;
  border-bottom: 1px dashed #b6b6b6;
}
.genome-spy .tooltip .summary {
  font-size: 12px;
}
.genome-spy .tooltip table {
  border-collapse: collapse;
}
.genome-spy .tooltip table:first-child {
  margin-top: 0;
}
.genome-spy .tooltip table th,
.genome-spy .tooltip table td {
  padding: 2px 0.4em;
  vertical-align: top;
}
.genome-spy .tooltip table th:first-child,
.genome-spy .tooltip table td:first-child {
  padding-left: 0;
}
.genome-spy .tooltip table th {
  text-align: left;
  font-weight: bold;
}
.genome-spy .tooltip .color-legend {
  display: inline-block;
  width: 0.8em;
  height: 0.8em;
  margin-left: 0.4em;
  box-shadow: 0px 0px 3px 1px white;
}
.genome-spy .tooltip .attributes .hovered {
  background-color: #e0e0e0;
}
.genome-spy .tooltip .na {
  color: #aaa;
  font-style: italic;
  font-size: 80%;
}
.genome-spy .gene-track-tooltip .summary {
  font-size: 90%;
}
.genome-spy .message-box {
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: 0;
  height: 100%;
  width: 100%;
}
.genome-spy .message-box > div {
  border: 1px solid red;
  padding: 10px;
  background: #fff0f0;
}

.gs-input-binding {
  display: grid;
  grid-template-columns: max-content max-content;
  column-gap: 1em;
  row-gap: 0.3em;
  justify-items: start;
}
.gs-input-binding > select,
.gs-input-binding > input:not([type=checkbox]) {
  width: 100%;
}
.gs-input-binding input[type=range] + span {
  display: inline-block;
  margin-left: 0.3em;
  min-width: 2.2em;
  font-variant-numeric: tabular-nums;
}
.gs-input-binding input[type=range],
.gs-input-binding input[type=radio] {
  vertical-align: text-bottom;
}
.gs-input-binding .radio-group {
  display: flex;
  align-items: center;
}
.gs-input-binding .description {
  max-width: 26em;
  grid-column: 1/-1;
  color: #777;
  font-size: 90%;
  margin-top: -0.5em;
}

.gs-input-bindings {
  flex-basis: content;
  font-size: 14px;
  padding: 10px;
}
`;
export default css;
