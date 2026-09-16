
(function (global) {
  'use strict';

  var URL_ = 'https://atwkiqqtsfmxzkffcjxz.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0d2tpcXF0c2ZteHprZmZjanh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk1NjU3MzQsImV4cCI6MjEwNTE0MTczNH0.2XuOPHeqSMC736fOmnL8q9KqEOW_nYz1m6v0cI8RJcw';
  var KEY = 'rnv.session';

  function readSession() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function writeSession(s) {
    try {
      if (s) {
        s.expires_at = s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600);
        localStorage.setItem(KEY, JSON.stringify(s));
      } else {
        localStorage.removeItem(KEY);
      }
    } catch (e) {}
    return s;
  }

  function call(path, opts, token) {
    opts = opts || {};
    var headers = { apikey: ANON, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    Object.keys(opts.headers || {}).forEach(function (k) { headers[k] = opts.headers[k]; });
    return fetch(URL_ + path, {
      method: opts.method || 'GET', headers: headers,
      body: opts.body == null ? undefined : JSON.stringify(opts.body)
    }).then(function (r) {
      return r.text().then(function (t) {
        var data = t ? JSON.parse(t) : null;
        if (!r.ok) {
          var msg = (data && (data.msg || data.message || data.error_description || data.error)) || ('HTTP ' + r.status);
          var err = new Error(msg);
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }

  
  function token() {
    var s = readSession();
    if (!s) return Promise.resolve(null);
    if (s.expires_at - 60 > Date.now() / 1000) return Promise.resolve(s.access_token);
    return call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token } })
      .then(function (fresh) { return writeSession(fresh).access_token; })
      .catch(function () { writeSession(null); return null; });
  }

  var Auth = {
    
    sendCode: function (email) {
      return call('/auth/v1/otp', { method: 'POST', body: { email: email, create_user: true } });
    },
    verifyCode: function (email, code) {
      return call('/auth/v1/verify', { method: 'POST', body: { type: 'email', email: email, token: code } })
        .then(writeSession);
    },
    signInWithPassword: function (email, password) {
      return call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: email, password: password } })
        .then(writeSession);
    },
    setPassword: function (password) {
      return token().then(function (t) {
        if (!t) throw new Error('Please sign in again.');
        return call('/auth/v1/user', { method: 'PUT', body: { password: password } }, t);
      });
    },
    signOut: function () {
      return token().then(function (t) {
        writeSession(null);
        if (t) return call('/auth/v1/logout', { method: 'POST' }, t).catch(function () {});
      });
    },
    user: function () {
      var s = readSession();
      return s && s.user ? s.user : null;
    },
    
    db: function (path, opts) {
      return token().then(function (t) {
        if (!t) throw new Error('Please sign in.');
        return call('/rest/v1/' + path, opts, t);
      });
    },
    profile: function () {
      var u = Auth.user();
      if (!u) return Promise.resolve(null);
      return Auth.db('profiles?id=eq.' + encodeURIComponent(u.id) + '&select=*').then(function (rows) {
        return rows && rows[0] ? rows[0] : { id: u.id, email: u.email, name: '', country: '', profession: '', education: '' };
      });
    },
    saveProfile: function (p) {
      var u = Auth.user();
      return Auth.db('profiles?on_conflict=id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: { id: u.id, email: u.email, name: p.name, country: p.country, profession: p.profession,
                education: p.education, updated_at: new Date().toISOString() }
      });
    },
    complete: function (p) {
      return !!(p && p.name && p.email && p.country && p.profession && p.education);
    },
    
    require: function () {
      return (Auth.user() ? token() : Promise.resolve(null)).then(function (t) {
        if (!t) return null;
        return Auth.profile();
      }).then(function (p) {
        if (Auth.complete(p)) return p;
        var here = location.pathname.split('/').pop() + location.search;
        location.href = 'account.html?next=' + encodeURIComponent(here || 'index.html');
        return null;
      }).catch(function () {
        location.href = 'account.html?next=' + encodeURIComponent(location.pathname.split('/').pop());
        return null;
      });
    }
  };

  global.RNVAuth = Auth;
})(window);
