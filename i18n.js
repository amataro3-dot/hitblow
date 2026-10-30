/* 言語(日本語・English・한국어)。game.js より先に読む。Party-Arcade・Labyrinth と同じ決まり。
   - 画面の文字は T('日本語の文')。下の辞書 I18N に [英語, 韓国語] を書く。辞書にない文は日本語のまま出る。
   - {n} などは T('{n}けた',{n:3}) のように置きかえる(HTMLもそのまま入る)。
   - 名前のあとの「さん」は SAN(名前)(英語はなし、韓国語は「님」)。
   - Firebase には数字・名前・uid だけが入る(文は入らない)ので、同じ部屋でも人それぞれの言語で出る。
   - 言語は URL の ?lang=ja/en/ko → localStorage の muddys-lang(全ゲーム共通)→ スマホの言語設定 の順で決める。 */

const LANGS = ['ja', 'en', 'ko'];
const LANG_NAMES = { ja: '日本語', en: 'English', ko: '한국어' };
const LANG = (() => {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (LANGS.includes(q)) { localStorage.setItem('muddys-lang', q); return q; }
  } catch (e) { }
  try { const s = localStorage.getItem('muddys-lang'); if (LANGS.includes(s)) return s; } catch (e) { }
  const n = String(navigator.language || '').toLowerCase();
  return n.startsWith('ko') ? 'ko' : n.startsWith('ja') ? 'ja' : 'en';
})();
document.documentElement.lang = LANG;

function T(ja, vars) {
  const e = I18N[ja];
  let s = LANG === 'ja' || !e ? ja : (e[LANG === 'en' ? 0 : 1] ?? ja);
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}
const SAN = n => n + (LANG === 'ja' ? 'さん' : LANG === 'ko' ? '님' : '');
/* サイトへのリンク(英語・韓国語は /en/ /ko/ のページ) */
const sitePath = p => (LANG !== 'ja' ? '/' + LANG + p : p);

/* ホームの「日本語 / English / 한국어」。押したら、なまえを覚えてから読みこみ直す */
const langSwitchHtml = () => `<div class="seg lang">${LANGS.map(l => `<button class="sub ${l === LANG ? 'on' : ''}" data-lang="${l}">${LANG_NAMES[l]}</button>`).join('')}</div>`;
function langSwitchInit(saveName) {
  document.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => {
    const l = b.dataset.lang; if (l === LANG) return;
    try { saveName(); localStorage.setItem('muddys-lang', l); } catch (e) { }
    const u = new URL(location.href); u.searchParams.delete('lang'); location.href = u.toString();
  });
}

