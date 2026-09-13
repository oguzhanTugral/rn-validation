
(function (global) {
  'use strict';

  
  var PAGES = [
    ['hero.html', 'Home'],
    ['background.html', 'Background'],
    ['index.html', 'Summary'],
    ['theory.html', 'Theory'],
    ['same.html', 'Alignment'],
    ['different.html', 'Disagreements'],
    ['scoring.html', 'Ratings'],
    ['method.html', 'Method']
  ];

  var CORPUS_KEY = 'rnv.corpus';
  var MODE_KEY = 'rnv.mode';
  var BASIS_KEY = 'rnv.basis';
  var REPEAT_KEY = 'rnv.repeats';
  var packs = {};
  var waiting = {};

  global.__RNV_CORPUS__ = function (id, payload) {
    packs[id] = payload;
    (waiting[id] || []).forEach(function (fn) { fn(payload); });
    delete waiting[id];
  };

  function store(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
  function read(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  
  function pretty(title) {
    return String(title).replace(/^\d+_/, '').replace(/_+/g, ' ').trim();
  }

  
  function currentMode() { return 'normal'; }
  function setMode(m) { store(MODE_KEY, 'normal'); }

  
  function currentBasis() { return 'onset'; }
  function setBasis(b) { store(BASIS_KEY, 'onset'); }

  
  function currentRepeats() { return 'hide'; }
  function setRepeats(v) { store(REPEAT_KEY, 'hide'); }

  function corpusList() { return global.RNV_CORPORA || []; }

  function currentCorpusId() {
    var list = corpusList();
    if (!list.length) return null;
    var qs = new URLSearchParams(location.search).get('corpus');
    var saved = read(CORPUS_KEY);
    var ids = list.map(function (c) { return c.id; });
    if (qs && ids.indexOf(qs) >= 0) return qs;
    if (saved && ids.indexOf(saved) >= 0) return saved;
    return ids[0];
  }

  
  var books = {};
  global.__RNV_BOOK__ = function (id, payload) { books[id] = payload; };

  function loadBook(id, pack) {
    return new Promise(function (resolve) {
      if (pack.book !== undefined) { resolve(pack); return; }
      var s = document.createElement('script');
      s.src = 'data/corpora/' + id + '/book.js';
      var done = function () {
        pack.book = books[id] || null;
        if (pack.book && global.RNVGrades && global.RNVGrades.attachBook) {
          global.RNVGrades.attachBook(id, pack);
        }
        resolve(pack);
      };
      s.onload = done;
      s.onerror = done;
      document.head.appendChild(s);
    });
  }

  function loadCorpus(id) {
    return new Promise(function (resolve, reject) {
      if (packs[id]) { resolve(packs[id]); return; }
      if (waiting[id]) { waiting[id].push(resolve); return; }
      waiting[id] = [resolve];
      var s = document.createElement('script');
      s.src = 'data/corpora/' + id + '/rows.js';
      s.onerror = function () {
        delete waiting[id];
        reject(new Error('Could not load data/corpora/' + id + '/rows.js'));
      };
      document.head.appendChild(s);
    }).then(function (pack) { return loadBook(id, pack); });
  }

  function navLinks(active) {
    return PAGES.map(function (it) {
      return '<a href="' + it[0] + '"' + (it[0] === active ? ' aria-current="page"' : '') +
             '>' + it[1] + '</a>';
    }).join('');
  }

  function chrome(active, title, corpus) {
    var list = corpusList();


    var currentId = corpus ? corpus.id : currentCorpusId();
    var entry = list.filter(function (c) { return c.id === currentId; })[0] || null;
    var options = list.map(function (c) {
      return '<option value="' + esc(c.id) + '"' + (c.id === currentId ? ' selected' : '') +
             '>' + esc(c.name) + ' — ' + c.works + ' works</option>';
    }).join('');

    document.body.insertAdjacentHTML('afterbegin',
      '<header class="site"><div class="wrap">' +
        '<div class="brand">' +
          '<a class="logo" href="hero.html" aria-label="musWM home"><img src="assets/brand/muswm-mark-3d.svg" alt="" width="40" height="24"></a>' +
          '<h1>Roman numeral validation — musWM · AnalysisGNN · AugmentedNet</h1>' +
          '<span class="sub" id="rnvCorpusMeta"></span>' +
          (list.length > 1
            ? '<select id="rnvCorpusPick" class="corpus-pick" aria-label="Corpus">' + options + '</select>'
            : '') +
        '</div>' +
        '<nav class="site">' + navLinks(active) + '</nav>' +
      '</div></header>');

    document.title = title + ' · RN validation';

    var nfm = function (x) { return Number(x).toLocaleString('en-US'); };
    var metaName = corpus ? corpus.name : (entry && entry.name);
    var metaWorks = corpus ? corpus.pieces.length : (entry && entry.works);
    var metaRows = corpus ? corpus.rows.length : (entry && entry.rows);
    if (metaWorks != null) {
      document.getElementById('rnvCorpusMeta').textContent =
        (list.length > 1 ? '' : (metaName ? metaName + ' · ' : '')) +
        metaWorks + ' works · ' + nfm(metaRows) + ' rows';
    }
    var pick = document.getElementById('rnvCorpusPick');
    if (pick) {
      pick.addEventListener('change', function () {
        store(CORPUS_KEY, pick.value);
        var url = new URL(location.href);
        url.searchParams.delete('piece');
        url.searchParams.set('corpus', pick.value);
        location.href = url.toString();
      });
    }
    var head = document.querySelector('header.site');
    var sync = function () {
      document.documentElement.style.setProperty('--hdr', head.offsetHeight + 'px');
    };
    sync();
    window.addEventListener('resize', sync);
  }

  function footer(corpus) {
    if (!corpus) return;
    document.body.insertAdjacentHTML('beforeend',
      '<footer class="site"><div class="wrap">' +
      'built ' + esc(corpus.generated) + '</div></footer>');
  }


  
  function boot(opts) {
    var id = currentCorpusId();
    if (!id) {
      chrome(opts.page, opts.title, null);
      document.getElementById(opts.host).innerHTML =
        '<div class="empty">No corpus is installed yet. ' +
        '</div>';
      footer(null);
      return;
    }
    if (opts.needsCorpus === false) {
      chrome(opts.page, opts.title, null);
      opts.render(null);
      footer(null);
      return;
    }
    loadCorpus(id).then(function (corpus) {
      chrome(opts.page, opts.title, corpus);
      opts.render(corpus);
      footer(corpus);
    }).catch(function (err) {
      chrome(opts.page, opts.title, null);
      document.getElementById(opts.host).innerHTML =
        '<div class="empty">' + esc(err.message) + '</div>';
      footer(null);
    });
  }

  global.RNVData = {
    boot: boot,
    chrome: chrome,
    footer: footer,
    esc: esc,
    pretty: pretty,
    currentMode: currentMode,
    setMode: setMode,
    currentBasis: currentBasis,
    setBasis: setBasis,
    currentRepeats: currentRepeats,
    setRepeats: setRepeats,
    currentCorpusId: currentCorpusId,
    corpusList: corpusList,
    loadCorpus: loadCorpus
  };
})(window);
