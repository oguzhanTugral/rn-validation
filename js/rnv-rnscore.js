/* Copyright (c) 2026 Oğuzhan Tuğral. All rights reserved. Source: https://oguzhantugral.github.io/rn-validation/hero.html */

(function (global) {
  'use strict';
  var ENGINES = ['musWM', 'AnalysisGNN', 'AugmentedNet'];

  
  function firstAnswer(v) {
    var p = v && v.rnUndone && v.rnPrev;
    return p ? { rn: p.rn || [], rnNone: p.rnNone || '', rnU: !!p.rnU }
             : { rn: (v && v.rn) || [], rnNone: (v && v.rnNone) || '', rnU: !!(v && v.rnU) };
  }
  function finalAnswer(v) {
    return { rn: (v && v.rn) || [], rnNone: (v && v.rnNone) || '', rnU: !!(v && v.rnU) };
  }

  function add(total, rows, options, pick) {
    Object.keys(rows || {}).forEach(function (id) {
      var v = rows[id], opts = options[id];
      if (!v || !v.rnDone || !opts) return;
      if (v.rnUndone) total.revised += 1;            // every revision, counted or not
      var a = pick(v);
      if (a.rnU) { total.unclear += 1; return; }
      if (!a.rn.length && !a.rnNone) return;                       // not answered
      if (a.rn.length && a.rnNone) { total.inconsistent += 1; return; }
      total.n += 1;
      ENGINES.forEach(function (e) {
        if (opts.some(function (o) { return a.rn.indexOf(o.label) >= 0 && o.engines.indexOf(e) >= 0; })) {
          total.right[e] += 1;
        }
      });
    });
    return total;
  }

  function empty() {
    return { n: 0, unclear: 0, inconsistent: 0, revised: 0,
             right: { musWM: 0, AnalysisGNN: 0, AugmentedNet: 0 } };
  }

  
  function score(rowSets, options) {
    var t = empty();
    (rowSets || []).forEach(function (rows) { add(t, rows, options, firstAnswer); });
    return t;
  }

  
  function scoreRevised(rowSets, options) {
    var t = empty();
    (rowSets || []).forEach(function (rows) { add(t, rows, options, finalAnswer); });
    return t;
  }

  function pct(t, e) { return t.n ? (100 * t.right[e] / t.n).toFixed(1) + '%' : '—'; }

  
  function wilson(k, n) {
    if (!n) return null;
    var z = 1.959964, p = k / n, d = 1 + z * z / n;
    var centre = (p + z * z / (2 * n)) / d;
    var half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
    return [Math.max(0, centre - half) * 100, Math.min(1, centre + half) * 100];
  }

  global.RNVRnScore = { ENGINES: ENGINES, score: score, scoreRevised: scoreRevised, pct: pct,
                        wilson: wilson, firstAnswer: firstAnswer };
})(typeof window !== 'undefined' ? window : globalThis);
