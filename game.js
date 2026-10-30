/* ===== Hit & Blow: オンライン対戦(フロアで同時に) と ひとりで練習 =====
   データの場所(Firebase Realtime Database)
   hitblow-rooms/<部屋コード>   … 部屋のようす(部屋の人が読める)
     state: lobby(待ちあい) / game(試合中) ・ n: けた数 ・ round: 何回目の試合か
     players/<uid>: {name, joined}(先に入った人がホスト。8人まで)
     fs/<A〜D>: {a, b} … 待ちあいのフロアの席
     fl/<A〜D>: フロアごとの試合
       state: set(数字を決める) → play(対戦) → end(結果)
       a, b: 対戦する2人 / nm: 名前 / ready/<uid>: 数字を決めた / first: 先攻 / turn: いまの番
       guesses/<id>: {by, g, t, h, b} … コールと、その判定
       last: 先攻が当てたとき、その人(後攻に最後のチャンス)
       winner: 勝った人の uid、または 'draw' / ff: 不戦勝 / reveal/<uid>: 終わったあとに見せる数字
   hitblow-secrets/<部屋コード>/<uid> … ひみつの数字(本人しか読めない)
   判定は、数字を持っている本人のスマホが行う(相手に数字を見せないため) */

/* 小さな道具 */
const $=id=>document.getElementById(id),app=$('app');
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const LS={
  get(k){try{return localStorage.getItem(k)}catch(e){return null}},
  set(k,v){try{localStorage.setItem(k,v)}catch(e){}},
  del(k){try{localStorage.removeItem(k)}catch(e){}}};
const TITLE='🔢 Hit & Blow';
const FOOT=`<p class="dim foot"><a href="${sitePath('/')}">${T("Muddy's Games トップ")}</a>・<a href="${sitePath('/howto-hitblow.html')}">${T('遊び方')}</a>・<a href="${sitePath('/privacy.html')}">${T('プライバシーポリシー')}</a></p>`;

/* 判定: 数字も場所も同じ=ヒット、数字だけ同じ=ブロー */
function judge(secret,guess){
  let h=0,b=0;
  for(let i=0;i<guess.length;i++){if(guess[i]===secret[i])h++;else if(secret.includes(guess[i]))b++}
  return{h,b}}
/* 0〜9 から、重ならずに n こ */
function randomNum(n){
  const d=[...'0123456789'];
  for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]]}
  return d.slice(0,n).join('')}
const valid=(s,n)=>typeof s==='string'&&s.length===n&&/^\d+$/.test(s)&&new Set(s).size===n;

/* 自分(id はログインできたら uid に変わる) */
const me={id:Math.random().toString(36).slice(2,10),name:LS.get('hb-name')||''};

/* ゲームの状態
   db, ref, sref: Firebase、いまの部屋、自分のひみつの数字の場所
   room: 部屋のデータ / code: 部屋コード / mySecret: 自分のひみつの数字
   judged: もう判定したコール / cur: 入力中の数字(マスごと) / sel: 選んでいるマス(-1 = 選んでいない) / memo: 0〜9 のメモ
   pmemo: 場所のメモ(□ごとの数字) / psel: 選んでいる□ / onType: 入力が変わったときに呼ぶ(相手に入力中を見せる) / lastTyped: 最後に送った入力中
   round: 画面が知っている試合の回 / solo: ひとりで練習のデータ
   odSet: 切断したら消す設定をした / startedRound: ホストが試合を始めた回 / sending: コールを送っている */
let db=null,ref=null,sref=null,room=null,code='',mySecret='',judged={},cur=[],sel=-1,memo={},pmemo=[],psel=-1,onType=null,lastTyped='',round=null,solo=null,odSet=false,startedRound=-1,sending=false;
/* 演出: fxQ 出す順番待ち / fxOn 出している / fxSeen もう演出したコール(null = まだ数えていない) */
let fxQ=[],fxOn=false,fxSeen=null;

/* 部屋の人(入った順)と、ホスト(いちばん先に入った人) */
const plist=()=>Object.entries((room&&room.players)||{}).sort((a,b)=>(a[1].joined||0)-(b[1].joined||0));
const isHost=()=>{const p=plist();return p.length>0&&p[0][0]===me.id};

/* ===== 入力の部品 ===== */

/* 数字ボタン。同じ数字は2回押せない。canOk=false なら OK だけ押せない(相手の番に先に打っておける)
   上のマスをタップすると、そのマスを選べる(もう一度タップで外れる)。数字は選んだマスに入り、次の空いているマスへ進む。
   マスを選んでいなければ、左から順に入る */
