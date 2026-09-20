// NODE_PATH=<directory containing jsdom and @electric-sql/pglite> node tests/community.cjs
const {PGlite} = require('@electric-sql/pglite');
const {JSDOM} = require('jsdom');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const A='00000000-0000-0000-0000-000000000001', B='00000000-0000-0000-0000-000000000002', C='00000000-0000-0000-0000-000000000003';
const answer={rn:['I'],rnDone:true};
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,public to anon,authenticated;
 create table profiles(id uuid primary key,name text,email text,author_of text,country text,profession text,education text);
 create table live_answers(user_id uuid,sample text,positions_rated int,rn_answered int,rows jsonb,updated_at timestamptz);
 grant select on live_answers to authenticated;
 insert into profiles(id,name,email) values ('${A}','A','a@example.test'),('${B}','B','b@example.test'),('${C}','C','c@example.test');
 insert into live_answers values('${A}','sample',1,1,'{"S001":{"rn":["I"],"rnDone":true}}',now());`);
 await db.exec(fs.readFileSync('supabase/migrations/20260920010000_feedback_messages.sql','utf8'));
 async function as(role,id){await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub','${id||''}',false);`);}
 async function denied(sql){await assert.rejects(db.exec(sql));}
 await as('anon');
 for(const table of ['rn_feedback','direct_messages']) await denied(`select * from ${table}`);
 for(const f of ['member_directory','member_answers']) await denied(`select * from ${f}()`);
 await as('authenticated',B);
 const directory=(await db.query('select * from member_directory()')).rows;assert.equal(directory.length,3);assert(!('email' in directory[0]));
 const members=(await db.query('select * from member_answers()')).rows;assert.equal(members.length,1);
 const insert=(stars=4,reviewer=B,snapshot=JSON.stringify(answer))=>`insert into rn_feedback(target_id,sample,position_id,reviewer_id,stars,comment,answer_snapshot) values('${A}','sample','S001','${reviewer}',${stars},'review','${snapshot}')`;
 await denied(insert(6));await denied(insert(4,C));await denied(insert(4,B,'{"rnDone":true}'));
 await db.exec(insert());await denied(insert());
 await db.exec(`update rn_feedback set stars=5 where reviewer_id='${B}'`);
 await as('authenticated',A);await denied(insert(4,A));
 await db.exec(insert('null',A));
 await db.exec(`update rn_feedback set stars=1 where reviewer_id='${B}'`);
 assert.equal((await db.query(`select stars from rn_feedback where reviewer_id='${B}'`)).rows[0].stars,5);
 await db.exec(`insert into direct_messages(sender_id,recipient_id,body) values('${A}','${B}','test')`);
 await denied(`insert into direct_messages(sender_id,recipient_id,body) values('${B}','${C}','spoof')`);
 await denied(`insert into direct_messages(sender_id,recipient_id,body) values('${A}','${B}',' ')`);
 await denied(`update direct_messages set body='changed'`);
 await denied(`delete from direct_messages`);
 await as('authenticated',B);assert.equal((await db.query('select * from direct_messages')).rows.length,1);
 await as('authenticated',C);assert.equal((await db.query('select * from direct_messages')).rows.length,0);
 await as('anon');await denied('select * from direct_messages');
 await db.close();
 console.log('PASS database: member-only access, no e-mail, stars bounds, self-rating rejection, stale answer rejection, ownership, duplicate prevention, private messages, spoof rejection');

 for(const file of ['compare.html','messages.html','account.html']){
   const html=fs.readFileSync(file,'utf8');for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
 }
 const dom=new JSDOM('<div id="cmpDetails"></div><div id="messagesHost"></div>',{url:'https://example.test/compare.html',runScripts:'outside-only'});
 const w=dom.window;w.HTMLElement.prototype.scrollIntoView=function(){};
 w.RNVData={esc:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))};
 let user={id:B}, writes=[], feedback=[{reviewer_id:C,stars:3,comment:'<img src=x onerror=alert(1)>',answer_snapshot:answer,updated_at:new Date().toISOString()}, {reviewer_id:A,stars:5,comment:'old',answer_snapshot:{rn:['V'],rnDone:true},updated_at:new Date().toISOString()}];
 w.RNVAuth={user:()=>user,require:async()=>({id:B}),db:async(path,opts)=>{
   if(path==='rpc/member_directory')return [{id:A,name:'Author',author_of:'musWM'},{id:B,name:'Reviewer'},{id:C,name:'Third'}];
   if(opts?.method==='POST'){writes.push({path,body:opts.body});return null;}
   if(path.startsWith('rn_feedback'))return feedback;
   if(path.startsWith('direct_messages'))return [];
   throw Error('unexpected '+path);
 }};
 w.eval(fs.readFileSync('js/rnv-community.js','utf8'));
 const tick=()=>new Promise(r=>setTimeout(r,20));
 const entry={userId:A,analyst:'Author',sample:'sample',rows:{S001:answer}};
 w.RNVCommunity.feedback(entry,'S001');await tick();
 const panel=w.document.querySelector('#rnFeedback');assert(panel.textContent.includes('3.0 / 5'));assert(!panel.querySelector('img'));assert.equal(panel.querySelectorAll('input[name=stars]').length,6);
 panel.querySelector('input[value="4"]').checked=true;panel.querySelector('textarea').value='Good reasoning';panel.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();assert.equal(writes[0].body.stars,4);assert.equal(writes[0].body.target_id,A);
 user={id:A};w.RNVCommunity.feedback(entry,'S001');await tick();assert(!panel.querySelector('input[name=stars]'));
 user=null;w.RNVCommunity.feedback(entry,'S001');assert(panel.textContent.includes('Sign in'));assert(!panel.querySelector('form'));
 user={id:B};w.RNVCommunity.messages();await tick();
 const select=w.document.querySelector('#messageRecipient');select.value=A;select.dispatchEvent(new w.Event('change'));await tick();
 w.document.querySelector('#messageBody').value='Hello';w.document.querySelector('#messageForm').dispatchEvent(new w.Event('submit',{cancelable:true}));await tick();
 assert.equal(writes.at(-1).body.sender_id,B);assert.equal(writes.at(-1).body.recipient_id,A);assert.equal(writes.at(-1).body.body,'Hello');
 dom.window.close();console.log('PASS UI: inline syntax, star form, stale exclusion, escaped comments, self-rating hidden, signed-out gate, message recipient and sender');
})().catch(e=>{console.error(e);process.exitCode=1});
