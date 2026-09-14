
(function (global) {
  'use strict';


  var cache = {};
  var pending = {};
  var cachedCorpus = null;

  global.__RNV_SCORE__ = function (no, xml) {
    cache[no] = xml;
    (pending[no] || []).forEach(function (fn) { fn(xml); });
    delete pending[no];
  };

  function loadScore(corpusId, no) {
    if (cachedCorpus !== corpusId) { cache = {}; pending = {}; cachedCorpus = corpusId; }
    return new Promise(function (resolve, reject) {
      if (cache[no]) { resolve(cache[no]); return; }
      if (pending[no]) { pending[no].push(resolve); return; }
      pending[no] = [resolve];
      var s = document.createElement('script');
      s.src = 'data/corpora/' + corpusId + '/scores/' + no + '.js';
      s.onerror = function () {
        delete pending[no];
        reject(new Error('Could not load score ' + no + ' of corpus ' + corpusId + '.'));
      };
      document.head.appendChild(s);
    });
  }

  
  var ATTR_ORDER = ['footnote', 'level', 'divisions', 'key', 'time', 'staves', 'part-symbol', 'instruments',
                    'clef', 'staff-details', 'transpose', 'for-part', 'directive', 'measure-style'];

  
  function carryAttributes(doc, measures, firstIndex, target) {
    var state = {}, order = [];
    function absorb(attrs) {
      Array.prototype.forEach.call(attrs.children, function (c) {
        var k = c.tagName + '|' + (c.getAttribute('number') || '');
        if (!(k in state)) order.push(k);
        state[k] = c.cloneNode(true);
      });
    }
    function leading(m) {                        // <attributes> that precede the first note
      for (var n = m.firstElementChild; n; n = n.nextElementSibling) {
        if (n.tagName === 'note' || n.tagName === 'backup' || n.tagName === 'forward') return null;
        if (n.tagName === 'attributes') return n;
      }
      return null;
    }
    for (var i = 0; i < firstIndex; i++) {
      Array.prototype.forEach.call(measures[i].getElementsByTagName('attributes'), absorb);
    }
    var own = leading(target);
    if (own) { absorb(own); target.removeChild(own); }
    if (!order.length) return;
    var merged = doc.createElement('attributes');
    order.sort(function (a, b) {
      var ia = ATTR_ORDER.indexOf(a.split('|')[0]), ib = ATTR_ORDER.indexOf(b.split('|')[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    }).forEach(function (k) { merged.appendChild(state[k]); });
    target.insertBefore(merged, target.firstChild);
  }

  
  function sliceMeasures(xmlText, from, to) {
    var doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('The score is not valid MusicXML.');
    var parts = Array.prototype.slice.call(doc.getElementsByTagName('part'));
    var found = false;

    parts.forEach(function (part) {
      var measures = Array.prototype.slice.call(part.getElementsByTagName('measure'))
        .filter(function (m) { return m.parentNode === part; });
      var picked = [];
      var firstIndex = -1;
      measures.forEach(function (m, i) {
        var n = parseInt(String(m.getAttribute('number')).replace(/[^\-0-9]/g, ''), 10);
        if (!isNaN(n) && n >= from && n <= to) {
          if (firstIndex < 0) firstIndex = i;
          picked.push(m.cloneNode(true));
        }
      });
      if (!picked.length) return;
      found = true;



      carryAttributes(doc, measures, firstIndex, picked[0]);
      measures.forEach(function (m) { part.removeChild(m); });
      picked.forEach(function (m) { part.appendChild(m); });
    });

    if (!found) {
      throw new Error(from === to
        ? ('Bar ' + from + ' was not found in the score.')
        : ('Bars ' + from + '–' + to + ' were not found in the score.'));
    }
    return new XMLSerializer().serializeToString(doc);
  }

  function render(container, xmlText) {
    container.innerHTML = '';
    var osmd = new global.opensheetmusicdisplay.OpenSheetMusicDisplay(container, {
      autoResize: false,
      backend: 'svg',
      drawTitle: false,
      drawComposer: false,
      drawLyricist: false,
      drawPartNames: false,
      drawingParameters: 'compacttight'
    });
    return osmd.load(xmlText).then(function () { osmd.render(); });
  }

  

  var el = {};
  var state = { row: null, piece: null, corpus: null, corpusId: '',
              basis: 'onset', scope: 'measure', open: false, pushed: false };
  var navigate = null;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function buildOverlay() {
    var d = document.createElement('div');
    d.className = 'backdrop';
    d.hidden = true;
    d.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="rnvTitle">' +
        '<div class="head">' +
          '<div><h3 id="rnvTitle"></h3><div class="meta" id="rnvMeta"></div></div>' +
          '<button class="close" id="rnvClose" title="Close (Esc)" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="rnrow" id="rnvChips"></div>' +
        '<div class="controls">' +
          '<div class="seg" id="rnvScope">' +
            '<button data-scope="measure" aria-pressed="true">This bar</button>' +
            '<button data-scope="context" aria-pressed="false">± 1 bar</button>' +
            '<button data-scope="full" aria-pressed="false">Whole work</button>' +
          '</div>' +
          '<button class="btn" id="rnvPrev">&larr; Previous row</button>' +
          '<button class="btn" id="rnvNext">Next row &rarr;</button>' +
          '<span class="kbd">←/→ previous or next row</span>' +
        '</div>' +
        '<div class="body"><div class="score" id="rnvScore"></div></div>' +
        '<div class="hint" id="rnvHint"></div>' +
      '</div>';
    document.body.appendChild(d);
    el.back = d;
    el.title = d.querySelector('#rnvTitle');
    el.meta = d.querySelector('#rnvMeta');
    el.chips = d.querySelector('#rnvChips');
    el.score = d.querySelector('#rnvScore');
    el.hint = d.querySelector('#rnvHint');
    el.scope = d.querySelector('#rnvScope');

    d.querySelector('#rnvClose').addEventListener('click', function () { close(); });
    d.addEventListener('mousedown', function (e) { if (e.target === d) close(); });

    el.scope.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-scope]');
      if (!b) return;
      state.scope = b.dataset.scope;
      Array.prototype.forEach.call(el.scope.children, function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
      draw();
    });

    el.chips.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-engine]');
      if (btn) grade(Number(btn.dataset.engine), Number(btn.dataset.v));
    });

    var noteTimer = null;
    el.chips.addEventListener('input', function (e) {
      var box = e.target;
      if (!box.classList || !box.classList.contains('notebox')) return;
      var idx = Number(box.dataset.engine);
      clearTimeout(noteTimer);
      noteTimer = setTimeout(function () {
        var saved = global.RNVNotes.set(state.corpusId, state.corpus, state.row, idx, box.value);
        box.classList.toggle('filled', !!saved[idx]);
        global.dispatchEvent(new CustomEvent('rnv:note-changed', {
          detail: { rowId: state.row.id, engine: idx, text: saved[idx] }
        }));
      }, 350);
    });

    d.querySelector('#rnvPrev').addEventListener('click', function () { step(-1); });
    d.querySelector('#rnvNext').addEventListener('click', function () { step(1); });

    document.addEventListener('keydown', function (e) {
      if (!state.open) return;
      var typing = e.target && (e.target.tagName === 'TEXTAREA' ||
                                e.target.tagName === 'INPUT');
      if (typing) {
        if (e.key === 'Escape') e.target.blur();   // leave the field, keep the score open
        return;
      }
      var k = e.key.toLowerCase();
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowRight') { step(1); return; }
      if (e.key === 'ArrowLeft') { step(-1); return; }
      var correct = ['1', '2', '3'].indexOf(k);
      if (correct >= 0) { e.preventDefault(); grade(correct, 1); return; }
      var wrong = ['q', 'w', 'e'].indexOf(k);
      if (wrong >= 0) { e.preventDefault(); grade(wrong, 0); }
    });

    global.addEventListener('popstate', function () { if (state.open) close(true); });
  }

  function step(delta) {
    if (!navigate) return;
    var next = navigate(state.row, delta);
    if (next) open(next, navigate, { corpus: state.corpus, corpusId: state.corpusId });
  }

  function grade(engineIndex, value) {
    var row = state.row;
    if (!row || !row.raw[engineIndex]) return;      // no label, nothing to grade
    if (row.gradable && !row.gradable[engineIndex]) return;
    if (global.RNVGrades.locks(state.corpusId, row)[engineIndex]) return;   // identical row, fixed at 1
    var next = global.RNVGrades.set(state.corpusId, state.corpus, row, engineIndex, value);
    paintChips(next);
    global.dispatchEvent(new CustomEvent('rnv:grade-changed', {
      detail: { rowId: row.id, engine: engineIndex, value: next[engineIndex] }
    }));
  }

  var ENGINE_KEY = ['muswm', 'analysisgnn', 'augmentednet'];

  
  function evidence(i) {
    var row = state.row;
    if (!row || !row.diag) return '';
    var d = row.diag[ENGINE_KEY[i]];
    if (!d) {
      return row.dropped && row.dropped[i]
        ? '<div class="evidence"><span class="mismatch">The engine emitted here, but the ' +
          'aligned table dropped the label as identical to its previous one.</span></div>'
        : '';
    }

    var bits = [];
    if (d.rn && row.dropped && row.dropped[i]) {
      bits.push('<span class="mismatch">emitted <code>' + escapeHtml(d.rn) +
                '</code> here, dropped from the table as a repeat</span>');
    }
    if (d.pcSetNames) bits.push('built from <code>' + escapeHtml(d.pcSetNames) + '</code>');
    if (d.bass !== undefined && d.root !== undefined) {
      bits.push('bass <code>' + escapeHtml(d.bass) + '</code> root <code>' +
                escapeHtml(d.root) + '</code>');
    }

    if (d.localKeyName) bits.push('local key <code>' + escapeHtml(d.localKeyName) + '</code>');
    return bits.length ? '<div class="evidence">' + bits.join(' · ') + '</div>' : '';
  }

  function chip(i, name, cls, raw, norm, keyName, grades) {
    var row = state.row;
    var held = !!(row && row.carried && row.carried[i]);
    var excluded = held && state.basis === 'onset';

    var dropped = !!(row && row.dropped && row.dropped[i]);
    var value = raw
      ? escapeHtml(raw)
      : (dropped ? '<span style="opacity:.75">— dropped as a repeat</span>'
                 : '<span style="opacity:.6">— no label</span>');
    if (held) value += ' <span class="carried">held</span>';
    var extra = raw && norm && norm !== raw ? 'normalised: ' + escapeHtml(norm) : '';
    if (keyName) extra = (extra ? extra + ' · ' : '') + 'local key: ' + escapeHtml(keyName);
    if (held) {
      extra = (extra ? extra + ' · ' : '') +
        (excluded
          ? 'carried forward inside the bar — the engine did not emit here, so it is out of the comparison'
          : 'carried forward inside the bar — compared anyway on the sustained basis');
    }

    var ungradable = row && row.gradable && !row.gradable[i] && raw;
    var lockedHere = raw && row && global.RNVGrades.locks(state.corpusId, row)[i];
    var bookOn = global.RNVGrades.book && global.RNVGrades.book(state.corpusId);
    var bookG = bookOn && row ? global.RNVGrades.bookGrade(state.corpusId, row) : null;
    var buttons = (bookOn && raw)
      ? (bookG
          ? '<span class="grade big locked ' + (bookG[i] === 1 ? 'book1' : 'book0') + '"><b>' + bookG[i] + '</b> ' +
            (bookG[i] === 1 ? 'matches' : 'differs from') + ' the textbook label <b>' + escapeHtml(bookG[3]) +
            '</b> — locked</span>'
          : '<span class="grade big none">not compared — all three engines must emit here and the textbook must derive a label</span>')
      : ungradable
      ? '<span class="grade big none">' +
        (excluded ? 'not emitted here — grade it at its onset'
                  : 'this label starts on an earlier row — grade it there') + '</span>'
      : lockedHere
      ? '<span class="grade big locked" title="Counted as an automatic grade, kept apart from ' +
        'grades entered by hand."><b>1</b> correct — all three engines agree here, fixed</span>'
      : raw
      ? '<span class="grade big">' +
          '<button data-engine="' + i + '" data-v="1"' +
            (grades[i] === 1 ? ' class="g1 on"' : ' class="g1"') + '>1 correct</button>' +
          '<button data-engine="' + i + '" data-v="0"' +
            (grades[i] === 0 ? ' class="g0 on"' : ' class="g0"') + '>0 wrong</button>' +
        '</span>'
      : '<span class="grade big none">nothing to grade</span>';

    var noteBox = '';   // note boxes removed from Alignment and Disagreements

    return '<div class="rnbox ' + cls + '"><span>' + name + '</span>' +
           '<strong>' + value + '</strong>' +
           '<small>' + (extra || '&nbsp;') + '</small>' + buttons + evidence(i) +
           noteBox + '</div>';
  }

  function paintChips(grades) {
    var row = state.row;
    el.chips.innerHTML =
      chip(0, 'musWM', 'e-muswm', row.raw[0], row.norm[0], row.keys[0], grades) +
      chip(1, 'AnalysisGNN', 'e-gnn', row.raw[1], row.norm[1], row.keys[1], grades) +
      chip(2, 'AugmentedNet', 'e-anet', row.raw[2], row.norm[2], row.keys[2], grades);
  }

  function writtenMeasure(piece, reported) {
    var m = piece.map[String(reported)];
    return (m === undefined || m === null) ? reported : m;
  }

  function draw() {
    var row = state.row, piece = state.piece;
    var written = writtenMeasure(piece, row.measure);
    var from = written, to = written;
    if (state.scope === 'context') { from = written - 1; to = written + 1; }

    var mapNote = '';
    if (piece.mapMode === 'approx') {
      mapNote = ' · WARNING: reported bar ' + row.measure + ' → written bar ' + written +
                ' is approximate (repeat structure unresolved)';
    } else if (written !== row.measure) {
      mapNote = ' · reported bar ' + row.measure + ' is written bar ' + written +
                ' in the repeat expansion';
    }
    el.hint.textContent = 'Score: ' + piece.file +
      (piece.written ? ' · written bars ' + piece.written[0] + '–' + piece.written[1] : '') +
      ' · mapping: ' + piece.mapMode + mapNote;

    el.score.innerHTML = '<div class="placeholder">Loading score…</div>';
    loadScore(state.corpusId, piece.no).then(function (xml) {
      var text = (state.scope === 'full') ? xml : sliceMeasures(xml, from, to);
      return render(el.score, text);
    }).catch(function (err) {
      el.score.innerHTML = '<div class="placeholder">' +
        escapeHtml(err.message || String(err)) + '</div>';
    });
  }

  function open(row, nav, ctx) {
    if (!el.back) buildOverlay();
    navigate = nav || navigate;
    if (ctx) {
      state.corpus = ctx.corpus;
      state.corpusId = ctx.corpusId;
      state.basis = ctx.basis || state.basis;
    }
    state.row = row;
    state.piece = state.corpus.pieces[row.piece];
    var piece = state.piece;

    el.title.textContent = piece.no + ' · ' + global.RNVData.pretty(piece.title);
    el.meta.textContent = 'Reported bar ' + row.measure + ' · beat ' + row.beat +
      (piece.key ? ' · corpus key ' + piece.key : '') +
      ' · written bar ' + writtenMeasure(piece, row.measure);

    paintChips(global.RNVGrades.get(state.corpusId, state.corpus, row));

    if (!state.open) {
      state.open = true;
      el.back.hidden = false;
      document.body.style.overflow = 'hidden';


      try {
        history.pushState({ rnv: true }, '', location.href);
        state.pushed = true;
      } catch (e) {
        state.pushed = false;
      }
    }
    draw();
  }

  function close(fromPop) {
    if (!state.open) return;
    state.open = false;
    el.back.hidden = true;
    document.body.style.overflow = '';
    if (!fromPop && state.pushed && history.state && history.state.rnv) {
      state.pushed = false;
      try { history.back(); } catch (e) {  }
    }
  }

  global.RNVScore = { open: open, close: close, loadScore: loadScore, sliceMeasures: sliceMeasures };
})(window);