const curStr=()=>cur.join('');
const curFull=n=>Array.from({length:n},(_,i)=>cur[i]).every(Boolean);
function drawPad(n,label,onOk,canOk=true){
  const el=$('pad');if(!el)return;
  const free=Array.from({length:n},(_,i)=>i).filter(i=>!cur[i]);
  const act=sel>=0?sel:(free[0]??-1);
  el.innerHTML=`<div class="slots">${Array.from({length:n},(_,i)=>`<button class="slot ${cur[i]?'on':''} ${i===act?'sel':''}" data-i="${i}">${esc(cur[i]||'')}</button>`).join('')}</div>
<div class="keys">${['1','2','3','4','5','6','7','8','9','del','0','ok'].map(k=>`<button class="${k}${memo[k]==='x'?' memox':''}" data-k="${k}">${k==='del'?'⌫':k==='ok'?esc(label):k}</button>`).join('')}</div>`;
  el.querySelectorAll('.slot').forEach(b=>b.onclick=()=>{const i=+b.dataset.i;sel=sel===i?-1:i;drawPad(n,label,onOk,canOk)});
  el.querySelectorAll('.keys button').forEach(b=>{
    const k=b.dataset.k;
    if(k==='ok')b.disabled=!canOk||!curFull(n);
    else if(k==='del')b.disabled=!cur.some(Boolean);
    else b.disabled=act<0||cur.includes(k);
    b.onclick=()=>{
      if(k==='ok'){const v=curStr();cur=[];sel=-1;drawPad(n,label,onOk,false);onType&&onType(n);onOk(v);return}
      if(k==='del'){
        /* 選んだマスに数字があればそれを消す。なければ、いちばん右の数字を消す */
        if(sel>=0&&cur[sel])cur[sel]='';
        else{const j=cur.map((d,i)=>d?i:-1).filter(i=>i>=0).pop();if(j!=null){cur[j]='';if(sel>=0)sel=j}}}
      else{
        cur[act]=k;
        /* 次の空いているマスへ(右へ探して、なければ左から) */
        const nx=[...Array(n).keys()].map(d=>(act+1+d)%n).find(i=>!cur[i]);
        sel=sel>=0&&nx!=null?nx:-1}
      drawPad(n,label,onOk,canOk);onType&&onType(n)}})}

/* メモ: タップするたびに ✕(ない) → ○(あるかも) → なし。自分のコールの記録にも反映する
   場所のメモ: □をタップして選ぶ → 0〜9 を押すと、その□に入る。数字が入っている□をタップすると空になる */
const memoHTML=n=>`<div class="memobox"><div class="pml">${T('場所のメモ')}</div><div class="pm">${Array.from({length:n},(_,i)=>`<button class="pbox ${i===psel?'sel':''}" data-p="${i}">${esc(pmemo[i]||'')}</button>`).join('')}</div>
<div class="memo">${[...'0123456789'].map(d=>`<button class="${memo[d]||''}" data-d="${d}">${d}</button>`).join('')}</div>
<div class="dim small">${psel>=0?T('入れたい数字を押してね(□をもう一度押すとやめる)'):T('メモ: タップで ✕ → ○ → なし / □を押すと場所のメモ')}</div></div>`;
function bindMemo(n){
  const box=app.querySelector('.memobox');if(!box)return;
  const redraw=()=>{box.outerHTML=memoHTML(n);bindMemo(n)};
  box.querySelectorAll('.pbox').forEach(b=>b.onclick=()=>{
    const i=+b.dataset.p;
    if(pmemo[i]){pmemo[i]='';psel=-1}else psel=psel===i?-1:i;
    redraw()});
  box.querySelectorAll('.memo button').forEach(b=>b.onclick=()=>{
    const d=b.dataset.d;
    if(psel>=0){
      /* 同じ数字がほかの□にあれば、そちらは空にする */
      pmemo.forEach((x,i)=>{if(x===d)pmemo[i]=''});
      pmemo[psel]=d;psel=-1;redraw();return}
    memo[d]=memo[d]==='x'?'o':memo[d]==='o'?'':'x';b.className=memo[d];
    /* ✕ にした数字は、上の数字ボタンも薄くする(押すことはできる) */
    app.querySelectorAll(`#pad .keys button[data-k="${d}"]`).forEach(x=>x.classList.toggle('memox',memo[d]==='x'));
    app.querySelectorAll(`.hist.mm .num span[data-d="${d}"]`).forEach(x=>x.className=memo[d]?'m'+memo[d]:'')})}

/* コールの記録(新しいものが上)。mm=true なら、メモの ✕(薄く)・○(丸で囲む)を数字に反映する */
/* typ: 相手が入力中の数字(まだ入れていないマスは _ )。あれば、いちばん上に出す */
function histHTML(list,mm=false,typ=''){
  const tr=typ?`<tr class="typing"><td>✏️</td><td class="num">${[...typ].map(c=>`<span>${c==='_'?'＿':esc(c)}</span>`).join('')}</td><td>${T('入力中…')}</td></tr>`:'';
  if(!list.length&&!tr)return'<div class="dim">'+T('まだありません')+'</div>';
  const num=g=>mm?[...String(g)].map(d=>`<span data-d="${esc(d)}" class="${memo[d]?'m'+memo[d]:''}">${esc(d)}</span>`).join(''):esc(g);
  return`<table class="hist${mm?' mm':''}">${tr}${list.map((g,i)=>[i,g]).reverse().map(([i,g])=>`<tr><td class="dim">${i+1}</td><td class="num">${num(g.g)}</td><td>${g.h==null?'<span class="dim">'+T('判定中…')+'</span>':`<b class="H">${g.h}H</b> <b class="B">${g.b}B</b>`}</td></tr>`).join('')}</table>`}

