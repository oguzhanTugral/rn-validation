(function () {
  'use strict';
  var directoryPromise;
  var esc = function (v) { return RNVData.esc(String(v == null ? '' : v)); };
  var filter = function (v) { return encodeURIComponent(v); };
  function directory() {
    if (!directoryPromise) directoryPromise = RNVAuth.db('rpc/member_directory', {method: 'POST', body: {}})
      .catch(function (e) { directoryPromise = null; throw e; });
    return directoryPromise;
  }
  function nameOf(people, id) {
    var p = people.find(function (p) { return p.id === id; });
    return p ? (p.name || 'Unnamed participant') + (p.author_of ? ' — author of ' + p.author_of : '') : 'Participant';
  }
  function canonical(v) {
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canonical(v[k]); }).join(',') + '}';
    return JSON.stringify(v);
  }
  var generation = 0;
  window.RNVCommunity = {
    close: function () { generation++; var p = document.getElementById('rnFeedback'); if (p) p.hidden = true; },
    feedback: function (entry, position) {
      var panel = document.getElementById('rnFeedback');
      if (!panel) {
        panel = document.createElement('section'); panel.id = 'rnFeedback'; panel.className = 'community-panel';
        document.getElementById('cmpDetails').appendChild(panel);
      }
      var request = ++generation, answer = entry.rows[position], user = RNVAuth.user();
      panel.hidden = false;
      if (!user || !entry.userId) { panel.innerHTML = '<a href="account.html?next=compare.html">Sign in to read ratings and comments.</a>'; return; }
      panel.textContent = 'Loading ratings and comments…';
      panel.scrollIntoView({behavior: 'smooth', block: 'start'});
      var path = 'rn_feedback?target_id=eq.' + filter(entry.userId) + '&sample=eq.' + filter(entry.sample) + '&position_id=eq.' + filter(position);
      function load() {
        return Promise.all([directory(), RNVAuth.db(path + '&order=updated_at.desc&limit=1000')]).then(function (result) {
          if (request !== generation) return;
          var people = result[0], feedback = result[1];
          var current = feedback.filter(function (f) { return canonical(f.answer_snapshot) === canonical(answer); });
          var scores = current.filter(function (f) { return f.stars != null; });
          var mine = current.find(function (f) { return f.reviewer_id === user.id; });
          var own = user.id === entry.userId;
          panel.innerHTML = '<h3 tabindex="-1">' + esc(entry.analyst) + ' · ' + esc(position) + '</h3>' +
            '<p>RN: ' + esc((answer.rn || []).join(' | ') || (answer.rnU ? 'Unclear' : answer.rnNone || 'None')) + '</p>' +
            '<p>' + (scores.length ? (scores.reduce(function (sum, f) { return sum + f.stars; }, 0) / scores.length).toFixed(1) + ' / 5 ★ · ' + scores.length + ' ratings' : 'No star ratings yet.') +
            ' These ratings do not affect the pooled analyser scores.</p>' +
            '<p>Ratings and comments are visible to signed-in participants only.</p>' +
            (feedback.length !== current.length ? '<p>Feedback on an earlier version of this answer is excluded.</p>' : '') +
            (feedback.length === 1000 ? '<p>Showing the latest 1,000 reviews; the average covers this list.</p>' : '') +
            '<div class="feedback-list">' + current.map(function (f) {
              return '<article><b>' + esc(nameOf(people, f.reviewer_id)) + '</b> ' + (f.stars == null ? '' : '★'.repeat(f.stars) + ' (' + f.stars + '/5)') +
                '<p class="community-text">' + esc(f.comment) + '</p><small>' + esc(new Date(f.updated_at).toLocaleString()) + '</small></article>';
            }).join('') + '</div><form id="feedbackForm">' +
            (own ? '<p>You can comment on your own answer, but cannot rate it.</p>' : '<fieldset><legend>Your rating</legend>' +
              [1,2,3,4,5].map(function (n) { return '<label class="star-choice"><input type="radio" name="stars" value="' + n + '"' + (mine && mine.stars === n ? ' checked' : '') + '> ' + '★'.repeat(n) + '</label>'; }).join('') +
              '<label><input type="radio" name="stars" value=""' + (!mine || mine.stars == null ? ' checked' : '') + '> Comment only</label></fieldset>') +
            '<label for="feedbackComment">Your comment for this row (up to 2,000 characters)</label><textarea id="feedbackComment" maxlength="2000" rows="3">' + esc(mine ? mine.comment : '') + '</textarea>' +
            '<button type="submit">' + (mine ? 'Update' : 'Save') + ' feedback</button><p role="status" id="feedbackStatus"></p></form>';
          panel.querySelector('h3').focus();
          panel.querySelector('form').addEventListener('submit', function (event) {
            event.preventDefault();
            var selected = panel.querySelector('input[name="stars"]:checked');
            var stars = selected && selected.value ? Number(selected.value) : null;
            var comment = panel.querySelector('textarea').value.trim();
            var status = panel.querySelector('#feedbackStatus'), button = panel.querySelector('button');
            if (stars === null && !comment) { status.textContent = 'Choose a rating or write a comment.'; return; }
            button.disabled = true; status.textContent = 'Saving…';
            RNVAuth.db('rn_feedback?on_conflict=target_id,sample,position_id,reviewer_id', {
              method: 'POST', headers: {Prefer: 'resolution=merge-duplicates'}, body: {
                target_id: entry.userId, sample: entry.sample, position_id: position, reviewer_id: user.id,
                stars: stars, comment: comment, answer_snapshot: answer
              }
            }).then(function () { return load(); }).then(function () {
              if (request === generation) panel.querySelector('#feedbackStatus').textContent = 'Feedback saved.';
            }).catch(function (e) { status.textContent = e.message; button.disabled = false; });
          });
        });
      }
      load().catch(function (e) { if (request === generation) panel.textContent = e.message; });
    },
    messages: function () {
      var host = document.getElementById('messagesHost');
      RNVAuth.require().then(function (profile) {
        if (!profile) return;
        return directory().then(function (people) {
          var contacts = people.filter(function (p) { return p.id !== profile.id; });
          host.innerHTML = '<label for="messageRecipient">Participant</label><select id="messageRecipient"><option value="">Choose a participant</option>' + contacts.map(function (p) {
            return '<option value="' + esc(p.id) + '">' + esc(nameOf(people, p.id)) + '</option>';
          }).join('') + '</select><button id="messageRefresh" type="button">Refresh conversation</button>' +
            '<div id="messageInbox"></div><p id="messageStatus" role="status"></p><button id="messageOlder" hidden type="button">Load older messages</button><div id="messageThread" aria-live="polite"></div>' +
            '<form id="messageForm" hidden><label for="messageBody">Private message (up to 4,000 characters)</label><textarea id="messageBody" maxlength="4000" rows="4" required></textarea><button type="submit">Send message</button></form>';
          var select = host.querySelector('select'), status = host.querySelector('#messageStatus'), thread = host.querySelector('#messageThread');
          var form = host.querySelector('form'), older = host.querySelector('#messageOlder'), body = host.querySelector('textarea');
          var records = [], peer = '', version = 0, loading = false;
          if (!contacts.length) status.textContent = 'No other participants yet.';
          function inbox() {
            return RNVAuth.db('direct_messages?select=sender_id,recipient_id,created_at&order=created_at.desc,id.desc&limit=100').then(function (rows) {
              var seen = {};
              host.querySelector('#messageInbox').innerHTML = '<h3>Recent conversations</h3>' + rows.filter(function (m) {
                var id = m.sender_id === profile.id ? m.recipient_id : m.sender_id;
                if (seen[id]) return false; seen[id] = true; return true;
              }).map(function (m) {
                var id = m.sender_id === profile.id ? m.recipient_id : m.sender_id;
                return '<button type="button" data-peer="' + esc(id) + '">' + esc(nameOf(people, id)) + '</button>';
              }).join('');
            }).catch(function (e) { status.textContent = e.message; });
          }
          host.querySelector('#messageInbox').onclick = function (event) {
            var button = event.target.closest('button[data-peer]');
            if (button) { select.value = button.dataset.peer; select.dispatchEvent(new Event('change')); }
          };
          inbox();
          function render() {
            thread.innerHTML = records.slice().reverse().map(function (m) {
              return '<article class="message ' + (m.sender_id === profile.id ? 'mine' : '') + '"><b>' + esc(m.sender_id === profile.id ? 'You' : nameOf(people,m.sender_id)) + '</b><p class="community-text">' + esc(m.body) + '</p><small>' + esc(new Date(m.created_at).toLocaleString()) + '</small></article>';
            }).join('') || '<p>No messages yet. Start the conversation below.</p>';
          }
          function load(more) {
            if (!peer || loading) return Promise.resolve();
            var current = version; loading = true;
            var path = 'direct_messages?or=(and(sender_id.eq.' + profile.id + ',recipient_id.eq.' + peer + '),and(sender_id.eq.' + peer + ',recipient_id.eq.' + profile.id + '))&order=created_at.desc,id.desc&limit=50';
            if (more && records.length) {
              var last = records[records.length - 1];
              path += '&and=(or(created_at.lt.' + filter(last.created_at) + ',and(created_at.eq.' + filter(last.created_at) + ',id.lt.' + last.id + ')))';
            }
            return RNVAuth.db(path).then(function (rows) {
              if (current !== version) return;
              records = more ? records.concat(rows) : rows; older.hidden = rows.length < 50;
              render(); status.textContent = 'Only you and this participant can read this conversation.';
            }).catch(function (e) { if (current === version) status.textContent = e.message; }).finally(function () { if (current === version) loading = false; });
          }
          select.addEventListener('change', function () {
            if (body.value.trim() && !window.confirm('Discard the unsent draft and switch conversation?')) { select.value = peer; return; }
            peer = select.value; version++; loading = false; records = []; body.value = ''; thread.textContent = ''; older.hidden = true; form.hidden = !peer;
            status.textContent = peer ? 'Loading…' : 'Choose a participant.'; load(false);
          });
          host.querySelector('#messageRefresh').onclick = function () { inbox(); load(false); };
          older.onclick = function () { load(true); };
          form.addEventListener('submit', function (event) {
            event.preventDefault(); var text = body.value.trim(); if (!text || !peer) return;
            var recipient = peer, current = version, button = form.querySelector('button');
            button.disabled = true; select.disabled = true; status.textContent = 'Sending…';
            RNVAuth.db('direct_messages', {method: 'POST', body: {sender_id: profile.id, recipient_id: recipient, body: text}})
              .then(function () { inbox(); if (current === version) { body.value = ''; return load(false); } })
              .catch(function (e) { status.textContent = 'Message could not be confirmed. Refresh before retrying. ' + e.message; })
              .finally(function () { button.disabled = false; select.disabled = false; });
          });
          // Refresh explicitly; no background delivery or e-mail notifications.
          var requested = new URLSearchParams(location.search).get('to');
          if (contacts.some(function (p) { return p.id === requested; })) { select.value = requested; select.dispatchEvent(new Event('change')); }
        });
      }).catch(function (e) { host.textContent = e.message; });
    }
  };
}());
