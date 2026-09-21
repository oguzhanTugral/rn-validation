/* Copyright (c) 2026 Oğuzhan Tuğral. All rights reserved. Source: https://oguzhantugral.github.io/rn-validation/hero.html */

(function (global) {
  'use strict';

  var PREFIX = 'rnv.grades.';
  var ENGINES = ['musWM', 'AnalysisGNN', 'AugmentedNet'];
  var cache = {};

  function key(corpusId) { return PREFIX + corpusId; }

  function rowKey(pieceNo, measure, beat) {
    return pieceNo + ':' + measure + ':' + beat;
  }

  function load(corpusId) {
    if (cache[corpusId]) return cache[corpusId];
    var data = {};
    try {
      var raw = localStorage.getItem(key(corpusId));
      if (raw) data = JSON.parse(raw) || {};
    } catch (e) { data = {}; }
    cache[corpusId] = data;
    return data;
  }

  function persist(corpusId) {
    try {
      localStorage.setItem(key(corpusId), JSON.stringify(cache[corpusId] || {}));
      return true;
    } catch (e) {
      return false;   // private mode or quota; the session still works in memory
    }
  }

  function pick(v) { return (v === 0 || v === 1) ? v : null; }

  
  var bookByCorpus = {};

  function attachBook(corpusId, pack) {
    if (!pack || !pack.book || !pack.book.grades) return;
    bookByCorpus[corpusId] = {
      grades: pack.book.grades,
      pieceNo: pack.pieces.map(function (p) { return p.no; }),
      meta: pack.book
    };
  }

  function book(corpusId) { return bookByCorpus[corpusId] || null; }

  function bookGrade(corpusId, row) {
    var b = bookByCorpus[corpusId];
    if (!b) return null;
    var g = b.grades[rowKey(b.pieceNo[row.piece], row.measure, row.beat)];
    return g || null;
  }

  
  function claims(row, e) {
    var v = row.gradable ? row.gradable[e]
                         : (row.compared ? row.compared[e] : row.raw[e]);
    return !!v;
  }

  
  function autoLocked(corpusId, row) {
    if (bookByCorpus[corpusId]) return false;   // the book decides on this corpus
    if (!row || row.status !== 'same') return false;





    return !fromDecision(decidedClusters(corpusId), row);
  }

  
  function locks(corpusId, row) {
    if (bookByCorpus[corpusId]) {
      var bg = bookGrade(corpusId, row);
      return [!!bg, !!bg, !!bg];
    }
    var on = autoLocked(corpusId, row);
    return [
      on && claims(row, 0),
      on && claims(row, 1),
      on && claims(row, 2)
    ];
  }

  
  function get(corpusId, corpus, row) {
    if (bookByCorpus[corpusId]) {
      var bg = bookGrade(corpusId, row);
      return bg ? [bg[0], bg[1], bg[2]] : [null, null, null];
    }
    var piece = corpus.pieces[row.piece];
    var v = load(corpusId)[rowKey(piece.no, row.measure, row.beat)];
    var lock = locks(corpusId, row);
    return [0, 1, 2].map(function (e) {
      if (lock[e]) return 1;
      return v ? pick(v[e]) : null;
    });
  }

  
  function set(corpusId, corpus, row, engineIndex, value) {
    if (bookByCorpus[corpusId]) return get(corpusId, corpus, row);   // book-graded corpus
    if (locks(corpusId, row)[engineIndex]) return get(corpusId, corpus, row);   // fixed at 1
    var piece = corpus.pieces[row.piece];
    var store = load(corpusId);
    var k = rowKey(piece.no, row.measure, row.beat);
    var cur = store[k] ? store[k].slice() : [null, null, null];
    cur[engineIndex] = (cur[engineIndex] === value) ? null : value;
    if (cur[0] === null && cur[1] === null && cur[2] === null) delete store[k];
    else store[k] = cur;
    persist(corpusId);
    return get(corpusId, corpus, row);
  }

  function clearAll(corpusId) {
    cache[corpusId] = {};
    try { localStorage.removeItem(key(corpusId)); } catch (e) {}
  }

  

  
  function raw(corpusId, corpus, row) {
    var piece = corpus.pieces[row.piece];
    var v = load(corpusId)[rowKey(piece.no, row.measure, row.beat)];
    return v ? v.slice() : null;
  }

  
  function force(corpusId, corpus, row, engineIndex, value) {
    if (bookByCorpus[corpusId]) return get(corpusId, corpus, row);
    if (locks(corpusId, row)[engineIndex]) return get(corpusId, corpus, row);
    var piece = corpus.pieces[row.piece];
    var store = load(corpusId);
    var k = rowKey(piece.no, row.measure, row.beat);
    var cur = store[k] ? store[k].slice() : [null, null, null];
    cur[engineIndex] = pick(value);
    if (cur[0] === null && cur[1] === null && cur[2] === null) delete store[k];
    else store[k] = cur;
    persist(corpusId);
    return get(corpusId, corpus, row);
  }

  
  function restore(corpusId, k, triple) {
    var store = load(corpusId);
    if (triple && (pick(triple[0]) !== null || pick(triple[1]) !== null || pick(triple[2]) !== null)) {
      store[k] = triple.slice();
    } else {
      delete store[k];
    }
    persist(corpusId);
  }

  
  function decidedClusters(corpusId) {
    return (global.RNVClusters && global.RNVClusters.decidedKeys)
      ? global.RNVClusters.decidedKeys(corpusId) : null;
  }

  function fromDecision(decided, row) {
    if (!decided) return false;
    var k = global.RNVClusters.keyOf(row);
    return k !== null && Object.prototype.hasOwnProperty.call(decided, k);
  }

  
  function stats(corpusId, corpus, rows) {
    if (bookByCorpus[corpusId]) return bookStats(corpusId, rows);
    var store = load(corpusId);
    var decided = decidedClusters(corpusId);
    var out = ENGINES.map(function (name) {
      return { engine: name, labelled: 0, graded: 0, correct: 0,
               auto: 0, human: 0, bulk: 0, cell: 0,
               humanCorrect: 0, cellCorrect: 0,
               accuracy: null, humanAccuracy: null, cellAccuracy: null, progress: 0 };
    });
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var piece = corpus.pieces[row.piece];
      var g = store[rowKey(piece.no, row.measure, row.beat)];
      var lock = locks(corpusId, row);
      var bulk = (g || lock[0] || lock[1] || lock[2]) ? fromDecision(decided, row) : false;
      for (var e = 0; e < 3; e++) {
        if (!claims(row, e)) continue;
        out[e].labelled++;
        if (lock[e]) {
          out[e].graded++; out[e].correct++; out[e].auto++;
          continue;
        }
        var v = g ? pick(g[e]) : null;
        if (v === null) continue;
        out[e].graded++; out[e].human++;
        if (bulk) out[e].bulk++; else out[e].cell++;
        if (v === 1) {
          out[e].correct++; out[e].humanCorrect++;
          if (!bulk) out[e].cellCorrect++;
        }
      }
    }
    out.forEach(function (s) {
      s.accuracy = s.graded ? s.correct / s.graded : null;
      s.humanAccuracy = s.human ? s.humanCorrect / s.human : null;
      s.cellAccuracy = s.cell ? s.cellCorrect / s.cell : null;
      s.progress = s.labelled ? s.graded / s.labelled : 0;
    });
    return out;
  }

  
  function bookStats(corpusId, rows) {
    var out = ENGINES.map(function (name) {
      return { engine: name, labelled: 0, graded: 0, correct: 0,
               auto: 0, human: 0, bulk: 0, cell: 0, book: 0,
               humanCorrect: 0, cellCorrect: 0,
               accuracy: null, humanAccuracy: null, cellAccuracy: null, progress: 0 };
    });
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var bg = bookGrade(corpusId, row);
      for (var e = 0; e < 3; e++) {
        if (row.raw && row.raw[e]) out[e].labelled++;
        if (!bg) continue;
        out[e].graded++; out[e].book++;
        if (bg[e] === 1) out[e].correct++;
      }
    }
    out.forEach(function (s) {
      s.accuracy = s.graded ? s.correct / s.graded : null;
      s.progress = s.labelled ? s.graded / s.labelled : 0;
    });
    return out;
  }

  
  function gradedRows(corpusId, corpus, rows) {
    if (bookByCorpus[corpusId]) {
      return rows.filter(function (row) { return !!bookGrade(corpusId, row); });
    }
    var store = load(corpusId);
    return rows.filter(function (row) {
      if (autoLocked(corpusId, row)) return true;
      var piece = corpus.pieces[row.piece];
      return !!store[rowKey(piece.no, row.measure, row.beat)];
    });
  }

  function exportPayload(corpusId, corpus) {
    return {
      format: 'rnv-grades',
      version: 1,
      corpus: corpusId,
      corpusName: corpus ? corpus.name : '',
      engines: ENGINES,
      note: '1 = engine label judged correct, 0 = judged wrong, absent = not graded. ' +
            'Keys are work:measure:beat.',
      autoIdentical: {
        rule: 'A row where all three engines produced a label and the three normalise to ' +
              'the same figure is graded 1 for all three engines automatically and cannot ' +
              'be regraded by hand.',
        stored: false,
        recompute: 'Those grades are not listed below. They follow from the corpus pack under ' +
                   'the comparison mode and basis in force, so they have to be recomputed ' +
                   'rather than read from this file. A value listed below for such a position ' +
                   'is ignored while the rule is on.'
      },
      exported: new Date().toISOString(),
      grades: load(corpusId)
    };
  }

  
  function importPayload(corpusId, payload, strategy) {
    if (!payload || payload.format !== 'rnv-grades') {
      throw new Error('Not an rnv-grades file.');
    }
    if (payload.corpus && payload.corpus !== corpusId) {
      throw new Error('This file was exported for corpus "' + payload.corpus +
                      '", but "' + corpusId + '" is selected.');
    }
    var store = load(corpusId);
    var added = 0, kept = 0, replaced = 0, conflicts = 0;
    Object.keys(payload.grades || {}).forEach(function (k) {
      var incoming = payload.grades[k];
      if (!Array.isArray(incoming)) return;
      var cur = store[k];
      if (!cur) { store[k] = incoming.slice(); added++; return; }
      for (var e = 0; e < 3; e++) {
        var a = pick(cur[e]), b = pick(incoming[e]);
        if (b === null) continue;
        if (a === null) { cur[e] = b; added++; continue; }
        if (a === b) { kept++; continue; }
        conflicts++;
        if (strategy === 'incoming') { cur[e] = b; replaced++; } else { kept++; }
      }
    });
    persist(corpusId);
    return { added: added, kept: kept, replaced: replaced, conflicts: conflicts };
  }

  global.RNVGrades = {
    ENGINES: ENGINES,
    attachBook: attachBook,
    book: book,
    bookGrade: bookGrade,
    get: get,
    set: set,
    raw: raw,
    force: force,
    restore: restore,
    locks: locks,
    autoLocked: autoLocked,
    stats: stats,
    clearAll: clearAll,
    gradedRows: gradedRows,
    exportPayload: exportPayload,
    importPayload: importPayload,
    count: function (corpusId) { return Object.keys(load(corpusId)).length; }
  };
})(window);
