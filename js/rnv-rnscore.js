
(function (global) {
  'use strict';
  var ENGINES = ['musWM', 'AnalysisGNN', 'AugmentedNet'];

  function add(total, rows, options) {
    Object.keys(rows || {}).forEach(function (id) {
      var v = rows[id], opts = options[id];
      if (!v || !v.rnDone || v.rnU || !opts) return;
      total.n += 1;
      var chosen = v.rn || [];
      ENGINES.forEach(function (e) {
        if (opts.some(function (o) { return chosen.indexOf(o.label) >= 0 && o.engines.indexOf(e) >= 0; })) total.right[e] += 1;
      });
    });
    return total;
  }

  function empty() { return { n: 0, right: { musWM: 0, AnalysisGNN: 0, AugmentedNet: 0 } }; }

  
  function score(rowSets, options) {
    var t = empty();
    rowSets.forEach(function (rows) { add(t, rows, options); });
    return t;
  }

  function pct(t, e) { return t.n ? (100 * t.right[e] / t.n).toFixed(1) + '%' : '—'; }

  global.RNVRnScore = { ENGINES: ENGINES, score: score, pct: pct };
})(typeof window !== 'undefined' ? window : globalThis);
