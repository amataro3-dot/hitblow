# Hit & Blow(Muddy's Games)

相手のひみつの数字を当てる、2人用のオンライン数字当て対戦ゲーム。ひとりで練習モードつき。

- 公開先: https://muddys-games.com/hitblow/ (リポジトリ名 `hitblow` で GitHub Pages)
- ファイル: `index.html` / `style.css` / `game.js` / `config.js`(ほかのゲームと同じ Firebase 設定)
- 遊び方ページ: サイト側の `howto-hitblow.html`

## Firebase のルールに足すもの(公開前に必須)

Realtime Database → ルール の `"rules": { ... }` の中に、下の2つを足す。
今あるゲームのルールは消さない。

```json
"hitblow-rooms": {
  "$code": {
    ".read": "auth != null",
    ".write": "auth != null && ((!data.exists() && !newData.child('players').exists()) || data.child('players').child(auth.uid).exists())",
    ".validate": "$code.matches(/^[0-9]{4}$/)",
    "players": {
      "$pid": {
        ".write": "auth != null && $pid === auth.uid",
        ".validate": "newData.hasChild('name') && newData.child('name').isString() && newData.child('name').val().length <= 20"
      }
    }
  }
},
"hitblow-secrets": {
  "$code": {
    "$uid": {
      ".read": "auth != null && auth.uid === $uid",
      ".write": "auth != null && auth.uid === $uid",
      ".validate": "newData.isString() && newData.val().matches(/^[0-9]{3,4}$/)"
    }
  }
}
```

- `hitblow-secrets` は、ひみつの数字を本人しか読めないようにするため。
  判定は数字を持っている本人のスマホが行うので、相手からは数字が見えない。

## データの形

- `hitblow-rooms/<部屋コード>`: state(lobby→set→play→end)、n(けた数)、round、players、guesses、first、turn、last、winner、reveal
- `hitblow-secrets/<部屋コード>/<uid>`: ひみつの数字
- 先攻が当てたら、後攻に最後のチャンス(`last`)。後攻も当てたら引き分け。
