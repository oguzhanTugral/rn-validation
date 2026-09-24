/* Copyright (c) 2026 Oğuzhan Tuğral. All rights reserved. Source: https://oguzhantugral.github.io/rn-validation/hero.html */

(function (global) {
  'use strict';
  var URL_ = 'https://atwkiqqtsfmxzkffcjxz.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0d2tpcXF0c2ZteHprZmZjanh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NjU3MzQsImV4cCI6MjEwNTE0MTczNH0.2XuOPHeqSMC736fOmnL8q9KqEOW_nYz1m6v0cI8RJcw';

  function page() {
    var p = (location.pathname || '/').split('/').pop();
    return (p || 'index.html').slice(0, 120);
  }

  function refHost() {
    try {
      if (!document.referrer) return '';
      var h = new URL(document.referrer).hostname;
      return h === location.hostname ? '' : h.slice(0, 120);   // an internal link is not a referrer
    } catch (e) { return ''; }
  }

  function zone() {
    try { return (Intl.DateTimeFormat().resolvedOptions().timeZone || '').slice(0, 60); }
    catch (e) { return ''; }
  }

  function seenAlready(key) {
    try {
      if (sessionStorage.getItem(key)) return true;
      sessionStorage.setItem(key, '1');
      return false;
    } catch (e) {
      return false;   // no session storage: count it, rather than lose it
    }
  }

  function record() {
    var path = page();
    var day = new Date().toISOString().slice(0, 10);
    if (seenAlready('rnv.visit.' + day + '.' + path)) return;
    var body = JSON.stringify({
      path: path, ref_host: refHost(),
      lang: (navigator.language || '').slice(0, 20), tz: zone()
    });
    try {
      fetch(URL_ + '/rest/v1/site_visits', {
        method: 'POST', keepalive: true,
        headers: { apikey: ANON, Authorization: 'Bearer ' + ANON,
                   'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: body
      }).catch(function () {});
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', record);
  } else {
    record();
  }
  global.RNVVisits = { record: record };
})(typeof window !== 'undefined' ? window : globalThis);
