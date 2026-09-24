// What the policies must refuse. Run: node tests/rls-reads.cjs  (needs @electric-sql/pglite)
//
// A: the administrator. B and C: ordinary members. The assertions are the promises the site makes:
// e-mail addresses are not readable across accounts, one rater cannot read another rater's answers
// before answering as much themselves, and the visit log takes no rows beyond the daily cap.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs'), assert = require('node:assert/strict');
const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const C = '00000000-0000-0000-0000-00000000000c';

const as = (db, id) => db.exec(
  `reset role; set role ${id ? 'authenticated' : 'anon'};` +
  ` select set_config('request.jwt.claim.sub', '${id || ''}', false)`);

(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table auth.users(id uuid primary key, email text);
    create table public.profiles(id uuid primary key references auth.users, email text not null,
      name text not null default '', country text not null default '', profession text not null default '',
      education text not null default '', author_of text);
    create table public.live_answers(user_id uuid primary key references public.profiles,
      sample text not null default 's', positions_rated int not null default 0,
      rn_answered int not null default 0, rows jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now());
    create table public.live_answers_main(like public.live_answers including all);
    alter table public.profiles enable row level security;
    alter table public.live_answers enable row level security;
    alter table public.live_answers_main enable row level security;
    create policy "profiles read" on public.profiles for select to authenticated using (true);
    create policy "live read" on public.live_answers for select to authenticated using (true);
    create policy "main read" on public.live_answers_main for select to authenticated using (true);
    grant select on public.profiles, public.live_answers, public.live_answers_main to authenticated;
    insert into auth.users values ('${A}', 'oguzhantugral@gmail.com'), ('${B}', 'b@example.test'), ('${C}', 'c@example.test');
    insert into public.profiles (id, email, name) values
      ('${A}', 'oguzhantugral@gmail.com', 'Admin'), ('${B}', 'b@example.test', 'Bee'), ('${C}', 'c@example.test', 'Cee');
    insert into public.live_answers (user_id, sample, positions_rated, rn_answered) values
      ('${B}', 's', 700, 700), ('${C}', 's', 10, 10);
    insert into public.live_answers_main (user_id, sample, positions_rated, rn_answered) values
      ('${B}', 's', 700, 700);`);

  // the two migrations under test (the second one also redefines member_answers())
  await db.exec(fs.readFileSync('supabase/migrations/20260925000000_admin_settings_and_visits.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20260925010000_tighten_reads.sql', 'utf8'));

  // ---- e-mail addresses are not readable across accounts
  await as(db, B);
  assert.equal((await db.query('select email from public.profiles')).rows.length, 1,
    'a member must see only their own profile row');
  assert.equal((await db.query('select email from public.profiles')).rows[0].email, 'b@example.test');

  await as(db, null);
  await assert.rejects(db.query('select * from public.profiles'), 'anon must not read profiles');

  // ---- answers are not readable across accounts
  await as(db, C);
  assert.equal((await db.query('select user_id from public.live_answers')).rows.length, 1,
    'a member must see only their own answers');
  assert.equal((await db.query('select user_id from public.live_answers_main')).rows.length, 0,
    'C has no main row, so C sees none');

  // ---- the administrator still sees everything
  await as(db, A);
  assert.equal((await db.query('select id from public.profiles')).rows.length, 3);
  assert.equal((await db.query('select user_id from public.live_answers')).rows.length, 2);

  // ---- member_answers(): no peeking before you have answered as much yourself
  await as(db, C);                                        // C answered 10 of the sample
  let seen = (await db.query('select * from public.member_answers()')).rows.map(r => r.member_answers);
  assert.deepEqual(seen.map(x => x.participant).sort(), ['Cee'],
    'C must not receive the answers of a rater who is further along');

  await as(db, B);                                        // B answered 700
  seen = (await db.query('select * from public.member_answers()')).rows.map(r => r.member_answers);
  assert.deepEqual(seen.map(x => x.participant).sort(), ['Bee', 'Cee'],
    'B has answered more than C, so B may compare with C');
  assert.ok(seen.every(x => !('email' in x)), 'member_answers() must never carry an e-mail address');

  // ---- the visit log takes rows, but not without end
  await as(db, null);
  await db.query(`insert into public.site_visits (path, ref_host, lang, tz) values ('hero.html', '', 'en', 'Europe/Istanbul')`);
  await as(db, A);                                        // anon may write the log but never read it
  assert.equal((await db.query('select count(*)::int as n from public.site_visits')).rows[0].n, 1,
    'an anonymous visit is recorded');
  await as(db, null);
  await assert.rejects(
    db.query(`insert into public.site_visits (path) values ('${'x'.repeat(200)}')`),
    'a path beyond the allowed length must be refused');
  await db.exec(`reset role`);
  await db.exec(`insert into public.site_visits (path)
                 select 'p.html' from generate_series(1, 49999)`);          // 50,000 with the one above
  await as(db, null);
  await assert.rejects(db.query(`insert into public.site_visits (path) values ('hero.html')`),
    'the daily cap must refuse the next row');

  // ---- pruning is the administrator's alone
  await as(db, B);
  await assert.rejects(db.query('select public.prune_visits(1)'), 'a member must not prune the log');
  await as(db, A);
  await db.query('select public.prune_visits(1)');

  await db.close();
  console.log('PASS: e-mails and answers are own-row only, admin unaffected, no peeking ahead, ' +
              'visit log bounded, pruning admin-only');
})();