/* ===== 演出: コールの結果を画面いっぱいに出す =====
   どの数字がヒットかは見せない(答えが分かってしまうため)。数だけ出す */
function showFx(o){fxQ.push(o);if(!fxOn)nextFx()}
function nextFx(){
  const o=fxQ.shift();
  if(!o){fxOn=false;return}
  fxOn=true;
  /* 発表(先攻・後攻、サドンデス): Labyrinth と同じ、黒い画面に白い大きな字 */
  if(o.ov){
    const el=document.createElement('div');el.id='ov';el.innerHTML=o.ov;document.body.appendChild(el);
    let done=false;
    const close=()=>{if(done)return;done=true;el.classList.add('out');setTimeout(()=>{el.remove();nextFx()},250)};
    el.onclick=close;setTimeout(close,o.ms||2000);return}
  const win=o.h===o.n,miss=!o.h&&!o.b;
  const el=document.createElement('div');
  el.id='fx';el.className=win?'win':miss?'miss':'';
  el.innerHTML=`<div class="fxbox"><div class="fxwho">${o.who==null?T('あなたのコール'):T('{n}のコール',{n:esc(o.who)})}</div><div class="fxnum">${esc(o.g)}</div>
<div class="fxtilt"><div class="fxh ${o.h?'':'zero'}">${o.h} HIT!</div>${win?'':`<div class="fxb ${o.b?'':'zero'}">${o.b} BLOW!</div>`}</div>
${win?'<div class="fxsub">'+T('正解！')+'</div>':miss?'<div class="fxsub">'+T('ハズレ…')+'</div>':''}</div>`;
  /* 正解は紙ふぶき */
  if(win)for(let i=0;i<48;i++){
    const c=document.createElement('i');c.className='cf';
    c.style.left=Math.random()*100+'%';
    c.style.background=['#e5484d','#ffc21a','#6d4aff','#2fbf71','#fff'][i%5];
    c.style.animationDuration=(1.6+Math.random()*1.4)+'s';
    c.style.animationDelay=(Math.random()*.5)+'s';
    el.appendChild(c)}
  document.body.appendChild(el);
  let done=false;
  const close=()=>{if(done)return;done=true;el.classList.add('out');setTimeout(()=>{el.remove();nextFx()},250)};
  el.onclick=close;
  setTimeout(close,win?2800:1600)}

/* ===== ホーム ===== */
function home(err){
  room=null;solo=null;cur=[];sel=-1;
  const n=LS.get('hb-n')||'3',on=!!db;
  app.innerHTML=`<h1>${TITLE}</h1>
${langSwitchHtml()}
<div class="card">${T('相手のひみつの数字を、先に当てたほうが勝ち！')}<br><b class="H">${T('ヒット')}</b> ${T('… 数字も場所も同じ')}<br><b class="B">${T('ブロー')}</b> ${T('… 数字は同じで、場所がちがう')}</div>
<div class="card">
<div class="seg">${['3','4'].map(v=>`<button class="sub dg ${v===n?'on':''}" data-n="${v}">${T('{n}けた',{n:v})}</button>`).join('')}</div>
<input id="nm" maxlength="8" placeholder="${T('なまえ')}" value="${esc(me.name)}">
<button id="mk" ${on?'':'disabled'}>${T('部屋を作る')}</button><hr>
<input id="cd" inputmode="numeric" maxlength="4" placeholder="${T('部屋コード(4けた)')}" value="${esc(LS.get('hb-room')||'')}">
<button id="jn" class="sub" ${on?'':'disabled'}>${T('入室する')}</button>
<div class="err" id="er">${esc(err||'')}</div></div>
<div class="card"><button id="so" class="sub">${T('ひとりで練習')}</button>
<div class="dim">${T('ベスト: 3けた {a}回 / 4けた {b}回',{a:esc(LS.get('hb-best3')||'-'),b:esc(LS.get('hb-best4')||'-')})}</div></div>
<div class="dim">${T('オンラインは8人まで。A〜Dのフロアで同時に対戦できます')}</div>${FOOT}`;
  /* 言語の切りかえ: 入力中のなまえを覚えてから読みこみ直す(i18n.js) */
  langSwitchInit(()=>{const v=$('nm').value.trim();if(v)LS.set('hb-name',v)});
  app.querySelectorAll('.dg').forEach(b=>b.onclick=()=>{
    LS.set('hb-n',b.dataset.n);app.querySelectorAll('.dg').forEach(x=>x.classList.toggle('on',x===b))});
  $('mk').onclick=()=>enter(true);
  $('jn').onclick=()=>enter(false);
  $('so').onclick=startSolo}

/* ===== ひとりで練習(コンピューターが決めた数字を当てる) ===== */
function startSolo(){
  const n=+(LS.get('hb-n')||3);
  solo={n,secret:randomNum(n),list:[],done:false,best:false};memo={};pmemo=[];psel=-1;cur=[];sel=-1;drawSolo()}
