/* Presentation-only scale; the tested learning environment keeps its original state space. */
(function (root) {
  'use strict';
  const points = Object.freeze([[0, 0], [20, 20], [35, 60], [58, 1000], [80, 1200], [94, 1350], [100, 1400]].map(Object.freeze));
  const metadata = Object.freeze({internalUnit: 'heat-index-0-100', displayUnit: 'celsius', simulation: true, mapping: points});
  function celsius(value) {
    if (!Number.isFinite(value)) throw new TypeError('Temperature must be finite');
    const index = Math.max(0, Math.min(100, value));
    for (let i = 1; i < points.length; i++) {
      const [x, y] = points[i], [x0, y0] = points[i - 1];
      if (index <= x) return Math.round(y0 + (index - x0) / (x - x0) * (y - y0));
    }
    return 1400;
  }
  function format(value) { return `${celsius(value)}℃`; }
  root.KilnTemperature = {celsius, format, metadata, max: 1400};
  if (typeof module !== 'undefined') module.exports = root.KilnTemperature;
})(typeof window !== 'undefined' ? window : globalThis);
