/* Copyright (c) 2026 Oğuzhan Tuğral. All rights reserved. Source: https://oguzhantugral.github.io/rn-validation/hero.html */


function rnvSharedKeyTable(sk) {
  var F = sk.figures, a = F.all, s = F.shared, f = function (x) { return x == null ? '—' : x.toFixed(1) + '%'; };
  var nf = function (x) { return Number(x).toLocaleString('en-US'); };
  var row = function (label, x, y, cls) {
    return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + label + '</td><td class="num"><b>' + x + '</b></td><td class="num">' + y + '</td></tr>';
  };
  return '<div style="overflow-x:auto"><table><thead><tr><th></th><th class="num">Same local key<br><span class="dim">' +
    nf(s.positions) + ' positions · ' + s.works + ' works</span></th><th class="num">All positions<br><span class="dim">' +
    nf(a.positions) + ' positions · ' + a.works + ' works</span></th></tr></thead><tbody>' +
    row('All three Roman numerals identical', f(s.allThreeIdentical.pct), f(a.allThreeIdentical.pct)) +
    row('musWM &ndash; AnalysisGNN identical', f(s.pairwise['musWM-AnalysisGNN']), f(a.pairwise['musWM-AnalysisGNN'])) +
    row('musWM &ndash; AugmentedNet identical', f(s.pairwise['musWM-AugmentedNet']), f(a.pairwise['musWM-AugmentedNet'])) +
    row('AnalysisGNN &ndash; AugmentedNet identical', f(s.pairwise['AnalysisGNN-AugmentedNet']), f(a.pairwise['AnalysisGNN-AugmentedNet'])) +
    '</tbody></table></div>';
}
var RNV_SHARED_NOTE =
  'Restricting the comparison to positions where musWM, AnalysisGNN and AugmentedNet read the same local key (tonic and mode) ' +
  'removes key-finding differences, so what remains is a comparison of Roman-numeral analysis. This restriction was chosen ' +
  'after the first results were seen (exploratory), and positions where three analysers agree on the key are likely to be ' +
  'stable passages; the figures describe those positions, not the whole corpus, and the all-positions figures stay beside ' +
  'them. Both columns count only positions where all three emit a label, so the pairwise rates differ from the pairwise table below, which counts every position two engines share. Identity uses the published spelling normalisation, with a triad and a seventh on the same bass counted as equal. ' +
  'This table counts agreement only. How often each analyser is right is decided by a person on the ' +
  '<a href="review.html">Blind review</a> page, and those are the figures this site reports.';