function drawSolo(){
  const s=solo;
  app.innerHTML=`<h1>${TITLE}</h1><div class="dim">${T('ひとりで練習({n}けた)',{n:s.n})}</div>
${s.done?`<div class="card"><div class="big ok">🎉 ${esc(s.secret)}</div><div>${T('{n}回で当てた！',{n:s.list.length})}${s.best?' <b>'+T('ベスト更新！')+'</b>':''}</div><button id="ag">${T('もう一回')}</button></div>`
:`<div class="card"><div id="pad"></div></div><div class="card">${memoHTML(s.n)}</div>`}
<div class="card"><div class="lbl">${T('あなたのコール')}</div>${histHTML(s.list,true)}</div>
<button id="bk" class="sub">${s.done?T('もどる'):T('やめる')}</button>${s.done?'':'<button id="gu" class="sub">'+T('こうさん')+'</button>'}${FOOT}`;
  $('bk').onclick=()=>home();
  if(s.done){$('ag').onclick=startSolo;return}
  $('gu').onclick=()=>{if(confirm(T('答えを見ますか？')))alert(T('答えは {s} でした',{s:s.secret}));startSolo()};
  bindMemo(s.n);onType=null;
  drawPad(s.n,T('コール'),g=>{
    const r=judge(s.secret,g);s.list.push({g,...r});
    showFx({who:null,g,h:r.h,b:r.b,n:s.n});
    if(r.h===s.n){
      s.done=true;
      const k='hb-best'+s.n,b=+LS.get(k)||Infinity;
      if(s.list.length<b){LS.set(k,String(s.list.length));s.best=true}}
    drawSolo()})}

/* ===== オンライン: 部屋を作る・入る・出る ===== */

/* フロア: 部屋の中に A〜D の試合の置き場所がある。1フロア2人。ほかの人は観戦 */
const FL=['A','B','C','D'];
/* VF: いま見ているフロア / gone: 抜けた人を見つけた時刻 / gwt: 抜けた人の見直しタイマー
   myJoined: 自分の入室時刻(回線が切れて入り直したときに使う) / readd: 入り直し中 / startedKey: スタートを書いたフロア */
let VF='',gone={},gwt=0,myJoined=0,readd=false,startedKey='';
const pname=(id,f)=>(room&&room.players&&room.players[id]&&room.players[id].name)||(f&&f.nm&&f.nm[id])||'？';
const myF=()=>FL.find(F=>room&&room.fl&&room.fl[F]&&(room.fl[F].a===me.id||room.fl[F].b===me.id))||'';
const fend=f=>!!f&&f.state==='end';
const actF=()=>{const F=myF();return F&&!fend(room.fl[F])?F:''};
const oppOf=f=>f.a===me.id?f.b:f.a;
const fguesses=f=>Object.entries((f&&f.guesses)||{}).map(([k,v])=>({k,...v})).sort((a,b)=>(a.t||0)-(b.t||0));
const fref=F=>ref.child('fl/'+F);
const seatFull=(fs,F)=>{const s=fs[F]||{},pl=room.players||{};return !!(s.a&&s.b&&pl[s.a]&&pl[s.b])};

/* 部屋に入る(create=true なら新しく作る)。試合中でも観戦で入れる */
async function enter(create){
  const nm=$('nm').value.trim();
  if(!nm){$('er').textContent=T('なまえを入れてね');return}
  me.name=nm;LS.set('hb-name',nm);
  const n=+(LS.get('hb-n')||3);
  $('mk').disabled=$('jn').disabled=true;
  try{
    let c=$('cd').value.trim();
    if(create){
      /* あいている4けたのコードを探す */
      for(let i=0;i<20;i++){c=String(1000+Math.floor(Math.random()*9000));if(!(await db.ref('hitblow-rooms/'+c).get()).exists())break}}
    else{
      if(!/^\d{4}$/.test(c))throw T('部屋コードは4けたの数字だよ');
      const r=(await db.ref('hitblow-rooms/'+c).get()).val();
      if(!r)throw T('部屋がありません');
      const ps=r.players||{};
      if(!ps[me.id]&&Object.keys(ps).length>=8)throw T('満員です(8人まで)')}
    code=c;ref=db.ref('hitblow-rooms/'+c);sref=db.ref('hitblow-secrets/'+c+'/'+me.id);
    if(create)await ref.set({state:'lobby',n,round:0});
    const pr=ref.child('players/'+me.id);
    if((await pr.get()).exists())await pr.update({name:me.name});
    else await pr.set({name:me.name,joined:firebase.database.ServerValue.TIMESTAMP});
    myJoined=(await pr.child('joined').get()).val()||Date.now();
    mySecret=(await sref.get()).val()||'';
    LS.set('hb-room',c);odSet=false;judged={};startedKey='';round=null;sending=false;VF='';gone={};readd=false;
    /* 部屋のデータが変わるたびに呼ばれる */
    ref.on('value',s=>{room=s.val();onRoom()});
  }catch(e){
    if(typeof e!=='string')console.warn(e);
    const er=$('er');if(!er)return;
    er.textContent=typeof e==='string'?e:T('つながりませんでした。もう一度ためしてね');
    $('mk').disabled=$('jn').disabled=false}}

