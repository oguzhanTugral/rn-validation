/* Copyright (c) 2026 Oğuzhan Tuğral. All rights reserved. Source: https://oguzhantugral.github.io/rn-validation/hero.html */

(function (global) {
  'use strict';

  var PREFIX = 'rnv.clusters.';
  var ENGINE_KEY = ['muswm', 'analysisgnn', 'augmentednet'];

  var PC = {
    'C': 0, 'B#': 0, 'Dbb': 0, 'C#': 1, 'Db': 1, 'D': 2, 'Cx': 2, 'Ebb': 2,
    'D#': 3, 'Eb': 3, 'E': 4, 'Fb': 4, 'Dx': 4, 'F': 5, 'E#': 5, 'Gbb': 5,
    'F#': 6, 'Gb': 6, 'G': 7, 'Fx': 7, 'Abb': 7, 'G#': 8, 'Ab': 8,
    'A': 9, 'Gx': 9, 'Bbb': 9, 'A#': 10, 'Bb': 10, 'B': 11, 'Cb': 11, 'Ax': 11
  };

  var MAJOR = [0, 2, 4, 5, 7, 9, 11];
  var MINOR = [0, 2, 3, 5, 7, 8, 10];
  var NUMERAL = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

  
  var QUALITY = {
    '0,4,7':     { up: true,  mark: '',  seventh: false },
    '0,3,7':     { up: false, mark: '',  seventh: false },
    '0,3,6':     { up: false, mark: 'o', seventh: false },
    '0,4,8':     { up: true,  mark: '+', seventh: false },
    '0,4':       { up: true,  mark: '',  seventh: false },
    '0,3':       { up: false, mark: '',  seventh: false },
    '0,4,7,10':  { up: true,  mark: '',  seventh: true },
    '0,4,7,11':  { up: true,  mark: '',  seventh: true },
    '0,3,7,10':  { up: false, mark: '',  seventh: true },
    '0,3,7,11':  { up: false, mark: '',  seventh: true },
    '0,3,6,10':  { up: false, mark: 'h', seventh: true },
    '0,3,6,9':   { up: false, mark: 'o', seventh: true },
    '0,4,10':    { up: true,  mark: '',  seventh: true },
    '0,4,11':    { up: true,  mark: '',  seventh: true },
    '0,3,10':    { up: false, mark: '',  seventh: true },
    '0,3,11':    { up: false, mark: '',  seventh: true },
    '0,6,10':    { up: false, mark: 'h', seventh: true },
    '0,6,9':     { up: false, mark: 'o', seventh: true }
  };

  
  function figure(iv, seventh) {
    if (iv === 0) return seventh ? '7' : '';
    if (iv === 3 || iv === 4) return seventh ? '65' : '6';
    if (iv === 6 || iv === 7 || iv === 8) return seventh ? '43' : '64';
    if (seventh && (iv === 9 || iv === 10 || iv === 11)) return '42';
    return null;   // the bass is not a member of the chord
  }

  function pcOf(name) {
    var n = String(name || '').trim();
    return PC[n] === undefined ? null : PC[n];
  }

  
  function parsePcs(names) {
    var parts = String(names || '').split('-').map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length; });
    if (!parts.length) return null;
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var pc = pcOf(parts[i]);
      if (pc === null) return null;
      if (out.indexOf(pc) < 0) out.push(pc);
    }
    return out;
  }

  
  function parseKey(name) {
    var m = /^\s*([A-Ga-g](?:#|b|##|bb|x)?)\s+(major|minor)\s*$/i.exec(String(name || ''));
    if (!m) return null;
    var pc = pcOf(m[1].charAt(0).toUpperCase() + m[1].slice(1));
    if (pc === null) return null;
    return { tonic: pc, minor: /minor/i.test(m[2]) };
  }

  
  function degree(offset, minor) {
    var scale = minor ? MINOR : MAJOR;
    var i = scale.indexOf(offset);
    if (i >= 0) return NUMERAL[i];
    var above = scale.indexOf((offset + 1) % 12);
    if (above >= 0) return 'b' + NUMERAL[above];
    var below = scale.indexOf((offset + 11) % 12);
    if (below >= 0) return '#' + NUMERAL[below];
    return null;
  }

  
  function suggest(parts, mode) {
    var k = parseKey(parts.keyName);
    var pcs = parsePcs(parts.pcs);
    if (!k || !pcs || parts.root === null || parts.bass === null) return null;

    var ivals = pcs.map(function (p) { return (p - parts.root + 12) % 12; })
      .sort(function (a, b) { return a - b; });
    var q = QUALITY[ivals.join(',')];
    if (!q) return null;

    var deg = degree((parts.root - k.tonic + 12) % 12, k.minor);
    if (deg === null) return null;

    var fig = figure((parts.bass - parts.root + 12) % 12, q.seventh);
    if (fig === null) return null;

    var numeral = q.up ? deg : deg.replace(/[IVX]+/, function (s) { return s.toLowerCase(); });
    var label = numeral + q.mark + fig;
    return global.RNV.normalizeLabel(label, mode === 'strict' ? 'normal' : mode);
  }

  
  function keyOf(row) {
    var d = row.diag && row.diag.muswm;
    if (!d) return null;
    if (!d.localKeyName || !d.pcSetNames) return null;
    if (d.bass === undefined || d.bass === null) return null;
    if (d.root === undefined || d.root === null) return null;
    return d.localKeyName + ' | ' + d.pcSetNames + ' | ' + d.bass + ' | ' + d.root;
  }

  
  function keyPrefix(name) {
    var m = /^\s*([A-Ga-g](?:#|b|##|bb|x)?)\s+(major|minor)\s*$/i.exec(String(name || ''));
    if (!m) return '';
    var tonic = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    return /minor/i.test(m[2]) ? tonic.toLowerCase() : tonic;
  }

  
  function sameKey(a, b) { return a === b; }

  function partsOf(row) {
    var d = row.diag.muswm;
    return {
      keyName: d.localKeyName,
      pcs: d.pcSetNames,
      bass: Number(d.bass),
      root: Number(d.root),
      inversion: d.inversion || '',
      classification: d.classification || ''
    };
  }

  
  function build(rows, mode) {
    var byKey = {};
    var order = [];
    var sameByKey = {};
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var k;




      if (row.status === 'same') {
        k = keyOf(row);
        if (k === null) continue;
        (sameByKey[k] = sameByKey[k] || []).push(row);
        continue;
      }
      if (row.status !== 'diff') continue;
      k = keyOf(row);
      if (k === null) continue;
      if (!byKey[k]) { byKey[k] = { key: k, parts: partsOf(row), rows: [] }; order.push(k); }
      byKey[k].rows.push(row);
    }

    var out = order.map(function (k) {
      var c = byKey[k];
      var tally = {};
      var cells = 0, keySplit = 0;
      var own = keyPrefix(c.parts.keyName);
      c.rows.forEach(function (row) {
        var keys = {};
        for (var e = 0; e < 3; e++) {
          if (!row.gradable[e] || !row.norm[e]) continue;
          cells++;
          var lab = row.norm[e];
          if (!tally[lab]) tally[lab] = { label: lab, count: 0, engines: [false, false, false] };
          tally[lab].count++;
          tally[lab].engines[e] = true;

          var kk = (e === 0) ? own : row.keys[e];
          if (kk) keys[kk] = true;
        }
        var seen = Object.keys(keys);
        if (seen.length > 1 && !seen.every(function (k) { return sameKey(k, seen[0]); })) keySplit++;
      });
      c.n = c.rows.length;
      c.cells = cells;
      c.keySplit = keySplit;


      c.sameRows = sameByKey[k] || [];
      c.sameCells = c.sameRows.reduce(function (a, row) {
        var n = 0;
        for (var e = 0; e < 3; e++) if (row.gradable[e] && row.norm[e]) n++;
        return a + n;
      }, 0);
      c.votes = Object.keys(tally).map(function (l) { return tally[l]; })
        .sort(function (a, b) { return b.count - a.count || a.label.localeCompare(b.label); });
      c.suggestion = suggest(c.parts, mode);
      return c;
    });

    out.sort(function (a, b) { return b.n - a.n || b.cells - a.cells || a.key.localeCompare(b.key); });
    return out;
  }

  

  var cache = {};

  function storeKey(corpusId) { return PREFIX + corpusId; }

  function decisions(corpusId) {
    if (cache[corpusId]) return cache[corpusId];
    var data = {};
    try {
      var raw = localStorage.getItem(storeKey(corpusId));
      if (raw) data = JSON.parse(raw) || {};
    } catch (e) { data = {}; }
    cache[corpusId] = data;
    return data;
  }

  function persist(corpusId) {
    try {
      localStorage.setItem(storeKey(corpusId), JSON.stringify(cache[corpusId] || {}));
      return true;
    } catch (e) { return false; }
  }

  function decisionFor(corpusId, cluster) {
    return decisions(corpusId)[cluster.key] || null;
  }

  
  function apply(corpusId, corpus, cluster, label, mode) {
    var target = global.RNV.normalizeLabel(label, mode === 'strict' ? 'normal' : mode);
    if (!target) return null;

    var existing = decisionFor(corpusId, cluster);
    var prev = (existing && existing.prev) || {};
    var ones = 0, zeros = 0, sameOnes = 0, sameZeros = 0;



    decisions(corpusId)[cluster.key] = {
      label: target,
      typed: label,
      rows: cluster.n,
      sameRows: cluster.sameRows ? cluster.sameRows.length : 0,
      ones: 0, zeros: 0, sameOnes: 0, sameZeros: 0,
      prev: prev,
      decided: new Date().toISOString()
    };

    var write = function (row, identical) {
      var piece = corpus.pieces[row.piece];
      var rk = piece.no + ':' + row.measure + ':' + row.beat;
      if (!(rk in prev)) prev[rk] = global.RNVGrades.raw(corpusId, corpus, row);
      for (var e = 0; e < 3; e++) {
        if (!row.gradable[e] || !row.norm[e]) continue;
        var hit = row.norm[e] === target;
        global.RNVGrades.force(corpusId, corpus, row, e, hit ? 1 : 0);
        if (identical) { if (hit) sameOnes++; else sameZeros++; }
        else { if (hit) ones++; else zeros++; }
      }
    };
    cluster.rows.forEach(function (row) { write(row, false); });
    (cluster.sameRows || []).forEach(function (row) { write(row, true); });

    decisions(corpusId)[cluster.key].ones = ones;
    decisions(corpusId)[cluster.key].zeros = zeros;
    decisions(corpusId)[cluster.key].sameOnes = sameOnes;
    decisions(corpusId)[cluster.key].sameZeros = sameZeros;
    persist(corpusId);
    return decisions(corpusId)[cluster.key];
  }

  
  function undo(corpusId, corpus, cluster) {
    var d = decisionFor(corpusId, cluster);
    if (!d) return false;
    cluster.rows.concat(cluster.sameRows || []).forEach(function (row) {
      var piece = corpus.pieces[row.piece];
      var rk = piece.no + ':' + row.measure + ':' + row.beat;
      global.RNVGrades.restore(corpusId, rk, (d.prev || {})[rk] || null);
    });
    delete decisions(corpusId)[cluster.key];
    persist(corpusId);
    return true;
  }

  function clearAll(corpusId) {
    cache[corpusId] = {};
    try { localStorage.removeItem(storeKey(corpusId)); } catch (e) {}
  }

  
  function decidedKeys(corpusId) { return decisions(corpusId); }

  

  
  function exportPayload(corpusId, corpus) {
    var d = decisions(corpusId);
    return {
      format: 'rnv-clusters',
      version: 1,
      corpus: corpusId,
      corpusName: corpus ? corpus.name : '',
      note: 'One agreed Roman numeral per cluster. A cluster key is ' +
            '"local key | pitch-class set | bass | root" as musWM reports them. ' +
            'Importing re-applies the figure: every cell in the cluster is graded 1 where the ' +
            'engine label matches and 0 where it does not.',
      exported: new Date().toISOString(),
      decisions: Object.keys(d).map(function (k) {
        return { key: k, label: d[k].label, typed: d[k].typed, decided: d[k].decided };
      })
    };
  }

  
  function importPayload(corpusId, corpus, clusters, payload, strategy, mode) {
    if (!payload || payload.format !== 'rnv-clusters') {
      throw new Error('Not an rnv-clusters file.');
    }
    if (payload.corpus && payload.corpus !== corpusId) {
      throw new Error('This file was exported for corpus "' + payload.corpus +
                      '", but "' + corpusId + '" is selected.');
    }
    var byKey = {};
    clusters.forEach(function (c) { byKey[c.key] = c; });

    var applied = 0, kept = 0, replaced = 0, missing = 0, cells = 0;
    (payload.decisions || []).forEach(function (entry) {
      if (!entry || !entry.key || !entry.label) return;
      var c = byKey[entry.key];
      if (!c) { missing++; return; }
      var had = decisionFor(corpusId, c);
      if (had && strategy !== 'incoming') { kept++; return; }
      var rec = apply(corpusId, corpus, c, entry.typed || entry.label, mode);
      if (!rec) return;
      cells += (rec.ones || 0) + (rec.zeros || 0);
      if (had) replaced++; else applied++;
    });
    return { applied: applied, kept: kept, replaced: replaced, missing: missing, cells: cells };
  }

  function summary(corpusId, clusters) {
    var d = decisions(corpusId);
    var out = { clusters: clusters.length, decided: 0, rows: 0, rowsDecided: 0,
                cells: 0, cellsDecided: 0, ones: 0, zeros: 0 };
    clusters.forEach(function (c) {
      out.rows += c.n;
      out.cells += c.cells;
      var rec = d[c.key];
      if (!rec) return;
      out.decided++;
      out.rowsDecided += c.n;
      out.cellsDecided += c.cells;
      out.ones += rec.ones || 0;
      out.zeros += rec.zeros || 0;
    });
    return out;
  }

  global.RNVClusters = {
    ENGINE_KEY: ENGINE_KEY,
    build: build,
    keyOf: keyOf,
    suggest: suggest,
    parseKey: parseKey,
    parsePcs: parsePcs,
    apply: apply,
    undo: undo,
    clearAll: clearAll,
    decisionFor: decisionFor,
    decidedKeys: decidedKeys,
    exportPayload: exportPayload,
    importPayload: importPayload,
    summary: summary,
    count: function (corpusId) { return Object.keys(decisions(corpusId)).length; }
  };
})(window);
