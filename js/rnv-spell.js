/* Copyright (c) 2026 Oğuzhan Tuğral. All rights reserved. Source: https://oguzhantugral.github.io/rn-validation/hero.html */

(function (global) {
  'use strict';

  var LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  var STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];

  function pcOf(name) {
    var m = /^([A-G])(#*|b*)$/.exec(String(name || '').trim());
    return m ? (STEP[m[1]] + (m[2][0] === '#' ? m[2].length : -m[2].length) + 120) % 12 : null;
  }
  function nameOf(letter, alter) {
    return letter + (alter > 0 ? new Array(alter + 1).join('#') : new Array(-alter + 1).join('b'));
  }
  function alterFor(letter, pc) {
    var a = ((pc - STEP[letter]) % 12 + 12) % 12;
    return a > 6 ? a - 12 : a;
  }

  var CHROMATIC = {
    major: { 1: [0, 1], 3: [2, -1], 6: [3, 1], 8: [5, -1], 10: [6, -1] },
    minor: { 1: [1, -1], 4: [2, 1], 6: [3, 1] }
  };

  function buildKey(letter, tonicPc, minor) {
    var li = LETTERS.indexOf(letter), names = {}, scale = {}, degrees = [], ok = true;
    (minor ? MINOR : MAJOR).forEach(function (iv, k) {
      var L = LETTERS[(li + k) % 7], pc = (tonicPc + iv) % 12, a = alterFor(L, pc);
      if (Math.abs(a) > 1) ok = false;
      names[pc] = nameOf(L, a);
      scale[pc] = true;
      degrees.push([L, a]);
      if (minor && (k === 5 || k === 6)) { names[(pc + 1) % 12] = nameOf(L, a + 1); scale[(pc + 1) % 12] = true; }   // raised 6th and 7th
    });
    Object.keys(CHROMATIC[minor ? 'minor' : 'major']).forEach(function (d) {
      var pc = (tonicPc + Number(d)) % 12, spec = CHROMATIC[minor ? 'minor' : 'major'][d], deg = degrees[spec[0]];
      if (names[pc]) return;
      var alter = deg[1] + spec[1];
      if (Math.abs(alter) > 1) {                                   // e.g. B-double-flat: use the plain enharmonic
        var best = LETTERS.map(function (L) { return [L, alterFor(L, pc)]; })
          .sort(function (x, y) { return Math.abs(x[1]) - Math.abs(y[1]); })[0];
        names[pc] = nameOf(best[0], best[1]);
      } else {
        names[pc] = nameOf(deg[0], alter);
      }
    });
    return ok ? { names: names, scale: scale } : null;
  }

  
  function keyContext(localKey) {
    var m = /^\s*([A-G])(#|b)?\s+(major|minor)/i.exec(String(localKey || ''));
    if (!m) return null;
    var tonicPc = (STEP[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
    var minor = m[3].toLowerCase() === 'minor';

    var ctx = buildKey(m[1], tonicPc, minor);
    if (!ctx) {
      var li = LETTERS.indexOf(m[1]);
      ctx = buildKey(LETTERS[(li + (m[2] === 'b' ? 6 : 1)) % 7], tonicPc, minor) || buildKey(m[1], tonicPc, minor);
    }
    return ctx;
  }

  function byKey(pc, ctx) { return ctx.names[pc]; }

  
  function respell(notes, root, bass, localKey) {
    var ctx = keyContext(localKey);
    var list = String(notes || '').split(' - ').map(function (x) { return x.trim(); }).filter(Boolean);
    var pcs = list.map(pcOf);
    if (!ctx || pcs.some(function (p) { return p == null; })) return { notes: notes, root: root, bass: bass };
    var rootPc = pcOf(root), out = {};
    var acc = function (name) { return name.length - 1; };
    function spellFrom(rootName) {
      var o = {}, rl = LETTERS.indexOf(rootName[0]);
      var has = function (iv) { return pcs.indexOf((rootPc + iv) % 12) >= 0; };
      var dim7 = has(3) && has(6) && has(9);
      var STEPS = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 4, 9: dim7 ? 6 : 5, 10: 6, 11: 6 };
      var tertian = has(3) || has(4) || has(7);
      o[rootPc] = rootName;
      pcs.forEach(function (p) {
        if (p === rootPc) return;
        var key = byKey(p, ctx);
        if (ctx.scale[p] || !tertian) { o[p] = key; return; }       // scale notes keep their name
        var letter = LETTERS[(rl + STEPS[(p - rootPc + 12) % 12]) % 7], third = nameOf(letter, alterFor(letter, p));
        o[p] = acc(third) <= acc(key) ? third : key;                // never more complicated than the key
      });
      return o;
    }
    if (rootPc != null) {
      var choices = [byKey(rootPc, ctx)];
      if (!ctx.scale[rootPc]) {
        LETTERS.forEach(function (L) {
          var n = nameOf(L, alterFor(L, rootPc));
          if (acc(n) <= 1 && choices.indexOf(n) < 0) choices.push(n);
        });
      }
      var bestScore = Infinity;
      choices.forEach(function (rn) {
        var o = spellFrom(rn), score = 0;
        Object.keys(o).forEach(function (k) { score += acc(o[k]); });
        if (score < bestScore) { bestScore = score; out = o; }        // ties keep the key's own root name
      });
    }
    pcs.forEach(function (p) { if (!out[p]) out[p] = byKey(p, ctx); });
    var bassPc = pcOf(bass);
    return {
      notes: pcs.map(function (p) { return out[p]; }).join(' - '),
      root: rootPc == null ? root : out[rootPc],
      bass: bassPc == null ? bass : (out[bassPc] || byKey(bassPc, ctx))
    };
  }

  global.RNVSpell = { respell: respell, pcOf: pcOf, keyContext: keyContext };
})(typeof window !== 'undefined' ? window : globalThis);