/* 部屋から離れたあとの片づけ */
function cleanup(){
  try{ref&&ref.off()}catch(e){}
  ref=null;sref=null;room=null;odSet=false;mySecret='';round=null;fxSeen=null;fxQ=[];VF='';LS.del('hb-room')}

/* 退出する。試合中なら相手の不戦勝にする。最後の1人なら部屋ごと消す */
async function leave(){
  const r=ref,s=sref,rm=room,F=actF(),alone=plist().filter(([id])=>id!==me.id).length===0;
  cleanup();home();
  try{await s.remove()}catch(e){}
  try{
    await r.child('players/'+me.id).onDisconnect().cancel();
    if(alone){await r.remove();return}
    if(F){const f=rm.fl[F];await r.child('fl/'+F).update({state:'end',winner:f.a===me.id?f.b:f.a,ff:1})}
    for(const G in (rm&&rm.fs)||{})for(const k in rm.fs[G]||{})if(rm.fs[G][k]===me.id)await r.child('fs/'+G+'/'+k).remove();
    await r.child('players/'+me.id).remove()}catch(e){console.warn(e)}}

/* 部屋のデータが変わったら、いまの場面の画面を出す */
function onRoom(){
  if(!ref)return;
  if(!room){cleanup();return home(T('部屋が閉じました'))}
  /* 回線が切れて消えていたら、自分を入れ直す */
  if(!(room.players&&room.players[me.id])){
    if(!readd){readd=true;ref.child('players/'+me.id).set({name:me.name,joined:myJoined}).then(()=>{readd=false;odSet=false}).catch(()=>{readd=false})}
    return}
  if(!odSet){ref.child('players/'+me.id).onDisconnect().remove();odSet=true}
  /* 新しい試合になったら、前の数字・メモを消す */
  if(round!==room.round){
    if(round!==null){mySecret='';sref.remove().catch(()=>{});judged={};sending=false}
    round=room.round;memo={};pmemo=[];psel=-1;cur=[];sel=-1;lastTyped='';fxSeen=null}
  watchGone();
  if(room.state!=='game'){VF='';return drawLobby()}
  /* 見るフロア: 対戦中は自分のフロア。終わった人と観戦者は選べる */
  const fl=room.fl||{},ks=Object.keys(fl).sort(),a=actF();
  let v=a||VF;if(!fl[v])v=myF()||ks[0]||'';
  if(v!==VF){VF=v;fxSeen=null}
  const F=myF();
  if(F){const f=fl[F];
    if(f.state==='set')driveStart(F,f);
    if(f.state==='play')autoJudge(F,f);
    if(f.state==='end'&&mySecret&&!(f.reveal&&f.reveal[me.id]))fref(F).child('reveal/'+me.id).set(mySecret)}
  if(fl[VF])checkFx(VF,fl[VF]);
  drawGame()}

/* 抜けた人: 10秒待って戻らなければ、試合の相手が不戦勝にする。待ちあいの席はホストが空ける */
function watchGone(){
  const pl=room.players||{},now=Date.now();let wait=false;
  const miss=u=>{if(!u||pl[u]){delete gone[u];return false}gone[u]=gone[u]||now;if(now-gone[u]<10000){wait=true;return false}return true};
  if(room.state==='game'){
    for(const F in room.fl||{}){const f=room.fl[F];if(fend(f))continue;
      if(f.a===me.id||f.b===me.id){const o=oppOf(f);if(miss(o))fref(F).update({state:'end',winner:me.id,ff:1})}
      else if(isHost()&&miss(f.a)&&miss(f.b))fref(F).update({state:'end',winner:'draw',ff:1})}}
  else if(isHost()){for(const F in room.fs||{})for(const k in room.fs[F]||{})if(miss(room.fs[F][k]))ref.child('fs/'+F+'/'+k).remove()}
  if(wait&&!gwt)gwt=setTimeout(()=>{gwt=0;if(ref&&room)onRoom()},10200)}

/* ===== オンライン: 画面 ===== */

