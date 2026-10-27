/* ===== Hit & Blow: オンライン対戦(2人) と ひとりで練習 =====
   データの場所(Firebase Realtime Database)
   hitblow-rooms/<部屋コード>   … 部屋のようす(だれでも読める)
     state: lobby(待ちあい) → set(数字を決める) → play(対戦) → end(結果)
     n: けた数 / round: 何回目の試合か / first: 先攻 / turn: いまの番
     players/<uid>: {name, joined, ready}
     guesses/<id>: {by, g, t, h, b}  … コールと、その判定
     last: 先攻が当てたとき、その人(後攻に最後のチャンス)
     winner: 勝った人の uid、または 'draw'
     reveal/<uid>: 試合が終わったあとに見せる、ひみつの数字
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
const FOOT='<p class="dim foot"><a href="/">Muddy\'s Games トップ</a>・<a href="/howto-hitblow.html">遊び方</a>・<a href="/privacy.html">プライバシーポリシー</a></p>';

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
   judged: もう判定したコール / cur: 入力中の数字 / memo: 0〜9 のメモ
   round: 画面が知っている試合の回 / solo: ひとりで練習のデータ
   odSet: 切断したら消す設定をした / startedRound: ホストが試合を始めた回 / sending: コールを送っている */
let db=null,ref=null,sref=null,room=null,code='',mySecret='',judged={},cur='',memo={},round=null,solo=null,odSet=false,startedRound=-1,sending=false;

/* 部屋の人(入った順)と、ホスト(いちばん先に入った人) */
const plist=()=>Object.entries((room&&room.players)||{}).sort((a,b)=>(a[1].joined||0)-(b[1].joined||0));
const isHost=()=>{const p=plist();return p.length>0&&p[0][0]===me.id};

/* ===== 入力の部品 ===== */

/* 数字ボタン。同じ数字は2回押せない。canOk=false なら OK だけ押せない(相手の番に先に打っておける) */
function drawPad(n,label,onOk,canOk=true){
  const el=$('pad');if(!el)return;
  el.innerHTML=`<div class="slots">${Array.from({length:n},(_,i)=>`<span class="${cur[i]?'on':''}">${cur[i]??''}</span>`).join('')}</div>
<div class="keys">${['1','2','3','4','5','6','7','8','9','del','0','ok'].map(k=>`<button class="${k}" data-k="${k}">${k==='del'?'⌫':k==='ok'?esc(label):k}</button>`).join('')}</div>`;
  el.querySelectorAll('button').forEach(b=>{
    const k=b.dataset.k;
    if(k==='ok')b.disabled=!canOk||cur.length!==n;
    else if(k==='del')b.disabled=!cur;
    else b.disabled=cur.includes(k)||cur.length>=n;
    b.onclick=()=>{
      if(k==='ok'){const v=cur;cur='';drawPad(n,label,onOk,false);onOk(v);return}
      cur=k==='del'?cur.slice(0,-1):cur+k;
      drawPad(n,label,onOk,canOk)}})}

/* メモ: タップするたびに ✕(ない) → ○(ある) → なし */
const memoHTML=()=>`<div class="memo">${[...'0123456789'].map(d=>`<button class="${memo[d]||''}" data-d="${d}">${d}</button>`).join('')}</div><div class="dim small">メモ: タップで ✕ → ○ → なし</div>`;
function bindMemo(){
  app.querySelectorAll('.memo button').forEach(b=>b.onclick=()=>{
    const d=b.dataset.d;memo[d]=memo[d]==='x'?'o':memo[d]==='o'?'':'x';b.className=memo[d]})}

/* コールの記録(新しいものが上) */
function histHTML(list){
  if(!list.length)return'<div class="dim">まだありません</div>';
  return`<table class="hist">${list.map((g,i)=>[i,g]).reverse().map(([i,g])=>`<tr><td class="dim">${i+1}</td><td class="num">${esc(g.g)}</td><td>${g.h==null?'<span class="dim">判定中…</span>':`<b class="H">${g.h}H</b> <b class="B">${g.b}B</b>`}</td></tr>`).join('')}</table>`}

