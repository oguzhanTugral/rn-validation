/* Copyright (c) 2026 Oğuzhan Tuğral. All rights reserved. Source: https://oguzhantugral.github.io/rn-validation/hero.html */

(function (global) {
  'use strict';
  var KEY = 'rnv.figures.source';
  var ENG = ['musWM', 'AnalysisGNN', 'AugmentedNet'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  var COLOR = { musWM: 'var(--muswm)', AnalysisGNN: 'var(--gnn)', AugmentedNet: 'var(--anet)' };

  function chosen() {
    try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
  }
  function choose(id) {
    try { id ? localStorage.setItem(KEY, id) : localStorage.removeItem(KEY); } catch (e) {}
  }

  function corpusId() {
    return (global.RNVData && RNVData.currentCorpusId && RNVData.currentCorpusId()) || 'wir335';
  }

  function entry(id, label, first, revised, extra) {
    var e = { id: id, label: label, answered: first.n, unclear: first.unclear,
              inconsistent: first.inconsistent, revised: first.revised,
              engines: ENG.map(function (name) {
                return { name: name, correct: first.right[name],
                         rate: first.n ? +(100 * first.right[name] / first.n).toFixed(1) : null };
              }),
              revisedEngines: revised && revised.n ? ENG.map(function (name) {
                return { name: name, correct: revised.right[name],
                         rate: +(100 * revised.right[name] / revised.n).toFixed(1) };
              }) : null,
              revisedAnswered: revised ? revised.n : 0 };
    return Object.assign(e, extra || {});
  }

  
  function collect() {
    var id = corpusId();
    var options = fetch('data/corpora/' + encodeURIComponent(id) + '/rn_options_main.json')
      .then(function (r) { return r.json(); }).then(function (d) { return d.options || d; })
      .catch(function () { return null; });
    var published = fetch('data/corpora/' + encodeURIComponent(id) + '/blind_results_main.json')
      .then(function (r) { return r.json(); }).catch(function () { return null; });
    var live = (global.RNVAuth && RNVAuth.publicAnswersMain)
      ? RNVAuth.publicAnswersMain().catch(function () { return []; })
      : Promise.resolve([]);

    return Promise.all([options, published, live]).then(function (all) {
      var opts = all[0], pub = all[1], rows = all[2] || [];
      var authors = [], pooledRows = [];
      rows.forEach(function (r) {
        if (r.author_of) authors.push(r); else pooledRows.push(r.rows || {});
      });
      var out = { pooled: null, authors: [], published: null };
      if (opts && global.RNVRnScore) {
        out.pooled = entry('', 'All participants (pooled)',
                           RNVRnScore.score(pooledRows, opts), RNVRnScore.scoreRevised(pooledRows, opts),
                           { participants: pooledRows.length });
        out.authors = authors.map(function (r, i) {
          var first = RNVRnScore.score([r.rows || {}], opts);
          return entry('live:' + r.participant + ':' + i, r.participant + ' — author of ' + r.author_of +
                       ' (' + first.n + ' position' + (first.n === 1 ? '' : 's') + ')',
                       first, RNVRnScore.scoreRevised([r.rows || {}], opts), { who: r.participant });
        });
      }


      out.authors = out.authors
        .filter(function (a) { return a.answered > 0; })
        .sort(function (a, b) { return b.answered - a.answered; })
        .filter(function (a, i, list) {
          return list.findIndex(function (b) { return b.who === a.who; }) === i;
        });

      if (pub && pub.engines) {
        out.published = { id: 'published', answered: pub.answered, positions: pub.positions,
                          unclear: pub.unclear, inconsistent: pub.inconsistent, revised: pub.revised,
                          engines: pub.engines, revisedEngines: pub.revisedEngines || null,
                          revisedAnswered: pub.revisedAnswered || 0,
                          label: (pub.rater || 'The author') + ' — author of ' + (pub.raterIsAuthor || 'musWM') + ' (published completed review)'  };
      }
      return out;
    });
  }

  
  function current(data) {
    var want = chosen();
    if (want === 'published' && data.published) return data.published;
    if (want) {
      var hit = data.authors.filter(function (a) { return a.id === want; })[0];
      if (hit) return hit;
    }

    if (data.pooled && data.pooled.answered) return data.pooled;
    return data.published || data.authors[0] || data.pooled;
  }

  function bars(host, entry) {
    if (!host) return;
    if (!entry || !entry.answered) {
      host.innerHTML = '<div class="empty">No rating to report yet. Tick an author below, or rate the ' +
        'sample yourself on <a href="blind.html">Blind review</a>.</div>';
      return;
    }
    host.innerHTML = entry.engines.map(function (e) {
      var pc = e.rate == null ? 0 : e.rate;
      return '<div class="eng"><span class="nm" style="color:' + COLOR[e.name] + '">' + e.name + '</span>' +
        '<div class="track"><div class="fill" data-w="' + pc + '" style="background:' + COLOR[e.name] + '"></div></div>' +
        '<span class="pc">' + (e.rate == null ? '—' : e.rate.toFixed(1).replace('.', ',') + '%') + '</span></div>';
    }).join('');
    requestAnimationFrame(function () {
      Array.prototype.forEach.call(host.querySelectorAll('.fill'), function (f) { f.style.width = f.dataset.w + '%'; });
    });
  }

  function note(host, entry, data) {
    if (!host) return;
    var pooled = entry === data.pooled;
    var text = '';
    if (pooled && entry && entry.answered) {
      text = '<b>' + entry.answered.toLocaleString('en-US') + '</b> counted positions, pooled from ' +
        entry.participants + ' participant' + (entry.participants === 1 ? '' : 's') +
        ' who are not an author of one of the analysers.';
    } else if (pooled) {
      text = 'No participant outside the analysers&rsquo; authors has rated the sample yet, so there are no ' +
        'pooled figures. An author&rsquo;s own rating can be shown with the tick below.';
    } else if (entry) {
      text = '<b>' + entry.answered.toLocaleString('en-US') + '</b> counted positions from a single rating, by <b>' +
        esc(entry.label) + '</b>. An author&rsquo;s rating is never part of the pooled figures.';
    }
    if (entry && entry.answered) {
      text += ' At each position the rater ticked every Roman numeral they accept; an analyser counts as accepted ' +
        'when a label it gave is among them. <b>What is reported is the answer given before the page revealed ' +
        'which analyser wrote which label.</b>';
      if (entry.revised) {
        text += ' ' + entry.revised + ' answer' + (entry.revised === 1 ? ' was' : 's were') +
          ' revised after that reveal; with the revisions instead of the first answers the rates are ' +
          (entry.revisedEngines || []).map(function (e) {
            return e.name + ' ' + e.rate.toFixed(1).replace('.', ',') + '%';
          }).join(', ') + ' of ' + entry.revisedAnswered + ' positions.';
      }
      var out = [];
      if (entry.unclear) out.push(entry.unclear + ' answered &ldquo;unclear&rdquo;');
      if (entry.inconsistent) out.push(entry.inconsistent + ' ticking labels and &ldquo;none of these&rdquo; at once');
      if (out.length) text += ' Left out of the count: ' + out.join(' and ') + '.';
      text += ' These are acceptance rates of one sample by the raters named here, not a measure of accuracy: ' +
        'the sample is drawn by musWM&rsquo;s own labels and the notes, root, bass and span shown are musWM&rsquo;s. ' +
        'See <a href="method.html">Method</a>, rate the sample yourself on <a href="blind.html">Blind review</a>, ' +
        'and see every participant on <a href="compare.html">Compare</a>.';
    }
    host.innerHTML = text;
  }

  function picker(host, data, onChange) {
    if (!host) return;
    var selected = current(data);
    var want = selected ? selected.id : '';
    var items = (data.published ? [data.published] : []).concat(data.authors);
    if (!items.length) { host.innerHTML = ''; return; }
    host.innerHTML = '<div class="figsrc"><span class="figsrc-lab">Figures shown:</span> ' +
      '<label><input type="checkbox" data-id="" ' + (want ? '' : 'checked') + '> Pooled participants</label>' +
      items.map(function (a) {
        return '<label><input type="checkbox" data-id="' + esc(a.id) + '"' + (want === a.id ? ' checked' : '') + '> ' +
          esc(a.label || a.id) + '</label>';
      }).join('') +
      '</div>';
    Array.prototype.forEach.call(host.querySelectorAll('input[type=checkbox]'), function (box) {
      box.addEventListener('change', function () {
        choose(box.checked ? box.dataset.id : '');
        onChange();
      });
    });
  }

  
  function render() {
    var host = document.getElementById('blindRows');
    var noteHost = document.getElementById('blindNote');
    var srcHost = document.getElementById('figSource');
    if (!host && !noteHost && !srcHost) return Promise.resolve(null);
    return collect().then(function (data) {
      function paint() {
        var entry = current(data);
        bars(host, entry);
        note(noteHost, entry, data);
        picker(srcHost, data, paint);
        if (typeof global.rnvFiguresPainted === 'function') global.rnvFiguresPainted(entry, data);
      }
      paint();
      return data;
    }).catch(function () {
      if (host) host.innerHTML = '<div class="empty">The figures could not be loaded.</div>';
      return null;
    });
  }

  global.RNVFigures = { render: render, collect: collect, current: current, chosen: chosen, choose: choose };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})(typeof window !== 'undefined' ? window : globalThis);