/* 待ちあい: フロアの席を選ぶ */
function drawLobby(){
  const host=isHost(),pl=room.players||{},fs=room.fs||{},ready=FL.filter(F=>seatFull(fs,F)),hid=(plist()[0]||[])[0];
  app.innerHTML=`<h1>${TITLE}</h1>
<div class="card"><div class="dim">${T('部屋コード')}</div><div class="code">${esc(code)}</div><div class="dim">${T('みんなにこのコードを教えてね(8人まで)')}</div></div>
<div class="card">${plist().map(([id,p])=>`<span class="pl ${id===me.id?'me':''}">${esc(p.name)}${id===hid?' 👑':''}</span>`).join('')}</div>
<div class="floors">${FL.map(F=>{const s=fs[F]||{};return `<div class="fl ${seatFull(fs,F)?'full':''}"><div class="flh">${T('{f}フロア',{f:F})}${seatFull(fs,F)?' ✔':''}</div><div class="fls">${['a','b'].map(k=>{const u=s[k],who=u&&pl[u]?pl[u].name:'';return `<button class="seat ${u===me.id?'on':''}" data-f="${F}" data-k="${k}" ${u&&pl[u]&&u!==me.id?'disabled':''}>${who?esc(who):T('空き')}</button>`}).join('<span class="vs">VS</span>')}</div></div>`}).join('')}</div>
<div class="card"><div class="seg">${[3,4].map(v=>`<button class="sub dg ${v===room.n?'on':''}" data-n="${v}" ${host?'':'disabled'}>${T('{n}けた',{n:v})}</button>`).join('')}</div>
${host?`<button id="st" ${ready.length?'':'disabled'}>${T('はじめる')}${ready.length?T('({f}フロア)',{f:ready.join('・')}):''}</button>`:'<div class="dim">'+T('ホストがはじめるのを待っています')+'</div>'}
<div class="dim small">${T('2人そろったフロアが同時に始まります。席に座らなかった人は観戦です')}</div></div>
<button id="lv" class="sub">${T('退出')}</button>${FOOT}`;
  app.querySelectorAll('.seat').forEach(b=>b.onclick=()=>{
    const F=b.dataset.f,k=b.dataset.k;
    ref.child('fs').transaction(s=>{s=s||{};const had=s[F]&&s[F][k]===me.id;if(s[F]&&s[F][k]&&!had&&pl[s[F][k]])return;
      for(const x in s)for(const y in s[x]||{})if(s[x][y]===me.id)delete s[x][y];
      if(!had){s[F]=s[F]||{};s[F][k]=me.id}return s})});
  if(host){
    app.querySelectorAll('.dg').forEach(b=>b.onclick=()=>ref.update({n:+b.dataset.n}));
    $('st').onclick=()=>{const fl={};
      FL.filter(F=>seatFull(fs,F)).forEach(F=>{const s=fs[F];fl[F]={state:'set',a:s.a,b:s.b,nm:{[s.a]:pl[s.a].name,[s.b]:pl[s.b].name}}});
      if(Object.keys(fl).length)ref.update({state:'game',fl,round:(room.round||0)+1})}}
  $('lv').onclick=leave}

/* 2人とも数字を決めたら、フロアの係(a の人。いなければ b)が先攻をランダムに決めてスタート */
function driveStart(F,f){
  const rd=f.ready||{},drv=[f.a,f.b].find(u=>room.players&&room.players[u]);
  if(drv!==me.id||!rd[f.a]||!rd[f.b]||startedKey===room.round+F)return;
  startedKey=room.round+F;const first=Math.random()<.5?f.a:f.b;
  fref(F).update({state:'play',first,turn:first})}

/* 相手のコールを、自分の数字で判定する */
function autoJudge(F,f){
  if(!mySecret)return;
  const n=room.n;
  fguesses(f).forEach(g=>{
    if(g.by===me.id||g.h!=null||judged[g.k])return;
    judged[g.k]=1;
    const r=valid(g.g,n)?judge(mySecret,g.g):{h:0,b:0},hit=r.h===n;
    const u={['guesses/'+g.k+'/h']:r.h,['guesses/'+g.k+'/b']:r.b};
    if(f.last){u.state='end';u.winner=hit?'draw':f.last}       /* 後攻の最後のチャンス */
    else if(hit&&g.by===f.first){u.last=g.by;u.turn=me.id}     /* 先攻が当てた → 後攻にもう1回 */
    else if(hit){u.state='end';u.winner=g.by}                  /* 後攻が当てた → 勝ち */
    else u.turn=me.id;                                         /* はずれ → こっちの番 */
    fref(F).update(u).catch(e=>{console.warn(e);delete judged[g.k]})})}

/* 見ているフロアのコールで、判定が出たものを演出する(見はじめたときにもうあった判定は出さない) */
function checkFx(F,f){
  const gs=fguesses(f).filter(g=>g.h!=null);
  /* 見はじめたときに、もう出ていたもの(判定・先攻の発表・サドンデス)は出さない */
  if(fxSeen===null){fxSeen=new Set(gs.map(g=>g.k));if(f.first)fxSeen.add('start');if(f.last)fxSeen.add('last');return}
  if(f.first&&!fxSeen.has('start')){
    fxSeen.add('start');const second=f.first===f.a?f.b:f.a;
    showFx({ov:`<div class="big">${T('{a}先攻！<br>{b}後攻です！',{a:SAN(esc(pname(f.first,f))),b:SAN(esc(pname(second,f)))})}</div>`,ms:2000})}
  gs.forEach(g=>{
    if(fxSeen.has(g.k))return;
    fxSeen.add(g.k);
    showFx({who:g.by===me.id?null:pname(g.by,f),g:g.g,h:g.h,b:g.b,n:room.n})});
  /* 先攻が当てたら、正解の演出のあとにサドンデス */
  if(f.last&&!fxSeen.has('last')){
    fxSeen.add('last');const second=f.last===f.a?f.b:f.a;
    showFx({ov:`<div class="huge">${T('サドンデス！！！')}</div><div class="sm">${T('{n}、当てられなかったら負け！',{n:SAN(esc(pname(second,f)))})}</div>`,ms:2500})}}