/* ===== ホーム ===== */
function home(err){
  room=null;solo=null;cur='';
  const n=LS.get('hb-n')||'3',on=!!db;
  app.innerHTML=`<h1>${TITLE}</h1>
<div class="card">相手のひみつの数字を、先に当てたほうが勝ち！<br><b class="H">ヒット</b> … 数字も場所も同じ<br><b class="B">ブロー</b> … 数字は同じで、場所がちがう</div>
<div class="card">
<div class="seg">${['3','4'].map(v=>`<button class="sub dg ${v===n?'on':''}" data-n="${v}">${v}けた</button>`).join('')}</div>
<input id="nm" maxlength="8" placeholder="なまえ" value="${esc(me.name)}">
<button id="mk" ${on?'':'disabled'}>部屋を作る</button><hr>
<input id="cd" inputmode="numeric" maxlength="4" placeholder="部屋コード(4けた)" value="${esc(LS.get('hb-room')||'')}">
<button id="jn" class="sub" ${on?'':'disabled'}>入室する</button>
<div class="err" id="er">${esc(err||'')}</div></div>
<div class="card"><button id="so" class="sub">ひとりで練習</button>
<div class="dim">ベスト: 3けた ${esc(LS.get('hb-best3')||'-')}回 / 4けた ${esc(LS.get('hb-best4')||'-')}回</div></div>
<div class="dim">オンライン対戦は2人用</div>${FOOT}`;
  app.querySelectorAll('.dg').forEach(b=>b.onclick=()=>{
    LS.set('hb-n',b.dataset.n);app.querySelectorAll('.dg').forEach(x=>x.classList.toggle('on',x===b))});
  $('mk').onclick=()=>enter(true);
  $('jn').onclick=()=>enter(false);
  $('so').onclick=startSolo}

/* ===== ひとりで練習(コンピューターが決めた数字を当てる) ===== */
function startSolo(){
  const n=+(LS.get('hb-n')||3);
  solo={n,secret:randomNum(n),list:[],done:false,best:false};memo={};cur='';drawSolo()}
function drawSolo(){
  const s=solo;
  app.innerHTML=`<h1>${TITLE}</h1><div class="dim">ひとりで練習(${s.n}けた)</div>
${s.done?`<div class="card"><div class="big ok">🎉 ${esc(s.secret)}</div><div>${s.list.length}回で当てた！${s.best?' <b>ベスト更新！</b>':''}</div><button id="ag">もう一回</button></div>`
:`<div class="card"><div id="pad"></div></div><div class="card">${memoHTML()}</div>`}
<div class="card"><div class="lbl">あなたのコール</div>${histHTML(s.list)}</div>
<button id="bk" class="sub">${s.done?'もどる':'やめる'}</button>${s.done?'':'<button id="gu" class="sub">こうさん</button>'}${FOOT}`;
  $('bk').onclick=()=>home();
  if(s.done){$('ag').onclick=startSolo;return}
  $('gu').onclick=()=>{if(confirm('答えを見ますか？'))alert('答えは '+s.secret+' でした');startSolo()};
  bindMemo();
  drawPad(s.n,'コール',g=>{
    const r=judge(s.secret,g);s.list.push({g,...r});
    if(r.h===s.n){
      s.done=true;
      const k='hb-best'+s.n,b=+LS.get(k)||Infinity;
      if(s.list.length<b){LS.set(k,String(s.list.length));s.best=true}}
    drawSolo()})}

/* ===== オンライン: 部屋を作る・入る・出る ===== */

