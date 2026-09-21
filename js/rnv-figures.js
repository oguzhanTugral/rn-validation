/* Copyright (c) 2026 Oğuzhan Tuğral. All rights reserved. Source: https://oguzhantugral.github.io/rn-validation/hero.html */

(function (global) {
  'use strict';
  var KEY = 'rnv.figures.source';
  var ENG = ['musWM', 'AnalysisGNN', 'AugmentedNet'];
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

  
  function collect() {
    var id = corpusId();
    var options = fetch('data/corpora/' + encodeURIComponent(id) + '/rn_options.json')
      .then(function (r) { return r.json(); }).then(function (d) { return d.options || d; })
      .catch(function () { return null; });
    var published = fetch('data/corpora/' + encodeURIComponent(id) + '/blind_results.json')
      .then(function (r) { return r.json(); }).catch(function () { return null; });
    var live = (global.RNVAuth && RNVAuth.publicAnswers)
      ? RNVAuth.publicAnswers().catch(function () { return []; })
      : Promise.resolve([]);

    return Promise.all([options, published, live]).then(function (all) {
      var opts = all[0], pub = all[1], rows = all[2] || [];
      var authors = [], pooledRows = [];
      rows.forEach(function (r) {
        if (r.author_of) authors.push(r); else pooledRows.push(r.rows || {});
      });
      var out = { pooled: null, authors: [], published: null };
      if (opts && global.RNVRnScore) {
        var t = RNVRnScore.score(pooledRows, opts);
        out.pooled = { id: '', label: 'All participants (pooled)', answered: t.n,
                       engines: ENG.map(function (e) {
                         return { name: e, correct: t.right[e], rate: t.n ? +(100 * t.right[e] / t.n).toFixed(1) : null };
                       }), participants: pooledRows.length };
        out.authors = authors.map(function (r) {
          var s = RNVRnScore.score([r.rows || {}], opts);
          return { id: 'live:' + r.participant, label: r.participant + ' — author of ' + r.author_of,
                   answered: s.n, engines: ENG.map(function (e) {
                     return { name: e, correct: s.right[e], rate: s.n ? +(100 * s.right[e] / s.n).toFixed(1) : null };
                   }) };
        });
      }
      out.authors = out.authors.filter(function (a, i, list) {
        return list.findIndex(function (b) { return b.label === a.label; }) === i;   // one row per author
      });
      if (pub && pub.engines) {
        out.published = { id: 'published', answered: pub.answered, positions: pub.positions,
                          unclear: pub.unclear, engines: pub.engines,
                          label: (pub.rater || 'The author') + ' — author of ' + (pub.raterIsAuthor || 'musWM') +
                                 ' (published rating)' };
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
      if (data.published && want === 'published') return data.published;
    }
    return data.pooled && data.pooled.answered ? data.pooled : (data.pooled || data.published);
  }

  function bars(host, entry) {
    if (!host) return;
    if (!entry || !entry.answered) {
      host.innerHTML = '<div class="empty">No rating to report yet. Tick an author below, or rate the ' +
        'sample yourself on <a href="review.html">Blind review</a>.</div>';
      return;
    }
    host.innerHTML = entry.engines.map(function (e) {
      var pc = e.rate == null ? 0 : e.rate;
      return '<div class="eng"><span class="nm" style="color:' + COLOR[e.name] + '">' + e.name + '</span>' +
        '<div class="track"><div class="fill" data-w="' + pc + '" style="background:' + COLOR[e.name] + '"></div></div>' +
        '<span class="pc">' + (e.rate == null ? '—' : String(e.rate).replace('.', ',') + '%') + '</span></div>';
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
      text = '<b>' + entry.answered.toLocaleString('en-US') + '</b> answered positions, pooled from ' +
        entry.participants + ' participant' + (entry.participants === 1 ? '' : 's') +
        ' who are not an author of one of the analysers.';
    } else if (pooled) {
      text = 'No participant outside the analysers&rsquo; authors has rated the sample yet, so there are no ' +
        'pooled figures. An author&rsquo;s own rating can be shown with the tick below.';
    } else if (entry) {
      text = '<b>' + entry.answered.toLocaleString('en-US') + '</b> answered positions from a single rating, by <b>' +
        entry.label + '</b>. An author&rsquo;s rating is never part of the pooled figures.';
    }
    host.innerHTML = text + ' At each position the rater ticked every Roman numeral they accept; an analyser ' +
      'counts as right when a label it gave is among them. Rate the sample yourself on ' +
      '<a href="review.html">Blind review</a>, and see every participant on <a href="compare.html">Compare</a>.';
  }

  function picker(host, data, onChange) {
    if (!host) return;
    var want = chosen();
    var items = (data.published ? [data.published] : []).concat(data.authors);
    if (!items.length) { host.innerHTML = ''; return; }
    host.innerHTML = '<div class="figsrc"><span class="figsrc-lab">Figures shown:</span> ' +
      '<label><input type="checkbox" data-id="" ' + (want ? '' : 'checked') + '> Pooled participants</label>' +
      items.map(function (a) {
        return '<label><input type="checkbox" data-id="' + a.id + '"' + (want === a.id ? ' checked' : '') + '> ' +
          (a.label || a.id) + '</label>';
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