/* 入力中の数字: 対戦中だけ、自分以外の人のものを出す */
const typOf=(f,u)=>f.state==='play'&&u!==me.id&&f.typing&&f.typing[u]||'';

/* 試合の画面(見ているフロア) */
function drawGame(){
  const fl=room.fl||{},ks=Object.keys(fl).sort(),f=fl[VF],mine=!!f&&(f.a===me.id||f.b===me.id),all=ks.every(F=>fend(fl[F])),a=actF(),n=room.n;
  if(!f){app.innerHTML=`<h1>${TITLE}</h1><div class="card dim">${T('準備中…')}</div>`;return}
  const nmA=pname(f.a,f),nmB=pname(f.b,f),gs=fguesses(f),ga=gs.filter(g=>g.by===f.a),gb=gs.filter(g=>g.by===f.b);
  let body='',pad=null;
  if(f.state==='set'){
    const rd=f.ready||{};
    if(mine&&!rd[me.id]){
      body=`<div class="card"><div class="lbl">${T('ひみつの数字を決めよう')}</div><div class="dim small">${T('{n}けた・同じ数字は使えません',{n})}</div><div id="pad"></div><button id="rn" class="sub">${T('おまかせ')}</button></div>
<div class="dim">${esc(pname(oppOf(f),f))}: ${rd[oppOf(f)]?T('決めた ✅'):T('考え中…')}</div>`;
      pad='set'}
    else if(mine)body=`<div class="card"><div class="dim">${T('あなたのひみつの数字')}</div><div class="big">${esc(mySecret||'？')}</div><div class="dim">${rd[oppOf(f)]?T('まもなくスタート！'):T('相手が数字を決めるのを待っています…')}</div></div>`;
    else body=`<div class="card"><div class="lbl">${esc(nmA)} VS ${esc(nmB)}</div><div class="dim">${T('ひみつの数字を決めています')}</div><div>${esc(nmA)}: ${rd[f.a]?'✅':T('考え中…')}　${esc(nmB)}: ${rd[f.b]?'✅':T('考え中…')}</div></div>`}
  else if(f.state==='play'){
    const opp=mine?oppOf(f):'',mg=mine?gs.filter(g=>g.by===me.id):[],pending=mg.some(g=>g.h==null);
    if(mine&&!pending)sending=false;
    const myTurn=mine&&f.turn===me.id&&!pending&&!sending;
    const note=f.last?`<div class="card warn">${mine?(f.last===me.id?T('当てた！ 後攻の相手に最後のチャンス…'):T('相手が当てた！ 当てれば引き分け、ラストチャンス！')):T('{n}が当てた！ 後攻のラストチャンス',{n:SAN(esc(pname(f.last,f)))})}</div>`:'';
    const turnTxt=mine?(myTurn?T('あなたの番！'):pending?T('判定中…'):T('{n} の番…',{n:esc(pname(opp,f))})):T('{n} の番',{n:esc(pname(f.turn,f))});
    body=`<div class="turn ${myTurn?'mine':''}">${turnTxt}</div>${note}
${mine?`<div class="card"><div id="pad"></div></div><div class="card">${memoHTML(n)}</div>`:''}
<div class="two"><div class="card"><div class="lbl">${mine&&f.a===me.id?T('あなた'):esc(nmA)}</div>${histHTML(ga,mine&&f.a===me.id,typOf(f,f.a))}</div><div class="card"><div class="lbl">${mine&&f.b===me.id?T('あなた'):esc(nmB)}</div>${histHTML(gb,mine&&f.b===me.id,typOf(f,f.b))}</div></div>
${mine?`<div class="dim">${T('あなたのひみつの数字')}: <b>${esc(mySecret||'？')}</b></div>`:''}`;
    if(mine)pad={myTurn}}
  else{
    const w=f.winner,rv=f.reveal||{},ff=f.ff?T('(不戦勝)'):'';
    const res=mine?(w==='draw'?T('🤝 引き分け！'):w===me.id?T('🏆 あなたの勝ち！')+ff:T('😢 負け…')):(w==='draw'?T('🤝 引き分け！'):'🏆 '+T('{n}の勝ち！',{n:esc(pname(w,f))})+ff);
    body=`<div class="card"><div class="big ${mine&&w===me.id?'ok':''}" style="letter-spacing:0">${res}</div>
<div class="two" style="margin-top:8px"><div><div class="dim">${mine&&f.a===me.id?T('あなたの数字'):T('{n}の数字',{n:esc(nmA)})}</div><div class="big">${esc(rv[f.a]||(f.a===me.id&&mySecret)||'…')}</div></div><div><div class="dim">${mine&&f.b===me.id?T('あなたの数字'):T('{n}の数字',{n:esc(nmB)})}</div><div class="big">${esc(rv[f.b]||(f.b===me.id&&mySecret)||'…')}</div></div></div></div>
<div class="two"><div class="card"><div class="lbl">${esc(nmA)}</div>${histHTML(ga,mine&&f.a===me.id)}</div><div class="card"><div class="lbl">${esc(nmB)}</div>${histHTML(gb,mine&&f.b===me.id)}</div></div>`}
  /* 全部のフロアが終わったら、ホストがロビーへ */
  let foot='';
  if(all)foot=isHost()?'<button id="ag">'+T('もう一回(ロビーへ)')+'</button>':'<div class="dim">'+T('ホストが「もう一回」を押すのを待っています')+'</div>';
  else if(mine&&fend(f))foot='<div class="dim">'+T('ほかのフロアが終わるのを待っています(下のボタンで観戦できます)')+'</div>';
  else if(!mine)foot='<div class="dim">'+T('観戦中')+'</div>';
  const tabs=`<div id="ftab">${ks.map(F=>{const g=fl[F],st=fend(g)?'🏁':g.state==='play'?'⚔️':'🛠';return `<button data-f="${F}" class="${F===VF?'on':''}" ${a&&a!==F?'disabled':''}>${F}${st}</button>`}).join('')}</div>`;
  app.innerHTML=`<h1>${TITLE}</h1><div class="dim">${T('{f}フロア・{n}けた',{f:VF,n})}${mine?'':'・'+esc(nmA)+' VS '+esc(nmB)}</div>${body}${foot}
<button id="lv" class="sub">${T('退出')}</button>${tabs}`;
  /* ボタン */
  app.querySelectorAll('#ftab button').forEach(b=>b.onclick=()=>{if(b.disabled||b.dataset.f===VF)return;VF=b.dataset.f;fxSeen=null;onRoom()});
  if($('ag'))$('ag').onclick=()=>ref.update({state:'lobby',fl:null});
  $('lv').onclick=()=>{if(!a||confirm(T('試合をやめて退出しますか？(相手の不戦勝になります)')))leave()};
  if(pad==='set'){
    const F=VF,ok=async v=>{
      if(!valid(v,n))return;
      mySecret=v;
      try{await sref.set(v);await fref(F).child('ready/'+me.id).set(true)}
      catch(e){console.warn(e);mySecret='';alert(T('保存できませんでした。もう一度ためしてね'));drawGame()}};
    onType=null;drawPad(n,T('決定'),ok);
    $('rn').onclick=()=>{cur=[...randomNum(n)];sel=-1;drawPad(n,T('決定'),ok)}}
  else if(pad){
    const F=VF;bindMemo(n);
    /* 入力中の数字を相手と観戦者に見せる(対戦中だけ。ひみつの数字を決めるときは送らない) */
    onType=nn=>{const t=cur.some(Boolean)?Array.from({length:nn},(_,i)=>cur[i]||'_').join(''):'';
      if(t===lastTyped)return;lastTyped=t;fref(F).child('typing/'+me.id).set(t||null).catch(()=>{})};
    drawPad(n,T('コール'),g=>{
      const f2=room.fl&&room.fl[F];
      if(!valid(g,n)||!f2||f2.turn!==me.id||sending)return;
      sending=true;
      fref(F).child('guesses').push({by:me.id,g,t:firebase.database.ServerValue.TIMESTAMP})
        .catch(e=>{console.warn(e);sending=false;alert(T('送れませんでした。もう一度ためしてね'));drawGame()})},pad.myTurn)}}

