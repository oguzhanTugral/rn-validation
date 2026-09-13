
(function (global) {
  'use strict';

  var PREFIX = 'rnv.notes.';
  var ENGINES = ['musWM', 'AnalysisGNN', 'AugmentedNet'];
  var cache = {};

  function key(corpusId) { return PREFIX + corpusId; }
  function rowKey(pieceNo, measure, beat) { return pieceNo + ':' + measure + ':' + beat; }

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

  function clean(v) { return (typeof v === 'string' && v.trim()) ? v.trim() : ''; }

  
  function get(corpusId, corpus, row) {
    var piece = corpus.pieces[row.piece];
    var v = load(corpusId)[rowKey(piece.no, row.measure, row.beat)];
    return v ? [clean(v[0]), clean(v[1]), clean(v[2])] : ['', '', ''];
  }

  function set(corpusId, corpus, row, engineIndex, text) {
    var piece = corpus.pieces[row.piece];
    var store = load(corpusId);
    var k = rowKey(piece.no, row.measure, row.beat);
    var cur = store[k] ? store[k].slice() : ['', '', ''];
    cur[engineIndex] = clean(text);
    if (!cur[0] && !cur[1] && !cur[2]) delete store[k];
    else store[k] = cur;
    persist(corpusId);
    return [clean(cur[0]), clean(cur[1]), clean(cur[2])];
  }

  function has(corpusId, corpus, row) {
    var n = get(corpusId, corpus, row);
    return !!(n[0] || n[1] || n[2]);
  }

  function count(corpusId) {
    var store = load(corpusId);
    var n = 0;
    Object.keys(store).forEach(function (k) {
      for (var e = 0; e < 3; e++) if (clean(store[k][e])) n++;
    });
    return n;
  }

  function clearAll(corpusId) {
    cache[corpusId] = {};
    try { localStorage.removeItem(key(corpusId)); } catch (e) {}
  }

  
  function collect(corpusId, corpus, rows) {
    var store = load(corpusId);
    var out = [];
    rows.forEach(function (row) {
      var piece = corpus.pieces[row.piece];
      var v = store[rowKey(piece.no, row.measure, row.beat)];
      if (!v) return;
      for (var e = 0; e < 3; e++) {
        var text = clean(v[e]);
        if (!text) continue;
        out.push({
          workNo: piece.no,
          work: piece.title,
          file: piece.orig,
          bar: row.measure,
          writtenBar: piece.map[String(row.measure)],
          beat: row.beat,
          engine: ENGINES[e],
          label: row.raw[e] || '',
          otherLabels: ENGINES.map(function (name, i) {
            return name + '=' + (row.raw[i] || '—');
          }).join('  '),
          held: !!row.carried[e],
          repeated: !!row.repeated[e],
          droppedRepeat: !!(row.dropped && row.dropped[e]),
          status: row.status,
          note: text
        });
      }
    });
    return out;
  }

  function exportPayload(corpusId, corpus) {
    return {
      format: 'rnv-notes',
      version: 1,
      corpus: corpusId,
      corpusName: corpus ? corpus.name : '',
      alignment: corpus ? (corpus.alignment || 'beat') : '',
      engines: ENGINES,
      note: 'Free-text notes per engine per row. Keys are work:measure:beat, ' +
            'values are [musWM, AnalysisGNN, AugmentedNet].',
      exported: new Date().toISOString(),
      notes: load(corpusId)
    };
  }

  function importPayload(corpusId, payload, strategy) {
    if (!payload || payload.format !== 'rnv-notes') {
      throw new Error('Not an rnv-notes file.');
    }
    if (payload.corpus && payload.corpus !== corpusId) {
      throw new Error('This file was exported for corpus "' + payload.corpus +
                      '", but "' + corpusId + '" is selected.');
    }
    var store = load(corpusId);
    var added = 0, kept = 0, replaced = 0, conflicts = 0;
    Object.keys(payload.notes || {}).forEach(function (k) {
      var incoming = payload.notes[k];
      if (!Array.isArray(incoming)) return;
      var cur = store[k];
      if (!cur) { store[k] = [clean(incoming[0]), clean(incoming[1]), clean(incoming[2])]; added++; return; }
      for (var e = 0; e < 3; e++) {
        var a = clean(cur[e]), b = clean(incoming[e]);
        if (!b) continue;
        if (!a) { cur[e] = b; added++; continue; }
        if (a === b) { kept++; continue; }
        conflicts++;
        if (strategy === 'incoming') { cur[e] = b; replaced++; }
        else if (strategy === 'merge') { cur[e] = a + '\n---\n' + b; replaced++; }
        else { kept++; }
      }
    });
    persist(corpusId);
    return { added: added, kept: kept, replaced: replaced, conflicts: conflicts };
  }

  
  function exportMarkdown(corpusId, corpus, rows) {
    var items = collect(corpusId, corpus, rows);
    var lines = [];
    lines.push('# RN validation — notes and questions');
    lines.push('');
    lines.push('Corpus: **' + corpus.name + '** (`' + corpusId + '`)');
    lines.push('Alignment: `' + (corpus.alignment || 'beat') + '` · exported ' +
               new Date().toISOString());
    lines.push('');
    lines.push(items.length + ' note' + (items.length === 1 ? '' : 's') + '.');
    lines.push('');

    var byWork = {};
    items.forEach(function (it) {
      (byWork[it.workNo] = byWork[it.workNo] || []).push(it);
    });

    Object.keys(byWork).sort().forEach(function (no) {
      var group = byWork[no];
      lines.push('## ' + no + ' · ' + group[0].work);
      lines.push('');
      lines.push('`' + group[0].file + '`');
      lines.push('');
      group.sort(function (a, b) { return (a.bar - b.bar) || (a.beat - b.beat); });
      group.forEach(function (it) {
        var flags = [];
        if (it.held) flags.push('held');
        if (it.repeated) flags.push('repeat');
        if (it.droppedRepeat) flags.push('emitted but dropped');
        var written = (it.writtenBar !== undefined && it.writtenBar !== it.bar)
          ? ' (written bar ' + it.writtenBar + ')' : '';
        lines.push('### bar ' + it.bar + written + ', beat ' + it.beat +
                   ' — ' + it.engine);
        lines.push('');
        lines.push('- label: `' + (it.label || '(none)') + '`' +
                   (flags.length ? '  _' + flags.join(', ') + '_' : ''));
        lines.push('- all three: `' + it.otherLabels + '`');
        lines.push('- row status: ' + it.status);
        lines.push('');
        lines.push('> ' + it.note.split('\n').join('\n> '));
        lines.push('');
      });
    });
    return lines.join('\n');
  }

  global.RNVNotes = {
    ENGINES: ENGINES,
    get: get,
    set: set,
    has: has,
    count: count,
    clearAll: clearAll,
    collect: collect,
    exportPayload: exportPayload,
    importPayload: importPayload,
    exportMarkdown: exportMarkdown
  };
})(window);