const I18N = {
  // --- ホーム ---
  'Muddy\'s Games トップ': ['Muddy\'s Games home', 'Muddy\'s Games 홈'],
  '遊び方': ['How to play', '게임 방법'],
  'プライバシーポリシー': ['Privacy policy', '개인정보 처리방침'],
  '相手のひみつの数字を、先に当てたほうが勝ち！': ['Guess your opponent’s secret number first to win!', '상대의 비밀 숫자를 먼저 맞히는 쪽이 이겨요!'],
  'ヒット': ['Hit', '히트'],
  '… 数字も場所も同じ': ['… right number, right place', '… 숫자도 자리도 같음'],
  'ブロー': ['Blow', '블로'],
  '… 数字は同じで、場所がちがう': ['… right number, wrong place', '… 숫자는 같지만 자리가 다름'],
  '{n}けた': ['{n} digits', '{n}자리'],
  'なまえ': ['Name', '이름'],
  '部屋を作る': ['Create a room', '방 만들기'],
  '部屋コード(4けた)': ['Room code (4 digits)', '방 코드 (4자리)'],
  '入室する': ['Join', '입장하기'],
  'ひとりで練習': ['Practice alone', '혼자 연습'],
  'ベスト: 3けた {a}回 / 4けた {b}回': ['Best: 3 digits {a} tries / 4 digits {b} tries', '최고 기록: 3자리 {a}회 / 4자리 {b}회'],
  'オンラインは8人まで。A〜Dのフロアで同時に対戦できます': ['Online: up to 8 players. Matches run at the same time on floors A–D', '온라인은 8명까지. A~D 플로어에서 동시에 대전할 수 있어요'],
  'なまえを入れてね': ['Please enter your name', '이름을 입력해 주세요'],
  '部屋コードは4けたの数字だよ': ['The room code is a 4-digit number', '방 코드는 4자리 숫자예요'],
  '部屋がありません': ['Room not found', '방이 없어요'],
  '満員です(8人まで)': ['The room is full (max 8)', '인원이 다 찼어요 (최대 8명)'],
  'つながりませんでした。もう一度ためしてね': ['Couldn’t connect. Please try again', '연결하지 못했어요. 다시 시도해 주세요'],
  'オンライン対戦に今つなげません(ひとりで練習はできます)': ['Online play is unavailable right now (you can still practice alone)', '지금은 온라인 대전에 연결할 수 없어요 (혼자 연습은 할 수 있어요)'],
  '接続中…': ['Connecting…', '연결 중…'],

  // --- 数字ボタン・メモ・記録 ---
  'コール': ['Call', '콜'],
  '決定': ['OK', '결정'],
  '場所のメモ': ['Position memo', '위치 메모'],
  '入れたい数字を押してね(□をもう一度押すとやめる)': ['Tap the number to put in (tap □ again to cancel)', '넣을 숫자를 눌러 주세요 (□를 다시 누르면 취소)'],
  'メモ: タップで ✕ → ○ → なし / □を押すと場所のメモ': ['Memo: tap for ✕ → ○ → none / tap □ for a position memo', '메모: 탭하면 ✕ → ○ → 없음 / □를 누르면 위치 메모'],
  '入力中…': ['typing…', '입력 중…'],
  'まだありません': ['None yet', '아직 없어요'],
  '判定中…': ['Checking…', '판정 중…'],

  // --- 演出 ---
  'あなたのコール': ['Your call', '나의 콜'],
  '{n}のコール': ['{n}’s call', '{n}의 콜'],
  '正解！': ['Correct!', '정답!'],
  'ハズレ…': ['Miss…', '꽝…'],
  '{a}先攻！<br>{b}後攻です！': ['{a} goes first!<br>{b} goes second!', '{a} 선공!<br>{b} 후공이에요!'],
  'サドンデス！！！': ['SUDDEN DEATH!!!', '서든데스!!!'],
  '{n}、当てられなかったら負け！': ['{n}, if you don’t guess it, you lose!', '{n}, 맞히지 못하면 패배!'],

  // --- ひとりで練習 ---
  'ひとりで練習({n}けた)': ['Practice alone ({n} digits)', '혼자 연습 ({n}자리)'],
  '{n}回で当てた！': ['Got it in {n} tries!', '{n}회 만에 맞혔다!'],
  'ベスト更新！': ['New best!', '최고 기록 갱신!'],
  'もう一回': ['Play again', '한 번 더'],
  'もどる': ['Back', '돌아가기'],
  'やめる': ['Quit', '그만하기'],
  'こうさん': ['Give up', '포기'],
  '答えを見ますか？': ['Show the answer?', '답을 볼까요?'],
  '答えは {s} でした': ['The answer was {s}', '답은 {s}였어요'],

  // --- 待ちあい ---
  '部屋が閉じました': ['The room was closed', '방이 닫혔어요'],
  '部屋コード': ['Room code', '방 코드'],
  'みんなにこのコードを教えてね(8人まで)': ['Share this code with everyone (up to 8)', '모두에게 이 코드를 알려 주세요 (8명까지)'],
  '{f}フロア': ['Floor {f}', '{f} 플로어'],
  '空き': ['Empty', '빈자리'],
  'はじめる': ['Start', '시작'],
  '({f}フロア)': [' (Floors {f})', ' ({f} 플로어)'],
  'ホストがはじめるのを待っています': ['Waiting for the host to start', '방장이 시작하기를 기다리는 중'],
  '2人そろったフロアが同時に始まります。席に座らなかった人は観戦です': ['Floors with 2 players start together. Anyone without a seat watches', '2명이 모인 플로어가 동시에 시작해요. 자리에 앉지 않은 사람은 관전이에요'],
  '退出': ['Leave', '나가기'],

  // --- 試合 ---
  '準備中…': ['Getting ready…', '준비 중…'],
  'ひみつの数字を決めよう': ['Choose your secret number', '비밀 숫자를 정해요'],
  '{n}けた・同じ数字は使えません': ['{n} digits · no repeated digits', '{n}자리 · 같은 숫자는 쓸 수 없어요'],
  'おまかせ': ['Random', '랜덤'],
  '決めた ✅': ['Done ✅', '결정 ✅'],
  '考え中…': ['Thinking…', '생각 중…'],
  'あなたのひみつの数字': ['Your secret number', '나의 비밀 숫자'],
  'まもなくスタート！': ['Starting soon!', '곧 시작!'],
  '相手が数字を決めるのを待っています…': ['Waiting for your opponent to choose…', '상대가 숫자를 정하기를 기다리는 중…'],
  'ひみつの数字を決めています': ['Choosing secret numbers', '비밀 숫자를 정하는 중'],
  '当てた！ 後攻の相手に最後のチャンス…': ['You got it! Your opponent gets one last chance…', '맞혔다! 후공인 상대에게 마지막 찬스…'],
  '相手が当てた！ 当てれば引き分け、ラストチャンス！': ['Your opponent got it! Guess it too for a draw — last chance!', '상대가 맞혔다! 맞히면 무승부, 마지막 찬스!'],
  '{n}が当てた！ 後攻のラストチャンス': ['{n} got it! Last chance for the second player', '{n}이 맞혔다! 후공의 마지막 찬스'],
  'あなたの番！': ['Your turn!', '당신 차례!'],
  '{n} の番…': ['{n}’s turn…', '{n}의 차례…'],
  '{n} の番': ['{n}’s turn', '{n}의 차례'],
  'あなた': ['You', '나'],
  '(不戦勝)': [' (by forfeit)', ' (부전승)'],
  '🤝 引き分け！': ['🤝 Draw!', '🤝 무승부!'],
  '🏆 あなたの勝ち！': ['🏆 You win!', '🏆 당신의 승리!'],
  '😢 負け…': ['😢 You lose…', '😢 패배…'],
  '{n}の勝ち！': ['{n} wins!', '{n} 승리!'],
  'あなたの数字': ['Your number', '나의 숫자'],
  '{n}の数字': ['{n}’s number', '{n}의 숫자'],
  'もう一回(ロビーへ)': ['Play again (to lobby)', '한 번 더 (로비로)'],
  'ホストが「もう一回」を押すのを待っています': ['Waiting for the host to tap “Play again”', '방장이 「한 번 더」를 누르기를 기다리는 중'],
  'ほかのフロアが終わるのを待っています(下のボタンで観戦できます)': ['Waiting for the other floors to finish (watch them with the buttons below)', '다른 플로어가 끝나기를 기다리는 중 (아래 버튼으로 관전할 수 있어요)'],
  '観戦中': ['Watching', '관전 중'],
  '{f}フロア・{n}けた': ['Floor {f} · {n} digits', '{f} 플로어 · {n}자리'],
  '試合をやめて退出しますか？(相手の不戦勝になります)': ['Leave the match? (Your opponent wins by forfeit)', '경기를 그만두고 나갈까요? (상대의 부전승이 돼요)'],
  '保存できませんでした。もう一度ためしてね': ['Couldn’t save. Please try again', '저장하지 못했어요. 다시 시도해 주세요'],
  '送れませんでした。もう一度ためしてね': ['Couldn’t send. Please try again', '보내지 못했어요. 다시 시도해 주세요']
};
