/* Copyright (c) 2026 Oğuzhan Tuğral. All rights reserved. Source: https://oguzhantugral.github.io/rn-validation/hero.html */

(function (global) {
  'use strict';

  var SUPSUB = {
    '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
    '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
    '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
    '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9'
  };

  
  function splitKey(raw) {
    var s = (raw == null ? '' : String(raw)).trim();
    if (!s) return { key: '', label: '' };
    var m = /^([A-Ga-g][#b\-]{0,2})\s*:\s*(.+)$/.exec(s);
    return m ? { key: m[1], label: m[2].trim() } : { key: '', label: s };
  }

  function toAscii(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) out += (SUPSUB[s[i]] || s[i]);
    return out;
  }

  
  var FIGURE_ALIAS = [
    [/42(?=$|\/)/g, '2'],
    [/63(?=$|\/)/g, '6'],
    [/653(?=$|\/)/g, '65'],
    [/753(?=$|\/)/g, '7'],
    [/53(?=$|\/)/g, '']
  ];

  
  var SEVENTH_FOLD = { '7': '', '65': '6', '43': '64' };
  function foldSeventh(s) {
    var slash = s.indexOf('/'), target = '';
    if (slash >= 0) { target = s.slice(slash); s = s.slice(0, slash); }
    var m = /^([#b\-]*)([iIvV]+|N)(o|h|\+|M)?(\d*)$/.exec(s);
    if (!m || !Object.prototype.hasOwnProperty.call(SEVENTH_FOLD, m[4])) return s + target;
    var q = m[3] || '';
    if (q === 'h') q = 'o';
    if (q === 'M') q = '';
    return m[1] + m[2] + q + SEVENTH_FOLD[m[4]] + target;
  }

  function normalizeLabel(raw, mode) {
    var s = splitKey(raw).label;
    if (!s) return '';
    if (mode === 'strict') return s;

    s = toAscii(s);
    s = s.replace(/°/g, 'o');                              // diminished
    s = s.replace(/ø/g, 'h').replace(/%/g, 'h');           // half-diminished
    s = s.replace(/\/o/g, 'o');
    s = s.replace(/\((?:no\d|dyad|d|mb|add\d*)\)/gi, '');  // voicing remarks


    s = s.replace(/Maj/gi, 'M');                           // IMaj7 -> IM7 (M7 korunur)
    s = s.replace(/\s+/g, '');

    for (var i = 0; i < FIGURE_ALIAS.length; i++) {
      s = s.replace(FIGURE_ALIAS[i][0], FIGURE_ALIAS[i][1]);
    }
    s = foldSeventh(s);
    if (mode === 'degree') {
      s = s.replace(/^Cad64$/i, 'I');
      var applied = '';
      var slash = s.indexOf('/');
      if (slash >= 0) { applied = s.slice(slash); s = s.slice(0, slash); }
      var d = /^([#b\-]*)([iIvV]+|Cad|Ger|It|Fr|N)/.exec(s);
      s = d ? (d[1] + d[2]) : s;
      s += applied;
    }
    return s;
  }

  var ENGINES = ['musWM', 'AnalysisGNN', 'AugmentedNet'];

  
  function hasOnsetInfo(corpus) {
    var rows = corpus.rows;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].length > 6 && rows[i][6] !== null && rows[i][6] !== undefined) return true;
    }
    return false;
  }

  
  function classify(norm) {
    var present = norm.filter(function (v) { return v !== ''; });
    if (present.length === 0) return 'empty';
    if (present.length < 3) return 'partial';
    return (norm[0] === norm[1] && norm[1] === norm[2]) ? 'same' : 'diff';
  }

  
  function buildRows(corpus, mode, basis, hideRepeats) {
    var src = corpus.rows;
    var onsetAware = hasOnsetInfo(corpus);
    var useOnset = onsetAware && basis !== 'sustained';
    var out = new Array(src.length);


    var lastShown = [null, null, null];
    var lastPiece = null;

    for (var i = 0; i < src.length; i++) {

      var r = src[i];
      var raw = [r[3], r[4], r[5]];
      var exact = (r.length > 6 && r[6] !== null && r[6] !== undefined) ? r[6] : null;
      var diag = (r.length > 7 && r[7]) ? r[7] : null;
      var rawEmit = (r.length > 8 && r[8] !== null && r[8] !== undefined) ? r[8] : null;
      var carried = [false, false, false];
      var dropped = [false, false, false];
      var compared = raw.slice();

      if (r[0] !== lastPiece) { lastShown = [null, null, null]; lastPiece = r[0]; }
      var repeated = [false, false, false];

      for (var e = 0; e < 3; e++) {



        dropped[e] = !raw[e] && rawEmit !== null && !!(rawEmit & (1 << e));
        if (!raw[e]) { lastShown[e] = null; continue; }
        carried[e] = (exact !== null) && !(exact & (1 << e));

        if (useOnset && carried[e]) compared[e] = '';
        repeated[e] = (lastShown[e] === raw[e]);
        lastShown[e] = raw[e];
      }

      var norm = [
        normalizeLabel(compared[0], mode),
        normalizeLabel(compared[1], mode),
        normalizeLabel(compared[2], mode)
      ];

      var hide = hideRepeats !== false;
      var gradable = [false, false, false];
      for (var g = 0; g < 3; g++) {
        gradable[g] = compared[g] !== '' && !(hide && repeated[g]);
      }

      out[i] = {
        id: i,
        piece: r[0],
        measure: r[1],
        beat: r[2],
        raw: raw,               // what the pack holds, always shown
        compared: compared,     // what the partition actually used
        norm: norm,
        exact: exact,
        carried: carried,
        dropped: dropped,
        repeated: repeated,
        gradable: gradable,
        diag: diag,
        keys: [splitKey(raw[0]).key, splitKey(raw[1]).key, splitKey(raw[2]).key],
        status: classify(norm)
      };
    }
    return out;
  }

  function summarise(rows) {
    var s = { total: rows.length, same: 0, diff: 0, partial: 0, empty: 0 };
    for (var i = 0; i < rows.length; i++) s[rows[i].status]++;
    s.comparable = s.same + s.diff;
    s.agreement = s.comparable ? s.same / s.comparable : 0;
    return s;
  }

  
  function pairwise(rows) {
    return [[0, 1], [0, 2], [1, 2]].map(function (p) {
      var both = 0, agree = 0;
      for (var i = 0; i < rows.length; i++) {
        var n = rows[i].norm;
        if (n[p[0]] && n[p[1]]) { both++; if (n[p[0]] === n[p[1]]) agree++; }
      }
      return {
        a: ENGINES[p[0]], b: ENGINES[p[1]],
        both: both, agree: agree, rate: both ? agree / both : 0
      };
    });
  }

  global.RNV = {
    ENGINES: ENGINES,
    hasOnsetInfo: hasOnsetInfo,
    splitKey: splitKey,
    normalizeLabel: normalizeLabel,
    classify: classify,
    buildRows: buildRows,
    summarise: summarise,
    pairwise: pairwise
  };
})(window);