/* ===== はじめに: Firebase につなぐ(だめでも、ひとりで練習はできる) ===== */
function boot(){
  if(typeof firebase==='undefined'||typeof firebaseConfig==='undefined')return home(T('オンライン対戦に今つなげません(ひとりで練習はできます)'));
  try{
    firebase.initializeApp(firebaseConfig);
    /* App Check: このサイトから来たアクセスだと証明する(reCAPTCHA Enterprise。サイトキーは公開してよいもの。失敗してもゲームは続ける) */
    try{firebase.appCheck().activate(new firebase.appCheck.ReCaptchaEnterpriseProvider('6LdxegYuAAAAAEsspAxLI1swKYC_vKCa1OpYG7p5'),true)}catch(e){console.warn('App Check',e)}
    db=firebase.database()}
  catch(e){console.warn(e);db=null;return home(T('オンライン対戦に今つなげません(ひとりで練習はできます)'))}
  app.innerHTML=`<h1>${TITLE}</h1><div class="card dim">${T('接続中…')}</div>`;
  /* 見えない匿名ログイン。uid をそのままプレイヤーのIDにする(ひみつの数字を本人しか読めないようにするため) */
  let started=false;
  const go=()=>{if(started)return;started=true;home()};
  try{firebase.auth().signInAnonymously().then(c=>{if(c&&c.user&&c.user.uid)me.id=c.user.uid}).catch(e=>console.warn('ログインできませんでした',e)).then(go)}catch(e){go()}
  setTimeout(go,8000)}
boot();