/* 部屋に入る(create=true なら新しく作る) */
async function enter(create){
  const nm=$('nm').value.trim();
  if(!nm){$('er').textContent='なまえを入れてね';return}
  me.name=nm;LS.set('hb-name',nm);
  const n=+(LS.get('hb-n')||3);
  $('mk').disabled=$('jn').disabled=true;
  try{
    let c=$('cd').value.trim();
    if(create){
      /* あいている4けたのコードを探す */
      for(let i=0;i<20;i++){c=String(1000+Math.floor(Math.random()*9000));if(!(await db.ref('hitblow-rooms/'+c).get()).exists())break}}
    else{
      if(!/^\d{4}$/.test(c))throw'部屋コードは4けたの数字だよ';
      const r=(await db.ref('hitblow-rooms/'+c).get()).val();
      if(!r)throw'部屋がありません';
      const ps=r.players||{};
      /* 同じスマホなら、ゲーム中でも戻れる */
      if(!ps[me.id]){
        if(Object.keys(ps).length>=2)throw'満員です(2人まで)';
        if(r.state!=='lobby')throw'もう始まっています'}}
    code=c;ref=db.ref('hitblow-rooms/'+c);sref=db.ref('hitblow-secrets/'+c+'/'+me.id);
    if(create)await ref.set({state:'lobby',n,round:0});
    const pr=ref.child('players/'+me.id);
    if((await pr.get()).exists())await pr.update({name:me.name});
    else await pr.set({name:me.name,joined:firebase.database.ServerValue.TIMESTAMP,ready:false});
    mySecret=(await sref.get()).val()||'';
    LS.set('hb-room',c);odSet=false;judged={};startedRound=-1;round=null;sending=false;
    /* 部屋のデータが変わるたびに呼ばれる */
    ref.on('value',s=>{room=s.val();onRoom()});
  }catch(e){
    if(typeof e!=='string')console.warn(e);
    const er=$('er');if(!er)return;
    er.textContent=typeof e==='string'?e:'つながりませんでした。もう一度ためしてね';
    $('mk').disabled=$('jn').disabled=false}}

/* 部屋から離れたあとの片づけ */
function cleanup(){
  try{ref&&ref.off()}catch(e){}
  ref=null;sref=null;room=null;odSet=false;mySecret='';round=null;LS.del('hb-room')}

/* 退出する(最後の1人なら部屋ごと消す) */
async function leave(){
  const r=ref,s=sref,alone=plist().filter(([id])=>id!==me.id).length===0;
  cleanup();home();
  try{await s.remove()}catch(e){}
  try{
    await r.child('players/'+me.id).onDisconnect().cancel();
    if(alone)await r.remove();else await r.child('players/'+me.id).remove()}catch(e){console.warn(e)}}

/* 試合をやり直すときに消すもの(いる人の「決めた」も消す) */
function resetFields(state){
  const u={state,guesses:null,first:null,turn:null,last:null,winner:null,reveal:null};
  plist().forEach(([id])=>u['players/'+id+'/ready']=false);
  return u}

/* 部屋のデータが変わったら、いまの場面の画面を出す */
function onRoom(){
  if(!ref)return;
  if(!room){cleanup();return home('部屋が閉じました')}
  if(!(room.players&&room.players[me.id])){cleanup();return home('部屋から外れました')}
  /* 待ちあいの間だけ、回線が切れたら自分を消す(試合中は、開き直せば戻れるように) */
  const pr=ref.child('players/'+me.id);
  if(room.state==='lobby'&&!odSet){pr.onDisconnect().remove();odSet=true}
  if(room.state!=='lobby'&&odSet){pr.onDisconnect().cancel();odSet=false}
  /* 新しい試合になったら、前の数字・メモを消す */
  if(round!==room.round){
    if(round!==null){mySecret='';sref.remove().catch(()=>{});judged={};sending=false}
    round=room.round;memo={};cur=''}
  const opp=plist().find(([id])=>id!==me.id);
  /* 相手が抜けたら、待ちあいにもどす */
  if(room.state!=='lobby'&&!opp){ref.update(resetFields('lobby'));return}
  if(room.state==='set')return drawSet(opp);
  if(room.state==='play'){autoJudge();return drawPlay(opp)}
  if(room.state==='end'){
    if(mySecret&&!(room.reveal&&room.reveal[me.id]))ref.child('reveal/'+me.id).set(mySecret);
    return drawEnd(opp)}
  drawLobby(opp)}

/* ===== オンライン: 画面 ===== */

