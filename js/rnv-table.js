
(function (global) {
  'use strict';

  var PAGE = 250;

  function esc(s) { return global.RNVData.esc(s); }
  function pretty(s) { return global.RNVData.pretty(s); }

  var REPEAT_NOTE = {
    hide: 'A repeated label is written once, where its run begins; later rows of the run are left blank. ' +
          'This affects presentation only, not classification.',
    show: 'Every row shows its label, including repeats of the row above.'
  };

  var BASIS_NOTE = {
    onset: 'Onset only: a label carried forward within its bar is shown but not compared, because the ' +
           'engine made no claim at that position.',
    sustained: 'Sustained: labels carried forward inside their bar are compared as if re-asserted ' +
               'at every beat. This inflates disagreement between engines that segment differently.'
  };

  var MODE_NOTE = {
    strict: 'Strict: raw labels must match character for character; only the key prefix is separated.',
    normal: 'Normalised: spelling variants are treated as equal (sub- and superscripts, °/o, ø/%, 42 = 2, Maj, (no5)), as are triad and seventh names over the same bass.',
    degree: 'Degree only: inversion and seventh ignored. Looser than musical equality — do not publish it as an agreement rate.'
  };

  
  function mount(opts) {
    var corpus = opts.corpus;
    var corpusId = corpus.id;
    var host = document.getElementById(opts.host);
    var mode = global.RNVData.currentMode();
    var onsetAware = global.RNV.hasOnsetInfo(corpus);
    var basis = onsetAware ? global.RNVData.currentBasis() : 'sustained';
    var hideRepeats = global.RNVData.currentRepeats() !== 'show';
    var rows = global.RNV.buildRows(corpus, mode, basis, hideRepeats);


    var keyAt = (function () {
      var out = new Array(corpus.rows.length), piece = null, last = '';
      for (var k = 0; k < corpus.rows.length; k++) {
        var cr = corpus.rows[k];
        if (cr[0] !== piece) { piece = cr[0]; last = ''; }
        var m = cr[7] && cr[7].muswm;
        if (m && m.localKeyName) last = m.localKeyName;
        out[k] = last;
      }
      return out;
    })();
    var view = [];
    var shown = 0;

    var pieceOptions = ['<option value="">All works (' + corpus.pieces.length + ')</option>']
      .concat(corpus.pieces.map(function (p) {
        return '<option value="' + p.i + '">' + esc(p.no + ' · ' + pretty(p.title)) + '</option>';
      })).join('');

    host.innerHTML =
      '<div class="toolbar">' +
        '<div class="field"><label for="fPiece">Work</label>' +
          '<select id="fPiece">' + pieceOptions + '</select></div>' +
        '<div class="field"><label for="fSearch">Search (label or work)</label>' +
          '<input id="fSearch" type="search" placeholder="e.g. V7 · Brahms · Cad64"></div>' +
        '<div class="field"><label>Comparison</label><div class="seg" id="fMode">' +
          '<button data-mode="normal">Normalised</button>' +
        '</div></div>' +
        '<div class="count" id="fCount"></div>' +
      '</div>' +
      '<p class="modenote" id="fModeNote"></p>' +
      '<div class="tablewrap"><table><thead><tr>' +
        '<th>Work</th><th>Bar</th><th>Beat</th>' +
        '<th>musWM</th><th>AnalysisGNN</th><th>AugmentedNet</th><th>Status</th>' +
      '</tr></thead><tbody id="fBody"></tbody></table>' +
      '<button class="more" id="fMore" hidden></button>' +
      '<div class="empty" id="fEmpty" hidden></div></div>';

    var elPiece = document.getElementById('fPiece');
    var elSearch = document.getElementById('fSearch');
    var elBody = document.getElementById('fBody');
    var elMore = document.getElementById('fMore');
    var elEmpty = document.getElementById('fEmpty');
    var elCount = document.getElementById('fCount');
    var elMode = document.getElementById('fMode');

    var ALIGN_NOTE = {
      window: 'Alignment: each musWM label sits at the beat where, by its own record, its analysis ' +
              'window begins. AnalysisGNN and AugmentedNet are used exactly as their adapters return ' +
              'them and are never moved.',
      beat: 'Alignment: labels sit at the beat each engine anchored them to, reproducing the RN ' +
            'tab and the benchmark workbooks. musWM can anchor a label earlier than the evidence ' +
            'it was built from.'
    };
    document.getElementById('fModeNote').innerHTML =
      esc(MODE_NOTE[mode]) + '<br>' + esc(BASIS_NOTE.onset) +
      '<br>' + esc(ALIGN_NOTE[corpus.alignment || 'beat']) +
      '<br>' + esc(REPEAT_NOTE.hide);

    var qsPiece = new URLSearchParams(location.search).get('piece');
    if (qsPiece !== null && corpus.pieces[Number(qsPiece)]) elPiece.value = qsPiece;

    Array.prototype.forEach.call(elMode.children, function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
      b.addEventListener('click', function () {
        global.RNVData.setMode(b.dataset.mode);
        location.reload();
      });
    });

    function gradesOf(row) {
      return global.RNVGrades.get(corpusId, corpus, row);
    }

    function passes(r) {
      if (!opts.match(r.status)) return false;
      if (elPiece.value !== '' && String(r.piece) !== elPiece.value) return false;
      var gf = '';
      if (gf) {
        var g = gradesOf(r);
        var any = g[0] !== null || g[1] !== null || g[2] !== null;
        if (gf === 'noted') return global.RNVNotes.has(corpusId, corpus, r);
        if (gf === 'graded' && !any) return false;
        if (gf === 'ungraded' && any) return false;
      }
      var q = elSearch.value.trim().toLowerCase();
      if (!q) return true;
      var p = corpus.pieces[r.piece];
      return (r.raw.join(' ') + ' ' + r.norm.join(' ') + ' ' + p.title + ' ' + p.no)
        .toLowerCase().indexOf(q) >= 0;
    }

    function noteCell(r, i, notes) {
      var v = notes[i];
      return '<input class="notebox' + (v ? ' filled' : '') + '" type="text" ' +
             'data-row="' + r.id + '" data-engine="' + i + '" ' +
             'placeholder="note / question…" value="' + esc(v) + '">';
    }

    function gradeCell(r, i, grades) {
      if (!r.raw[i]) return '<span class="grade none" title="No label to grade">—</span>';

      if (global.RNVGrades.book && global.RNVGrades.book(corpusId)) {
        var bg = global.RNVGrades.bookGrade(corpusId, r);
        if (!bg) {
          return '<span class="grade none" title="Not compared: all three engines must emit a label ' +
                 'at this onset and the textbook must derive one. See Ratings for the reasons.">not compared</span>';
        }
        return '<span class="grade locked ' + (bg[i] === 1 ? 'book1' : 'book0') + '" title="Locked textbook grade. ' +
               'Textbook label here: ' + esc(bg[3]) + '">' + '<b>' + bg[i] + '</b><span class="tb">textbook</span><span class="tl">' + esc(bg[3]) + '</span></span>';
      }
      if (!r.gradable[i]) {
        return '<span class="grade none" title="This label starts on an earlier row; grade it ' +
               'there. A run of the same label is one judgement.">at its first row</span>';
      }
      if (global.RNVGrades.locks(corpusId, r)[i]) {
        return '<span class="grade locked" title="All three engines produced the same figure ' +
               'here, so this cell is fixed at 1 and cannot be regraded. It is counted as an ' +
               'automatic grade, kept apart from grades entered by hand.">' +
               '<b>1</b> agreed</span>';
      }
      var v = grades[i];
      return '<span class="grade" data-row="' + r.id + '" data-engine="' + i + '">' +
        '<button class="g1' + (v === 1 ? ' on' : '') + '" data-v="1" title="Correct">1</button>' +
        '<button class="g0' + (v === 0 ? ' on' : '') + '" data-v="0" title="Wrong">0</button>' +
        '</span>';
    }

    function rowHtml(r) {
      var p = corpus.pieces[r.piece];
      var grades = gradesOf(r);
      var notes = global.RNVNotes.get(corpusId, corpus, r);
      var cells = [0, 1, 2].map(function (i) {
        var cls = ['e-muswm', 'e-gnn', 'e-anet'][i];
        if (!r.raw[i]) {
          var dropNote = r.dropped[i]
            ? '<span class="carried drop" title="The engine did emit a label at this onset, but ' +
              'the aligned table drops a label identical to the previous label from that engine. ' +
              'Open the ' +
              'score to see what it emitted.">emitted, dropped</span>'
            : '';
          return '<td class="eng"><span class="rn none">no label</span>' + dropNote +
                 '<span class="norm blank" aria-hidden="true">&nbsp;</span>' +
                 (opts.grading ? gradeCell(r, i, grades) : '') +
                 '' + '</td>';
        }
        if (hideRepeats && r.repeated[i]) {


          return '<td class="rep" title="Same as the row above; written and graded ' +
                 'where the run starts">' +
                 '' + '</td>';
        }
        var key = r.keys[i] ? '<span class="kk">' + esc(r.keys[i]) + ': </span>' : '';
        var label = global.RNV.splitKey(r.raw[i]).label;



        var norm = (mode !== 'strict' && r.norm[i] && r.norm[i] !== label)
          ? '<span class="norm">→ ' + esc(r.norm[i]) + '</span>'
          : '<span class="norm blank" aria-hidden="true">&nbsp;</span>';
        var carried = r.carried[i]
          ? '<span class="carried" title="' +
            (basis === 'onset'
              ? 'Carried forward inside the bar. The engine did not emit here, so this cell is excluded from the comparison.'
              : 'Carried forward inside the bar. The engine did not emit here, but the sustained basis compares it anyway.') +
            '">held</span>'
          : '';
        var out = (basis === 'onset' && r.carried[i]) ? ' out' : '';
        return '<td class="eng"><span class="rn ' + cls + out + '">' + key + esc(label) + '</span>' + carried + norm +
               (opts.grading ? gradeCell(r, i, grades) : '') +
               '' + '</td>';
      }).join('');

      var tag = { same: ['same', 'identical'], diff: ['diff', 'different'],
                  partial: ['partial', 'partial'], empty: ['partial', 'empty'] }[r.status];
      return '<tr class="clickable" tabindex="0" data-id="' + r.id + '">' +
        '<td class="work"><span class="t">' + esc(pretty(p.title)) + '</span>' +
        '<span class="m">' + p.no + (p.key ? ' · ' + esc(p.key) : '') + '</span>' +
        (keyAt[r.id] ? '<span class="m" title="Local key at this position, as musWM read it">' +
          'key: <b>' + esc(keyAt[r.id]) + '</b></span>' : '') + '</td>' +
        '<td class="num"><b>' + r.measure + '</b></td>' +
        '<td class="num">' + r.beat + '</td>' + cells +
        '<td><span class="tag ' + tag[0] + '">' + tag[1] + '</span></td></tr>';
    }

    function updateCount() {
      var s = opts.grading ? global.RNVGrades.stats(corpusId, corpus, view) : null;
      elCount.innerHTML = '<b>' + view.length.toLocaleString('en-US') + '</b> rows' +
        (view.length ? ' · ' + shown.toLocaleString('en-US') + ' shown' : '') +
        (s ? ' · graded ' + s.reduce(function (a, x) { return a + x.graded; }, 0) +
             ' / ' + s.reduce(function (a, x) { return a + x.labelled; }, 0) + ' cells' : '') +
        '';
    }

    function paint(reset) {
      if (reset) { view = rows.filter(passes); shown = 0; elBody.innerHTML = ''; }
      var slice = view.slice(shown, shown + PAGE);
      elBody.insertAdjacentHTML('beforeend', slice.map(rowHtml).join(''));
      shown += slice.length;
      elMore.hidden = shown >= view.length;
      elMore.textContent = 'Show more (' + (view.length - shown) + ' rows left)';
      elEmpty.hidden = view.length > 0;
      elEmpty.textContent = 'No rows match this filter.';
      updateCount();
    }

    function neighbour(row, delta) {
      var i = view.findIndex(function (x) { return x.id === row.id; });
      return i < 0 ? null : (view[i + delta] || null);
    }

    function openRow(id) {
      var r = rows[id];
      if (r) global.RNVScore.open(r, neighbour, { corpus: corpus, corpusId: corpusId, basis: basis });
    }

    elBody.addEventListener('click', function (e) {
      if (e.target.classList && e.target.classList.contains('notebox')) {
        e.stopPropagation();
        return;
      }
      var btn = e.target.closest('.grade button');
      if (btn) {
        e.stopPropagation();
        var holder = btn.parentNode;
        var r = rows[Number(holder.dataset.row)];
        var idx = Number(holder.dataset.engine);
        var next = global.RNVGrades.set(corpusId, corpus, r, idx, Number(btn.dataset.v));
        holder.querySelector('.g1').classList.toggle('on', next[idx] === 1);
        holder.querySelector('.g0').classList.toggle('on', next[idx] === 0);
        updateCount();
        return;
      }
      var tr = e.target.closest('tr[data-id]');
      if (tr) openRow(Number(tr.dataset.id));
    });

    elBody.addEventListener('keydown', function (e) {
      if (e.target.classList && e.target.classList.contains('notebox')) {
        e.stopPropagation();          // space and Enter belong to the text field
        return;
      }
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var tr = e.target.closest('tr[data-id]');
      if (tr) { e.preventDefault(); openRow(Number(tr.dataset.id)); }
    });

    var noteTimers = {};
    elBody.addEventListener('input', function (e) {
      var box = e.target;
      if (!box.classList || !box.classList.contains('notebox')) return;
      var id = Number(box.dataset.row), idx = Number(box.dataset.engine);
      var timerKey = id + ':' + idx;
      clearTimeout(noteTimers[timerKey]);
      noteTimers[timerKey] = setTimeout(function () {
        var saved = global.RNVNotes.set(corpusId, corpus, rows[id], idx, box.value);
        box.classList.toggle('filled', !!saved[idx]);
        updateCount();
        global.dispatchEvent(new CustomEvent('rnv:note-changed', {
          detail: { rowId: id, engine: idx, text: saved[idx] }
        }));
      }, 350);
    });

    elMore.addEventListener('click', function () { paint(false); });
    elPiece.addEventListener('change', function () { paint(true); });
    var t = null;
    elSearch.addEventListener('input', function () {
      clearTimeout(t); t = setTimeout(function () { paint(true); }, 160);
    });

    global.addEventListener('rnv:note-changed', function (ev) {
      var d = ev.detail;
      var box = elBody.querySelector(
        '.notebox[data-row="' + d.rowId + '"][data-engine="' + d.engine + '"]');
      if (box && box !== document.activeElement) {
        box.value = d.text;
        box.classList.toggle('filled', !!d.text);
      }
      updateCount();
    });

    global.addEventListener('rnv:grade-changed', function (ev) {
      var d = ev.detail;
      var holder = elBody.querySelector(
        '.grade[data-row="' + d.rowId + '"][data-engine="' + d.engine + '"]');
      if (holder) {
        holder.querySelector('.g1').classList.toggle('on', d.value === 1);
        holder.querySelector('.g0').classList.toggle('on', d.value === 0);
      }
      updateCount();
    });

    paint(true);
    return { rows: rows, mode: mode };
  }

  global.RNVTable = { mount: mount, esc: esc, pretty: pretty };
})(window);