/* 待ちあい */
function drawLobby(opp){
  const host=isHost();
  app.innerHTML=`<h1>${TITLE}</h1>
<div class="card"><div class="dim">部屋コード</div><div class="code">${esc(code)}</div><div class="dim">相手にこのコードを教えてね</div></div>
<div class="card">${plist().map(([id,p])=>`<span class="pl ${id===me.id?'me':''}">${esc(p.name)}</span>`).join('<span class="vs">VS</span>')}
${opp?'':'<div class="dim">相手を待っています…</div>'}</div>
<div class="card"><div class="seg">${[3,4].map(v=>`<button class="sub dg ${v===room.n?'on':''}" data-n="${v}" ${host?'':'disabled'}>${v}けた</button>`).join('')}</div>
${host?`<button id="st" ${opp?'':'disabled'}>はじめる</button>`:'<div class="dim">ホストがはじめるのを待っています</div>'}</div>
<button id="lv" class="sub">退出</button>${FOOT}`;
  if(host){
    app.querySelectorAll('.dg').forEach(b=>b.onclick=()=>ref.update({n:+b.dataset.n}));
    $('st').onclick=()=>ref.update({...resetFields('set'),round:(room.round||0)+1})}
  $('lv').onclick=leave}

/* ひみつの数字を決める */
function drawSet(opp){
  const n=room.n,mine=!!room.players[me.id].ready,theirs=!!opp[1].ready;
  /* ホスト: 2人とも決めたら、先攻をランダムに決めてスタート */
  if(isHost()&&mine&&theirs&&startedRound!==room.round){
    startedRound=room.round;
    const f=Math.random()<.5?me.id:opp[0];
    ref.update({state:'play',first:f,turn:f})}
  app.innerHTML=`<h1>${TITLE}</h1><div class="dim">${esc(me.name)} VS ${esc(opp[1].name)}・${n}けた</div>
${mine?`<div class="card"><div class="dim">あなたのひみつの数字</div><div class="big">${esc(mySecret||'？')}</div><div class="dim">${theirs?'まもなくスタート！':'相手が数字を決めるのを待っています…'}</div></div>`
:`<div class="card"><div class="lbl">ひみつの数字を決めよう</div><div class="dim small">${n}けた・同じ数字は使えません</div><div id="pad"></div><button id="rn" class="sub">おまかせ</button></div>
<div class="dim">${esc(opp[1].name)}: ${theirs?'決めた ✅':'考え中…'}</div>`}
<button id="lv" class="sub">退出</button>`;
  $('lv').onclick=leave;
  if(mine)return;
  const ok=async v=>{
    if(!valid(v,n))return;
    mySecret=v;
    try{await sref.set(v);await ref.child('players/'+me.id+'/ready').set(true)}
    catch(e){console.warn(e);mySecret='';alert('保存できませんでした。もう一度ためしてね');drawSet(opp)}};
  drawPad(n,'決定',ok);
  $('rn').onclick=()=>{cur=randomNum(n);drawPad(n,'決定',ok)}}

/* コールの一覧(古い順) */
const guesses=()=>Object.entries(room.guesses||{}).map(([k,v])=>({k,...v})).sort((a,b)=>(a.t||0)-(b.t||0));

/* 相手のコールを、自分の数字で判定する */
function autoJudge(){
  if(!mySecret)return;
  const n=room.n;
  guesses().forEach(g=>{
    if(g.by===me.id||g.h!=null||judged[g.k])return;
    judged[g.k]=1;
    const r=valid(g.g,n)?judge(mySecret,g.g):{h:0,b:0},hit=r.h===n;
    const u={['guesses/'+g.k+'/h']:r.h,['guesses/'+g.k+'/b']:r.b};
    if(room.last){u.state='end';u.winner=hit?'draw':room.last}       /* 後攻の最後のチャンス */
    else if(hit&&g.by===room.first){u.last=g.by;u.turn=me.id}       /* 先攻が当てた → 後攻にもう1回 */
    else if(hit){u.state='end';u.winner=g.by}                       /* 後攻が当てた → 勝ち */
    else u.turn=me.id;                                              /* はずれ → こっちの番 */
    ref.update(u).catch(e=>{console.warn(e);delete judged[g.k]})})}

/* 対戦中 */
function drawPlay(opp){
  const n=room.n,gs=guesses(),mine=gs.filter(g=>g.by===me.id),theirs=gs.filter(g=>g.by!==me.id);
  const pending=mine.some(g=>g.h==null);
  if(!pending)sending=false;
  const myTurn=room.turn===me.id&&!pending&&!sending;
  const note=room.last?`<div class="card warn">${room.last===me.id?'当てた！ 後攻の相手に最後のチャンス…':'相手が当てた！ 当てれば引き分け、ラストチャンス！'}</div>`:'';
  app.innerHTML=`<h1>${TITLE}</h1>
<div class="turn ${myTurn?'mine':''}">${myTurn?'あなたの番！':pending?'判定中…':esc(opp[1].name)+' の番…'}</div>${note}
<div class="card"><div id="pad"></div></div>
<div class="card">${memoHTML()}</div>
<div class="two"><div class="card"><div class="lbl">あなた</div>${histHTML(mine)}</div><div class="card"><div class="lbl">${esc(opp[1].name)}</div>${histHTML(theirs)}</div></div>
<div class="dim">あなたのひみつの数字: <b>${esc(mySecret||'？')}</b></div>
<button id="lv" class="sub">退出</button>`;
  bindMemo();
  $('lv').onclick=()=>{if(confirm('試合をやめて退出しますか？'))leave()};
  drawPad(n,'コール',g=>{
    if(!valid(g,n)||room.turn!==me.id||sending)return;
    sending=true;
    ref.child('guesses').push({by:me.id,g,t:firebase.database.ServerValue.TIMESTAMP})
      .catch(e=>{console.warn(e);sending=false;alert('送れませんでした。もう一度ためしてね');drawPlay(opp)})},myTurn)}

/* 結果 */
function drawEnd(opp){
  const w=room.winner,gs=guesses(),mine=gs.filter(g=>g.by===me.id),theirs=gs.filter(g=>g.by!==me.id);
  const res=w==='draw'?'🤝 引き分け！':w===me.id?'🏆 あなたの勝ち！':'😢 負け…';
  const os=(room.reveal&&room.reveal[opp[0]])||'…';
  app.innerHTML=`<h1>${TITLE}</h1>
<div class="card"><div class="big ${w===me.id?'ok':''}" style="letter-spacing:0">${res}</div>
<div class="two" style="margin-top:8px"><div><div class="dim">あなたの数字</div><div class="big">${esc(mySecret||'？')}</div></div><div><div class="dim">${esc(opp[1].name)}の数字</div><div class="big">${esc(os)}</div></div></div></div>
${isHost()?'<button id="ag">もう一回</button>':'<div class="dim">ホストが「もう一回」を押すのを待っています</div>'}
<div class="two"><div class="card"><div class="lbl">あなた</div>${histHTML(mine)}</div><div class="card"><div class="lbl">${esc(opp[1].name)}</div>${histHTML(theirs)}</div></div>
<button id="lv" class="sub">退出</button>${FOOT}`;
  if($('ag'))$('ag').onclick=()=>ref.update({...resetFields('set'),round:(room.round||0)+1});
  $('lv').onclick=leave}

/* ===== はじめに: Firebase につなぐ(だめでも、ひとりで練習はできる) ===== */
function boot(){
  if(typeof firebase==='undefined'||typeof firebaseConfig==='undefined')return home('オンライン対戦に今つなげません(ひとりで練習はできます)');
  try{
    firebase.initializeApp(firebaseConfig);
    /* App Check は、まだ使っていない(専用プロジェクトに reCAPTCHA の設定ができたら、ここで activate する) */
    db=firebase.database()}
  catch(e){console.warn(e);db=null;return home('オンライン対戦に今つなげません(ひとりで練習はできます)')}
  app.innerHTML=`<h1>${TITLE}</h1><div class="card dim">接続中…</div>`;
  /* 見えない匿名ログイン。uid をそのままプレイヤーのIDにする(ひみつの数字を本人しか読めないようにするため) */
  let started=false;
  const go=()=>{if(started)return;started=true;home()};
  try{firebase.auth().signInAnonymously().then(c=>{if(c&&c.user&&c.user.uid)me.id=c.user.uid}).catch(e=>console.warn('ログインできませんでした',e)).then(go)}catch(e){go()}
  setTimeout(go,8000)}
boot();
