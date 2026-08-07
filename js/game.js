/* =====================================================================
 * 企画部カードゲーム — game.js（ゲームロジック全体）
 * ---------------------------------------------------------------------
 * このファイルは1つのグローバルスコープです（関数は巻き上げで相互参照）。
 * 分割する場合は実行順・TDZに注意（例: buildRealPool は CARD_POOL より前）。
 *
 * 目次（Ctrl+F で関数名検索）:
 *   [データ]      CARD_DATA / buildRealPool / freshPlayer / newGame
 *   [CP計算]      baseCP / linkedCP / battleCP / dist8 / isCut
 *   [効果基盤]    provides / motifActive / motifCondMet / maintainMotifs
 *   [バトル]      attackFrom / resolveOrAskDefense / showDefensePrompt /
 *                 beginBlockSelect / resolveBlock / resolveTake / endAttack /
 *                 destroyBattle / toGrave
 *   [召喚/ターン] beginPlacing / placeCard / onSummon / startTurn /
 *                 endTurn / finishTurn / offerLifeSummon
 *   [キャラ効果]  ○◇△✕⬠◎ 各シリーズの効果関数（masaTarget, kuriDiaTarget,
 *                 reaXRoll, musuXUnlink, nekoXAttack ... 等）
 *   [モチーフ]    activateMotif / runMotifInstant / motifYoda... / MOTIF_INSTANT /
 *                 MOTIF_COND / MOTIF_ANYTIME
 *   [特殊]        playSpecial / SPECIAL_IMPL / showSpecialCard
 *   [CPU AI]      cpuTurn / cpuChooseAttack / cpuDefense
 *   [P2P通信]     NET / createRoom / joinRoom / hostStartGame /
 *                 hostApplyResp / hostApplyIn / clientShowPrompt / netSnapshotFor
 *   [描画/UI]     render / cardNode / renderSlots / renderHand / openDetail /
 *                 selectPrompt / showPickBanner / applyMats
 *   [プレイマット] MY_MAT / applyMats / fitMatBox / updateMatUI
 *   [サウンド]     Snd / UrlAudio
 * ===================================================================== */
"use strict";
const CONFIG={ LIFE_START:6, LIFE_MAX:12, OPENING:5, SLOTS:3, EN_MAX:5, GRAVE_KINDS:5 };
const SHAPES=["○","◇","✕","△","◎","⬠","♡"];
const COLORS=[{k:"赤",v:"var(--c-red)"},{k:"青",v:"var(--c-blue)"},{k:"黄",v:"var(--c-yellow)"},{k:"緑",v:"var(--c-green)"},{k:"橙",v:"var(--c-orange)"},{k:"紫",v:"var(--c-purple)"}];
const KEY2VAL=Object.fromEntries(COLORS.map(c=>[c.k,c.v]));
const TYPEJP={character:"キャラ",special:"特殊",motif:"モチーフ特殊",friendlink:"フレンドリンク"};
const DECK_MIN=20, DECK_MAX=22, COPY_MAX=3;

/* =========================================================
   CARD_POOL / PACKAGES — 本番データに差し替える場所
   card: {id, name, cp, energy, shape, colors:[k,k,k], effect, img, max}
   ========================================================= */
const TIMINGS=["常時","召喚時","エネルギー回復時","エネルギー増減時","アタック時","味方アタック時","ブロック時","味方ブロック時","バトル破壊時","破壊時","ターンエンド時","リンク先効果発動時","フレンドリンク"];
const CARD_DATA=[{"i":0,"n":"YODA Yodo","ty":"character","sh":"○","cp":1,"en":4,"co":["紫","紫","紫"],"ti":["常時"],"e":"【常時】敵味方ともにエネルギーを基本CPとする。CPを加減する時はこの効果の後に計算する"},{"i":1,"n":"りおっぴ","ty":"character","sh":"○","cp":1,"en":4,"co":["赤","赤","赤"],"ti":["アタック時"],"e":"【アタック時】ターンに1度だけ、相手のライフを減らした時、追加でライフを1削る"},{"i":2,"n":"れあ","ty":"character","sh":"○","cp":1,"en":5,"co":["紫","紫","青"],"ti":["バトル破壊時","破壊時"],"e":"【バトル破壊時】墓地から\"れあ\"以外のキャラ1枚を宣言して手札に加える"},{"i":3,"n":"ちゅろす","ty":"character","sh":"○","cp":2,"en":3,"co":["橙","橙","緑"],"ti":["常時"],"e":"【常時】リンク先の効果を獲得する、ただし、召喚時･破壊時効果は発動しない"},{"i":4,"n":"いと","ty":"character","sh":"○","cp":2,"en":3,"co":["紫","紫","緑"],"ti":["アタック時"],"e":"【アタック時】このキャラの合計CPが8の時ブロックされない"},{"i":5,"n":"げんちゃん","ty":"character","sh":"○","cp":2,"en":3,"co":["緑","緑","青"],"ti":["アタック時"],"e":"【アタック時】正面の敵のエネルギー-1,エネルギー0の相手にはブロックされない"},{"i":6,"n":"Fam","ty":"character","sh":"○","cp":2,"en":3,"co":["赤","赤","橙"],"ti":["常時"],"e":"【常時】このキャラの正面の相手キャラは基本CP-1(0未満にはならない)"},{"i":7,"n":"D!amusung","ty":"character","sh":"○","cp":3,"en":3,"co":["橙","橙","紫"],"ti":["メイン"],"e":"【自分のメイン時】ターンに一度、味方と位置を入れ替えることができる"},{"i":8,"n":"Masa","ty":"character","sh":"○","cp":3,"en":2,"co":["赤","赤","青"],"ti":["アタック時"],"e":"【アタック時】ブロック可能な相手に指定アタックすることができるが、ゲーム開始3ターンはアタックできない"},{"i":9,"n":"ぺんしりゃ。","ty":"character","sh":"○","cp":2,"en":3,"co":["橙","橙","青"],"ti":["常時"],"e":"【常時】他キャラカードの効果を受けない"},{"i":10,"n":"新薬浅田","ty":"character","sh":"○","cp":4,"en":3,"co":["橙","橙","青"],"ti":["ブロック時"],"e":"【ブロック時】このバトル中味方全員基本CP+1"},{"i":11,"n":"くり","ty":"character","sh":"○","cp":4,"en":2,"co":["紫","紫","赤"],"ti":[],"e":"アタック時、ライフを削るとエネルギーが減少しない"},{"i":12,"n":"りんごあめ","ty":"character","sh":"○","cp":4,"en":2,"co":["緑","緑","青"],"ti":["バトル破壊時","破壊時"],"e":"【バトル破壊時】エネルギーが1以上あれば、エネルギー0の状態で再召喚できる"},{"i":13,"n":"真筝","ty":"character","sh":"○","cp":5,"en":2,"co":["橙","橙","赤"],"ti":["アタック時","味方ブロック時","ブロック時"],"e":"【アタック時】ライフ+1(最大6)【味方ブロック時】このバトル中このキャラの基本CP-1"},{"i":14,"n":"一ノ城","ty":"character","sh":"○","cp":5,"en":4,"co":["紫","紫","青"],"ti":["常時"],"e":"【常時】エネルギーが味方の中で単独で最多の時、このキャラのみブロックできる"},{"i":15,"n":"とれんさー","ty":"character","sh":"○","cp":3,"en":2,"co":["緑","緑","橙"],"ti":["召喚時","味方召喚時"],"e":"【味方召喚時】手札からキャラカードを1枚召喚できる(ターン1)"},{"i":16,"n":"YODA Yodo","ty":"character","sh":"◇","cp":2,"en":3,"co":["紫","紫","赤"],"ti":["ターンエンド時"],"e":"【自分のターンエンド時】エネルギーを1消費することで、相手キャラ1体を指定することができる。指定したキャラは次のターン効果を発動できない"},{"i":17,"n":"りおっぴ","ty":"character","sh":"◇","cp":1,"en":3,"co":["赤","赤","紫"],"ti":["バトル破壊時","破壊時"],"e":"【バトル破壊時】このキャラのエネルギー未満のキャラカード一体を破壊する"},{"i":18,"n":"れあ","ty":"character","sh":"◇","cp":1,"en":3,"co":["青","青","緑"],"ti":["常時"],"e":"【常時】2種類の図形とリンクしている時バトルによって破壊されない"},{"i":19,"n":"ちゅろす","ty":"character","sh":"◇","cp":2,"en":4,"co":["青","青","黄"],"ti":["バトル破壊時","破壊時"],"e":"【バトル破壊時】リンク先にこのキャラのエネルギーを分配する"},{"i":20,"n":"いと","ty":"character","sh":"◇","cp":5,"en":3,"co":["緑","緑","黄"],"ti":["ブロック時"],"e":"【アタック･ブロック時】このバトル中、このキャラの基本CP-2"},{"i":21,"n":"げんちゃん","ty":"character","sh":"◇","cp":2,"en":2,"co":["紫","紫","黄"],"ti":["ブロック時"],"e":"【ブロック時】味方と位置を入れ替えることができる。入れ替え後、エネルギーが1以上ある時相打ちによって破壊されない。"},{"i":22,"n":"Fam","ty":"character","sh":"◇","cp":3,"en":3,"co":["青","青","赤"],"ti":[],"e":"召喚時、山札からモチーフ特殊カードもしくは特殊カード1枚を宣言して手札に加える"},{"i":23,"n":"D!amusung","ty":"character","sh":"◇","cp":3,"en":4,"co":["赤","赤","黄"],"ti":[],"e":"味方のアタック･ブロック時、追加でエネを1消費することでこのバトル中の自分の基本CPを+1or-1する"},{"i":24,"n":"Masa","ty":"character","sh":"◇","cp":3,"en":3,"co":["黄","黄","緑"],"ti":[],"e":"アタック終了時、ターンに一度ライフを1消費することでさらにアタックできる"},{"i":25,"n":"ぺんしりゃ。","ty":"character","sh":"◇","cp":3,"en":3,"co":["橙","橙","緑"],"ti":[],"e":"アタック時、合計CPが奇数ならエネルギーが減少しない"},{"i":26,"n":"新薬浅田","ty":"character","sh":"◇","cp":4,"en":2,"co":["橙","橙","紫"],"ti":["召喚時"],"e":"【召喚時】自分の山札から1枚ドローし、合計CPが偶数ならばダイスを振り、4,5,6が出れば相手の山札を1枚破棄"},{"i":27,"n":"くり","ty":"character","sh":"◇","cp":4,"en":2,"co":["黄","黄","赤"],"ti":[],"e":"アタック時、敵キャラ1体を指定し、そのキャラにはブロックされない"},{"i":28,"n":"りんごあめ","ty":"character","sh":"◇","cp":4,"en":1,"co":["緑","緑","赤"],"ti":["常時","アタック時"],"e":"【常時】リンクできず、墓地にもいけず、アタック以外でエネルギー増減もしないが、【アタック時】ブロックされない"},{"i":29,"n":"真筝","ty":"character","sh":"◇","cp":2,"en":2,"co":["赤","赤","緑"],"ti":[],"e":"アタック時、リンク先のエネルギーを合計3消費するとブロックされない"},{"i":30,"n":"一ノ城","ty":"character","sh":"◇","cp":5,"en":3,"co":["赤","赤","緑"],"ti":[],"e":"アタック時、正面の敵と相手キャラを入れ替えることができる"},{"i":31,"n":"とれんさー","ty":"character","sh":"◇","cp":5,"en":2,"co":["青","青","黄"],"ti":[],"e":"バトル結果を反転する、相打ち時は自分のみ破壊する"},{"i":32,"n":"YODA Yodo","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能 自分のキャラ1〜3体のエネルギーを+2もしくは相手のキャラクター1体のエネルギー-2する"},{"i":33,"n":"りおっぴ","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能 互いにエネルギー0のキャラクターとブランクカードを全て破壊する"},{"i":34,"n":"れあ","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 破壊時に使用可能 墓地からすきなカードを2枚宣言して手札に加える"},{"i":35,"n":"ちゅろす","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 いつでも使用可能 自分の味方のエネルギーを全て好きなように再分配する"},{"i":36,"n":"いと","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能 自分の\"いと\"が場を去るまで、互いにアタックによってライフを減らす時、リンクの数と同じだけ減らす"},{"i":37,"n":"げんちゃん","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能 自分の\"げんちゃん\"が場から去るまで、互いにエネルギー1のキャラではアタックできない"},{"i":38,"n":"Fam","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能 自分の\"Fam\"が場から去るまで、互いに全キャラがリンクをしていないものとして扱う"},{"i":39,"n":"D!amusung","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能 自分の\"D!amusung\"が場を去るまで、\"D!amsung\"の正面の敵のみアタックできる"},{"i":40,"n":"Masa","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能 このターンの間、エネルギーを消費せずにアタックできる"},{"i":41,"n":"ぺんしりゃ。","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能 どちらかのライフが4以下の間、互いに「ブロックされない」の効果を無効化してブロックすることができる"},{"i":42,"n":"新薬浅田","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 いつでも使用可能 手札山札からキャラカードを2体まで召喚する"},{"i":43,"n":"くり","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能 自分の\"くり\"が場を去るまでの間、互いに合計CP8のキャラカードはアタック･ブロックができない"},{"i":44,"n":"りんごあめ","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能 自分のライフを1消費することで、相手キャラ1体を破壊する"},{"i":45,"n":"真筝","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能 自分の\"真筝\"が場から去るまでの間、相手がアタックする度に自分の好きなキャラクター一体のエネルギーを+1する"},{"i":46,"n":"一ノ城","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能 どちらかのライフが4以下の間、互いの\"一ノ城\"が破壊された時、手札を1枚破棄することで再召喚することができる"},{"i":47,"n":"とれんさー","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能 カード1枚を指定し、指定したカードを互いに手札と山札、墓地から破棄する"},{"i":48,"n":"れあ","ty":"character","sh":"✕","cp":2,"en":2,"co":["紫","紫","緑"],"ti":[],"e":"アタック時、ダイスを振り、対応した効果を発動する。1〜4:自分の手札1枚破棄、5,6:相手のライフ-1して追加でダイスを振れる"},{"i":49,"n":"Masa","ty":"character","sh":"✕","cp":3,"en":1,"co":["黄","黄","赤"],"ti":[],"e":"このアタック終了後このキャラクターを除外する。アタック時、ダイスを振り出目に応じた効果を発動する。1,2,3：自分のライフ-1  4,5：相手のライフ-1  6：相手のライフ-2"},{"i":50,"n":"真筝","ty":"character","sh":"✕","cp":3,"en":3,"co":["橙","橙","黄"],"ti":[],"e":"召喚時、山札から3枚ドローし、手札から2枚山札に戻す"},{"i":51,"n":"D!amusung","ty":"character","sh":"✕","cp":3,"en":3,"co":["橙","橙","青"],"ti":[],"e":"バトル時、このキャラとの任意のリンクを解除できる"},{"i":52,"n":"りんごあめ","ty":"character","sh":"✕","cp":3,"en":3,"co":["緑","緑","橙"],"ti":[],"e":"自分のターンエンド時、自分のキャラ1体を山札に戻せる"},{"i":53,"n":"猫うさぎ","ty":"character","sh":"✕","cp":5,"en":3,"co":["紫","紫","黄"],"ti":[],"e":"アタック時、相手のキャラ1〜2体を指定し、正面のキャラにエネルギーを合計2つ集約する。自身よりもエネルギーの多いキャラにはブロックされない"},{"i":54,"n":"すけお","ty":"character","sh":"✕","cp":5,"en":2,"co":["黄","黄","紫"],"ti":[],"e":"召喚時、リンク数分ライフを回復する(最大6)"},{"i":55,"n":"ギルバス","ty":"character","sh":"✕","cp":1,"en":5,"co":["紫","紫","紫"],"ti":[],"e":"召喚時、合計CPが5以下の時、次の相手のターン、相手はこのキャラの正面のキャラでアタックしなければならない"},{"i":56,"n":"モチリン","ty":"character","sh":"✕","cp":null,"en":3,"co":["青","青","紫"],"ti":["常時","味方ブロック時","ブロック時","召喚時"],"e":"【常時】自分のダイスの出目をこのキャラの基本CPとする 【自分のターン開始時】【味方ブロック時】に自分のダイスを振ることができる 【召喚時】自分のダイスを振ることができる","vc":1},{"i":57,"n":"Gumi","ty":"character","sh":"✕","cp":2,"en":3,"co":["青","青","青"],"ti":[],"e":"召喚時、合計CPが奇数ならば正面の相手キャラをエネルギー0のブランクカードにする"},{"i":58,"n":"猫うさぎ","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能 自分の\"猫うさぎ\"が場から去るまでの間、互いに、相手のキャラクターカードを指定する効果を発動する時、相手が対象を選択する。(配置やCP、エネルギーなどに依存した指定も相手が選択する)"},{"i":59,"n":"すけお","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能 ライフ差が2以下の間、自分の場の中央のキャラクターカードは相手の効果を受けない。(CP、エネルギーの増減変換、配置換え、効果指定、効果破壊、アンブロ無効、アタックブロック可否)"},{"i":60,"n":"ギルバス","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のライフが2以下の間、自分のライフが減少した時、アタックしていたキャラクターカードを破壊する"},{"i":61,"n":"モチリン","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能 どちらかのライフが3以下の間、自分の場のキャラクターカードが除外される時、数を2つ宣言してからダイスを振り、宣言した数のどちらかが出れば除外されずに手札に戻る"},{"i":62,"n":"Gumi","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能 自分のGumiがブロックするまでの間、互いのライフが奇数の時はライフを回復できない"},{"i":63,"n":"攻城戦","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"ターンに1度アタック時、相手キャラのみをバトルで破壊した時追加でもう1度アタックできる。追加アタック時はアタック時効果は発動しない。追加アタックを行ったとき、このカードのエネルギー-1"},{"i":64,"n":"攻学戦","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"アタック発動可能、アタックしたキャラが破壊された時、キャラ効果発動後手札に戻す。この効果で手札に戻った時、このカードのエネルギー-1"},{"i":65,"n":"マイクラ人狼","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"自分のターン中に使用可能、相手のカード1種類と枚数を宣言し、相手の手札にそのカードの種類と枚数が一致していた時、そのカード1枚を墓地に送る。宣言した時、このカードのエネルギー-1"},{"i":66,"n":"犯人の箱","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"常時、通常召喚ができず、予告召喚でのみ召喚できる。自分のアタック時、ﾌﾞﾗﾝｸｶｰﾄﾞを指定してｱﾀｯｸできる。指定されたﾌﾞﾗﾝｸｶｰﾄﾞは現在のｴﾈﾙｷﾞｰで召喚する。この効果で指定ｱﾀｯｸした時互いに破壊されない。指定した時、このカードのｴﾈﾙｷﾞｰ-1"},{"i":67,"n":"周年記念企画","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"常時、CPバトル時、合計CPが高い方が勝利する。キャラが場から去るときこのカードのエネルギー-1"},{"i":68,"n":"けい","ty":"character","sh":"△","cp":4,"en":3,"co":["青","青","赤"],"ti":[],"e":"召喚時、合計CPが偶数の時、墓地から特殊カード1枚を宣言して手札に加える"},{"i":69,"n":"おかさん","ty":"character","sh":"△","cp":3,"en":3,"co":["黄","黄","橙"],"ti":[],"e":"自分のターン開始時、任意の相手キャラ1体の効果を獲得する。※召喚時、破壊時効果は発動しない。※対象キャラが場から去るまでか次の自分のターン開始時まで継続する"},{"i":70,"n":"ルイ","ty":"character","sh":"△","cp":2,"en":3,"co":[],"ti":[],"e":"自分のターンエンド時、エネルギーを1消費することで相手のキャラ1体を指定し、そのキャラは次のターンアタックできない"},{"i":71,"n":"るぅ","ty":"character","sh":"△","cp":5,"en":2,"co":["緑","緑","黄"],"ti":[],"e":"アタック時、このターン中に墓地が増減しており、リンクしていない時、ブロックされない"},{"i":72,"n":"純水","ty":"character","sh":"△","cp":3,"en":3,"co":["紫","紫","橙"],"ti":[],"e":"味方ブロック時、任意の味方キャラのエネルギー+1"},{"i":73,"n":"夏至","ty":"character","sh":"△","cp":4,"en":2,"co":["緑","緑","緑"],"ti":[],"e":"破壊時、自分のエネルギーの数、相手は手札を山札に戻す(最大3)"},{"i":74,"n":"てぃりー","ty":"character","sh":"△","cp":5,"en":3,"co":["黄","黄","黄"],"ti":[],"e":"常時、自分のライフが回復する時、任意の味方キャラのエネルギー+1"},{"i":75,"n":"ひいらぎ","ty":"character","sh":"△","cp":2,"en":4,"co":["青","青","青"],"ti":[],"e":"味方アタック時、どちらかのダイスを1回振る、基本CPがダイスの出目と違うキャラにブロックされた時破壊されない"},{"i":76,"n":"雪雅","ty":"character","sh":"△","cp":1,"en":4,"co":["黄","黄","紫"],"ti":[],"e":"味方アタック･ブロック時、自分もしくはリンク先のキャラ1体のCPを2倍にできる"},{"i":77,"n":"sinn","ty":"character","sh":"△","cp":2,"en":3,"co":["青","青","緑"],"ti":[],"e":"アタック時、リンク先の召喚時効果を発動する"},{"i":78,"n":"けい","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能、どちらかのライフが5以下の間、互いに、自分のターンに1度だけ、基本エネルギーのキャラを手札に戻すことができ、違うキャラであれば召喚することができる"},{"i":79,"n":"るぅ","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能、使用時、互いの全キャラのエネルギーを基本CPと同じにする"},{"i":80,"n":"純水","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能、互いのライフが4以下の間、お互いに2エネ以上あるキャラがバトルによって破壊される時、エネルギーを1消費することで破壊されない"},{"i":81,"n":"夏至","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能、どちらかの山札が1枚以上の間、特殊カードを使用する時、数字1つを2倍にする"},{"i":82,"n":"てぃりー","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":["破壊時","バトル破壊時","召喚時"],"e":"【破壊時】【バトル破壊時】を【召喚時】として扱う"},{"i":83,"n":"雪雅","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能、互いのライフが2以上の間、どちらかの場にブランクカードがある時、合計CPが偶数のキャラはアタック・ブロックができず、CPバトルによって相打ちになった際、ブランクカードが自分の場にある方は破壊されない"},{"i":84,"n":"予定確認したよね？？","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"エネルギー0の企画カードを除外する。もしくは、相手キャラ1体のエネルギー-2"},{"i":85,"n":"ギャンブル","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"数を2つ指定して自分か相手のダイスを振り、指定した数が出たら相手の山札から1枚破棄する"},{"i":86,"n":"徒歩で来た","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"次の相手のアタック時エネルギーを追加で1消費しなければアタックできない"},{"i":87,"n":"カンピロバクター","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"自分のキャラクター1~3人のエネルギー-1"},{"i":88,"n":"リマインド","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"自分のブランクカードのエネルギー+1"},{"i":89,"n":"おつ！","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"相手キャラを指定する。指定したキャラはこのターンブロックができず、次のターンアタックもできない"},{"i":90,"n":"煽りw","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"相手のライフ+1"},{"i":91,"n":"逃げるンゴ！","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"自分の場のキャラカードを1枚手札に戻す,その後召喚はできない(再召喚含む)"},{"i":92,"n":"ツッコミ","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"アタックしたキャラの正面のキャラでブロックしなければならない"},{"i":93,"n":"遅刻","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"相手全員エネルギー-1"},{"i":94,"n":"オフ会","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"ライフ+1(最大6)"},{"i":95,"n":"魔剤","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"味方全員エネルギー+1"},{"i":96,"n":"席替え","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"どちらかの場のキャラを2体選んで位置を交換する"},{"i":97,"n":"招集！","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"1ターンに1回のみ使用可能 2ドロー"},{"i":98,"n":"まさかの脱退！？","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"自分の場のキャラカードを墓地に送り、手札から1枚キャラカードを召喚する"},{"i":99,"n":"新メンバー！","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"山札から1枚宣言して手札に加える"},{"i":100,"n":"おかさん","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能、自分の場の\"おかさん\"が場から去るまでの間、相手のモチーフ特殊カードを無効化する"},{"i":101,"n":"ルイ","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 自分のメイン時に使用可能、互いのライフ差が2以下の間、自分のキャラが効果を発動する時、そのキャラのエネルギー+1(最大初期値まで)"},{"i":102,"n":"ひいらぎ","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 いつでも使用可能、特殊カード2種類宣言して、相手の山札、手札から自分のものとして使用する。使用後除外する"},{"i":103,"n":"sinn","ty":"motif","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"モチーフ特殊 どちらかのライフが4以下の間、互いにエネルギーが2以上あるsinnは合計CP8として扱う"},{"i":104,"n":"フレンドリンク(赤)","ty":"friendlink","sh":null,"cp":null,"en":null,"co":["赤","赤","緑"],"ti":[],"e":"自分が新たにフレンドリンクを使用するまでの間、自分の場のの性質を持つキャラはそのキャラの持つの性質の数、合計CPを増加させ、自分の場のの性質を持つキャラはそのキャラの持つの性質の数、合計CPを減少させる"},{"i":105,"n":"フレンドリンク(青)","ty":"friendlink","sh":null,"cp":null,"en":null,"co":["青","青","橙"],"ti":[],"e":"自分が新たにフレンドリンクを使用するまでの間、自分の場のの性質を持つキャラはそのキャラの持つの性質の数、合計CPを増加させ、自分の場のの性質を持つキャラはそのキャラの持つの性質の数、合計CPを減少させる"},{"i":106,"n":"フレンドリンク(黄)","ty":"friendlink","sh":null,"cp":null,"en":null,"co":["黄","黄","紫"],"ti":[],"e":"自分が新たにフレンドリンクを使用するまでの間、自分の場のの性質を持つキャラはそのキャラの持つの性質の数、合計CPを増加させ、自分の場のの性質を持つキャラはそのキャラの持つの性質の数、合計CPを減少させる"},{"i":107,"n":"フレンドリンク(緑)","ty":"friendlink","sh":null,"cp":null,"en":null,"co":["緑","緑","赤"],"ti":[],"e":"自分が新たにフレンドリンクを使用するまでの間、自分の場のの性質を持つキャラはそのキャラの持つの性質の数、合計CPを増加させ、自分の場のの性質を持つキャラはそのキャラの持つの性質の数、合計CPを減少させる"},{"i":108,"n":"フレンドリンク(橙)","ty":"friendlink","sh":null,"cp":null,"en":null,"co":["橙","橙","青"],"ti":[],"e":"自分が新たにフレンドリンクを使用するまでの間、自分の場のの性質を持つキャラはそのキャラの持つの性質の数、合計CPを増加させ、自分の場のの性質を持つキャラはそのキャラの持つの性質の数、合計CPを減少させる"},{"i":109,"n":"フレンドリンク(紫)","ty":"friendlink","sh":null,"cp":null,"en":null,"co":["紫","紫","黄"],"ti":[],"e":"自分が新たにフレンドリンクを使用するまでの間、自分の場のの性質を持つキャラはそのキャラの持つの性質の数、合計CPを増加させ、自分の場のの性質を持つキャラはそのキャラの持つの性質の数、合計CPを減少させる"},{"i":110,"n":"けい","ty":"character","sh":"⬠","cp":2,"en":4,"co":["橙","橙","赤"],"ti":["エネルギー回復時"],"e":"【エネルギー回復時】回復した分相手のエネ-1(1度につき最大2まで)"},{"i":111,"n":"おかさん","ty":"character","sh":"⬠","cp":4,"en":2,"co":["緑","緑","紫"],"ti":["常時"],"e":"【常時】どちらかの場にモチーフ特殊カードがある時、エネ減少しない"},{"i":112,"n":"ちゅろす","ty":"character","sh":"⬠","cp":3,"en":2,"co":["青","青","橙"],"ti":["バトル破壊時","破壊時"],"e":"【バトル破壊時】このキャラのエネ分ライフ回復(最大6)"},{"i":113,"n":"メルトア","ty":"character","sh":"⬠","cp":3,"en":4,"co":[],"ti":["常時","召喚時"],"e":"【常時】自分の場の性質が5色であれば、6色として扱う。【召喚時】山札から\"フレンドリンク\"を1枚手札に加える"},{"i":114,"n":"ぺんしりゃ。","ty":"character","sh":"⬠","cp":5,"en":4,"co":["青","青","黄"],"ti":["アタック時","バトル破壊時","破壊時"],"e":"【アタック時】除外される。【バトル破壊時】アタックしたキャラとこのキャラのリンク数が違う時このキャラは手札に戻る"},{"i":115,"n":"新薬浅田","ty":"character","sh":"⬠","cp":5,"en":2,"co":["青","黄","紫"],"ti":["常時"],"e":"【常時】自分のターンに召喚されたキャラはそのターン中、全員アタックできる"},{"i":116,"n":"D!amusung","ty":"character","sh":"⬠","cp":3,"en":3,"co":["黄","赤","紫"],"ti":["場から去る時"],"e":"【場から去る時】相手の墓地へ行く。墓地で重ならず、墓地から手札に加えられない。"},{"i":117,"n":"くり","ty":"character","sh":"⬠","cp":5,"en":2,"co":["紫","紫","青"],"ti":["アタック時"],"e":"【アタック時】正面の敵と合計CPを比べ、相手の方が高い時、その差分相手の手札を山札に戻す"},{"i":118,"n":"すけお","ty":"character","sh":"⬠","cp":3,"en":3,"co":["緑","青","紫"],"ti":["常時","ターンエンド時"],"e":"【常時】自分の場のキャラが\"エネを消費して\"効果を発動する時、消費量-1。相手の【ターン開始時】【ターンエンド時】を無効化する"},{"i":119,"n":"Fam","ty":"character","sh":"⬠","cp":3,"en":3,"co":["紫","紫","緑"],"ti":["ターンエンド時"],"e":"【自分のターンエンド時】エネ1消費することで相手は次のターンアタックしなければならない"},{"i":120,"n":"D!amusung","ty":"character","sh":"◎","cp":1,"en":4,"co":["赤","赤","橙"],"ti":["常時"],"e":"【常時】このキャラとリンクしていない自分の場のキャラは相打ち時破壊されない"},{"i":121,"n":"くり","ty":"character","sh":"◎","cp":4,"en":3,"co":["赤","赤","黄"],"ti":["相手のアタック終了時"],"e":"【相手のアタック終了時】アタックできる。このアタック中は互いにリンクしていないものとして扱う"},{"i":122,"n":"れあ","ty":"character","sh":"◎","cp":4,"en":3,"co":["緑","青","紫"],"ti":["アタック時"],"e":"【アタック時】ブロック可能なら必ずブロックする"},{"i":123,"n":"ぺんしりゃ。","ty":"character","sh":"◎","cp":4,"en":4,"co":["緑","黄","橙"],"ti":["ターンエンド時"],"e":"【自分のターンエンド時】このキャラのエネを1消費することで次のターン特殊カードを使用できない"},{"i":124,"n":"けい","ty":"character","sh":"◎","cp":3,"en":3,"co":["橙","橙","黄"],"ti":["場から去る時"],"e":"【場から去る時】相手は特殊カードを使用し、そのカードを除外する"},{"i":125,"n":"ひいらぎ","ty":"character","sh":"◎","cp":2,"en":3,"co":["青","橙","黄"],"ti":["アタック時"],"e":"【アタック時】味方1体のエネ+1(最大初期値)その後このバトル中破壊されない"},{"i":126,"n":"sinn","ty":"character","sh":"◎","cp":1,"en":3,"co":["青","黄","紫"],"ti":["常時"],"e":"【常時】基本CP+5"},{"i":127,"n":"とれんさー","ty":"character","sh":"◎","cp":3,"en":3,"co":["黄","緑","橙"],"ti":["常時"],"e":"【常時】自分の場のリンクしていないキャラとリンクしているものとし、リンクしているキャラとリンクしていないものとする"},{"i":128,"n":"りんごあめ","ty":"character","sh":"◎","cp":2,"en":1,"co":["黄","黄","青"],"ti":["ターンエンド時"],"e":"【自分のターンエンド時】リンク先のキャラからエネルギーを好きなだけ移動し、合計7エネならば相手のライフ-1、その後ブランクカードになる"},{"i":129,"n":"るぅ","ty":"character","sh":"◎","cp":4,"en":3,"co":["黄","黄","黄"],"ti":["味方アタック時","アタック時"],"e":"【味方アタック時】このターン中に相手の手札が増減していればリンク先のキャラはアタック中にブロックされない"},{"i":130,"n":"酒","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"自分のキャラ1体を指定し、すきなだけエネルギーを減らし、その後基本CP+1"},{"i":131,"n":"上京","ty":"special","sh":null,"cp":null,"en":null,"co":[],"ti":[],"e":"自分のキャラ1体を指定し、そのキャラの性質を2つまで変更する"}];
const IMG_BASE="cards/"; const BACK_IMG=IMG_BASE+"card_back.png";
let USE_IMG=false;
function cardImg(c){ if(!c||!c.img) return null; if(c.img.indexOf("data:")===0) return c.img; return USE_IMG?c.img:null; }
function defColors(i){ const k=COLORS.map(c=>c.k); return [k[i%6], k[(i*2+1)%6], k[(i*3+2)%6]]; }
const EXCLUDED_IDS=new Set([63,64,65,66,67]); // 企画カード（バランス調整前・非表示）
let CARD_POOL=buildRealPool();
function buildRealPool(){ return CARD_DATA.filter(d=>!EXCLUDED_IDS.has(d.i)).map(d=>({
    id:d.i, name:(d.n||("カード "+String(d.i+1).padStart(3,"0"))), type:d.ty||"character",
    cp:d.cp, energy:d.en, varcp:!!d.vc, shape:(d.sh||(d.ty==="character"?SHAPES[d.i%SHAPES.length]:"")),
    colors:(d.co||[]).slice(), timings:(d.ti||[]).slice(), effect:(d.e||""),
    img:IMG_BASE+"card_"+String(d.i).padStart(3,"0")+".png",
    max:(d.ty==="motif"||d.ty==="friendlink")?1:(d.ty==="special"?2:3) })); }
const poolById=id=>CARD_POOL.find(c=>c.id===id);

/* ===== ストレージ / デッキコード ===== */
const memStore={};
const store={ get(k){try{return localStorage.getItem(k);}catch(e){return (k in memStore)?memStore[k]:null;}}, set(k,v){try{localStorage.setItem(k,v);}catch(e){memStore[k]=v;}} };
const DECKS_KEY="kikaku_decks", ACTIVE_KEY="kikaku_active", ACTIVE_META_KEY="kikaku_active_meta", NAME_KEY="kikaku_name";
const deckTotal=o=>Object.values(o).reduce((a,b)=>a+b,0);
function deckValid(o){const t=deckTotal(o); if(t<DECK_MIN||t>DECK_MAX) return false; for(const id in o){const c=poolById(+id); if(!c) return false; if(o[id]<0||o[id]>c.max) return false;} return true;}
function encodeDeck(o){let s="A"; Object.keys(o).map(Number).sort((a,b)=>a-b).forEach(id=>{const n=o[id]; if(n>0) s+=id.toString(36).padStart(2,"0")+String(n);}); return s;}
function decodeDeck(code){ if(!code||code[0]!=="A") return null; const o={},b=code.slice(1); for(let i=0;i+3<=b.length;i+=3){const id=parseInt(b.slice(i,i+2),36),n=parseInt(b.slice(i+2,i+3),10); if(isNaN(id)||isNaN(n))return null; if(poolById(id))o[id]=n;} return o;}
function defaultDeck(){const o={};let t=0; for(const c of CARD_POOL){ if(t>=DECK_MIN)break; const add=Math.min(c.max,DECK_MIN-t); o[c.id]=add; t+=add;} return o;}
function loadSavedDecks(){try{return JSON.parse(store.get(DECKS_KEY))||[];}catch(e){return [];}}
function saveSavedDecks(l){store.set(DECKS_KEY, JSON.stringify(l));}
let activeDeck=null, activeDeckName="", activeDeckCover=null;
function setActiveDeck(o,name,cover){ activeDeck=o; if(name!=null) activeDeckName=name; if(cover!==undefined) activeDeckCover=cover;
  store.set(ACTIVE_KEY, encodeDeck(o)); store.set(ACTIVE_META_KEY, JSON.stringify({name:activeDeckName, cover:activeDeckCover})); }
function getActiveDeck(){ if(activeDeck&&deckValid(activeDeck)) return activeDeck; const s=decodeDeck(store.get(ACTIVE_KEY)||""); if(s&&deckValid(s)){activeDeck=s;
    try{const m=JSON.parse(store.get(ACTIVE_META_KEY)||"{}"); activeDeckName=m.name||activeDeckName; if(m.cover!=null)activeDeckCover=m.cover;}catch(e){}
    return s;} activeDeck=defaultDeck(); return activeDeck; }
function buildDeckCards(o){const cards=[]; for(const id in o){const b=poolById(+id); for(let k=0;k<o[id];k++) cards.push(mkCard(b));} shuffle(cards); return cards;}

/* ===== 状態 ===== */
let state=null, uid=0, MODE="cpu", PLAYER_NAME="あなた", ROOM_CODE="", pickTimer=null;
const nid=()=>++uid;
function mkCard(b){return {id:nid(), cardId:b.id, name:b.name, type:b.type||"character", varcp:!!b.varcp, cpMod:0, cp:b.cp, energy:b.energy, curEn:(b.energy||0),
  shape:b.shape, colors:b.colors.slice(), timings:(b.timings||[]).slice(), effect:b.effect||"", img:b.img||null, blank:false, blankEn:0, picking:false};}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]];}}
function freshPlayer(name, deckObj){return {name, life:CONFIG.LIFE_START, deck:buildDeckCards(deckObj), hand:[], grave:[], exclude:[], field:new Array(CONFIG.SLOTS).fill(null), forced:false, playedChar:false, attacked:false, motif:null, friendlink:null, lostLifeThisTurn:false, tobo:0};}

function newGame(){ const p2p=(MODE==="p2p"); const deckA=(p2p&&P2P_DA)?P2P_DA:getActiveDeck(); const deckB=(p2p&&P2P_DB)?P2P_DB:getActiveDeck(); const nameA=p2p?(P2P_NA||"対戦者A"):(PLAYER_NAME||"あなた"); const oppName = MODE==="cpu" ? "CPU" : (p2p?(P2P_NB||"対戦者B"):"対戦相手");
  state={mode:MODE, turn:1, active:"self", phase:1, over:false, players:{self:freshPlayer(nameA,deckA), opp:freshPlayer(oppName,deckB)}, placing:null, pending:null, dice:{self:null,opp:null}, afterBattle:[], seen:{}};
  draw("self",CONFIG.OPENING,true); draw("opp",CONFIG.OPENING,true);
  logLine(`<span class="hi">▶ 新規対戦</span>（${modeLabel()} / デッキ${deckTotal(deckA)}枚）`,true); Snd.resume();
  render();
  rollForFirst(first=>{ state.active=first;
    logLine(`先行判定：${state.players.self.name} ${state.dice.self} / ${state.players.opp.name} ${state.dice.opp} → 先行 <b>${state.players[first].name}</b>`,true);
    startTurn(first); }); }
const modeLabel=()=>({cpu:"CPU戦",hotseat:"2人対戦",p2p:"P2P対戦"})[state?state.mode:MODE]||"対戦";

function draw(pid,n=1,silent=false){const p=state.players[pid]; for(let i=0;i<n;i++){ if(p.deck.length===0){p.forced=true;continue;} p.hand.push(p.deck.pop()); } if(p.deck.length===0){ p.forced=true; if(!silent) logLine(`${p.name}：山札0 → <b>強制アタック</b>`); }}
// ターンドロー：引いたカードを中央にピック表示（人間側のみ）→2秒後に手札へ
function turnDraw(pid){const p=state.players[pid];
  if(p.deck.length===0){ p.forced=true; logLine(`${p.name}：山札0 → <b>強制アタック</b>`); return; }
  const card=p.deck.pop(); p.hand.push(card); if(p.deck.length===0)p.forced=true;
  const reveal = (state.mode!=="cpu") || pid==="self";
  if(reveal){ card.picking=true; showPick(card); }
}
function showPick(card){ const ov=document.getElementById("pickOv"), pk=document.getElementById("pickCard");
  const _im=cardImg(card); pk.style.backgroundImage=_im?`url("${_im}")`:""; pk.className="pk"+(_im?"":" face"); pk.innerHTML=cardFaceHTML(card);
  ov.classList.add("on"); clearTimeout(pickTimer); pickTimer=setTimeout(()=>{ ov.classList.remove("on"); card.picking=false; render(); },2000); }

const opp=pid=>pid==="self"?"opp":"self";
function humanControls(){ if(!state||state.over) return null; if(state.mode==="cpu") return state.active==="self"?"self":null; return state.active; }

function startTurn(pid){const p=state.players[pid]; p.graveChangedTurn=0; okaTurnStart(pid); if(p.gilFacing&&p.gilFacing.turn<state.turn) p.gilFacing=null; if(p.gilForced&&p.gilForced<state.turn) p.gilForced=null; p.playedChar=false; p.attacked=false; p.lostLifeThisTurn=false; state.players[opp(pid)].lostLifeThisTurn=false; state.phase=1; state.placing=null; maintainMotifs(); state.inputOwner=pid;
  turnDraw(pid); logLine(`— ターン${state.turn}：<b>${p.name}</b>（ドロー→メイン）—`,true);
  if(!checkWin()) render(); maybeCpu(); }
function canFieldAttack(pid){ const p=state.players[pid]; return p.field.some(c=>c&&!c.blank&&(c.curEn||0)>=1 && !attackForbiddenFor(pid,c)); }
function canSummonAttack(pid){ const p=state.players[pid]; if(p.playedChar||p.noSummonTurn===state.turn) return false; if(!p.field.includes(null)) return false; return p.hand.some(c=>c.type==="character"&&(c.energy||0)>=1); }
function mustAttack(pid){ const p=state.players[pid]; if(!p||p.attacked) return false; if(!p.forced && p.gilForced!==state.turn) return false; return canFieldAttack(pid)||canSummonAttack(pid); }
function endTurn(){ if(NET.active&&!NET.isHost){ netSendIn({kind:"endTurn"}); return; } if(state.over||state.pending||state.pick) return;
  if(mustAttack(state.active)&&!(state.mode==="cpu"&&state.active==="opp")){ flash("強制アタック中：アタックしてください（アタック可能なキャラがいる／召喚してアタックできる間は終了できません）"); return; }
  const dpid=opp(state.active); const step2=()=>offerYodaDia(state.active, ()=>rinXTurnEnd(state.active, ()=>meltoaTurnEnd(state.active, finishTurn)));   // YODA◇→りん✕→終了
  if(state.players[dpid].lostLifeThisTurn){ offerLifeSummon(dpid, step2); } else step2(); }
function finishTurn(){ if(state.over) return;
  for(const pid of ["self","opp"]){ const p=state.players[pid]; p.field.forEach((c)=>{ if(c&&c.blank){ c.blankEn=(c.blankEn||0)+1;
    if(c.blankEn>=p.life){ c.blank=false; c.curEn=c.blankEn; logLine(`${p.name}：<b>予告召喚 発動</b>！ ${c.name} をエネルギー${c.blankEn}で召喚`,true); } } }); }
  if(checkWin()) return;
  state.active=opp(state.active); state.turn++; startTurn(state.active); }

/* ===== 召喚（通常 / 予告=ブランク） ===== */
function beginPlacing(cardId, blank){ if(NET.active&&!NET.isHost) return;  const pid=humanControls(); if(!pid) return; const p=state.players[pid];
  if(state.phase!==1){flash("配置はメインステップのみ");return;} if(p.noSummonTurn===state.turn){flash("このターンは召喚できません");return;} if(!blank && p.playedChar){flash("通常召喚は1ターンに1枚まで");return;}
  if(!p.field.includes(null)){flash("場に空きがありません");return;} state.placing={id:cardId, blank:!!blank}; closeOverlay(); render(); }
function placeCard(pid,slotIdx){const p=state.players[pid];
  if(pid!==humanControls()||state.phase!==1||!state.placing||p.field[slotIdx]) return;
  const _pc=p.hand.find(c=>c.id===state.placing.id); if(_pc&&_pc.type!=="character"){ state.placing=null; return; }
  const idx=p.hand.findIndex(c=>c.id===state.placing.id); if(idx<0) return;
  const card=p.hand.splice(idx,1)[0]; const blank=state.placing.blank;
  if(blank){ card.blank=true; card.blankEn=0; } else { card.blank=false; card.curEn=card.energy; p.playedChar=true; }
  p.field[slotIdx]=card; state.placing=null;
  if(!blank&&pid==="self"){ state.seen[card.cardId]=(state.seen[card.cardId]||0)+1; }
  if(!blank){ const hasToren=p.field.some((x,ix)=>x&&!x.blank&&x.cardId===15&&ix!==slotIdx); if(hasToren&&p.torenTurn!==state.turn){ p.torenTurn=state.turn; p.playedChar=false; logLine(`とれんさー：このターンもう1体召喚できます`); const _ts=p.field.findIndex(x=>x&&!x.blank&&x.cardId===15); announceFx(pid,_ts,"とれんさー","味方召喚時 追加召喚"); } }
  if(!blank){ Snd.play("summon"); onSummon(pid,slotIdx); }
  logLine(blank?`${p.name}：<b>予告召喚</b>（裏向き）を配置`:`${p.name}：<b>${card.name}</b> を召喚（CP${card.cp}/⚡${card.energy}）`); render(); }

/* ===== 効果エンジン（○シリーズ） =====
   実装: YODA(0),りおっぴ(1),れあ(2),ちゅろす(3),いと(4),げんちゃん(5),Fam(6),D!amusung(7),Masa(8),
         ぺんしりゃ(9),新薬浅田(10),くり(11),りんごあめ(12),真筝(13),一ノ城(14),とれんさー(15)
   正面 = 自分スロットi ↔ 相手スロット(SLOTS-1-i)（右端↔左端） */
// ちゅろすは隣接の効果を全獲得。ただし【召喚時】【破壊時】【バトル破壊時】は不発（該当cardIdを登録）
const CHURO_SUPPRESS=new Set([2,12,17,19,26,50,54,55,57,68,112,116]); // 召喚/破壊/バトル破壊時は不発（○れあ2/○りんご12/◇りお17/◇ちゅろ19/◇浅田26）
function faceSlot(i){ return CONFIG.SLOTS-1-i; }
function provides(pid,i,eid){ const f=state.players[pid].field, c=f[i]; if(!c||c.blank) return false;
  if(c.noEffectTurn===state.turn) return false;         // YODA◇：効果無効化
  if(c.cardId===eid) return true;
  if(c.cardId===3 && !CHURO_SUPPRESS.has(eid)){ const n1=f[i-1],n2=f[i+1];
    if(n1&&!n1.blank&&n1.cardId===eid) return true; if(n2&&!n2.blank&&n2.cardId===eid) return true; }
  if(c.cardId===69){ const aq=state.players[pid].okaAcq; if(aq && aq.cardId===eid && !CHURO_SUPPRESS.has(eid)) return true; }   // △おか：獲得した相手効果
  return false; }
function anyYoda(){ return ["self","opp"].some(p=>state.players[p].field.some(c=>c&&!c.blank&&c.cardId===0)); }
function d6(){ return 1+Math.floor(Math.random()*6); }
function baseCP(pid,i){ const f=state.players[pid].field, c=f[i]; if(!c||c.blank) return 0;
  if(provides(pid,i,9)) return Math.max(0,(c.cp||0)+(c.cpMod||0));    // ぺんしりゃ：他キャラ効果を受けない（酒の自己修正は反映）
  let b=(c.cp||0);
  if(c.cardId===56) b=(state.dice&&state.dice[pid])||0;              // モチリン：自分のダイス目
  if(anyYoda()) b=(c.curEn||0);                                      // YODA：エネルギー＝基本CP
  if(c._cpx2) b*=2;                                                  // 雪雅：基本CP×2（加減より前）
  b+=(c.cpMod||0);                                                   // 酒：基本CP+1（破壊まで）
  if(provides(pid,i,126)) b+=5;                                      // ◎sinn：CP+5（ちゅろす獲得可）
  const of=state.players[opp(pid)].field, jf=faceSlot(i);
  if(of[jf]&&!of[jf].blank&&provides(opp(pid),jf,6)) b-=1;           // Fam：正面-1
  return Math.max(0,b); }
function isCut(f,i,j){ const ci=f[i],cj=f[j]; if(ci&&ci._cutSlots&&ci._cutSlots.indexOf(j)>=0) return true; if(cj&&cj._cutSlots&&cj._cutSlots.indexOf(i)>=0) return true; return false; }
function linkedCP(pid,i){ const f=state.players[pid].field; if(!f[i]||f[i].blank) return 0; if(f[i].name==="sinn"&&(f[i].curEn||0)>=2&&motifEither(103)) return 8; if(f[i].cardId===28||f[i]._solo||motifEither(38)) return baseCP(pid,i); let s=baseCP(pid,i); for(const j of [i-1,i+1]){ const c=f[j]; if(!c||c.blank||c.cardId===28||c._solo) continue; if(isCut(f,i,j)) continue; s+=baseCP(pid,j); } return s; }
function battleCP(pid,i,bonus){ const f=state.players[pid].field; if(f[i]&&f[i].name==="sinn"&&(f[i].curEn||0)>=2&&motifEither(103)) return 8; if(f[i]&&(f[i].cardId===28||f[i]._solo||motifEither(38))){ let v=baseCP(pid,i)+(bonus?bonus(pid,i,f[i]):0); return Math.max(0,v); } let s=Math.max(0,baseCP(pid,i)+(bonus?bonus(pid,i,f[i]):0)); for(const j of [i-1,i+1]){ const c=f[j]; if(!c||c.blank||c.cardId===28||c._solo) continue; if(isCut(f,i,j)) continue; let v=baseCP(pid,j)+(bonus?bonus(pid,j,c):0); s+=Math.max(0,v); } return s; }
const dist8=v=>Math.abs(v-8);
function chEn(card,delta){ if(!card) return; if(card.cardId===28) return; if(delta<0 && card.cardId===111 && (state.players.self.motif||state.players.opp.motif)) return; card.curEn=Math.max(0,Math.min(12,(card.curEn||0)+delta)); }
function allowedBlockers(defPid, atkPid, atkSlot){ const f=state.players[defPid].field; let idxs=[];
  f.forEach((c,i)=>{ if(c&&!c.blank) idxs.push(i); });
  let ichi=-1; for(let i=0;i<f.length;i++){ if(f[i]&&!f[i].blank&&provides(defPid,i,14)){ichi=i;break;} } // 一ノ城：単独最多のみ
  if(ichi>=0){ const e=f[ichi].curEn||0; const others=f.filter((c,i)=>c&&!c.blank&&i!==ichi).map(c=>c.curEn||0); if(others.every(o=>e>o)) idxs=[ichi]; }
  if(atkPid!=null && provides(atkPid,atkSlot,5)) idxs=idxs.filter(i=>(f[i].curEn||0)>0);          // げんちゃん：0エネ不可
  idxs=idxs.filter(i=>f[i].noBlockTurn!==state.turn);   // おつ！：ブロック不可
  if(state.tsukkomiTurn===state.turn && atkSlot!=null){ const fs=faceSlot(atkSlot); idxs=idxs.filter(i=>i===fs); }   // ツッコミ：正面のみ
  if(state.pending && state.pending.noBlockBy!=null && defPid===state.pending.defender) idxs=idxs.filter(i=>i!==state.pending.noBlockBy);   // くり◇：指定ブロック不可
  if(motifEither(43)) idxs=idxs.filter(i=>linkedCP(defPid,i)!==8);   // くり(モチーフ)：合計CP8はブロック不可
  if(yukigaBlank()) idxs=idxs.filter(i=>linkedCP(defPid,i)%2!==0);   // 雪雅：偶数CPはブロック不可
  if(state.pending && state.pending.nekoEn!=null && defPid===state.pending.defender) idxs=idxs.filter(i=>(f[i].curEn||0)<=state.pending.nekoEn);   // 猫うさぎ：エネ超過は不可
  return idxs; }

/* ===== アタック（エネルギー消費はバトル確定後） ===== */
function attackForbiddenFor(pid,card){ if(state.turn===1) return true; if(card&&card.noAttackTurn===state.turn) return true; const i=state.players[pid].field.indexOf(card);
  if(i>=0){ if(motifEither(37)&&linkedCP(pid,i)<=1) return true;                 // げん：CP1以下不可
    if(motifEither(43)&&linkedCP(pid,i)===8) return true;                        // くり：合計CP8不可
    if(yukigaBlank()&&linkedCP(pid,i)%2===0) return true;                          // 雪雅：ブランク有＆偶数CP不可
    if(motifActive(opp(pid),39)){ const dp=state.players[opp(pid)]; const ds=dp.field.findIndex(c=>c&&!c.blank&&c.name==="D!amusung"); if(ds>=0 && i!==faceSlot(ds)) return true; } // むす
  }
  if(i>=0){ const gf=state.players[pid].gilFacing; if(gf&&gf.turn===state.turn&&i!==gf.slot) return true; }
  if(i>=0&&provides(pid,i,8)&&state.turn<=3) return true; return false; }
function canAttack(pid,card){ return !!card && !card.blank && card.curEn>=1+(state.players[pid].tobo||0) && !state.players[pid].attacked && !attackForbiddenFor(pid,card); }
function attackFrom(pid,slotIdx){ if(NET.active&&!NET.isHost) return; const p=state.players[pid], card=p.field[slotIdx];
  if(!card||state.pending||pid!==state.active) return;
  if(card.blank){flash("ブランクカードはアタック不可");return;}
  if(attackForbiddenFor(pid,card)){flash(card.cardId===8?"Masaは開始3ターンはアタック不可":"1ターン目はアタックできません");return;}
  if(p.attacked){flash("このターンは既にアタック済み");return;}
  { const need=1+(p.tobo||0); if(card.curEn<need){flash(need>1?`徒歩で来た：アタックに⚡${need}必要`:"エネルギー0はアタック不可");return;} }
  state.phase=2; p.attacked=true; state.pending={attacker:pid, atkSlot:slotIdx, defender:opp(pid), noBlock:false, noEnergyCost:false}; Snd.play("attack");
  if(provides(pid,slotIdx,5)){ const oc=state.players[opp(pid)].field[faceSlot(slotIdx)]; if(oc&&!oc.blank){ chEn(oc,-1); logLine(`げんちゃん：正面のエネルギー-1`); announceFx(pid,slotIdx,card.name,"正面のエネルギー-1"); } }
  if(provides(pid,slotIdx,13) && p.life<6 && canGainLife()){ p.life+=1; onLifeGain(pid); logLine(`真筝：ライフ+1 → ${p.life}`,true); announceFx(pid,slotIdx,card.name,"アタック時 ライフ+1"); }
  if(provides(pid,slotIdx,4) && linkedCP(pid,slotIdx)===8){ state.pending.noBlock=true; logLine(`いと：合計CP8 → 被ブロック不可`); announceFx(pid,slotIdx,card.name,"合計CP8 被ブロック不可"); }
  if(provides(pid,slotIdx,25) && (linkedCP(pid,slotIdx)%2===1)){ state.pending.noEnergyCost=true; announceFx(pid,slotIdx,card.name,"合計CP奇数 エネルギー消費なし"); }
  if(provides(pid,slotIdx,122)){ state.pending.mustBlock=true; announceFx(pid,slotIdx,card.name,"相手は必ずブロック"); }
  if(motifActive(opp(pid),45)){ const dp=state.players[opp(pid)]; let bi=-1,be=99; dp.field.forEach((c,i)=>{if(c&&!c.blank&&(c.curEn||0)<be){be=c.curEn||0;bi=i;}}); if(bi>=0){ chEn(dp.field[bi],1); logLine("真筝(モチーフ)：相手アタック時 自分の1体+1",true); } }
  if(provides(pid,slotIdx,48)) reaXRoll(pid,slotIdx);
  if(provides(pid,slotIdx,49)) masaXRoll(pid,slotIdx);
  if(provides(pid,slotIdx,71) && state.players[pid].graveChangedTurn===state.turn && ![slotIdx-1,slotIdx+1].some(j=>{const x=state.players[pid].field[j]; return x&&!x.blank;})){ state.pending.noBlock=true; announceFx(pid,slotIdx,card.name,"墓地増減＆非リンク → ブロック不可"); }
  if(provides(pid,slotIdx,77)){ [slotIdx-1,slotIdx+1].forEach(j=>{ const nb=state.players[pid].field[j]; if(nb&&!nb.blank){ announceFx(pid,slotIdx,card.name,"リンク先の召喚時効果を発動"); onSummon(pid,j); } }); }
  closeOverlay(); logLine(`${p.name}：<b>${card.name}</b> でアタック（合計CP ${linkedCP(pid,slotIdx)}）`); render();
  if(checkWin()) return;
  if(provides(pid,slotIdx,51)){ musuXUnlink(pid,slotIdx); return; }
  if(provides(pid,slotIdx,53)){ nekoXAttack(pid,slotIdx); return; }
  if(provides(pid,slotIdx,8)){ masaTarget(pid,slotIdx); return; }   // Masa：指定アタック（ちゅろす獲得含む）
  if(provides(pid,slotIdx,27)){ kuriDiaTarget(pid,slotIdx); return; }   // くり◇
  if(provides(pid,slotIdx,29)){ mashitoDiaTarget(pid,slotIdx); return; }   // 真筝◇
  if(provides(pid,slotIdx,30)){ ichinoDiaSwap(pid,slotIdx); return; }   // 一ノ城◇
  triAtkFx(pid,slotIdx,resolveOrAskDefense); }
function masaTarget(pid,slotIdx){ const dpid=opp(pid), idxs=allowedBlockers(dpid,pid,slotIdx), dP=state.players[dpid]; announceFx(pid,slotIdx,state.players[pid].field[slotIdx].name,"指定アタック");
  if(!idxs.length){ resolveOrAskDefense(); return; }
  const pick=i=>{ hidePrompt(); resolveBlock(i); };
  const human=(state.mode!=="cpu")||pid==="self";
  if(human) selectPrompt(`<b>Masa</b>：バトルする相手を指定`, idxs.map(i=>({label:`${dP.field[i].name}(CP${linkedCP(dpid,i)})`,fn:()=>pick(i)})));
  else { let best=idxs[0],bd=-1; idxs.forEach(i=>{const d=dist8(linkedCP(dpid,i)); if(d>bd){bd=d;best=i;}}); pick(best); } }
function resolveOrAskDefense(){const pd=state.pending; if(!pd) return; const human = state.mode==="cpu" ? (pd.defender==="self") : true; if(human) showDefensePrompt(); else cpuDefense(); }
function showDefensePrompt(){const pd=state.pending, defP=state.players[pd.defender], atkCP=linkedCP(pd.attacker,pd.atkSlot); state.inputOwner=pd.defender;
  const canBlock = (!pd.noBlock||penIgnoreBlock()) && allowedBlockers(pd.defender,pd.attacker,pd.atkSlot).length>0;
  if(NET.active&&NET.isHost&&!ownerIsLocal(pd.defender)){ netToSeat(pd.defender,{t:"prompt",ui:{kind:"defense",msg:`<b>${defP.name}</b> の防御 — 攻撃側 合計CP <b>${atkCP}</b>（8との差 ${dist8(atkCP)}）`+(pd.noBlock?'<br><span style="color:var(--brass)">この攻撃はブロックできません</span>':""),canBlock,mustBlock:!!pd.mustBlock}}); hostWaiting(pd.defender); return; }
  document.getElementById("promptMsg").innerHTML=`<b>${defP.name}</b> の防御 — 攻撃側 合計CP <b>${atkCP}</b>（8との差 ${dist8(atkCP)}）`+(pd.noBlock?`<br><span style="color:var(--brass)">この攻撃はブロックできません</span>`:"");
  const acts=document.getElementById("promptActs"); acts.innerHTML="";
  if(!(pd.mustBlock && canBlock)) acts.appendChild(pbtn("ライフで受ける (-1)",resolveTake));
  if(canBlock) acts.appendChild(pbtn("ブロックする",beginBlockSelect));
  if(pd.mustBlock && canBlock){ const w=document.createElement("div"); w.style.cssText="flex:1 1 100%;font-size:11px;color:var(--brass);text-align:center"; w.textContent="※ 相手効果により必ずブロック"; acts.appendChild(w); }
  document.getElementById("prompt").classList.add("on"); }
function beginBlockSelect(){ const pd=state.pending; const slots=allowedBlockers(pd.defender,pd.attacker,pd.atkSlot);
  hidePrompt();
  state.pick={ banner:`ブロックするキャラを<b>タップ</b>`, owner:pd.defender, field:{pid:pd.defender, slots, on:(slot)=>{ state.pick=null; hidePrompt(); resolveBlock(slot); }}, cancel:()=>{ state.pick=null; showDefensePrompt(); } };
  showPickBanner(); render(); }
function showPickBanner(){ if(!state.pick) return; const _own=state.pick.owner||inputOwner(); if(NET.active&&NET.isHost&&!ownerIsLocal(_own)){ NET.await={kind:"pick"}; netToSeat(_own,{t:"prompt",ui:{kind:"pick",banner:state.pick.banner,field:state.pick.field?{pid:state.pick.field.pid,slots:state.pick.field.slots}:null,hand:state.pick.hand?{pid:state.pick.hand.pid}:null,anyField:!!state.pick.anyField,done:state.pick.doneBtn?state.pick.doneBtn.label:null,extra:state.pick.extraBtn?state.pick.extraBtn.label:null,cancel:!!state.pick.cancel}}); hostWaiting(_own); return; } document.getElementById("promptMsg").innerHTML=state.pick.banner; const acts=document.getElementById("promptActs"); acts.innerHTML=""; if(state.pick.doneBtn) acts.appendChild(pbtn(state.pick.doneBtn.label,state.pick.doneBtn.fn)); if(state.pick.extraBtn) acts.appendChild(pbtn(state.pick.extraBtn.label,state.pick.extraBtn.fn)); if(state.pick.cancel) acts.appendChild(pbtn("やめる",()=>{ const c=state.pick.cancel; state.pick=null; hidePrompt(); c&&c(); render(); })); document.getElementById("prompt").classList.add("on"); }
const hidePrompt=()=>document.getElementById("prompt").classList.remove("on");
function resolveTake(){const pd=state.pending; if(!pd) return; const d=state.players[pd.defender], aP=state.players[pd.attacker], atk=aP.field[pd.atkSlot];
  let _dec=1; if(motifActive(pd.attacker,36)) _dec=Math.max(1,linkCount(pd.attacker,pd.atkSlot)); d.life=Math.max(0,d.life-_dec); Snd.play("life"); logLine(`${d.name}：ライフで受けた -${_dec} → LIFE ${d.life}`,true);
  if(atk&&provides(pd.attacker,pd.atkSlot,1)&&aP.rioTurn!==state.turn){ aP.rioTurn=state.turn; d.life=Math.max(0,d.life-1); logLine(`りおっぴ：追加でライフ-1 → ${d.life}`,true); announceFx(pd.attacker,pd.atkSlot,atk.name,"追加でライフ-1"); }
  if(motifActive(pd.defender,60) && atk && aP.field[pd.atkSlot]===atk){ toGrave(pd.attacker,pd.atkSlot,"ギルバスモチーフ"); logLine("ギルバス(モチーフ)：アタックしたキャラを破壊",true); announceFx(pd.defender,null,"ギルバス","反撃で攻撃キャラ破壊"); }
  d.lostLifeThisTurn=true;   // 交換/召喚は相手ターンエンド時に1回だけ
  if(atk&&provides(pd.attacker,pd.atkSlot,11)){ pd.noEnergyCost=true; logLine(`くり：エネルギー消費なし`); announceFx(pd.attacker,pd.atkSlot,atk.name,"エネルギー消費なし"); }
  endAttack(); }
function distinctNeighborShapes(pid,slot){ const f=state.players[pid].field; const s=new Set(); [slot-1,slot+1].forEach(j=>{ const c=f[j]; if(c&&!c.blank) s.add(c.shape); }); return s.size; }
function destroyBattle(pid,slot,tie){ const c=state.players[pid].field[slot]; if(!c) return;
  if(c.name==="一ノ城" && motifActive(pid,46) && state.players[pid].life<=4 && state.players[pid].hand.length>0){ const d=state.players[pid].hand.pop(); state.players[pid].exclude.push(d); announceFx(pid,slot,c.name,"手札破棄で維持"); logLine("のじょ(モチーフ)：手札1枚破棄で一ノ城を維持",true); return; }
  if(c.cardId===18 && distinctNeighborShapes(pid,slot)>=2){ announceFx(pid,slot,c.name,"2図形リンクで破壊耐性"); logLine(`れあ：2図形リンクで破壊されない`,true); return; }
  if(c.cardId===21 && tie && (c.curEn||0)>=1){ announceFx(pid,slot,c.name,"相打ち回避"); logLine(`げんちゃん：相打ちを回避`,true); return; }
  if(motifActive(pid,80) && (c.curEn||0)>=2){ chEn(c,-1); announceFx(pid,slot,c.name,"純水(モチーフ)：エネ消費で耐性"); logLine("純水(モチーフ)：エネ1消費で破壊されない",true); return; }
  if(tie && yukigaBlank() && state.players[pid].field.some(x=>x&&x.blank)){ announceFx(pid,slot,c.name,"雪雅(モチーフ)：ブランクで相打ち耐性"); logLine("雪雅(モチーフ)：相打ちで破壊されない",true); return; }
  toGrave(pid,slot,tie?"相打ち":"敗北",true); }
function preBattleDamu(pd,defSlot,done){ pd.damu=pd.damu||{}; const cands=[];
  [pd.atkSlot-1,pd.atkSlot,pd.atkSlot+1].forEach(j=>{ const c=state.players[pd.attacker].field[j]; if(c&&!c.blank&&provides(pd.attacker,j,23)&&(c.curEn||0)>=1) cands.push([pd.attacker,j]); });
  [defSlot-1,defSlot,defSlot+1].forEach(j=>{ const c=state.players[pd.defender].field[j]; if(c&&!c.blank&&provides(pd.defender,j,23)&&(c.curEn||0)>=1) cands.push([pd.defender,j]); });
  let idx=0; const nextC=()=>{ if(idx>=cands.length){ done(); return; } const [cp,cs]=cands[idx++]; askDamu(cp,cs,nextC); };
  nextC(); }
function askDamu(pid,slot,cont){ const c=state.players[pid].field[slot]; if(!c||(c.curEn||0)<1){ cont(); return; }
  const apply=(delta)=>{ chEn(c,-1); state.pending.damu[pid+":"+slot]=(state.pending.damu[pid+":"+slot]||0)+delta; announceFx(pid,slot,c.name,`基本CP${delta>0?"+":""}${delta}`); logLine(`D!amusung：⚡1消費で基本CP${delta>0?"+":""}${delta}`,true); hidePrompt(); render(); cont(); };
  const human=(state.mode!=="cpu")||pid==="self";
  if(!human){ cont(); return; }
  selectPrompt(`<b>D!amusung◇</b>（${c.name}）：⚡1消費で基本CPを変化させますか？`, [
    {label:"+1",fn:()=>apply(1)}, {label:"-1",fn:()=>apply(-1)}, {label:"発動しない",fn:()=>{ hidePrompt(); cont(); }} ]); }
function resolveBlock(defSlot){const pd=state.pending; if(!pd) return;
  if(!pd._junsuiDone && state.players[pd.defender].field.some((c,i)=>c&&!c.blank&&provides(pd.defender,i,72))){ pd._junsuiDone=true; const dp=state.players[pd.defender]; const chs=[]; dp.field.forEach((c,i)=>{ if(c&&!c.blank) chs.push(i); }); const hum=(state.mode!=="cpu")||pd.defender==="self";
    if(!hum){ let bi=-1,be=99; chs.forEach(i=>{ if((dp.field[i].curEn||0)<be){ be=dp.field[i].curEn||0; bi=i; } }); if(bi>=0){ chEn(dp.field[bi],1); logLine("純水：味方ブロック時 エネ+1",true); } resolveBlock(defSlot); return; }
    state.inputOwner=pd.defender; state.pick={ banner:`<b>純水</b>：エネ+1する自分のキャラを<b>タップ</b>`, owner:pd.defender, field:{pid:pd.defender, slots:chs, on:(i)=>{ chEn(dp.field[i],1); logLine("純水：味方ブロック エネ+1",true); state.pick=null; hidePrompt(); resolveBlock(defSlot); }}, cancel:()=>{ state.pick=null; hidePrompt(); resolveBlock(defSlot); } }; showPickBanner(); render(); return; }
  { const bc=state.players[pd.defender].field[defSlot]; if(bc&&bc.name==="Gumi"){ ["self","opp"].forEach(s=>{ const mp=state.players[s]; if(mp.motif&&mp.motif.card.cardId===62){ mp.exclude.push(mp.motif.card); mp.motif=null; logLine("Gumi(モチーフ)：Gumiがブロックしたため終了→除外",true); } }); } }
  { const dc=state.players[pd.defender].field[defSlot]; if(dc && provides(pd.defender,defSlot,21) && !pd._genSwapped){ genDiaBlockSwap(pd.defender,defSlot); return; } }
  if(!pd._damuDone){ preBattleDamu(pd,defSlot,()=>{ pd._damuDone=true; resolveBlock(defSlot); }); return; }
  const aP=state.players[pd.attacker], dP=state.players[pd.defender], aCard=aP.field[pd.atkSlot], dCard=dP.field[defSlot];
  const abonus=(pp,j,c)=>{ let x=0; if(j===pd.atkSlot && provides(pd.attacker,pd.atkSlot,20)) x-=2; x+=(pd.damu&&pd.damu[pd.attacker+":"+j])||0; return x; };
  const asada=provides(pd.defender,defSlot,10);
  const bbonus=(pp,j,c)=>{ let x=0; if(asada) x+=1; if(provides(pd.defender,j,13)) x-=1; if(j===defSlot && provides(pd.defender,defSlot,20)) x-=2; x+=(pd.damu&&pd.damu[pd.defender+":"+j])||0; return x; };
  const aCP=battleCP(pd.attacker,pd.atkSlot,abonus), dCP=battleCP(pd.defender,defSlot,bbonus);
  if(asada) announceFx(pd.defender,defSlot,dCard.name,"ブロック時 味方全員CP+1");
  for(const j of [defSlot-1,defSlot,defSlot+1]){ if(dP.field[j]&&provides(pd.defender,j,13)) announceFx(pd.defender,j,dP.field[j].name,"ブロック時 自身CP-1"); }
  const aN=aCard.name,dN=dCard.name,da=dist8(aCP),dd=dist8(dCP);
  let winner = da<dd?"a":(dd<da?"d":"tie");
  const invA=provides(pd.attacker,pd.atkSlot,31), invD=provides(pd.defender,defSlot,31);
  const invert = invA!==invD;   // とれんさー◇：結果反転（同士なら通常）
  if(invert && winner!=="tie"){ winner = winner==="a"?"d":"a"; announceFx(null,null,"とれんさー","バトル結果を反転"); }
  state.afterBattle=state.afterBattle||[]; let r;
  const hiiragiSave = pd.hiiragiRoll!=null && baseCP(pd.defender,defSlot)!==pd.hiiragiRoll;
  if(winner==="a"){ destroyBattle(pd.defender,defSlot,false); r=`${aN}(${aCP})勝ち → ${dN}`; }
  else if(winner==="d"){ if(hiiragiSave){ announceFx(pd.attacker,pd.atkSlot,aN,"ひいらぎ：破壊耐性"); logLine("ひいらぎ：出目≠基本CPのため破壊されない",true); r=`${dN}(${dCP})勝ち（${aN}は破壊耐性）`; } else { destroyBattle(pd.attacker,pd.atkSlot,false); r=`${dN}(${dCP})勝ち → ${aN}`; } }
  else { let killA=true,killD=true; if(invA&&!invD) killD=false; if(invD&&!invA) killA=false; if(hiiragiSave) killA=false; if(killA) destroyBattle(pd.attacker,pd.atkSlot,true); if(killD) destroyBattle(pd.defender,defSlot,true); r="相打ち"; }
  logLine(`ブロック：攻${aCP}(差${da}) / 防${dCP}(差${dd}) → <b>${r}</b>`,true); endAttack(); }
function toGrave(pid,i,reason="",battle=false){const p=state.players[pid], c=p.field[i]; if(!c) return; if(!battle && i===1 && motifActive(pid,59)){ logLine("すけお(モチーフ)：中央キャラは相手効果で破壊されない",true); announceFx(pid,i,c.name,"中央は無効化"); return; } Snd.play("destroy"); p.field[i]=null; const wasEn=c.curEn||0; p.graveChangedTurn=state.turn;
  if(motifEither(82) && !c._tiiriFired){ c._tiiriFired=true; const _bk=p.field[i]; p.field[i]=c; onSummon(pid,i); p.field[i]=_bk; }
  if(c.name==="てぃりー" && p.motif && p.motif.card.cardId===82){ p.tiiriLeaves=(p.tiiriLeaves||0)+1; if(p.tiiriLeaves>=2){ p.exclude.push(p.motif.card); p.motif=null; logLine("てぃりー(モチーフ)：2回退場で終了→除外",true); } }
  if(c.cardId===73){ const foe=state.players[opp(pid)]; const nn=Math.min(wasEn,3); for(let k=0;k<nn&&foe.hand.length;k++){ foe.deck.push(foe.hand.splice(Math.floor(Math.random()*foe.hand.length),1)[0]); } foe.deck.sort(()=>Math.random()-0.5); if(nn) logLine(`夏至：破壊時 相手の手札${nn}枚を山札へ`,true); announceFx(pid,i,c.name,"相手手札を山札へ"); }
  if(c.cardId===28){ if(!rescueFromExclude(pid,c)){ p.exclude.push(c); logLine(`${p.name}：${c.name} は墓地に行けず<b>除外</b>へ`); } }
  else { const kinds=new Set(p.grave.map(x=>x.cardId));
    if(kinds.has(c.cardId)||kinds.size<CONFIG.GRAVE_KINDS){ p.grave.push(c); logLine(`${p.name}：${c.name}を破壊${reason?"（"+reason+"）":""}`); }
    else { if(!rescueFromExclude(pid,c)){ p.exclude.push(c); logLine(`${p.name}：墓地が${CONFIG.GRAVE_KINDS}種類のため ${c.name} は<b>除外</b>へ`); } } }
  if(c.cardId===116){ const foe=state.players[opp(pid)]; let bi=-1,be=-1; foe.field.forEach((x,i)=>{ if(x&&!x.blank&&(x.curEn||0)>be){be=x.curEn||0;bi=i;} }); if(bi>=0){ chEn(foe.field[bi],-1); logLine(`D!amusung(⬠)：場を去る → 相手のエネ-1`,true); announceFx(pid,null,c.name,"場を去る 相手エネ-1"); } }
  if(battle){ state.afterBattle=state.afterBattle||[];
    if(c.cardId===112){ const heal=wasEn; announceFx(pid,null,c.name,`バトル破壊時 ライフ+${heal}`); state.afterBattle.push(next=>{ if(canGainLife()){ p.life=Math.min(CONFIG.LIFE_MAX,p.life+heal); onLifeGain(pid); logLine(`ちゅろす(⬠)：ライフ+${heal} → ${p.life}`,true);} render(); next(); }); }
    if(c.cardId===2){ announceFx(pid,null,c.name,"バトル破壊時 墓地からキャラ回収"); state.afterBattle.push(next=>reaHook(pid,next)); }
    if(c.cardId===12 && wasEn>=1){ announceFx(pid,null,c.name,"バトル破壊時 0エネで再召喚"); state.afterBattle.push(next=>ringoHook(pid,c,next)); }
    if(c.cardId===17){ announceFx(pid,null,c.name,"バトル破壊時 弱いキャラを破壊"); state.afterBattle.push(next=>rioppiDiaHook(pid,wasEn,next)); }
    if(c.cardId===19){ const slot=i, en=wasEn; state.afterBattle.push(next=>churoDiaHook(pid,slot,en,next)); } }
  if(motifActive(pid,34)){ let n=0; for(let k=p.grave.length-1;k>=0&&n<2;k--){ p.hand.push(p.grave.splice(k,1)[0]); n++; } if(n){ logLine(`れあ(モチーフ)：墓地から${n}枚手札へ`,true); } }
  maintainMotifs(); }
function churoDiaDistribute(pid,slot,en){ const f=state.players[pid].field; const ns=[slot-1,slot+1].filter(j=>f[j]&&!f[j].blank&&f[j].cardId!==28); if(!ns.length||en<=0) return; const k=ns.length; ns.forEach((j,idx)=>{ const add=Math.floor(en/k)+((idx<(en%k))?1:0); f[j].curEn=Math.min(12,(f[j].curEn||0)+add); }); announceFx(pid,null,"ちゅろす",`エネルギー${en}を隣接へ分配`); logLine(`ちゅろす：エネルギー${en}を隣接に分配`,true); }
function rioppiDiaHook(pid,thr,next){ const dpid=opp(pid), foe=state.players[dpid]; const slots=[]; foe.field.forEach((c,i)=>{ if(c&&!c.blank&&(c.curEn||0)<thr) slots.push(i); });
  if(!slots.length){ next(); return; }
  const apply=(i)=>{ const nm=foe.field[i].name; toGrave(dpid,i,"りおっぴ効果"); logLine(`りおっぴ：${nm} を破壊`,true); render(); next(); };
  const human=(state.mode!=="cpu")||pid==="self";
  if(!human){ let best=slots[0],bd=99; slots.forEach(i=>{const d=dist8(linkedCP(dpid,i)); if(d<bd){bd=d;best=i;}}); apply(best); return; }
  selectPrompt(`<b>りおっぴ◇</b>：エネルギー${thr}未満の相手キャラを破壊`, slots.map(i=>({label:`${foe.field[i].name}(⚡${foe.field[i].curEn||0})`,fn:()=>{ hidePrompt(); apply(i); }})).concat([{label:"やめる",fn:()=>{ hidePrompt(); next(); }}])); }
// エネルギー消費はここ（バトル確定後）。攻撃キャラが生存していれば1消費（くりで削った時は消費なし）
function endAttack(){ const pd=state.pending; let masa=null;
  if(pd){ const aP=state.players[pd.attacker], atk=aP.field[pd.atkSlot]; const cost=1+(aP.tobo||0); const _mfree=aP.motifMasaNext; if(_mfree) aP.motifMasaNext=false; if(atk && !pd.noEnergyCost && !_mfree){ atk.curEn=Math.max(0,(atk.curEn||0)-cost); } if(atk) aP.tobo=0;
    if(atk && atk.cardId===49 && aP.field[pd.atkSlot]===atk){ aP.field[pd.atkSlot]=null; aP.exclude.push(atk); logLine("Masa(✕)：アタック終了で除外",true); }
    if(atk && provides(pd.attacker,pd.atkSlot,24) && (atk.curEn||0)>=1) masa={pid:pd.attacker,slot:pd.atkSlot}; }
  ["self","opp"].forEach(s=>state.players[s].field.forEach(c=>{ if(c){ c._solo=false; c._cutSlots=null; c._cpx2=false; } }));
  state.pending=null; hidePrompt(); if(checkWin()) return; render();
  if(masa){ offerMasaDia(masa, runAfterBattle); return; }
  runAfterBattle(); }
function offerMasaDia(m,done){ const pid=m.pid, slot=m.slot, p=state.players[pid], atk=p.field[slot]; if(!atk||(atk.curEn||0)<1){ done(); return; }
  const reatk=()=>{ atk.curEn=0; p.attacked=true; state.phase=2; state.pending={attacker:pid,atkSlot:slot,defender:opp(pid),noBlock:false,noEnergyCost:true}; logLine(`Masa：全エネルギー消費で再攻撃`,true); announceFx(pid,slot,atk.name,"全エネ消費で再攻撃"); render(); resolveOrAskDefense(); };
  const human=(state.mode!=="cpu")||pid==="self";
  if(!human){ done(); return; }
  selectPrompt(`<b>Masa◇</b>：全エネルギー(${atk.curEn})を消費して再攻撃しますか？`, [
    {label:"はい（再攻撃）",fn:()=>{ hidePrompt(); reatk(); }},
    {label:"いいえ",fn:()=>{ hidePrompt(); done(); }} ]); }
function kuriDiaTarget(pid,slotIdx){ const dpid=opp(pid), foe=state.players[dpid]; const slots=[]; foe.field.forEach((c,i)=>{ if(c&&!c.blank) slots.push(i); });
  if(!slots.length){ resolveOrAskDefense(); return; }
  const set=(i)=>{ state.pending.noBlockBy=i; announceFx(pid,slotIdx,state.players[pid].field[slotIdx].name,"指定した相手にブロックされない"); hidePrompt(); resolveOrAskDefense(); };
  const human=(state.mode!=="cpu")||pid==="self";
  if(!human){ let best=slots[0],bd=99; slots.forEach(i=>{const d=dist8(linkedCP(dpid,i)); if(d<bd){bd=d;best=i;}}); set(best); return; }
  selectPrompt(`<b>くり◇</b>：ブロックさせない相手キャラを指定`, slots.map(i=>({label:`${foe.field[i].name}`,fn:()=>set(i)}))); }
function onSummon(pid,slot){ const c=state.players[pid].field[slot]; if(!c) return; if(c.cardId===26) asadaDiaSummon(pid,slot);
  if(c.cardId===50) makoXSummon(pid);
  if(c.cardId===55 && linkedCP(pid,slot)<=5){ const dp=state.players[opp(pid)]; const nt=state.turn+1; dp.gilFacing={turn:nt, slot:faceSlot(slot)}; dp.gilForced=nt; logLine(`ギルバス：相手は次ターン正面のキャラで強制アタック`,true); announceFx(pid,slot,c.name,"相手を正面で強制アタック"); }
  if(c.cardId===68 && linkedCP(pid,slot)%2===0) keiSummon(pid,slot);
  if(c.cardId===57){ if(linkedCP(pid,slot)%2===1){ const foe=state.players[opp(pid)], fs=faceSlot(slot); const t=foe.field[fs]; if(t&&!t.blank){ t.blank=true; t.blankEn=0; logLine(`Gumi：正面の敵をブランク化`,true); announceFx(pid,slot,c.name,"正面をブランク化"); } } }
  if(c.cardId===54){ let lc=0; [slot-1,slot,slot+1].forEach(j=>{const x=state.players[pid].field[j]; if(x&&!x.blank) lc++;}); const p=state.players[pid]; if(canGainLife()){ p.life=Math.min(CONFIG.LIFE_MAX,p.life+lc); onLifeGain(pid); logLine(`すけお：リンク数${lc}ぶんライフ回復 → ${p.life}`,true);} else logLine("Gumi効果でライフ増加不可",true); announceFx(pid,slot,c.name,`ライフ+${lc}`); } }
/* ===== ✕シリーズ効果 ===== */
function reaXRoll(pid,slot){ const p=state.players[pid], foe=state.players[opp(pid)]; let again=true, g=0;
  while(again && g++<15){ const r=d6(); logLine(`れあ(✕)：ダイス ${r}`,true); announceFx(pid,slot,"れあ",`ダイス ${r}`);
    if(r<=4){ if(p.hand.length){ const d=p.hand.pop(); p.grave.push(d); logLine(`れあ(✕)：手札1枚破棄（${d.name}）`,true); } again=false; }
    else { foe.life=Math.max(0,foe.life-1); logLine(`れあ(✕)：相手ライフ-1 → ${foe.life}`,true); again=true; if(foe.life<=0) break; } } }
function masaXRoll(pid,slot){ const p=state.players[pid], foe=state.players[opp(pid)]; const r=d6(); logLine(`Masa(✕)：ダイス ${r}`,true); announceFx(pid,slot,"Masa",`ダイス ${r}`);
  if(r<=3){ p.life=Math.max(0,p.life-1); logLine(`Masa(✕)：自分ライフ-1 → ${p.life}`,true); }
  else if(r<=5){ foe.life=Math.max(0,foe.life-1); logLine(`Masa(✕)：相手ライフ-1 → ${foe.life}`,true); }
  else { foe.life=Math.max(0,foe.life-2); logLine(`Masa(✕)：相手ライフ-2 → ${foe.life}`,true); } }
function musuXUnlink(pid,slot){ const proceed=()=>resolveOrAskDefense(); const f=state.players[pid].field, card=f[slot];
  const neighbors=[slot-1,slot+1].filter(j=>f[j]&&!f[j].blank&&f[j].cardId!==28);
  if(!neighbors.length){ proceed(); return; }
  const human=(state.mode!=="cpu")||pid==="self";
  if(!human){ // 合計CPを8に近づけられるなら解除
    const subsets=[[]]; neighbors.forEach(n=>subsets.push([n])); if(neighbors.length===2) subsets.push(neighbors.slice());
    let best=[], bestD=dist8(linkedCP(pid,slot));
    subsets.forEach(cs=>{ card._cutSlots=cs; const d=dist8(linkedCP(pid,slot)); if(d<bestD){ bestD=d; best=cs.slice(); } });
    card._cutSlots=best.length?best:null; if(best.length){ announceFx(pid,slot,card.name,"リンク解除で合計CP調整"); logLine(`D!amusung(✕)：リンク解除（合計CP ${linkedCP(pid,slot)}）`,true); }
    render(); proceed(); return; }
  state.inputOwner=pid;
  selectPrompt(`<b>D!amusung(✕)</b>：リンクを解除しますか？`, [
    {label:"解除する（キャラをタップ）",fn:()=>{ hidePrompt(); musuPickCut(pid,slot,neighbors,proceed); }},
    {label:"そのまま",fn:()=>{ hidePrompt(); proceed(); }} ]); }
function musuPickCut(pid,slot,neighbors,proceed){ const f=state.players[pid].field, card=f[slot]; const cuts=[]; card._cutSlots=[];
  const finish=()=>{ card._cutSlots=cuts.length?cuts.slice():null; if(cuts.length) announceFx(pid,slot,card.name,"リンク解除"); state.pick=null; hidePrompt(); render(); proceed(); };
  const step=()=>{ const avail=neighbors.filter(n=>cuts.indexOf(n)<0); if(!avail.length){ finish(); return; }
    state.pick={ banner:`<b>D!amusung(✕)</b>：リンク解除する隣接キャラを<b>タップ</b>（現在の合計CP ${linkedCP(pid,slot)}）`, owner:pid,
      field:{pid, slots:avail, on:(i)=>{ cuts.push(i); card._cutSlots=cuts.slice(); render(); step(); }}, doneBtn:{label:"決定",fn:finish} };
    showPickBanner(); render(); };
  step(); }
function nekoXAttack(pid,slot){ const dpid=opp(pid), foe=state.players[dpid], fs=faceSlot(slot); const card=state.players[pid].field[slot];
  const done=()=>{ if(state.pending) state.pending.nekoEn=(card.curEn||0); resolveOrAskDefense(); };
  const facing=foe.field[fs]; const targets=[]; foe.field.forEach((c,i)=>{ if(i!==fs && c && !c.blank && (c.curEn||0)>0) targets.push(i); });
  const move=(idxs)=>{ let moved=0; for(const i of idxs){ if(moved>=2) break; const c=foe.field[i]; const take=Math.min(2-moved,(c.curEn||0)); chEn(c,-take); moved+=take; } if(facing&&!facing.blank) chEn(facing,moved); if(moved) logLine(`猫うさぎ：正面に${moved}エネ集約`,true); announceFx(pid,slot,card.name,"エネ集約"); };
  if(!facing||facing.blank||!targets.length){ done(); return; }
  const human=(state.mode!=="cpu")||pid==="self";
  if(!human){ const s=targets.slice().sort((a,b)=>(foe.field[b].curEn||0)-(foe.field[a].curEn||0)); move(s.slice(0,2)); render(); done(); return; }
  const chosen=[]; state.inputOwner=pid;
  const step=()=>{ const avail=targets.filter(i=>!chosen.includes(i)); if(chosen.length>=2||!avail.length){ move(chosen); state.pick=null; hidePrompt(); render(); done(); return; }
    state.pick={ banner:`<b>猫うさぎ</b>：エネを集める相手を<b>タップ</b>（${chosen.length}/2 → 正面へ集約）`, owner:pid, field:{pid:dpid, slots:avail, on:(i)=>{ chosen.push(i); step(); }}, doneBtn:{label:"決定",fn:()=>{ move(chosen); state.pick=null; hidePrompt(); render(); done(); }} };
    showPickBanner(); render(); };
  step(); }
function makoXSummon(pid){ const p=state.players[pid]; draw(pid,3); const human=(state.mode!=="cpu")||pid==="self";
  const back=(card)=>{ const idx=p.hand.indexOf(card); if(idx>=0) p.deck.push(p.hand.splice(idx,1)[0]); };
  if(!human){ const s=p.hand.slice().sort((a,b)=>((a.type==="character")?1:0)-((b.type==="character")?1:0)||(a.cp||0)-(b.cp||0)); s.slice(0,2).forEach(back); p.deck.sort(()=>Math.random()-0.5); logLine(`真筝(✕)：3ドロー→2枚山札へ`,true); render(); return; }
  let cnt=0; state.inputOwner=pid;
  const step=()=>{ if(cnt>=2||!p.hand.length){ p.deck.sort(()=>Math.random()-0.5); state.pick=null; hidePrompt(); logLine(`真筝(✕)：3ドロー→2枚山札へ`,true); render(); return; }
    state.pick={ banner:`山札に戻す手札を<b>タップ</b>（${cnt}/2）`, owner:pid, hand:{pid, on:(c)=>{ back(c); cnt++; step(); }} }; showPickBanner(); render(); };
  step(); }
function rinXTurnEnd(pid,done){ const p=state.players[pid]; let has=false; p.field.forEach((c,i)=>{ if(c&&!c.blank&&provides(pid,i,52)) has=true; });
  const chars=[]; p.field.forEach((c,i)=>{ if(c&&!c.blank) chars.push(i); });
  const human=(state.mode!=="cpu")||pid==="self";
  if(!has||!chars.length){ done(); return; }
  if(!human){ let bi=-1,bs=0;
    chars.forEach(i=>{ const c=p.field[i]; let sc=0; if((c.curEn||0)===0) sc+=2; if([26,50,54].indexOf(c.cardId)>=0) sc+=2;
      const before=[i-1,i+1].reduce((a,j)=>{const x=p.field[j]; return a+((x&&!x.blank)?(8-dist8(linkedCP(pid,j))):0);},0);
      p.field[i]=null; const after=[i-1,i+1].reduce((a,j)=>{const x=p.field[j]; return a+((x&&!x.blank)?(8-dist8(linkedCP(pid,j))):0);},0); p.field[i]=c;
      if(after>before) sc+=2; if(sc>bs){ bs=sc; bi=i; } });
    if(bi>=0&&bs>=2){ const c=p.field[bi]; p.field[bi]=null; c.blank=false; c.curEn=c.energy; p.deck.push(c); p.deck.sort(()=>Math.random()-0.5); logLine(`りんごあめ(✕)：${c.name}を山札へ`,true); render(); }
    done(); return; }
  state.inputOwner=pid;
  state.pick={ banner:`<b>りんごあめ(✕)</b>：山札に戻す自分のキャラを<b>タップ</b>（自身も可・任意）`, owner:pid,
    field:{pid, slots:chars, on:(i)=>{ const c=p.field[i]; p.field[i]=null; c.blank=false; c.curEn=c.energy; p.deck.push(c); p.deck.sort(()=>Math.random()-0.5); announceFx(pid,i,c.name,"山札へ戻す"); state.pick=null; hidePrompt(); render(); done(); }},
    cancel:()=>{ state.pick=null; hidePrompt(); done(); } };
  showPickBanner(); render(); }
/* ===== △シリーズ効果 ===== */
function okaTurnStart(pid){ const p=state.players[pid]; p.okaAcq=null; let os=-1; for(let i=0;i<p.field.length;i++){ if(p.field[i]&&!p.field[i].blank&&p.field[i].cardId===69){ os=i; break; } } if(os<0) return;
  const foe=state.players[opp(pid)]; const targets=[]; foe.field.forEach((c,i)=>{ if(c&&!c.blank) targets.push(i); }); if(!targets.length) return;
  const set=(i)=>{ const t=foe.field[i]; p.okaAcq={cardId:t.cardId, name:t.name}; logLine(`おかさん：${t.name} の効果を獲得（このターン）`,true); announceFx(pid,os,"おかさん",`${t.name}の効果を獲得`); render(); };
  const human=(state.mode!=="cpu")||pid==="self";
  if(!human){ let b=targets[0],bd=99; targets.forEach(i=>{const d=dist8(linkedCP(opp(pid),i)); if(d<bd){bd=d;b=i;}}); set(b); return; }
  state.inputOwner=pid; selectPrompt(`<b>おかさん</b>：効果を獲得する相手キャラを選択`, targets.map(i=>({label:foe.field[i].name,fn:()=>{hidePrompt();set(i);}}))); }
function triAtkFx(pid,slotIdx,proceed){ yukigaAttack(pid,slotIdx, ()=>hiiragiAttack(pid,slotIdx,proceed)); }
function yukigaAttack(pid,slotIdx,proceed){ const f=state.players[pid].field;
  const yuki=[]; f.forEach((c,i)=>{ if(c&&!c.blank&&provides(pid,i,76)) yuki.push(i); }); if(!yuki.length){ proceed(); return; }
  const cands=new Set(); yuki.forEach(y=>{ cands.add(y); [y-1,y+1].forEach(j=>{ if(f[j]&&!f[j].blank) cands.add(j); }); });
  const valid=[...cands].filter(t=>{ f[t]._cpx2=true; const lc=linkedCP(pid,slotIdx); f[t]._cpx2=false; if(motifEither(43)&&lc===8) return false; if(yukigaBlank()&&lc%2===0) return false; return true; });
  if(!valid.length){ proceed(); return; }
  const apply=(t)=>{ f[t]._cpx2=true; announceFx(pid,t,f[t].name,"基本CP×2"); logLine("雪雅：基本CPを2倍",true); render(); };
  const human=(state.mode!=="cpu")||pid==="self";
  if(!human){ let best=-1,bd=dist8(linkedCP(pid,slotIdx)); valid.forEach(t=>{ f[t]._cpx2=true; const d=dist8(linkedCP(pid,slotIdx)); f[t]._cpx2=false; if(d<bd){bd=d;best=t;} }); if(best>=0) apply(best); proceed(); return; }
  state.inputOwner=pid;
  selectPrompt(`<b>雪雅</b>：基本CPを2倍にするキャラ（アタック合計CP調整）`, valid.map(t=>({label:`${f[t].name}(${f[t].cp}→${(f[t].cp||0)*2})`,fn:()=>{hidePrompt();apply(t);proceed();}})).concat([{label:"しない",fn:()=>{hidePrompt();proceed();}}])); }
function hiiragiAttack(pid,slotIdx,proceed){ const f=state.players[pid].field;
  if(!f.some((c,i)=>c&&!c.blank&&provides(pid,i,75))){ proceed(); return; }
  const roll=()=>{ const r=d6(); if(state.pending) state.pending.hiiragiRoll=r; logLine(`ひいらぎ：ダイス ${r}（出目≠基本CPのブロッカーには破壊されない）`,true); announceFx(pid,slotIdx,"ひいらぎ",`ダイス ${r}`); };
  const human=(state.mode!=="cpu")||pid==="self";
  if(!human){ roll(); proceed(); return; }
  state.inputOwner=pid;
  selectPrompt(`<b>ひいらぎ</b>：ダイスを振りますか？（出目と基本CPが違うキャラに破壊されない）`, [
    {label:"振る",fn:()=>{hidePrompt();roll();proceed();}},
    {label:"振らない",fn:()=>{hidePrompt();proceed();}} ]); }
/* ===== 残りモチーフ効果 ===== */
function SX2(){ return state._sasshiX2?2:1; }
function keiReturn(pid,slot){ const p=state.players[pid]; const c=p.field[slot]; if(!c) return; p.field[slot]=null; c.blank=false; c.curEn=c.energy; p.hand.push(c); p.keiUsedTurn=state.turn; logLine(`けい(モチーフ)：${c.name} を手札に戻した（違うキャラを召喚可）`,true); announceFx(pid,slot,"けい","手札に戻す"); closeOverlay(); render(); }
function cardName(cid){ const c=CARD_POOL.find(x=>x.cardId===cid); return c?c.name:("#"+cid); }
function hiiragiMotif(pid,fin){ const p=state.players[pid], foe=state.players[opp(pid)];
  const uniq=[...new Set(CARD_POOL.filter(c=>c.type==="special").map(c=>c.cardId))].filter(cid=>SPECIAL_IMPL.has(cid));
  const use=(cid)=>{ let arr=null,idx=foe.deck.findIndex(c=>c.cardId===cid); if(idx>=0) arr=foe.deck; else { idx=foe.hand.findIndex(c=>c.cardId===cid); if(idx>=0) arr=foe.hand; }
    if(idx<0){ logLine(`ひいらぎ(モチーフ)：相手は「${cardName(cid)}」未所持`,true); return; }
    const taken=arr.splice(idx,1)[0]; logLine(`ひいらぎ(モチーフ)：相手の「${taken.name}」を使用`,true); playSpecial(pid,taken);
    const gi=p.grave.indexOf(taken); if(gi>=0) foe.exclude.push(p.grave.splice(gi,1)[0]); else if(p.field.indexOf(taken)<0) foe.exclude.push(taken); };
  const human=(state.mode!=="cpu")||pid==="self";
  if(!human){ const has=uniq.filter(cid=> foe.deck.some(c=>c.cardId===cid)||foe.hand.some(c=>c.cardId===cid)); has.slice(0,2).forEach(use); fin(); return; }
  let picked=[];
  const step=()=>{ if(picked.length>=2){ picked.forEach(use); fin(); return; }
    const opts=uniq.filter(cid=>picked.indexOf(cid)<0).map(cid=>({label:cardName(cid),fn:()=>{ hidePrompt(); picked.push(cid); step(); }}));
    opts.push({label: picked.length?"決定":"やめる", fn:()=>{ hidePrompt(); picked.forEach(use); fin(); }});
    state.inputOwner=pid; selectPrompt(`<b>ひいらぎ(モチーフ)</b>：宣言する特殊カード（${picked.length}/2・重複不可）`, opts); };
  step(); }
function keiSummon(pid,slot){ const p=state.players[pid]; const sp=p.grave.filter(x=>x.type==="special"); if(!sp.length) return;
  const take=(card)=>{ const idx=p.grave.indexOf(card); if(idx>=0){ p.hand.push(p.grave.splice(idx,1)[0]); logLine(`けい：墓地から ${card.name} を手札へ`,true); announceFx(pid,slot,"けい","特殊カード回収"); render(); } };
  const human=(state.mode!=="cpu")||pid==="self"; if(!human){ take(sp[0]); return; }
  state.inputOwner=pid; selectPrompt(`<b>けい</b>：墓地から手札に加える特殊カード`, sp.map(c=>({label:c.name,fn:()=>{hidePrompt();take(c);}})).concat([{label:"やめる",fn:()=>hidePrompt()}])); }
function meltoaTurnEnd(pid,done){ const p=state.players[pid]; let ms=-1; for(let i=0;i<p.field.length;i++){ if(p.field[i]&&!p.field[i].blank&&provides(pid,i,70)&&(p.field[i].curEn||0)>=1){ ms=i; break; } }
  const foe=state.players[opp(pid)]; const targets=[]; foe.field.forEach((c,i)=>{ if(c&&!c.blank) targets.push(i); });
  if(ms<0||!targets.length){ done(); return; }
  const apply=(i)=>{ chEn(p.field[ms],-1); foe.field[i].noAttackTurn=state.turn+1; logLine("ルイ：相手キャラを次ターンアタック不可",true); announceFx(pid,ms,"ルイ","相手を次ターンアタック不可"); render(); done(); };
  const human=(state.mode!=="cpu")||pid==="self";
  if(!human){ let b=targets[0],bd=99; targets.forEach(i=>{const d=dist8(linkedCP(opp(pid),i)); if(d<bd){bd=d;b=i;}}); apply(b); return; }
  state.inputOwner=pid; selectPrompt(`<b>ルイ</b>：エネ1消費で次ターンアタック不可にする相手（任意）`, targets.map(i=>({label:foe.field[i].name,fn:()=>{hidePrompt();apply(i);}})).concat([{label:"やめる",fn:()=>{hidePrompt();done();}}])); }
function asadaDiaSummon(pid,slot){ const p=state.players[pid]; const even=(linkedCP(pid,slot)%2===0);
  if(!even){ logLine(`新薬浅田◇：合計CP奇数で不発`,true); return; }
  if(p.deck.length===0){ logLine(`新薬浅田◇：山札0でドロー不可`,true); return; }
  draw(pid,1,true); announceFx(pid,slot,"新薬浅田","召喚時 1ドロー");
  const resolve=(r)=>{ if(state.dice) state.dice[pid]=r; if(r>=4){ const foe=state.players[opp(pid)]; if(foe.deck.length){ const d=foe.deck.pop(); const kinds=new Set(foe.grave.map(x=>x.cardId)); if(kinds.has(d.cardId)||kinds.size<CONFIG.GRAVE_KINDS) foe.grave.push(d); else foe.exclude.push(d); } logLine(`新薬浅田◇：ダイス${r} → 相手山札上を1枚破棄`,true); } else logLine(`新薬浅田◇：ダイス${r}`,true); render(); };
  const human=(state.mode!=="cpu")||pid==="self";
  if(human) openDiceScreen("新薬浅田◇",[p.name],vals=>{ closeDice(); resolve(vals[0]); }); else resolve(1+(Math.random()*6|0)); }
function offerYodaDia(pid,done){ const p=state.players[pid]; let ys=-1; for(let i=0;i<p.field.length;i++){ if(p.field[i]&&!p.field[i].blank&&provides(pid,i,16)&&(p.field[i].curEn||0)>=1){ ys=i; break; } }
  const dpid=opp(pid), foe=state.players[dpid]; const targets=[]; foe.field.forEach((c,i)=>{ if(c&&!c.blank) targets.push(i); });
  if(ys<0||!targets.length){ done(); return; }
  const doTarget=(i)=>{ p.field[ys].curEn=Math.max(0,(p.field[ys].curEn||0)-1); foe.field[i].noEffectTurn=state.turn+1; announceFx(pid,ys,"YODA","相手の効果を無効化"); logLine(`YODA◇：${foe.field[i].name} の効果を次ターン無効化`,true); render(); done(); };
  const human=(state.mode!=="cpu")||pid==="self";
  if(!human){ let best=targets[0],bd=99; targets.forEach(i=>{const d=dist8(linkedCP(dpid,i)); if(d<bd){bd=d;best=i;}}); doTarget(best); return; }
  selectPrompt(`<b>YODA◇</b>：⚡1消費で相手キャラの効果を無効化？`, targets.map(i=>({label:`${foe.field[i].name} を無効化`,fn:()=>{ hidePrompt(); doTarget(i); }})).concat([{label:"使わない",fn:()=>{ hidePrompt(); done(); }}])); }
function runAfterBattle(){ const q=state.afterBattle||(state.afterBattle=[]); if(q.length){ const fn=q.shift(); fn(runAfterBattle); } else maybeCpu(); }
function selectPrompt(msg,options){ if(NET.active&&NET.isHost&&!ownerIsLocal(inputOwner())){ NET.await={kind:"select",options}; netToSeat(inputOwner(),{t:"prompt",ui:{kind:"select",msg,labels:options.map(o=>o.label)}}); hostWaiting(inputOwner()); return; } $("promptMsg").innerHTML=msg; const a=$("promptActs"); a.innerHTML=""; options.forEach(o=>a.appendChild(pbtn(o.label,o.fn))); $("prompt").classList.add("on"); }
function reaHook(pid,next){ const p=state.players[pid]; const seen=new Set(); const opts=[];
  p.grave.forEach(c=>{ if(c.type==="character"&&c.cardId!==2&&!seen.has(c.cardId)){ seen.add(c.cardId); opts.push({label:c.name,fn:()=>{ const idx=p.grave.findIndex(x=>x.cardId===c.cardId); const card=p.grave.splice(idx,1)[0]; p.hand.push(card); logLine(`${p.name}：れあ効果 → ${card.name} を手札に`,true); hidePrompt(); render(); next(); }}); } });
  if(!opts.length){ next(); return; }
  opts.push({label:"何もしない",fn:()=>{ hidePrompt(); render(); next(); }});
  const human=(state.mode!=="cpu")||pid==="self";
  if(human) selectPrompt(`<b>れあ</b>：墓地から手札に加えるキャラを選択`,opts); else opts[0].fn(); }
function ringoHook(pid,card,next){ const p=state.players[pid]; if(p.noSummonTurn===state.turn){ next(); return; } const empties=[]; p.field.forEach((c,i)=>{ if(!c) empties.push(i); });
  if(!empties.length){ next(); return; }
  const place=(slot)=>{ const gi=p.grave.lastIndexOf(card); if(gi>=0) p.grave.splice(gi,1); card.blank=false; card.curEn=0; p.field[slot]=card; logLine(`${p.name}：りんごあめ 再召喚（⚡0）`,true); hidePrompt(); render(); next(); };
  const opts=empties.map(i=>({label:`スロット${i+1}`,fn:()=>place(i)}));
  opts.push({label:"再召喚しない",fn:()=>{ hidePrompt(); render(); next(); }});
  const human=(state.mode!=="cpu")||pid==="self";
  if(human) selectPrompt(`<b>りんごあめ</b>：再召喚する空きスロット（⚡0）`,opts); else place(empties[0]); }
function startSwap(pid,slot){ const p=state.players[pid]; announceFx(pid,slot,p.field[slot].name,"位置入替"); const opts=[];
  p.field.forEach((c,i)=>{ if(c&&!c.blank&&i!==slot) opts.push({label:`${c.name}（スロット${i+1}）`,fn:()=>{ const t=p.field[i]; p.field[i]=p.field[slot]; p.field[slot]=t; p.swapTurn=state.turn; hidePrompt(); render(); }}); });
  if(!opts.length){ flash("入れ替える味方がいません"); return; }
  closeOverlay(); selectPrompt(`<b>D!amusung</b>：入れ替える味方を選択`,opts); }
/* 汎用：エネルギー割り当て（add=分配 / spend=消費）。ライブプレビュー＋決定/やり直す */
function allocEnergy(pid, slots, total, mode, onDone){ const P=()=>state.players[pid];
  const alloc={}; slots.forEach(s=>alloc[s]=0);
  const sum=()=>slots.reduce((a,s)=>a+alloc[s],0); const remaining=()=>total-sum();
  const canTap=(s)=>{ const c=P().field[s]; if(!c) return false; return mode==='spend' ? (c.curEn||0)>0 : (c.curEn||0)<12; };
  const doTap=(s)=>{ const c=P().field[s]; if(!c) return; if(mode==='spend') c.curEn=Math.max(0,(c.curEn||0)-1); else c.curEn=Math.min(12,(c.curEn||0)+1); alloc[s]++; };
  const revert=()=>{ slots.forEach(s=>{ const c=P().field[s]; if(!c) return; if(mode==='spend') c.curEn=Math.min(12,(c.curEn||0)+alloc[s]); else c.curEn=Math.max(0,(c.curEn||0)-alloc[s]); alloc[s]=0; }); };
  const human=(state.mode!=="cpu")||pid==="self";
  if(!human){ let r=total; for(const s of slots){ while(r>0&&canTap(s)){ doTap(s); r--; } if(r<=0) break; } if(remaining()>0){ revert(); onDone(false); return; } onDone(true); return; }
  const step=()=>{ const tappable=slots.filter(s=> remaining()>0 && canTap(s));
    state.pick={ banner:`${mode==='add'?'分配':'消費'}：残り <b>${remaining()}</b>（カードをタップ）`, field:{pid, slots:tappable, on:(s)=>{ if(remaining()>0&&canTap(s)) doTap(s); step(); }},
      doneBtn: remaining()===0?{label:"決定",fn:()=>{ state.pick=null; hidePrompt(); onDone(true); }}:null,
      extraBtn:{label:"やり直す",fn:()=>{ revert(); step(); }},
      cancel:()=>{ revert(); state.pick=null; hidePrompt(); onDone(false); } };
    showPickBanner(); render(); };
  step(); }
function churoDiaHook(pid,slot,en,next){ const f=state.players[pid].field; const ns=[slot-1,slot+1].filter(j=>f[j]&&!f[j].blank&&f[j].cardId!==28); if(!ns.length||en<=0){ next(); return; } announceFx(pid,null,"ちゅろす",`エネルギー${en}を分配`); allocEnergy(pid,ns,en,'add',()=>{ logLine(`ちゅろす：エネルギー${en}を隣接に分配`,true); render(); next(); }); }
function mashitoDiaTarget(pid,slotIdx){ const f=state.players[pid].field; const ns=[slotIdx-1,slotIdx+1].filter(j=>f[j]&&!f[j].blank&&f[j].cardId!==28); const tot=ns.reduce((a,j)=>a+(f[j].curEn||0),0);
  const proceed=()=>resolveOrAskDefense();
  if(tot<3){ proceed(); return; }
  const human=(state.mode!=="cpu")||pid==="self";
  if(!human){ let rem=3; for(const j of ns){ const c=f[j]; const take=Math.min(rem,c.curEn||0); chEn(c,-take); rem-=take; if(rem<=0) break; } state.pending.noBlock=true; announceFx(pid,slotIdx,f[slotIdx].name,"リンク3消費 ブロック不可"); proceed(); return; }
  selectPrompt(`<b>真筝◇</b>：リンク先のエネルギーを3消費してブロック不可にしますか？`, [
    {label:"はい（3消費）",fn:()=>{ hidePrompt(); allocEnergy(pid,ns,3,'spend',(ok)=>{ if(ok){ state.pending.noBlock=true; announceFx(pid,slotIdx,f[slotIdx].name,"リンク3消費 ブロック不可"); } proceed(); }); }},
    {label:"いいえ",fn:()=>{ hidePrompt(); proceed(); }} ]); }
function ichinoDiaSwap(pid,slotIdx){ const dpid=opp(pid), foe=state.players[dpid], fs=faceSlot(slotIdx);
  const proceed=()=>resolveOrAskDefense();
  const targets=[]; foe.field.forEach((c,i)=>{ if(i!==fs && c && !c.blank) targets.push(i); });   // 空スロットは対象外
  if(!targets.length){ proceed(); return; }
  const doSwap=(i)=>{ const t=foe.field[fs]; foe.field[fs]=foe.field[i]; foe.field[i]=t; announceFx(pid,slotIdx,state.players[pid].field[slotIdx].name,"正面の敵を入替"); };
  const human=(state.mode!=="cpu")||pid==="self"; if(!human){ proceed(); return; }
  state.inputOwner=pid;
  state.pick={ banner:`<b>一ノ城◇</b>：正面(スロット${fs+1})と入れ替える<b>相手キャラをタップ</b>`, owner:pid,
    field:{pid:dpid, slots:targets, on:(i)=>{ state.pick=null; hidePrompt(); doSwap(i); render(); proceed(); }},
    cancel:()=>{ state.pick=null; hidePrompt(); proceed(); } };
  showPickBanner(); render(); }
function genDiaBlockSwap(pid,slot){ const p=state.players[pid]; const allies=[]; p.field.forEach((c,i)=>{ if(c&&!c.blank&&i!==slot) allies.push(i); });
  const go=(ns)=>{ state.pending._genSwapped=true; resolveBlock(ns); };
  const human=(state.mode!=="cpu")||pid==="self";
  if(!allies.length||!human){ go(slot); return; }
  const opts=allies.map(i=>({label:`${p.field[i].name}（スロット${i+1}）と入替`,fn:()=>{ const t=p.field[slot]; p.field[slot]=p.field[i]; p.field[i]=t; announceFx(pid,i,"げんちゃん","ブロック時 位置入替"); hidePrompt(); render(); go(i); }}));
  opts.push({label:"入れ替えない",fn:()=>{ hidePrompt(); go(slot); }});
  selectPrompt(`<b>げんちゃん◇</b>：ブロック前に味方と位置入替（任意）`, opts); }
/* ライフ減少による召喚/交換（ターンエンド時に1回・タップ選択方式） */
function placeChar(pid,slot,card){ const p=state.players[pid]; const idx=p.hand.indexOf(card); if(idx>=0) p.hand.splice(idx,1); card.blank=false; card.curEn=card.energy; p.field[slot]=card; if(pid==="self") state.seen[card.cardId]=(state.seen[card.cardId]||0)+1; }
function offerLifeSummon(pid,done){ const p=state.players[pid]; p.lostLifeThisTurn=false; state.inputOwner=pid; if(p.noSummonTurn===state.turn){ done(); return; }
  const handChars=p.hand.filter(c=>c.type==="character");
  const empties=[]; p.field.forEach((c,i)=>{ if(c===null) empties.push(i); });
  const fchars=[]; p.field.forEach((c,i)=>{ if(c&&!c.blank) fchars.push(i); });
  if(!handChars.length || (!empties.length && !fchars.length)){ done(); return; }
  const human=(state.mode!=="cpu")||pid==="self";
  if(!human){ const best=handChars.slice().sort((a,b)=>(b.cp||0)-(a.cp||0))[0];
    if(best){ let ex=-1,exCp=-1; p.field.forEach((c,i)=>{ if(c&&!c.blank&&(c.curEn||0)===0&&(c.cp||0)>exCp){ exCp=c.cp||0; ex=i; } });   // エネ0の主力
      if(ex>=0 && (best.cp||0)>=exCp-1){ toGrave(pid,ex,"交換"); placeChar(pid,ex,best); logLine(`${p.name}：交換でエネルギー切れの主力を補充 → ${best.name}`,true); }
      else if(empties.length){ placeChar(pid,empties[0],best); logLine(`${p.name}：ライフ時召喚 → ${best.name}`,true); }
      else if(ex>=0){ toGrave(pid,ex,"交換"); placeChar(pid,ex,best); logLine(`${p.name}：交換 → ${best.name}`,true); }
      render(); }
    done(); return; }
  const opts=[];
  if(empties.length) opts.push({label:"空きに召喚",fn:()=>lifeSummonEmpty(pid,empties,done)});
  if(fchars.length) opts.push({label:"交換",fn:()=>lifeExchange(pid,done)});
  opts.push({label:"何もしない",fn:()=>{ hidePrompt(); render(); done(); }});
  selectPrompt(`<b>${p.name}</b>：ライフ減少 — 召喚 / 交換（このターン1回）`, opts); }
function lifeSummonEmpty(pid,empties,done){ hidePrompt();
  state.pick={ banner:`出す手札のキャラを<b>タップ</b>`, hand:{pid, on:(card)=>{
    state.pick={ banner:`召喚する空きスロットを<b>タップ</b>`, field:{pid, slots:empties, on:(slot)=>{ state.pick=null; hidePrompt(); placeChar(pid,slot,card); logLine(`${state.players[pid].name}：ライフ時召喚 → ${card.name}`,true); render(); done(); }}, cancel:()=>{ state.pick=null; hidePrompt(); lifeSummonEmpty(pid,empties,done); } };
    showPickBanner(); render(); }}, cancel:()=>{ state.pick=null; hidePrompt(); render(); done(); } };
  showPickBanner(); render(); }
function lifeExchange(pid,done){ hidePrompt(); const p=state.players[pid]; const fchars=[]; p.field.forEach((c,i)=>{ if(c&&!c.blank) fchars.push(i); });
  state.pick={ banner:`墓地へ送る自分のキャラを<b>タップ</b>`, field:{pid, slots:fchars, on:(slot)=>{
    toGrave(pid,slot,"交換"); render();
    const handChars=p.hand.filter(c=>c.type==="character");
    if(!handChars.length){ state.pick=null; hidePrompt(); render(); done(); return; }
    state.pick={ banner:`召喚する手札のキャラを<b>タップ</b>`, hand:{pid, on:(card)=>{
      const empties=[]; p.field.forEach((c,ii)=>{ if(c===null) empties.push(ii); });
      const fin=(s)=>{ state.pick=null; hidePrompt(); placeChar(pid,s,card); logLine(`${p.name}：交換 → ${card.name}`,true); render(); done(); };
      if(empties.length<=1){ fin(empties.length?empties[0]:slot); }
      else { state.pick={ banner:`召喚する空きスロットを<b>タップ</b>`, field:{pid, slots:empties, on:fin}, cancel:()=>{ state.pick=null; hidePrompt(); render(); done(); } }; showPickBanner(); render(); }
    }}, cancel:()=>{ state.pick=null; hidePrompt(); render(); done(); } };
    showPickBanner(); render(); }}, cancel:()=>{ state.pick=null; hidePrompt(); render(); done(); } };
  showPickBanner(); render(); }

function onLifeGain(pid){ const p=state.players[pid]; if(!p.field.some((c,i)=>c&&!c.blank&&provides(pid,i,74))) return; let bi=-1,be=99; p.field.forEach((c,i)=>{ if(c&&!c.blank&&(c.curEn||0)<be){ be=c.curEn||0; bi=i; } }); if(bi>=0){ chEn(p.field[bi],1); logLine("てぃりー：ライフ回復で味方エネ+1",true); } }
function canGainLife(){ return !((state.players.self.life%2===1&&state.players.opp.life%2===1)&&(motifActive("self",62)||motifActive("opp",62))); }
function setLife(pid,d){const p=state.players[pid]; if(d>0&&!canGainLife()){ logLine("Gumi(モチーフ)：互いのライフが奇数のため増加不可",true); if(!checkWin()) render(); return; } p.life=Math.max(0,Math.min(CONFIG.LIFE_MAX,p.life+d)); if(d>0) onLifeGain(pid); if(!checkWin()) render();}
function checkWin(){for(const pid of ["self","opp"]) if(state.players[pid].life<=0){ gameOver(opp(pid),`${state.players[pid].name}のライフが0`); return true; } return false;}
function stalemate(){ if(state.over) return; const s=state.players.self.life,o=state.players.opp.life; let w=null; if(s>o)w="self"; else if(o>s)w="opp"; gameOver(w,`膠着ライフ判定（${state.players.self.name} ${s} / ${state.players.opp.name} ${o}）`);}
function gameOver(w,reason){state.over=true; const big=document.getElementById("mBig");
  if(w===null){big.textContent="引き分け"; big.className="big";} else {const you=w==="self"; big.textContent=(you?state.players.self.name:state.players.opp.name)+" の勝ち"; big.className="big "+(you?"win":"lose");}
  document.getElementById("mDetail").textContent=reason; logLine(`<span class="hi">■ 決着</span>：${reason}`,true); Snd.play(w==="self"?"win":"lose"); render(); document.getElementById("modal").classList.add("on"); }

/* ===== CPU ===== */
function maybeCpu(){ if(!state||state.mode!=="cpu"||state.over||state.active!=="opp"||state.pending) return; setTimeout(cpuTurn,700); }
// 相手(自分=self)デッキ予想：想定投入枚数（キャラ最大3, 招集/オフ会2, 他1〜2）
function assumedCopies(c){ if(!c) return 1; if(c.type==="character") return 3; if(c.name==="招集！"||c.name==="オフ会") return 2; if(c.type==="special") return 2; return 1; }
function predictThreat(){ // selfの公開状況から「まだ出うる強キャラ」を推定（高CP寄り）
  const known=state.seen||{}; let maxCp=0;
  CARD_POOL.forEach(c=>{ if(c.type!=="character") return; const left=assumedCopies(c)-(known[c.id]||0); if(left>0) maxCp=Math.max(maxCp,(c.cp||0)); });
  return maxCp; }
// 召喚：空きスロットへ最良配置（合計CPが8に近い＋高CP）。とれんさーで追加召喚も。
function cpuSummon(p){ if(p.noSummonTurn===state.turn) return; let guard=0;
  while(guard++<3){ if(p.playedChar) break; const empties=[]; p.field.forEach((x,i)=>{ if(x===null) empties.push(i); }); if(!empties.length) break;
    const cands=p.hand.filter(c=>c.type==="character"); if(!cands.length) break;
    let best=null;
    cands.forEach(c=>{ empties.forEach(slot=>{ p.field[slot]=c; const lc=linkedCP("opp",slot); p.field[slot]=null; const score=dist8(lc)*10-(c.cp||0)-(c.energy||0)*0.2; if(!best||score<best.score) best={c,slot,score}; }); });
    if(!best) break;
    const idx=p.hand.indexOf(best.c); const c=p.hand.splice(idx,1)[0]; c.curEn=c.energy; c.blank=false; p.field[best.slot]=c; p.playedChar=true; Snd.play("summon"); logLine(`${p.name}：${c.name}を召喚`); onSummon("opp",best.slot);
    const hasToren=p.field.some((x,ix)=>x&&!x.blank&&x.cardId===15&&ix!==best.slot);
    if(hasToren&&p.torenTurn!==state.turn){ p.torenTurn=state.turn; p.playedChar=false; } else break; }
  render(); }
// アタック判断：確実に勝てる/相手がライフで受けるしかない/被ブロック不可 の時のみ
function cpuChooseAttack(p){ let bestSlot=-1,bestVal=-1;
  p.field.forEach((c,i)=>{ if(!canAttack("opp",c)) return;
    const aCP=linkedCP("opp",i), da=dist8(aCP);
    const blockers=allowedBlockers("self","opp",i);
    const linkEn=[i-1,i+1].reduce((s,j)=>{const x=p.field[j]; return s+((x&&!x.blank&&x.cardId!==28)?(x.curEn||0):0);},0);
    const alwaysUnblock = (provides("opp",i,4)&&aCP===8) || provides("opp",i,28);   // いとCP8 / りんごあめ◇：常に被ブロック不可
    const canMakeUnblock = provides("opp",i,29) && linkEn>=3;                        // 真筝◇：3消費で被ブロック不可
    const masa=provides("opp",i,8)&&state.turn>3;
    let good=false,val=0;
    if(alwaysUnblock||canMakeUnblock){ good=true; val=100; }   // 確実に1点＆自キャラ破壊なし → 自CP不問
    else if(!blockers.length){ good=true; val=60; }
    else if(provides("opp",i,27)){                              // くり◇：最強ブロッカー1体を不能化
      const dds=blockers.map(b=>dist8(linkedCP("self",b)));
      const sIdx=dds.indexOf(Math.min(...dds)); const rest=dds.filter((_,k)=>k!==sIdx);
      if(rest.length===0 || rest.every(d=>d>da)){ good=true; val=58; }   // 脅威1体を消せば確実に有利 → 自CP不問
      else { const minDD=Math.min(...rest); if(minDD>da){ good=true; val=30-da; } } }
    else { const dds=blockers.map(b=>dist8(linkedCP("self",b))); const minDD=Math.min(...dds); const beatable=dds.some(d=>d>da);
      if(masa&&beatable){ good=true; val=45; }
      else if(minDD>da){ good=true; val=30-da; } }
    if(good&&val>bestVal){ bestVal=val; bestSlot=i; } });
  return bestSlot; }
function cpuFindSpecial(p,cid){ return p.hand.find(c=>c.type==="special"&&c.cardId===cid&&SPECIAL_IMPL.has(cid)); }
function cpuPlaySpecials(p){
  // オフ会：ライフ1〜4で安全圏へ（過剰回復は避ける）
  if(p.life>0&&p.life<=4){ const c=cpuFindSpecial(p,94); if(c){ playSpecial("opp",c); return true; } }
  // 招集：使用可能なら
  { const c=cpuFindSpecial(p,97); if(c&&p.shukaTurn!==state.turn&&p.deck.length){ playSpecial("opp",c); return true; } }
  // 遅刻：相手のエネ持ちキャラが2体以上で妨害
  { const foe=state.players.self; const n=foe.field.filter(x=>x&&!x.blank&&(x.curEn||0)>0).length; const c=cpuFindSpecial(p,93); if(c&&n>=2){ playSpecial("opp",c); return true; } }
  // おつ！：相手の強キャラ（合計CPが8に近い）を無力化
  { const foe=state.players.self; const strong=foe.field.some((x,i)=>x&&!x.blank&&dist8(linkedCP("self",i))<=1); const c=cpuFindSpecial(p,89); if(c&&strong){ playSpecial("opp",c); return true; } }
  // ツッコミ：正面が空/ブランクで確実に1点取れる時
  { const c=cpuFindSpecial(p,92); if(c&&state.tsukkomiTurn!==state.turn){ const free=p.field.some((x,i)=>{ if(!canAttack("opp",x)) return false; const t=state.players.self.field[faceSlot(i)]; return !t||t.blank; }); if(free){ playSpecial("opp",c); return true; } } }
  return false; }
function cpuTurn(){ if(state.over||state.active!=="opp"||state.pending) return; const p=state.players.opp;
  let g=0; while(g++<4 && cpuPlaySpecials(p)){}
  cpuSummon(p);
  setTimeout(()=>{ if(state.over||state.active!=="opp"||state.pending) return;
    let g2=0; while(g2++<3 && cpuPlaySpecials(p)){}
    const ai=cpuChooseAttack(p);
    if(ai>=0){ attackFrom("opp",ai); }
    else setTimeout(()=>{ if(!state.over&&state.active==="opp"&&!state.pending) endTurn(); },300); },600); }
function simAtkCP(apid,aslot){ return battleCP(apid,aslot,(pp,j,c)=>{ let x=0; if(j===aslot && provides(apid,aslot,20)) x-=2; return x; }); }
function simBlockCP(dpid,bslot){ const asada=provides(dpid,bslot,10); return battleCP(dpid,bslot,(pp,j,c)=>{ let x=0; if(asada) x+=1; if(provides(dpid,j,13)) x-=1; if(j===bslot && provides(dpid,bslot,20)) x-=2; return x; }); }
function cpuDefense(){const pd=state.pending, dP=state.players[pd.defender]; const da=dist8(simAtkCP(pd.attacker,pd.atkSlot));
  const bs = (pd.noBlock&&!penIgnoreBlock())?[]:allowedBlockers(pd.defender,pd.attacker,pd.atkSlot); let best=-1,bd=99;
  bs.forEach(i=>{ const d=dist8(simBlockCP(pd.defender,i)); if(d<bd){bd=d;best=i;} });
  const mustSurvive = dP.life<=1 && bs.length>0;              // 受けると負ける→必ずブロック
  const lifeLow = dP.life<=3 && bs.length>0;                  // 低ライフ：ライフ温存を優先
  // 最も価値の低い（合計CPが8から遠い）ブロッカー＝捨て駒候補
  let sac=-1, sacD=-1; bs.forEach(i=>{ const d=dist8(simBlockCP(pd.defender,i)); if(d>sacD){ sacD=d; sac=i; } });
  let choose=-1;
  if(best>=0){
    if(bd<=da) choose=best;                 // 効果後CPで勝ち/相打ち
    else if(mustSurvive) choose=best;        // 負け回避
    else if(pd.mustBlock) choose=best;       // 強制ブロック
    else if(lifeLow) choose=(sac>=0?sac:best); // 低ライフ：弱いキャラを捨ててでもライフを守る（盤面も空く）
  }
  setTimeout(()=>{ if(choose>=0) resolveBlock(choose); else resolveTake(); if(state.mode==="cpu"&&state.active==="opp"&&!state.over) setTimeout(()=>{ if(!state.over&&state.active==="opp"&&!state.pending) endTurn(); },500); },700); }

/* ===== カード描画/詳細 ===== */
function chipsHTML(colors){return colors.map(k=>`<span class="cchipS" style="background:${KEY2VAL[k]}"></span>`).join("");}
function cardFaceHTML(c){ if(cardImg(c)) return "";
  const cp=(c.varcp?"X":(c.cp==null?"":c.cp)), en=(c.energy?"★".repeat(Math.min(c.energy,6)):"");
  return `${c.shape?`<div class="cardshape">${c.shape}</div>`:""}<div class="cardframe"><div class="cardtop"><div class="cardcp num">${cp}</div><div class="carden">${en}</div></div><div class="cardnm">${c.name}</div><div class="cardfoot">${chipsHTML(c.colors||[])}</div></div>`; }
let DETAIL_CTX={};
function openDetail(card, ctx){ DETAIL_CTX={uid:card.id,zone:ctx.zone,pid:ctx.pid,slot:ctx.slot}; const big=document.getElementById("bigcard");
  const _im=cardImg(card); big.style.backgroundImage=_im?`url("${_im}")`:""; big.className="bigcard"+(_im?"":" face"); big.innerHTML=cardFaceHTML(card);
  document.getElementById("dName").textContent=card.name+(card.type&&card.type!=="character"?`（${TYPEJP[card.type]||card.type}）`:"");
  document.getElementById("dCP").textContent=(card.varcp?"X（ダイス）":(card.cp==null?"—":card.cp));
  document.getElementById("dEn").textContent=(card.energy?("★".repeat(card.energy)+`  (${card.energy})`):"—");
  document.getElementById("dColors").innerHTML=(card.colors&&card.colors.length)?card.colors.map(k=>`<span class="cchip" style="background:${KEY2VAL[k]}"></span>`).join("")+" "+card.colors.join(" / "):"—";
  document.getElementById("dTiming").textContent=(card.timings&&card.timings.length)?card.timings.map(t=>"【"+t+"】").join(""):"—";
  const linkRow=document.getElementById("dLinkRow");
  if(ctx.zone==="field"){ linkRow.style.display="flex"; document.getElementById("dLink").textContent=linkedCP(ctx.pid,ctx.slot); } else linkRow.style.display="none";
  document.getElementById("dEff").textContent="効果："+(card.effect?card.effect:"（未実装）");
  const acts=document.getElementById("dActs"); acts.innerHTML=""; const ctrl=humanControls();
  if(ctx.zone==="hand"&&card.type==="motif"&&MOTIF_ANYTIME.has(card.cardId)){
    const _hc=state.players[ctx.pid].field.some(c=>c&&!c.blank&&c.name===card.name);
    const _loc=(state.mode==="cpu")?(ctx.pid==="self"):(NET.active?(ctx.pid===NET.seat):true);
    if(_hc&&_loc) acts.appendChild(dact("発動（モチーフ・いつでも）","",()=>activateMotif(ctx.pid,card)));
    const n2=document.createElement("div"); n2.style.cssText="flex:1 1 100%;font-size:11px;color:var(--mut);text-align:center"; n2.textContent=_hc?"※ いつでも発動可（相手ターン中・アタック後も可）":"※ 対応キャラが場にいる時のみ発動可"; acts.appendChild(n2);
  } else if(ctx.zone==="hand"&&ctrl===ctx.pid&&card.type==="character"&&state.phase===1&&state.players[ctx.pid].field.includes(null)){
    if(!state.players[ctx.pid].playedChar) acts.appendChild(dact("召喚","play",()=>beginPlacing(card.id,false)));
    acts.appendChild(dact("予告召喚（裏）","blank",()=>beginPlacing(card.id,true)));
  } else if(ctx.zone==="hand"&&ctrl===ctx.pid&&card.type==="motif"){
    const hasChar=state.players[ctx.pid].field.some(c=>c&&!c.blank&&c.name===card.name);
    if(state.phase===1&&hasChar) acts.appendChild(dact("発動（モチーフ）","",()=>activateMotif(ctx.pid,card)));
    const note=document.createElement("div"); note.style.cssText="flex:1 1 100%;font-size:11px;color:var(--mut);text-align:center"; note.textContent=hasChar?"※ モチーフ発動（即時／継続効果）":"※ 対応キャラ（同名）が場にいる時のみ発動可能"; acts.appendChild(note);
  } else if(ctx.zone==="hand"&&ctrl===ctx.pid&&card.type==="special"){
    const impl=SPECIAL_IMPL.has(card.cardId);
    if(state.phase===1&&impl) acts.appendChild(dact("発動（特殊）","",()=>playSpecial(ctx.pid,card)));
    const note=document.createElement("div"); note.style.cssText="flex:1 1 100%;font-size:11px;color:var(--mut);text-align:center"; note.textContent=impl?"※ 特殊カード：発動で効果適用→墓地":"※ この特殊カードの効果は未実装です"; acts.appendChild(note);
  } else if(ctx.zone==="hand"&&ctrl===ctx.pid&&card.type!=="character"){
    const note=document.createElement("div"); note.style.cssText="flex:1 1 100%;font-size:11px;color:var(--mut);text-align:center"; note.textContent="※ この種別（"+(TYPEJP[card.type]||card.type)+"）の効果は未実装です"; acts.appendChild(note);
  }
  if(ctx.zone==="field"&&ctrl===ctx.pid&&canAttack(ctx.pid,card)) acts.appendChild(dact("アタックする","attack",()=>attackFrom(ctx.pid,ctx.slot)));
  if(ctx.zone==="field"&&ctrl===ctx.pid&&provides(ctx.pid,ctx.slot,7)&&state.phase===1&&state.players[ctx.pid].swapTurn!==state.turn) acts.appendChild(dact("位置入替","",()=>startSwap(ctx.pid,ctx.slot)));
  if(ctx.zone==="field"&&ctrl===ctx.pid&&motifActive(ctx.pid,78)&&state.phase===1&&(card.curEn||0)===(card.energy||0)&&state.players[ctx.pid].keiUsedTurn!==state.turn) acts.appendChild(dact("手札に戻す（けい）","",()=>keiReturn(ctx.pid,ctx.slot)));
  if(ctx.zone==="field"&&ctrl===ctx.pid) acts.appendChild(dact("墓地へ送る","",()=>{ toGrave(ctx.pid,ctx.slot,"手動"); closeOverlay(); render(); }));
  acts.appendChild(dact("閉じる","close",closeOverlay));
  document.getElementById("overlay").classList.add("on"); }
function openBlankDetail(card,pid){const big=document.getElementById("bigcard");
  big.style.backgroundImage=""; big.className="bigcard back"; big.innerHTML="";
  document.getElementById("dName").textContent="ブランクカード（予告召喚）";
  document.getElementById("dCP").textContent="—";
  document.getElementById("dEn").textContent=`⚡ ${card.blankEn||0}`;
  document.getElementById("dColors").textContent="裏向き";
  document.getElementById("dTiming").textContent="—";
  document.getElementById("dLinkRow").style.display="none";
  document.getElementById("dEff").textContent=`エネルギーが「自分のライフ以上」で表向きに召喚（現在 ⚡${card.blankEn||0} / ライフ ${state.players[pid].life}）。アタック・ブロック・リンク不可。`;
  const acts=document.getElementById("dActs"); acts.innerHTML=""; const ctrl=humanControls();
  if(ctrl===pid){ const slot=state.players[pid].field.indexOf(card); acts.appendChild(dact("墓地へ送る","",()=>{ toGrave(pid,slot,"手動"); closeOverlay(); render(); })); }
  acts.appendChild(dact("閉じる","close",closeOverlay));
  document.getElementById("overlay").classList.add("on"); }
function dact(l,cls,fn){const b=document.createElement("button");b.className="act "+cls;b.textContent=l;b.onclick=(e)=>{Snd.play("click"); if(NET.active&&!NET.isHost){ netSendIn({kind:"detailAct",uid:DETAIL_CTX.uid,zone:DETAIL_CTX.zone,pid:DETAIL_CTX.pid,slot:DETAIL_CTX.slot,label:l}); closeOverlay(); return; } fn(e);};return b;}
const closeOverlay=()=>document.getElementById("overlay").classList.remove("on");

/* ===== 墓地ビューア（除外も表示） ===== */
function openGrave(pid){const p=state.players[pid];
  document.getElementById("gvTitle").textContent=p.name+" の墓地";
  const kinds=new Set(p.grave.map(c=>c.cardId)).size;
  document.getElementById("gvMeta").textContent=`種類 ${kinds}/${CONFIG.GRAVE_KINDS}・合計 ${p.grave.length}`+(p.exclude.length?`・除外 ${p.exclude.length}`:"");
  const body=document.getElementById("gvBody"); body.innerHTML="";
  const groups=groupByCard(p.grave);
  if(!groups.length) body.innerHTML='<div class="gvempty">墓地は空です</div>';
  groups.forEach(g=>body.appendChild(graveCardEl(g.card,g.count)));
  if(p.exclude.length){ const sub=document.createElement("div"); sub.className="gvsub"; sub.textContent="除外エリア"; body.appendChild(sub); groupByCard(p.exclude).forEach(g=>body.appendChild(graveCardEl(g.card,g.count))); }
  document.getElementById("graveOv").classList.add("on"); }
function groupByCard(list){const m=new Map(); list.forEach(c=>{ if(!m.has(c.cardId)) m.set(c.cardId,{card:c,count:0}); m.get(c.cardId).count++; }); return [...m.values()];}
function graveCardEl(card,count){const w=document.createElement("div"); w.className="gvcard";
  const el=document.createElement("div"); el.className="card face"; const _im=cardImg(card); if(_im){el.style.backgroundImage=`url("${_im}")`; el.classList.remove("face");} else el.innerHTML=cardFaceHTML(card);
  el.onclick=()=>openDetail(card,{zone:"grave"}); w.appendChild(el);
  if(count>1){const b=document.createElement("div"); b.className="badge"; b.textContent="×"+count; w.appendChild(b);} return w;}
const closeGrave=()=>document.getElementById("graveOv").classList.remove("on");

/* ===== 盤面 ===== */
function boltStr(n){ n=Math.max(0,n|0); return n===0?'<span class="e0">－</span>':'⚡'.repeat(Math.min(n,12)); }
function cardNode(card,{faceDown=false,zone="hand",pid=null,slot=null}={}){
  if(faceDown){const b=document.createElement("div"); b.className="card back"; if(USE_IMG){b.classList.add("imgback"); b.style.backgroundImage=`url("${BACK_IMG}")`;} return b;}
  if(zone==="field"&&card.blank){ // ブランク（裏向き）
    const b=document.createElement("div"); b.className="card back blank"; if(USE_IMG){b.classList.add("imgback"); b.style.backgroundImage=`url("${BACK_IMG}")`;}
    const t=document.createElement("div"); t.className="btag"; t.textContent="予告"; b.appendChild(t);
    const e=document.createElement("div"); e.className="ben num"; e.textContent="⚡"+(card.blankEn||0); b.appendChild(e);
    b.onclick=()=>openBlankDetail(card,pid); return b; }
  const el=document.createElement("div"); el.className="card face";
  const _im=cardImg(card); if(_im){el.style.backgroundImage=`url("${_im}")`; el.classList.remove("face");} else el.innerHTML=cardFaceHTML(card);
  if(zone==="hand"&&state.placing&&state.placing.id===card.id) el.classList.add("selected");
  if(zone==="field"&&pid!==null){ el.dataset.p=pid; el.dataset.s=slot; const b=document.createElement("div"); b.className="linkcp num"; b.innerHTML=`Σ${linkedCP(pid,slot)}<span class="encp">${boltStr(card.curEn||0)}</span>`; el.appendChild(b);
    if(card.curEn<=0){const s=document.createElement("div"); s.className="spent"; s.textContent="⚡0"; el.appendChild(s);}
    if(state.pending&&state.pending.attacker===pid&&state.pending.atkSlot===slot){ el.classList.add("tapped"); b.classList.add("atkcp"); }
    else if(canAttack(pid,card)&&humanControls()===pid&&!state.pending&&!state.pick) el.classList.add("canact");}
  const _pk=activePick();
  if(_pk){
    if(zone==="field"&&_pk.anyField&&pid!==null){ el.classList.add("pickable"); el.onclick=()=>_pk.anyField.on(pid,slot); return el; }
    if(zone==="field"&&_pk.field&&_pk.field.pid===pid&&_pk.field.slots.includes(slot)){ el.classList.add("pickable"); el.onclick=()=>_pk.field.on(slot); return el; }
    if(zone==="hand"&&_pk.hand&&_pk.hand.pid===pid&&card.type==="character"){ el.classList.add("pickable"); el.onclick=()=>_pk.hand.on(card); return el; }
  }
  el.onclick=()=>openDetail(card,{zone,pid,slot}); return el;}
function renderHand(id,pid,revealed){const c=document.getElementById(id); c.innerHTML="";
  state.players[pid].hand.forEach(card=>{ if(card.picking) return; c.appendChild(cardNode(card,{faceDown:!revealed, zone:"hand", pid})); });}
function renderSlots(id,pid){const c=document.getElementById(id); c.innerHTML=""; const p=state.players[pid], ctrl=humanControls();
  const foe=state.players[opp(pid)]; const _col=(foe&&foe.motif)?COLOR_BY_NAME[foe.motif.name]:null; if(_col){ c.classList.add("tinted"); c.style.setProperty("--tint",_col); } else { c.classList.remove("tinted"); c.style.removeProperty("--tint"); }
  for(let i=0;i<CONFIG.SLOTS;i++){const card=p.field[i]; const slot=document.createElement("div"); slot.className="slot";
    const no=document.createElement("div"); no.className="slotno"; no.textContent=(i+1); slot.appendChild(no);
    if(card){ slot.appendChild(cardNode(card,{zone:"field",pid,slot:i})); }
    else if(activePick()&&activePick().field&&activePick().field.pid===pid&&activePick().field.slots.includes(i)){ const _p=activePick(); slot.classList.add("drop","pickable"); slot.onclick=()=>_p.field.on(i); }
    else if(NET.active&&!NET.isHost&&state.placing&&state.active===NET.seat&&pid===NET.seat){ slot.classList.add("drop"); slot.onclick=()=>netSendIn({kind:"place",slot:i}); }
    else if(ctrl===pid&&state.phase===1&&state.placing&&(state.placing.blank||!p.playedChar)){ slot.classList.add("drop"); slot.onclick=()=>placeCard(pid,i); }
    c.appendChild(slot);}}
function mfMini(label,cardObj){ const d=document.createElement("div"); d.className="mfslot"+(cardObj?" filled":"");
  if(cardObj){ const im=cardImg(cardObj); if(im){ d.style.backgroundImage=`url("${im}")`; } else { d.classList.add("face"); d.innerHTML=cardFaceHTML(cardObj); } const col=COLOR_BY_NAME[cardObj.name]; if(col){ d.style.borderColor=col; d.style.boxShadow=`0 0 8px -1px ${col}`; } d.title=label+"："+cardObj.name; d.onclick=()=>openDetail(cardObj,{zone:"mf"}); }
  else { d.textContent=label; }
  return d; }
function renderZones(pid,leftId,rightId){const p=state.players[pid];
  const deck=pileEl("deck","山札",p.deck.length,p.deck.length===0,null);
  deck.appendChild(minidieEl(state.dice?state.dice[pid]:null));
  const grave=pileEl("grave","墓地",p.grave.length,false,()=>openGrave(pid));
  const mz=document.createElement("div"); mz.className="mfzone"; mz.appendChild(mfMini("M",p.motif&&p.motif.card)); mz.appendChild(mfMini("FL",p.friendlink&&p.friendlink.card));
  const L=document.getElementById(leftId),R=document.getElementById(rightId); L.innerHTML="";R.innerHTML="";
  if(pid==="self"){ L.appendChild(grave); R.appendChild(deck); R.appendChild(mz); } else { L.appendChild(deck); L.appendChild(mz); R.appendChild(grave); }}
function pileEl(kind,label,count,deckout,onclick){const wrap=document.createElement("div"); wrap.style.cssText="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px";
  const p=document.createElement("div"); p.className="pile "+kind+(deckout?" deckout":""); p.innerHTML=`<span class="cnt num">${count}</span>`; if(onclick) p.onclick=onclick;
  const l=document.createElement("div"); l.className="pilelab"; l.textContent=label; wrap.appendChild(p); wrap.appendChild(l); return wrap;}
function renderStrip(domSide,pid){const p=state.players[pid], pre=domSide==="self"?"self":"opp";
  const _nm=document.getElementById(pre+"Name"); _nm.textContent=p.name+((p.tobo>0)?` 🚶×${p.tobo}`:"")+((NET.active&&NET.viewHand===pid)?" 👁":""); _nm.style.cursor=NET.active?"pointer":""; _nm.onclick=NET.active?()=>{ NET.viewHand=(NET.viewHand===pid?null:pid); render(); }:null;
  const box=document.getElementById(pre+"Life"); box.querySelector(".val").textContent=p.life; box.classList.toggle("low",p.life<=2&&p.life>0);
  const pips=box.querySelector(".pips"); pips.innerHTML=""; for(let i=0;i<CONFIG.LIFE_MAX;i++){const d=document.createElement("div");d.className="pip"+(i<p.life?" on":"");pips.appendChild(d);}
  document.getElementById(pre+"Flag").classList.toggle("on",p.forced);
  const strip=document.getElementById(pre==="self"?"stripSelf":"stripOpp");
  strip.querySelector(".hcount").textContent=p.hand.length; strip.querySelector(".dcount").textContent=p.deck.length; strip.querySelector(".gcount").textContent=p.grave.length;}
function BOT(){ return (NET.active && NET.seat==="opp") ? "opp" : "self"; }
function TOP(){ return BOT()==="self" ? "opp" : "self"; }
function render(){ if(!state) return; maintainMotifs();
  const bot=BOT(), top=TOP(); const aBot=state.active===bot;
  document.getElementById("stripSelf").classList.toggle("active",aBot); document.getElementById("stripOpp").classList.toggle("active",!aBot);
  let revBot,revTop;
  if(state.mode==="cpu"){ revBot=true; revTop=false; }
  else if(NET.active && !NET.isHost){ if(NET.seat==="spec"){ revBot=(NET.viewHand===bot); revTop=(NET.viewHand===top); } else { revBot=true; revTop=(NET.viewHand===top); } }
  else { revBot=state.active===bot; revTop=state.active===top; if(NET.viewHand){ revBot=revBot||NET.viewHand===bot; revTop=revTop||NET.viewHand===top; } }
  renderHand("selfHand",bot,revBot); renderHand("oppHand",top,revTop);
  renderSlots("selfSlots",bot); renderSlots("oppSlots",top);
  renderZones(bot,"selfZoneL","selfZoneR"); renderZones(top,"oppZoneL","oppZoneR");
  renderStrip("self",bot); renderStrip("opp",top);
  document.getElementById("turnNo").textContent=state.turn;
  document.getElementById("phChip").textContent=state.phase===2?"アタック":"メイン";
  document.getElementById("actorName").textContent=state.players[state.active].name;
  const cpuActing=state.mode==="cpu"&&state.active==="opp";
  document.getElementById("endBtn").disabled=state.over||!!state.pending||cpuActing||(NET.active&&(NET.seat==="spec"||state.active!==NET.seat))||(mustAttack(state.active)&&!(state.mode==="cpu"&&state.active==="opp"));
  { const _la=(state.mode==="cpu")?(state.active==="self"):(NET.active?(state.active===NET.seat):true); const _fe=document.getElementById("fireEdge"); if(_fe) _fe.classList.toggle("on", !!(_la&&mustAttack(state.active))); }
  applyMats(); if(NET.active&&!NET.isHost) clientRenderPrompt(); if(NET.active && NET.isHost) netBroadcastState(); }

/* ===== util ===== */
const $=id=>document.getElementById(id);
const Snd=(function(){ let ctx=null,master=null,bgmGain=null,sfxGain=null,bgmOn=true,sfxOn=true,timer=null,playing=false,step=0,nextTime=0;
  try{ bgmOn=localStorage.getItem("kk_bgm")!=="0"; sfxOn=localStorage.getItem("kk_sfx")!=="0"; }catch(e){}
  function ensure(){ if(ctx) return; try{ ctx=new (window.AudioContext||window.webkitAudioContext)(); master=ctx.createGain(); master.gain.value=0.85; master.connect(ctx.destination); bgmGain=ctx.createGain(); bgmGain.gain.value=0.22; bgmGain.connect(master); sfxGain=ctx.createGain(); sfxGain.gain.value=0.5; sfxGain.connect(master); }catch(e){ ctx=null; } }
  function resume(){ ensure(); if(ctx&&ctx.state==="suspended") ctx.resume(); }
  function blip(freq,dur,type,gain,to){ if(!sfxOn) return; ensure(); if(!ctx) return; const t=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain(); o.type=type||"square"; o.frequency.setValueAtTime(freq,t); if(to) o.frequency.exponentialRampToValueAtTime(to,t+dur); g.gain.setValueAtTime(gain||0.3,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur); o.connect(g); g.connect(sfxGain); o.start(t); o.stop(t+dur+0.02); }
  function noise(dur,gain,ff){ if(!sfxOn) return; ensure(); if(!ctx) return; const t=ctx.currentTime,b=ctx.createBuffer(1,Math.max(1,ctx.sampleRate*dur),ctx.sampleRate),d=b.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1; const s=ctx.createBufferSource(); s.buffer=b; const g=ctx.createGain(); g.gain.setValueAtTime(gain||0.3,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur); const f=ctx.createBiquadFilter(); f.type="bandpass"; f.frequency.value=ff||1200; s.connect(f); f.connect(g); g.connect(sfxGain); s.start(t); s.stop(t+dur+0.03); }
  const SFX={ click:()=>blip(520,0.05,"square",0.16,420), summon:()=>blip(300,0.1,"sawtooth",0.22,560), attack:()=>{blip(760,0.16,"sawtooth",0.3,150); noise(0.1,0.15,2500);}, block:()=>noise(0.14,0.32,900), destroy:()=>{noise(0.24,0.38,320); blip(110,0.24,"square",0.28,50);}, life:()=>blip(250,0.2,"sine",0.28,150), dice:()=>{noise(0.32,0.28,2200);}, effect:()=>blip(900,0.14,"sine",0.2,1500), win:()=>{[523,659,784,1046,1318].forEach((f,i)=>setTimeout(()=>blip(f,0.2,"square",0.26),i*110));}, lose:()=>{[392,330,262,196].forEach((f,i)=>setTimeout(()=>blip(f,0.26,"sawtooth",0.26),i*150));} };
  function play(n){ const f=SFX[n]; if(f){ try{f();}catch(e){} } }
  const midi=n=>440*Math.pow(2,(n-69)/12);
  function kick(t){ const o=ctx.createOscillator(),g=ctx.createGain(); o.frequency.setValueAtTime(150,t); o.frequency.exponentialRampToValueAtTime(45,t+0.12); g.gain.setValueAtTime(1.0,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.15); o.connect(g); g.connect(bgmGain); o.start(t); o.stop(t+0.17); }
  function snare(t){ const b=ctx.createBuffer(1,ctx.sampleRate*0.13,ctx.sampleRate),d=b.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1; const s=ctx.createBufferSource();s.buffer=b; const g=ctx.createGain(); g.gain.setValueAtTime(0.55,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.13); const f=ctx.createBiquadFilter(); f.type="highpass"; f.frequency.value=1400; s.connect(f);f.connect(g);g.connect(bgmGain); s.start(t); s.stop(t+0.14); }
  function hat(t,g0){ const b=ctx.createBuffer(1,ctx.sampleRate*0.03,ctx.sampleRate),d=b.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1; const s=ctx.createBufferSource();s.buffer=b; const g=ctx.createGain(); g.gain.setValueAtTime(g0||0.14,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.03); const f=ctx.createBiquadFilter(); f.type="highpass"; f.frequency.value=7000; s.connect(f);f.connect(g);g.connect(bgmGain); s.start(t); s.stop(t+0.04); }
  function tone(t,freq,dur,type,gain){ const o=ctx.createOscillator(),g=ctx.createGain(); o.type=type; o.frequency.value=freq; g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(gain,t+0.01); g.gain.exponentialRampToValueAtTime(0.001,t+dur); o.connect(g); g.connect(bgmGain); o.start(t); o.stop(t+dur+0.02); }
  // 熱き決闘・明るめ：Cメジャー I–V–vi–IV（C–G–Am–F）
  const bass=[48,55,48,55, 43,50,43,50, 45,52,45,52, 41,48,41,48];   // 弾むベース
  const lead=[76,72,79,76, 74,71,71,67, 72,76,76,72, 69,72,72,69];   // 明るいリード
  const pad =[52,52,52,52, 47,47,47,47, 48,48,48,48, 45,45,45,45];   // コードの3rd（彩り）
  const BPM=150, spb=60/BPM, stepDur=spb/2;
  function schedule(){ if(!ctx||!playing) return; while(nextTime < ctx.currentTime+0.18){ const s=step%16,t=nextTime;
      if(s%4===0) kick(t); if(s===4||s===12) snare(t); hat(t, s%2?0.16:0.09);
      tone(t,midi(bass[s]),stepDur*0.9,"triangle",0.15);
      if(s%2===0) tone(t,midi(lead[s]),stepDur*1.7,"square",0.12);
      if(s%4===0) tone(t,midi(pad[s]+12),stepDur*4,"sine",0.05);
      if(s===0) tone(t,midi(bass[0]),stepDur*8,"triangle",0.06);
      nextTime+=stepDur; step++; }
  }
  function startBGM(){ if(!bgmOn) return; ensure(); resume(); if(!ctx||playing) return; playing=true; step=0; nextTime=ctx.currentTime+0.06; timer=setInterval(schedule,40); }
  function stopBGM(){ playing=false; if(timer){ clearInterval(timer); timer=null; } }
  function setBgm(v){ bgmOn=v; try{localStorage.setItem("kk_bgm",v?"1":"0");}catch(e){} if(v) startBGM(); else stopBGM(); }
  function setSfx(v){ sfxOn=v; try{localStorage.setItem("kk_sfx",v?"1":"0");}catch(e){} }
  return { play, startBGM, stopBGM, setBgm, setSfx, resume, isBgm:()=>bgmOn, isSfx:()=>sfxOn };
})();
document.addEventListener("pointerdown",()=>{ Snd.resume(); });
const UrlAudio=(function(){ let ytReady=false,yt=null,pending=null,aud=null,tmr=null;
  function ytId(u){ const m=(u||"").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|[?&]v=)([\w-]{11})/); return m?m[1]:null; }
  function mkPlayer(){ if(yt) return; try{ yt=new YT.Player("ytplayer",{height:"1",width:"1",playerVars:{playsinline:1,controls:0},events:{onReady:()=>{ ytReady=true; if(pending){ const p=pending; pending=null; playYT(p); } }}}); }catch(e){} }
  function initYT(){ if(window.YT&&window.YT.Player){ mkPlayer(); return; } if(!document.getElementById("ytapi")){ const s=document.createElement("script"); s.id="ytapi"; s.src="https://www.youtube.com/iframe_api"; document.head.appendChild(s); } const prev=window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady=()=>{ if(prev) try{prev();}catch(e){} mkPlayer(); }; }
  function stop(){ if(tmr){clearTimeout(tmr);tmr=null;} try{ if(yt&&yt.stopVideo) yt.stopVideo(); }catch(e){} if(aud){ try{aud.pause();}catch(e){} } }
  function playYT(id){ if(!ytReady||!yt){ pending=id; initYT(); return; } stop(); try{ yt.loadVideoById(id,0); yt.playVideo(); }catch(e){} tmr=setTimeout(stop,30000); }
  function play(url){ if(!url) return; stop(); const id=ytId(url); if(id){ playYT(id); return; } if(!aud) aud=new Audio(); try{ aud.src=url; aud.currentTime=0; aud.play().catch(()=>{}); tmr=setTimeout(stop,30000);}catch(e){} }
  return { play, stop }; })();
let SND_URLS={self:["",""],opp:["",""]};
try{ const j=JSON.parse(localStorage.getItem("kk_urls")||"null"); if(j&&j.self&&j.opp) SND_URLS=j; }catch(e){}
let MY_MAT="", MY_MAT_ADJ={s:1,x:0,y:0}; try{ MY_MAT=localStorage.getItem("kk_area")||""; MY_MAT_ADJ=JSON.parse(localStorage.getItem("kk_area_adj")||"null")||{s:1,x:0,y:0}; }catch(e){}
function matAdjStr(a){ a=a||{s:1,x:0,y:0}; return `translate(${a.x||0}%,${a.y||0}%) scale(${a.s||1})`; }
function setMatEl(el,m){ if(!el) return; let im=el.querySelector("img.matimg"); const img=m&&m.img; if(!img){ if(im) im.remove(); return; } if(!im){ im=document.createElement("img"); im.className="matimg"; el.appendChild(im); } if(im.getAttribute("src")!==img) im.src=img; im.style.transform=matAdjStr(m.adj); }
function applyMats(){ let bot=null, top=null; const mine={img:MY_MAT,adj:MY_MAT_ADJ};
  if(!NET.active){ bot=mine; top=null; }
  else { const b=BOT(), t=TOP(), sm=NET.seatMats||{}; bot=(NET.seat===b)?mine:(sm[b]||null); top=(NET.seat===t)?mine:(sm[t]||null); if(NET.seat==="spec"){ bot=sm[b]||null; top=sm[t]||null; } }
  const sEl=document.getElementById("selfMat"), oEl=document.getElementById("oppMat"); setMatEl(sEl,bot); setMatEl(oEl,top); fitMatBox(sEl); fitMatBox(oEl); }
function fitMatBox(el){ if(!el) return; const row=el.parentElement; if(!row) return; const W=row.clientWidth-4, Hh=row.clientHeight-4; if(W<=0||Hh<=0){ el.style.width=""; el.style.height=""; return; } const bw=W, bh=W*7/12; el.style.width=bw+"px"; el.style.height=bh+"px"; }
function matAreaRatio(){ return 12/7; }   // 固定比率 12:7
function ratioLabel(r){ for(const [a,b] of [[16,9],[3,2],[5,2],[2,1],[5,3],[4,3],[3,1],[7,3],[9,4],[12,5],[8,3]]){ if(Math.abs(r-a/b)<0.06) return a+":"+b; } return (Math.round(r*10)/10)+":1"; }
function saveAdj(){ try{ localStorage.setItem("kk_area_adj",JSON.stringify(MY_MAT_ADJ)); }catch(e){} }
function updateMatUI(){ const r=matAreaRatio(); const lab=document.getElementById("matLabelText"); if(lab) lab.textContent="プレイマット画像を選択（推奨比率 12:7）";
  const ed=document.getElementById("matEdit"); if(ed) ed.style.aspectRatio=String(r);
  const wrap=document.getElementById("matEditWrap"), im=document.getElementById("matEditImg"), z=document.getElementById("matZoom");
  if(MY_MAT){ if(wrap) wrap.style.display="block"; if(im){ im.src=MY_MAT; im.style.transform=matAdjStr(MY_MAT_ADJ); } if(z) z.value=MY_MAT_ADJ.s||1; } else { if(wrap) wrap.style.display="none"; } }
function hostBroadcastMats(){ if(!NET.isHost) return; const aPeer=Object.keys(NET.roles).find(k=>NET.roles[k]==="A"), bPeer=Object.keys(NET.roles).find(k=>NET.roles[k]==="B"); const matOf=(pe)=> pe==="host"?{img:MY_MAT,adj:MY_MAT_ADJ}:((NET.mats&&NET.mats[pe])||{img:"",adj:null}); NET.seatMats={self:aPeer?matOf(aPeer):{img:"",adj:null}, opp:bPeer?matOf(bPeer):{img:"",adj:null}}; applyMats(); NET.conns.forEach(c=>{ if(c.open) try{ c.send({t:"mats",mats:NET.seatMats}); }catch(e){} }); }
function readImg(input,cb){ const f=input.files&&input.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>cb(r.result); r.readAsDataURL(f); }
function renderSoundButtons(){ [["self","sbtnsSelf"],["opp","sbtnsOpp"]].forEach(([side,id])=>{ const box=document.getElementById(id); if(!box) return; box.innerHTML=""; let any=false; (SND_URLS[side]||[]).forEach((u,i)=>{ if(!u) return; any=true; const b=document.createElement("button"); b.className="sbtn"; b.textContent="♪"+(i+1); b.title=u; b.onclick=()=>{ UrlAudio.play(u); }; box.appendChild(b); }); if(any){ const s=document.createElement("button"); s.className="sbtn stop"; s.textContent="■"; s.title="停止"; s.onclick=()=>UrlAudio.stop(); box.appendChild(s); } }); }
const COLOR_BY_NAME={"くり":"#966432","げんちゃん":"#00b41e","ちゅろす":"#00c8ff","とれんさー":"#b4ffff","ぺんしりゃ。":"#ff9600","りおっぴ":"#ffd4ff","りんごあめ":"#ff0000","れあ":"#a5a5a5","いと":"#9696f0","メルトア":"#F7D707","一ノ城":"#00d2b4","真筝":"#ff6769","新薬浅田":"#00ff00","D!amusung":"#dcb4a0","Masa":"#2743D2","Fam":"#c8ff00","YODA Yodo":"#b450ff","Gumi":"#8fe542","モチリン":"#e5d97a","ギルバス":"#ff00a3","すけお":"#ffca04","猫うさぎ":"#dba66b","けい":"#4ef088","おかさん":"#006fd7","ルイ":"#92c14f","るぅ":"#ffc7ea","純水":"#e4cf26","夏至":"#115eab","てぃりー":"#ffeb7c","ひいらぎ":"#4e4e4e","雪雅":"#d4d4d4","sinn":"#b2d9ff"};
let fxQ=[], fxBusy=false;
function announceFx(pid,slot,name,text){ if(pid&&typeof slot==="number"&&slot>=0&&motifActive(pid,101)){ const _c=state.players[pid].field[slot]; if(_c&&!_c.blank&&(_c.curEn||0)<(_c.energy||0)){ _c.curEn=(_c.curEn||0)+1; } } fxQ.push({pid,slot,name,text}); Snd.play("effect"); processFx(); }
function processFx(){ if(fxBusy||!fxQ.length) return; fxBusy=true; const it=fxQ.shift();
  const pop=$("fxpop"); if(pop){ pop.innerHTML=`<span class="fxname">${it.name||""}</span><span class="fxtext">${it.text||""}</span>`; pop.classList.add("on"); }
  let el=null; if(it.pid!=null&&it.slot!=null){ el=document.querySelector(`.card[data-p="${it.pid}"][data-s="${it.slot}"]`); if(el) el.classList.add("fxhi"); }
  setTimeout(()=>{ if(el) el.classList.remove("fxhi"); if(pop) pop.classList.remove("on"); fxBusy=false; setTimeout(processFx,160); },1250); }
const MOTIF_INSTANT=new Set([32,33,35,40,42,44,47,79,102]); // 即時＋るぅ＋ひいらぎ
const MOTIF_COND=new Set([41,46,59,60,61,78,80,81,82,83,101,103]); // 条件継続型
const MOTIF_ANYTIME=new Set([35,42,102]); // いつでも発動：ちゅろす,新薬浅田,ひいらぎ
function motifCondMet(pid,cid){ const s=state.players.self.life,o=state.players.opp.life,me=state.players[pid].life;
  if(cid===41||cid===46) return (s<=4||o<=4);
  if(cid===59) return Math.abs(s-o)<=2;   // すけお：ライフ差2以下
  if(cid===60) return me<=2;              // ギルバス：自分ライフ2以下
  if(cid===61) return (s<=3||o<=3);       // モチリン：どちらか3以下
  if(cid===80) return (s<=4&&o<=4);       // 純水：互いに4以下
  if(cid===83) return (s>=2&&o>=2);       // 雪雅：互いに2以上
  if(cid===103) return (s<=4||o<=4);      // sinn：どちらか4以下
  if(cid===101) return Math.abs(s-o)<=2;   // ルイ：ライフ差2以下
  if(cid===78) return (s<=5||o<=5);        // けい：どちらか5以下
  if(cid===81) return (state.players.self.deck.length>=1||state.players.opp.deck.length>=1); // 夏至：どちらか山札1以上
  if(cid===82) return true;                // てぃりー：退場2回で終了（別管理）
  return true; }
function motifActive(pid,cid){ const m=state.players[pid].motif; if(!m||!m.card) return false; if(cid&&m.card.cardId!==cid) return false; if(m.card.cardId!==100){ const om=state.players[opp(pid)].motif; if(om&&om.card.cardId===100 && state.players[opp(pid)].field.some(c=>c&&!c.blank&&c.name===om.name)) return false; } if(MOTIF_COND.has(m.card.cardId)) return motifCondMet(pid,m.card.cardId); return state.players[pid].field.some(c=>c&&!c.blank&&c.name===m.name); }
function motifEither(cid){ return motifActive("self",cid)||motifActive("opp",cid); }
function yukigaBlank(){ return motifEither(83) && ["self","opp"].some(s=>state.players[s].field.some(c=>c&&c.blank)); }
function penIgnoreBlock(){ return motifEither(41) && (state.players.self.life<=4||state.players.opp.life<=4); }
function linkCount(pid,slot){ let n=0; [slot-1,slot,slot+1].forEach(j=>{const c=state.players[pid].field[j]; if(c&&!c.blank) n++;}); return n; }
function rescueFromExclude(pid,card){ if(!card||card.type!=="character") return false; if(!motifActive(pid,61)) return false; const r=d6(); const dec=[3,4]; logLine(`モチリン(モチーフ)：除外回避ダイス ${r}（宣言 ${dec.join("/")}）`,true); if(dec.indexOf(r)>=0){ card.blank=false; card.curEn=card.energy; state.players[pid].hand.push(card); announceFx(pid,null,card.name,"除外回避→手札"); return true; } return false; }
function maintainMotifs(){ if(!state) return; ["self","opp"].forEach(pid=>{ const p=state.players[pid]; if(!p.motif) return; const cid=p.motif.card.cardId; let rm=false; if(MOTIF_COND.has(cid)){ if(!motifCondMet(pid,cid)) rm=true; } else if(!p.field.some(c=>c&&!c.blank&&c.name===p.motif.name)) rm=true; if(rm){ p.exclude.push(p.motif.card); logLine(`${p.name}：モチーフ「${p.motif.name}」終了→除外`,true); p.motif=null; } }); }
function activateMotif(pid,card){ if(NET.active&&!NET.isHost) return; const p=state.players[pid]; const idx=p.hand.indexOf(card); if(idx<0) return;
  if(!p.field.some(c=>c&&!c.blank&&c.name===card.name)){ flash("対応キャラが場にいません"); return; }
  closeOverlay(); const cid=card.cardId;
  if(MOTIF_COND.has(cid) && !motifCondMet(cid)){ flash("継続条件（ライフ4以下）を満たしていません"); return; }
  if(MOTIF_INSTANT.has(cid)){ p.hand.splice(idx,1); logLine(`${p.name}：モチーフ「${card.name}」発動（即時）`,true); announceFx(null,null,`モチーフ：${card.name}`,"即時"); runMotifInstant(pid,card,cid); return; }
  p.hand.splice(idx,1); if(p.motif) p.exclude.push(p.motif.card); p.motif={name:card.name, card};
  logLine(`${p.name}：モチーフ「${card.name}」発動（継続）`,true); announceFx(null,null,`モチーフ：${card.name}`,"継続"); render(); }
function runMotifInstant(pid,card,cid){ const p=state.players[pid]; const fin=()=>{ p.exclude.push(card); maintainMotifs(); render(); };
  switch(cid){ case 102: hiiragiMotif(pid,fin); break; case 79: motifRuu(pid,fin); break; case 33: motifRio(pid,fin); break; case 40: p.motifMasaNext=true; logLine("Masa(モチーフ)：次のアタックはエネ消費なし",true); fin(); break;
    case 44: motifRingo(pid,fin); break; case 32: motifYoda(pid,fin); break; case 35: motifChuro(pid,fin); break;
    case 42: motifYaku(pid,fin); break; case 47: motifToren(pid,fin); break; default: fin(); } }
function motifRuu(pid,fin){ ["self","opp"].forEach(s=>{ state.players[s].field.forEach((c,i)=>{ if(c&&!c.blank){ c.curEn=Math.max(0,Math.min(12, baseCP(s,i))); } }); }); logLine("るぅ(モチーフ)：全キャラのエネを基本CPに",true); render(); fin(); }
function motifRio(pid,fin){ ["self","opp"].forEach(s=>{ const f=state.players[s].field; for(let i=0;i<f.length;i++){ const c=f[i]; if(c&&(c.blank||(c.curEn||0)===0)) toGrave(s,i,"りおモチーフ"); } }); logLine("りお(モチーフ)：エネ0・ブランクを全破壊",true); render(); if(!checkWin()) fin(); }
function motifRingo(pid,fin){ const p=state.players[pid], foe=state.players[opp(pid)]; const slots=[]; foe.field.forEach((c,i)=>{ if(c&&!c.blank) slots.push(i); }); if(!slots.length||p.life<1){ flash("対象/ライフ不足"); fin(); return; }
  const apply=(i)=>{ p.life=Math.max(0,p.life-1); const nm=foe.field[i].name; toGrave(opp(pid),i,"りんモチーフ"); logLine(`りん(モチーフ)：ライフ-1で ${nm} を破壊`,true); render(); if(!checkWin()) fin(); };
  const human=(state.mode!=="cpu")||pid==="self"; if(!human){ let b=slots[0],bd=99; slots.forEach(i=>{const d=dist8(linkedCP(opp(pid),i)); if(d<bd){bd=d;b=i;}}); apply(b); return; }
  selectPrompt(`<b>りん(モチーフ)</b>：ライフ-1で破壊する相手キャラ`, slots.map(i=>({label:foe.field[i].name,fn:()=>{hidePrompt();apply(i);}})).concat([{label:"やめる",fn:()=>{hidePrompt();fin();}}])); }
function motifYoda(pid,fin){ const human=(state.mode!=="cpu")||pid==="self";
  if(!human){ const own=[]; state.players[pid].field.forEach((c,i)=>{if(c&&!c.blank)own.push(i);}); own.slice(0,3).forEach(i=>chEn(state.players[pid].field[i],2)); logLine("よだ(モチーフ)：味方+2",true); render(); fin(); return; }
  selectPrompt(`<b>よだ(モチーフ)</b>：効果を選択`, [ {label:"① 味方1〜3体 エネ+2",fn:()=>{hidePrompt();motifYodaBuff(pid,fin);}}, {label:"② 相手1体 エネ-2",fn:()=>{hidePrompt();motifYodaDebuff(pid,fin);}} ]); }
function motifYodaBuff(pid,fin){ const p=state.players[pid]; let cnt=0; const used=new Set();
  const step=()=>{ const s=[]; p.field.forEach((c,i)=>{if(c&&!c.blank&&!used.has(i))s.push(i);}); if(cnt>=3||!s.length){ state.pick=null; hidePrompt(); logLine(`よだ(モチーフ)：味方${cnt}体+2`,true); fin(); return; }
    state.pick={ banner:`エネ+2する味方を<b>タップ</b>（${cnt}/3）`, field:{pid, slots:s, on:(i)=>{ chEn(p.field[i],2); used.add(i); cnt++; step(); }}, doneBtn:{label:"決定",fn:()=>{ state.pick=null; hidePrompt(); logLine(`よだ(モチーフ)：味方${cnt}体+2`,true); fin(); }}, cancel: cnt===0?()=>{ state.pick=null; hidePrompt(); fin(); }:null };
    showPickBanner(); render(); };
  step(); }
function motifYodaDebuff(pid,fin){ const foe=state.players[opp(pid)]; const s=[]; foe.field.forEach((c,i)=>{if(c&&!c.blank)s.push(i);}); if(!s.length){ fin(); return; }
  state.pick={ banner:`エネ-2する相手を<b>タップ</b>`, field:{pid:opp(pid), slots:s, on:(i)=>{ chEn(foe.field[i],-2); state.pick=null; hidePrompt(); logLine("よだ(モチーフ)：相手-2",true); render(); fin(); }}, cancel:()=>{ state.pick=null; hidePrompt(); fin(); } };
  showPickBanner(); render(); }
function motifChuro(pid,fin){ const p=state.players[pid]; const slots=[]; let tot=0; p.field.forEach((c,i)=>{ if(c&&!c.blank){ slots.push(i); tot+=(c.curEn||0); c.curEn=0; } }); if(!slots.length||tot<=0){ render(); fin(); return; } render(); allocEnergy(pid,slots,tot,'add',()=>{ logLine(`ちろ(モチーフ)：エネ${tot}を再分配`,true); render(); fin(); }); }
function motifYaku(pid,fin){ const p=state.players[pid]; let done=0;
  const pickSlot=(got,src)=>{ const empties=[]; p.field.forEach((c,i)=>{if(c===null)empties.push(i);});
    state.pick={ banner:`召喚する空きスロットを<b>タップ</b>`, field:{pid, slots:empties, on:(s)=>{ state.pick=null; hidePrompt(); got.blank=false; got.curEn=got.energy; p.field[s]=got; if(pid==="self") state.seen[got.cardId]=(state.seen[got.cardId]||0)+1; logLine(`やく(モチーフ)：${got.name} を召喚`,true); done++; render(); one(); }}, cancel:()=>{ state.pick=null; hidePrompt(); (src==="hand"?p.hand:p.deck).push(got); fin(); } };
    showPickBanner(); render(); };
  const one=()=>{ const empties=[]; p.field.forEach((c,i)=>{if(c===null)empties.push(i);}); const handC=p.hand.filter(c=>c.type==="character"); const deckSeen=new Set(); const deckC=p.deck.filter(c=>{ if(c.type!=="character"||deckSeen.has(c.cardId))return false; deckSeen.add(c.cardId); return true; });
    if(done>=2||!empties.length||(!handC.length&&!deckC.length)){ fin(); return; }
    const human=(state.mode!=="cpu")||pid==="self";
    if(!human){ let got=null,src="hand"; if(handC.length){ got=handC[0]; p.hand.splice(p.hand.indexOf(got),1); } else { got=deckC[0]; p.deck.splice(p.deck.findIndex(x=>x.cardId===got.cardId),1); } got.blank=false; got.curEn=got.energy; p.field[empties[0]]=got; logLine(`やく(モチーフ)：${got.name} を召喚`,true); done++; one(); return; }
    const opts=[]; handC.forEach(c=>opts.push({label:"手札: "+c.name,fn:()=>{ hidePrompt(); const g=p.hand.splice(p.hand.indexOf(c),1)[0]; pickSlot(g,"hand"); }}));
    deckC.forEach(c=>opts.push({label:"山札: "+c.name,fn:()=>{ hidePrompt(); const k=p.deck.findIndex(x=>x.cardId===c.cardId); const g=p.deck.splice(k,1)[0]; pickSlot(g,"deck"); }}));
    opts.push({label:"やめる",fn:()=>{ hidePrompt(); fin(); }});
    selectPrompt(`<b>やく(モチーフ)</b>：召喚するキャラ（${done+1}/2）`, opts); };
  one(); }
function motifToren(pid,fin){ const names={}; ["self","opp"].forEach(s=>{ const P=state.players[s]; [].concat(P.hand,P.deck,P.grave).forEach(c=>{ names[c.cardId]=c.name; }); });
  const ids=Object.keys(names); if(!ids.length){ fin(); return; }
  const doExclude=(cid)=>{ cid=+cid; ["self","opp"].forEach(s=>{ const P=state.players[s]; ["hand","deck","grave"].forEach(z=>{ for(let i=P[z].length-1;i>=0;i--){ if(P[z][i].cardId===cid) P.exclude.push(P[z].splice(i,1)[0]); } }); }); logLine(`とれ(モチーフ)：「${names[cid]}」を全除外`,true); render(); fin(); };
  const human=(state.mode!=="cpu")||pid==="self"; if(!human){ doExclude(ids[0]); return; }
  selectPrompt(`<b>とれ(モチーフ)</b>：全除外するカードを宣言`, ids.map(cid=>({label:names[cid],fn:()=>{hidePrompt();doExclude(cid);}})).concat([{label:"やめる",fn:()=>{hidePrompt();fin();}}])); }
/* ===== 特殊カード ===== */
function showSpecialCard(card){ if(!card) return; let ov=document.getElementById("spCard"); if(!ov) return; const im=cardImg(card);
  ov.innerHTML=`<div class="spInner">${im?`<img src="${im}" alt="">`:`<div class="bigcard face">${cardFaceHTML(card)}</div>`}<div class="spLabel">特殊カード：${card.name}</div></div>`;
  ov.classList.add("on"); clearTimeout(ov._t); ov._t=setTimeout(()=>ov.classList.remove("on"),2000); }
function maybeShowSpecial(pid,card){ const isOpp=(state.mode==="cpu")?(pid==="opp"):(NET.active?(pid!==NET.seat):true);
  if(isOpp) showSpecialCard(card);
  if(NET.active&&NET.isHost){ NET.conns.forEach(c=>{ if(!c.open) return; const r=NET.roles[c.peer]||"spec"; const seat=r==="A"?"self":r==="B"?"opp":null; if(seat!==pid||seat===null) { try{ c.send({t:"special",card:{cardId:card.cardId,name:card.name,img:card.img,cp:card.cp,energy:card.energy,colors:card.colors,shape:card.shape,type:card.type,varcp:card.varcp}}); }catch(e){} } }); } }
const SPECIAL_IMPL=new Set([84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,130,131]);
function discardSpecial(pid,card){ const p=state.players[pid]; const idx=p.hand.indexOf(card); if(idx>=0) p.hand.splice(idx,1);
  const kinds=new Set(p.grave.map(x=>x.cardId)); if(kinds.has(card.cardId)||kinds.size<CONFIG.GRAVE_KINDS) p.grave.push(card); else p.exclude.push(card); }
function playSpecial(pid,card){ if(NET.active&&!NET.isHost) return;  const p=state.players[pid], foe=state.players[opp(pid)]; closeOverlay(); const cid=card.cardId; maybeShowSpecial(pid,card); state._sasshiX2 = motifActive(pid,81);
  announceFx(null,null,card.name,"特殊カード");
  const done=(msg)=>{ if(msg) logLine(`${p.name}：特殊「${card.name}」 ${msg}`,true); discardSpecial(pid,card); render(); };
  const cancel=()=>{ render(); };
  switch(cid){
    case 94: if(canGainLife()){ p.life=Math.min(6,p.life+SX2()); onLifeGain(pid); done(`ライフ+${SX2()} → ${p.life}`);} else done("Gumi効果でライフ増加不可"); break;
    case 95: p.field.forEach(c=>{ if(c&&!c.blank) chEn(c,SX2()); }); done(`味方全員 エネルギー+${SX2()}`); break;
    case 93: foe.field.forEach(c=>{ if(c&&!c.blank) chEn(c,-SX2()); }); done(`相手全員 エネルギー-${SX2()}`); break;
    case 90: if((state.mode==="cpu")&&pid!=="self"){ foe.life=Math.min(CONFIG.LIFE_MAX,foe.life+1); done("相手ライフ+1"); break; }
      selectPrompt(`<b>煽りw</b>：効果を選択`, [
        {label:"① 相手ライフ+1",fn:()=>{ foe.life=Math.min(CONFIG.LIFE_MAX,foe.life+1); done(`相手ライフ+1 → ${foe.life}`); }},
        {label:"② 相手が1ドロー",fn:()=>{ draw(opp(pid),1,false); done("相手が1ドロー"); }},
        {label:"② 相手が2ドロー",fn:()=>{ draw(opp(pid),2,false); done("相手が2ドロー"); }},
        {label:"② 相手が3ドロー",fn:()=>{ draw(opp(pid),3,false); done("相手が3ドロー"); }} ]); break;
    case 88: { let n=0; const amt=2*SX2(); p.field.forEach(c=>{ if(c&&c.blank){ c.blankEn=(c.blankEn||0)+amt; n++; } }); done(n?`ブランク${n}体 エネルギー+${amt}`:"対象のブランクなし"); break; }
    case 97: if(p.shukaTurn===state.turn){ flash("招集！は1ターン1回"); return; } p.shukaTurn=state.turn; draw(pid,2*SX2(),false); done(`${2*SX2()}ドロー`); break;
    case 86: foe.tobo=(foe.tobo||0)+1; done(`徒歩で来た（相手の次アタックに追加コスト・徒歩×${foe.tobo}）`); break;
    case 92: state.tsukkomiTurn=state.turn; done("このターン、正面のキャラでのみブロック可"); break;
    case 84: specialYotei(pid,done,cancel); break;
    case 85: specialGamble(pid,done,cancel); break;
    case 87: specialKampi(pid,done,cancel); break;
    case 89: specialOtsu(pid,done,cancel); break;
    case 91: specialNige(pid,done,cancel); break;
    case 96: specialSeki(pid,done,cancel); break;
    case 98: specialDattai(pid,done,cancel); break;
    case 99: specialShin(pid,done,cancel); break;
    case 130: specialSake(pid,done,cancel); break;
    case 131: specialJokyo(pid,done,cancel); break;
    default: flash("未実装"); }
}
function specialYotei(pid,done,cancel){ const dpid=opp(pid), foe=state.players[dpid]; const slots=[]; foe.field.forEach((c,i)=>{ if(c&&!c.blank) slots.push(i); });
  if(!slots.length){ flash("対象の相手キャラがいません"); cancel(); return; }
  const apply=(i)=>{ const c=foe.field[i]; chEn(c,-2); state.pick=null; hidePrompt(); logLine(`予定確認：${c.name} エネルギー-2`,true); done(); };
  if((state.mode==="cpu")&&pid!=="self"){ apply(slots[0]); return; }
  state.pick={ banner:`予定確認：相手キャラを<b>タップ</b>（⚡-2）`, field:{pid:dpid, slots, on:apply}, cancel:()=>{ state.pick=null; hidePrompt(); cancel(); } }; showPickBanner(); render(); }
function specialGamble(pid,done,cancel){
  if((state.mode==="cpu")&&pid!=="self"){ doGamble(pid,[1+(Math.random()*6|0),1+(Math.random()*6|0)],pid,done); return; }
  const pickNum=(label,cb)=>selectPrompt(`ギャンブル：${label}`, [1,2,3,4,5,6].map(n=>({label:`${n}`,fn:()=>cb(n)})));
  pickNum("1つ目の数字を指定",(a)=>{ pickNum("2つ目の数字を指定",(b)=>{ selectPrompt(`ギャンブル：どちらのダイスを振る？`, [
    {label:"自分のダイス",fn:()=>doGamble(pid,[a,b],pid,done)},
    {label:"相手のダイス",fn:()=>doGamble(pid,[a,b],opp(pid),done)} ]); }); }); }
function doGamble(pid,nums,rollPid,done){ hidePrompt(); openDiceScreen("ギャンブル",[state.players[rollPid].name],vals=>{ const r=vals[0]; if(state.dice) state.dice[rollPid]=r; closeDice();
  const hit=nums.includes(r); if(hit){ const foe=state.players[opp(pid)]; if(foe.deck.length){ const d=foe.deck.pop(); const kinds=new Set(foe.grave.map(x=>x.cardId)); if(kinds.has(d.cardId)||kinds.size<CONFIG.GRAVE_KINDS) foe.grave.push(d); else foe.exclude.push(d); } }
  done(hit?`的中(${r})→相手山札1枚破棄`:`はずれ(${r})`); }); }
function specialKampi(pid,done,cancel){ const p=state.players[pid]; let count=0; const used=new Set();
  const avail=()=>{ const s=[]; p.field.forEach((c,i)=>{ if(c&&!c.blank&&!used.has(i)) s.push(i); }); return s; };
  if(!avail().length){ flash("対象キャラがいません"); cancel(); return; }
  if((state.mode==="cpu")&&pid!=="self"){ avail().slice(0,3).forEach(i=>{ chEn(p.field[i],-1); }); done("自分キャラ エネルギー-1"); return; }
  const step=()=>{ const s=avail(); if(count>=3||!s.length){ state.pick=null; hidePrompt(); done(`${count}体 エネルギー-1`); return; }
    state.pick={ banner:`カンピロバクター：⚡-1する自分キャラを<b>タップ</b>（${count}/3）`, field:{pid, slots:s, on:(i)=>{ chEn(p.field[i],-1); used.add(i); count++; step(); }}, doneBtn:{label:"決定",fn:()=>{ state.pick=null; hidePrompt(); done(`${count}体 エネルギー-1`); }}, cancel: count===0?()=>{ state.pick=null; hidePrompt(); cancel(); }:null };
    showPickBanner(); render(); };
  step(); }
function specialSake(pid,done,cancel){ const p=state.players[pid]; const slots=[]; p.field.forEach((c,i)=>{ if(c&&!c.blank&&(c.curEn||0)>=1) slots.push(i); });
  if(!slots.length){ flash("エネルギー1以上の自分キャラが必要"); cancel(); return; }
  if((state.mode==="cpu")&&pid!=="self"){ const c=p.field[slots[0]]; chEn(c,-1); c.cpMod=(c.cpMod||0)+1; done("酒：基本CP+1"); return; }
  state.pick={ banner:`酒：対象の自分キャラを<b>タップ</b>`, field:{pid, slots, on:(i)=>{ const c=p.field[i]; state.pick=null; hidePrompt();
    const opts=[]; for(let a=1;a<=(c.curEn||0);a++) opts.push({label:`エネルギー-${a}`,fn:()=>{ chEn(c,-a); c.cpMod=(c.cpMod||0)+1; hidePrompt(); logLine(`酒：${c.name} ⚡-${a}・基本CP+1（破壊まで）`,true); done(); }});
    selectPrompt(`酒：減らすエネルギー（コスト・1以上）`, opts); }}, cancel:()=>{ state.pick=null; hidePrompt(); cancel(); } }; showPickBanner(); render(); }
function specialJokyo(pid,done,cancel){ const p=state.players[pid]; const slots=[]; p.field.forEach((c,i)=>{ if(c&&!c.blank) slots.push(i); });
  if(!slots.length){ flash("対象の自分キャラがいません"); cancel(); return; }
  if((state.mode==="cpu")&&pid!=="self"){ done("上京"); return; }
  state.pick={ banner:`上京：対象の自分キャラを<b>タップ</b>`, field:{pid, slots, on:(i)=>{ const c=p.field[i]; state.pick=null; hidePrompt();
    const pickCol=(label,cb)=>selectPrompt(`上京：${label}`, COLORS.map(k=>({label:k.k,fn:()=>cb(k.k)})).concat([{label:"変更しない",fn:()=>cb(null)}]));
    pickCol("1つ目の性質",(a)=>{ pickCol("2つ目の性質",(b)=>{ const nc=(c.colors||[]).slice(); while(nc.length<3) nc.push(nc[0]||"赤"); if(a) nc[0]=a; if(b) nc[1]=b; c.colors=nc.slice(0,3); hidePrompt(); logLine(`上京：${c.name} の性質を変更（破壊まで）`,true); done(); }); });
   }}, cancel:()=>{ state.pick=null; hidePrompt(); cancel(); } }; showPickBanner(); render(); }
function specialOtsu(pid,done,cancel){ const dpid=opp(pid), foe=state.players[dpid]; const slots=[]; foe.field.forEach((c,i)=>{ if(c&&!c.blank) slots.push(i); });
  if(!slots.length){ flash("対象の相手キャラがいません"); cancel(); return; }
  const apply=(i)=>{ const c=foe.field[i]; c.noBlockTurn=state.turn; c.noAttackTurn=state.turn+1; state.pick=null; hidePrompt(); logLine(`おつ！：${c.name} はブロック不可＆次ターン攻撃不可`,true); done(); };
  if((state.mode==="cpu")&&pid!=="self"){ let best=slots[0],bd=99; slots.forEach(i=>{const d=dist8(linkedCP(dpid,i)); if(d<bd){bd=d;best=i;}}); apply(best); return; }
  state.pick={ banner:`おつ！：対象の相手キャラを<b>タップ</b>`, field:{pid:dpid, slots, on:apply}, cancel:()=>{ state.pick=null; hidePrompt(); cancel(); } }; showPickBanner(); render(); }
function specialNige(pid,done,cancel){ const p=state.players[pid]; const slots=[]; p.field.forEach((c,i)=>{ if(c&&!c.blank) slots.push(i); });
  if(!slots.length){ flash("戻すキャラがいません"); cancel(); return; }
  const apply=(i)=>{ const c=p.field[i]; p.field[i]=null; c.blank=false; c.curEn=c.energy; p.hand.push(c); p.noSummonTurn=state.turn; p.playedChar=true; state.pick=null; hidePrompt(); logLine(`逃げるンゴ！：${c.name} を手札へ（以後召喚不可）`,true); done(); };
  if((state.mode==="cpu")&&pid!=="self"){ apply(slots[0]); return; }
  state.pick={ banner:`逃げるンゴ！：手札に戻す自分のキャラを<b>タップ</b>`, field:{pid, slots, on:apply}, cancel:()=>{ state.pick=null; hidePrompt(); cancel(); } }; showPickBanner(); render(); }
function specialSeki(pid,done,cancel){ if((state.mode==="cpu")&&pid!=="self"){ const own=state.players[pid].field.map((c,i)=>c&&!c.blank?i:-1).filter(i=>i>=0); if(own.length>=2){ const f=state.players[pid].field; const t=f[own[0]]; f[own[0]]=f[own[1]]; f[own[1]]=t; } done(); return; }
  const total=["self","opp"].reduce((n,s)=>n+state.players[s].field.filter(c=>c&&!c.blank).length,0); if(total<2){ flash("交換できるキャラが不足"); cancel(); return; }
  state.pick={ banner:`席替え：1体目を<b>タップ</b>`, anyField:{on:(sp,si)=>{
    state.pick={ banner:`席替え：2体目（同じ側）を<b>タップ</b>`, anyField:{on:(sp2,si2)=>{ if(sp2!==sp){ flash("同じ側を選択"); return; } if(si2===si){ flash("別のキャラを選択"); return; } const f=state.players[sp].field; const t=f[si]; f[si]=f[si2]; f[si2]=t; state.pick=null; hidePrompt(); logLine("席替え：位置を交換",true); done(); }}, cancel:()=>{ state.pick=null; hidePrompt(); cancel(); } };
    showPickBanner(); render(); }}, cancel:()=>{ state.pick=null; hidePrompt(); cancel(); } }; showPickBanner(); render(); }
function specialDattai(pid,done,cancel){ const p=state.players[pid]; const slots=[]; p.field.forEach((c,i)=>{ if(c&&!c.blank) slots.push(i); });
  if(!slots.length){ flash("墓地へ送れる場のキャラがいません"); cancel(); return; }
  const afterSac=()=>{ const handChars=p.hand.filter(c=>c.type==="character"); const empties=[]; p.field.forEach((c,ii)=>{ if(c===null) empties.push(ii); });
    if(!handChars.length||!empties.length||p.noSummonTurn===state.turn){ done("キャラを墓地へ"); return; }
    if((state.mode==="cpu")&&pid!=="self"){ done("キャラを墓地へ"); return; }
    state.pick={ banner:`召喚する手札のキャラを<b>タップ</b>（任意）`, hand:{pid, on:(c)=>{
      state.pick={ banner:`召喚する空きスロットを<b>タップ</b>`, field:{pid, slots:empties, on:(s)=>{ state.pick=null; hidePrompt(); placeChar(pid,s,c); logLine(`まさかの脱退！？：${c.name} を召喚`,true); done(); }}, cancel:()=>{ state.pick=null; hidePrompt(); done("召喚せず"); } };
      showPickBanner(); render(); }}, cancel:()=>{ state.pick=null; hidePrompt(); done("召喚せず"); } };
    showPickBanner(); render(); };
  if((state.mode==="cpu")&&pid!=="self"){ toGrave(pid,slots[0],"脱退"); afterSac(); return; }
  state.pick={ banner:`まさかの脱退！？：墓地へ送る自分のキャラを<b>タップ</b>`, field:{pid, slots, on:(i)=>{ state.pick=null; hidePrompt(); toGrave(pid,i,"脱退"); render(); afterSac(); }}, cancel:()=>{ state.pick=null; hidePrompt(); cancel(); } }; showPickBanner(); render(); }
function specialShin(pid,done,cancel){ const p=state.players[pid]; const chars=p.deck.filter(c=>c.type==="character"); if(!chars.length){ flash("山札にキャラがいません"); cancel(); return; }
  if((state.mode==="cpu")&&pid!=="self"){ const idx=p.deck.findIndex(c=>c.type==="character"); const got=p.deck.splice(idx,1)[0]; p.hand.push(got); done(); return; }
  const seen=new Set(); const opts=[];
  p.deck.forEach(c=>{ if(c.type==="character"&&!seen.has(c.cardId)){ seen.add(c.cardId); opts.push({label:c.name,fn:()=>{ const idx=p.deck.findIndex(x=>x.cardId===c.cardId); const got=p.deck.splice(idx,1)[0]; p.hand.push(got); hidePrompt(); logLine(`新メンバー！：${got.name} を手札に`,true); done(); }}); } });
  opts.push({label:"やめる",fn:()=>{ hidePrompt(); cancel(); }});
  selectPrompt(`新メンバー！：山札からキャラを選択`, opts); }
function pbtn(l,fn){const b=document.createElement("button");b.className="pbtn";b.textContent=l;b.onclick=(e)=>{Snd.play("click");fn(e);};return b;}
function logLine(html,hi=false){const l=$("logPanel");const d=document.createElement("div");d.innerHTML=(hi?"<b>":"")+html+(hi?"</b>":"");l.prepend(d);}
let flashTimer=null;
function flash(msg){ if(state&&state.pending) return; const p=$("prompt"),m=$("promptMsg"),a=$("promptActs"); m.textContent=msg; a.innerHTML=""; p.classList.add("on"); clearTimeout(flashTimer); flashTimer=setTimeout(()=>{ if(!state||!state.pending) p.classList.remove("on"); },1500);}

/* ===== ダイス ===== */
const DICE_SPOTS={TL:[22,22],TR:[22,78],ML:[50,22],MR:[50,78],C:[50,50],BL:[78,22],BR:[78,78]}; // [top%, left%]
const DICE_LAYOUT={1:["C"],2:["TL","BR"],3:["TL","C","BR"],4:["TL","TR","BL","BR"],5:["TL","TR","C","BL","BR"],6:["TL","TR","ML","MR","BL","BR"]};
function dieFaceHTML(v){ return (DICE_LAYOUT[v]||[]).map(s=>{const p=DICE_SPOTS[s]; return `<span class="dpip" style="top:${p[0]}%;left:${p[1]}%"></span>`;}).join(""); }
function minidieEl(val){ const d=document.createElement("div"); d.className="minidie"+(val?"":" empty"); if(val) d.innerHTML=dieFaceHTML(val); return d; }
// ダイス画面（画面いっぱいのロール演出）。labels=各ダイスのラベル配列。settle後 cb(値配列)
function openDiceScreen(title, labels, cb){ Snd.play("dice");
  const ov=$("diceOv"); ov.classList.add("on"); $("diceTitle").textContent=title; $("diceRes").textContent="";
  const row=$("diceRow"); row.innerHTML=""; const dice=[];
  labels.forEach(lb=>{ const box=document.createElement("div"); box.className="dicebox";
    const die=document.createElement("div"); die.className="die rolling"; die.innerHTML=dieFaceHTML(1);
    const lab=document.createElement("div"); lab.className="dicelab"; lab.textContent=lb;
    box.append(die,lab); row.appendChild(box); dice.push(die); });
  const finals=labels.map(()=>1+(Math.random()*6|0));
  const iv=setInterval(()=>{ dice.forEach(d=>d.innerHTML=dieFaceHTML(1+(Math.random()*6|0))); }, 90);
  setTimeout(()=>{ clearInterval(iv); dice.forEach((d,i)=>{ d.classList.remove("rolling"); d.innerHTML=dieFaceHTML(finals[i]); });
    $("diceRes").textContent = labels.length>1 ? `${labels[0]} ${finals[0]}　/　${labels[1]} ${finals[1]}` : `出目 ${finals[0]}`;
    setTimeout(()=>cb(finals), 750); }, 1550);
}
const closeDice=()=>$("diceOv").classList.remove("on");
function rollForFirst(done){
  openDiceScreen("", [state.players.self.name, state.players.opp.name], vals=>{
    state.dice.self=vals[0]; state.dice.opp=vals[1]; render();
    if(vals[0]===vals[1]){ $("diceRes").textContent="引き分け！ふりなおし"; setTimeout(()=>rollForFirst(done), 950); return; }
    const first = vals[0]>vals[1] ? "self":"opp"; closeDice(); done(first);
  });
}

/* ===== 画面遷移 ===== */
const ALLSCREENS=["Title","DeckSelect","Saved","Deck","Room","Game"];
function showScreen(id){ ALLSCREENS.forEach(s=>$("screen"+s).classList.toggle("on", s===id)); if(id==="Game"){ requestAnimationFrame(()=>{ try{applyMats();}catch(e){} }); } }
window.addEventListener("resize",()=>{ try{applyMats();}catch(e){} }); window.addEventListener("orientationchange",()=>{ setTimeout(()=>{try{applyMats();}catch(e){}},200); });
function refreshTitle(){ const d=getActiveDeck(); $("deckPickName").textContent=activeDeckName||"カスタムデッキ"; $("deckPickSub").textContent=`${deckTotal(d)}枚 ・ コード ${encodeDeck(d).slice(0,10)}…`;
  const tc=$("titleCover"); const c=activeDeckCover!=null?poolById(activeDeckCover):null;
  if(c){ const _im=cardImg(c); tc.style.display="block"; tc.className="cmini"+(_im?"":" face"); tc.style.backgroundImage=_im?`url("${_im}")`:""; tc.style.fontSize=".55em"; tc.innerHTML=_im?"":cardFaceHTML(c); }
  else { tc.style.display="none"; } }

/* タイトル */
$("nameInput").value=(store.get(NAME_KEY)||""); PLAYER_NAME=($("nameInput").value||"").trim();
$("nameInput").oninput=e=>{ PLAYER_NAME=e.target.value.trim(); store.set(NAME_KEY,PLAYER_NAME); };
$("toDeck").onclick=()=>showScreen("DeckSelect");
$("toCpu").onclick=()=>{ MODE="cpu"; ROOM_CODE=""; $("roomTag").textContent="CPU戦"; newGame(); showScreen("Game"); };
$("toRoom").onclick=()=>showScreen("Room");
$("toTitle").onclick=()=>{ refreshTitle(); showScreen("Title"); };

/* デッキ選択 */
$("dsBack").onclick=()=>showScreen("Title");
$("toSaved").onclick=()=>{ renderSavedBig(); showScreen("Saved"); };
$("toNew").onclick=()=>{ openDeck(); showScreen("Deck"); };
$("svBack").onclick=()=>showScreen("Title");
function miniEl(cardId){ const c=cardId!=null?poolById(cardId):null; const m=document.createElement("div"); const _im=cardImg(c); m.className="cmini"+((c&&!_im)?" face":"");
  if(c){ if(_im) m.style.backgroundImage=`url("${_im}")`; else { m.style.fontSize=".55em"; m.innerHTML=cardFaceHTML(c);} } return m; }
function renderSavedBig(){const box=$("savedListBig"), decks=loadSavedDecks(); box.innerHTML="";
  if(!decks.length){ box.innerHTML='<div class="empty">保存済みデッキはまだありません</div>'; return; }
  decks.forEach((d,idx)=>{const row=document.createElement("div"); row.className="srow"; row.style.gap="10px";
    if(d.cover!=null) row.appendChild(Object.assign(miniEl(d.cover),{style:"height:52px;aspect-ratio:296/460;border-radius:7px;overflow:hidden;flex:0 0 auto;"}));
    const nm=document.createElement("span"); nm.className="sn"; nm.textContent=d.name;
    const use=document.createElement("button"); use.textContent="使う"; use.onclick=()=>{const o=decodeDeck(d.code); if(o&&deckValid(o)){ setActiveDeck(o,d.name,d.cover!=null?d.cover:null); refreshTitle(); showScreen("Title"); } else alert("このデッキは読み込めません"); };
    const edit=document.createElement("button"); edit.textContent="編集"; edit.onclick=()=>openDeckEdit(idx);
    const del=document.createElement("button"); del.className="del"; del.textContent="削除"; del.onclick=()=>{const l=loadSavedDecks(); l.splice(idx,1); saveSavedDecks(l); renderSavedBig(); };
    row.append(nm,edit,use,del); box.appendChild(row);});}

/* ルーム */
$("roomBack").onclick=()=>{ try{ if(NET.peer) NET.peer.destroy(); }catch(e){} NET.active=false; NET.isHost=false; NET.peer=null; NET.conns=[]; NET.seat=null; NET.viewHand=null; $("lobby").style.display="none"; showScreen("Title"); };
let P2P_DA=null,P2P_DB=null,P2P_NA="",P2P_NB="";
const NET={active:false,isHost:false,seat:null,peer:null,conns:[],code:"",parts:[],roles:{},decks:{},mats:{},seatMats:{self:{img:"",adj:null},opp:{img:"",adj:null}},seatPeer:{},await:null,clientPrompt:null,viewHand:null};
function netLog(m){ const el=$("lobbyStatus"); if(el) el.textContent=m; }
function ensurePeerLib(cb){ if(window.Peer){ cb(); return; } netLog("通信ライブラリを読み込み中…");
  if(!document.getElementById("peerlib")){ const s=document.createElement("script"); s.id="peerlib"; s.src="https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"; s.onerror=()=>netLog("通信ライブラリの読込に失敗（ネット接続を確認）"); document.head.appendChild(s); }
  let n=0; const iv=setInterval(()=>{ if(window.Peer){ clearInterval(iv); cb(); } else if(++n>100){ clearInterval(iv); netLog("通信ライブラリの読込に失敗（ネット接続を確認）"); } },100); }
function showLobby(){ showScreen("Room"); $("lobby").style.display="block"; }
function netSnapshotFor(role,seat){ const s={players:JSON.parse(JSON.stringify(state.players)), turn:state.turn,phase:state.phase,active:state.active,over:state.over,dice:state.dice,tsukkomiTurn:state.tsukkomiTurn, pending: state.pending?{attacker:state.pending.attacker,atkSlot:state.pending.atkSlot,defender:state.pending.defender,noBlock:!!state.pending.noBlock}:null, placing: state.placing?{blank:!!state.placing.blank}:null };
  if(role!=="spec"){ const other=(seat==="self")?"opp":"self"; if(s.players[other]) s.players[other].hand=s.players[other].hand.map(()=>({hidden:true,type:"character"})); }
  return s; }
function netBroadcastState(){ if(!NET.isHost) return; NET.conns.forEach(c=>{ if(!c.open) return; const r=NET.roles[c.peer]||"spec"; const seat=r==="A"?"self":(r==="B"?"opp":null); try{ c.send({t:"state",snap:netSnapshotFor(r,seat)}); }catch(e){} }); }
function netApplyState(snap){ state=snap; state.mode="p2p"; state.afterBattle=state.afterBattle||[]; render(); }
function renderLobby(){ const box=$("lobbyList"); if(!box) return; $("lobbyCode").textContent=NET.code||"----"; box.innerHTML="";
  NET.parts.forEach(p=>{ const row=document.createElement("div"); row.className="lrow"; const nm=document.createElement("span"); nm.className="ln"; nm.textContent=p.name+(p.peer==="host"?"（オーナー）":""); row.appendChild(nm); const role=NET.roles[p.peer]||"spec";
    if(NET.isHost){ const sel=document.createElement("select"); sel.className="lsel"; [["A","対戦者A"],["B","対戦者B"],["spec","観戦"]].forEach(([v,l])=>{ const o=document.createElement("option"); o.value=v; o.textContent=l; if(v===role)o.selected=true; sel.appendChild(o); }); sel.onchange=()=>{ const val=sel.value; if(val!=="spec"){ for(const k in NET.roles){ if(k!==p.peer&&NET.roles[k]===val) NET.roles[k]="spec"; } } NET.roles[p.peer]=val; hostSyncLobby(); }; row.appendChild(sel); }
    else { const rl=document.createElement("span"); rl.className="lr"; rl.textContent=({A:"対戦者A",B:"対戦者B",spec:"観戦"})[role]||"観戦"; row.appendChild(rl); }
    box.appendChild(row); });
  const canStart=NET.isHost && Object.values(NET.roles).includes("A") && Object.values(NET.roles).includes("B");
  const sb=$("lobbyStart"); sb.style.display=NET.isHost?"flex":"none"; sb.disabled=!canStart; }
function hostSyncLobby(){ if(!NET.isHost) return; renderLobby(); const msg={t:"lobby",code:NET.code,parts:NET.parts,roles:NET.roles}; NET.conns.forEach(c=>{ if(c.open) try{c.send(msg);}catch(e){} }); }
function createRoom(){ ensurePeerLib(()=>{ const code=Math.random().toString(36).slice(2,6).toUpperCase(); try{ NET.peer=new Peer(code,{debug:1}); }catch(e){ netLog("作成失敗"); return; } NET.isHost=true; NET.code=code; NET.parts=[{peer:"host",name:(PLAYER_NAME||"あなた")}]; NET.roles={host:"A"}; NET.decks={host:getActiveDeck()};
    NET.peer.on("open",()=>{ netLog("ルーム作成完了。コードを共有してください。"); showLobby(); renderLobby(); });
    NET.peer.on("error",e=>{ netLog("エラー："+((e&&e.type)||e)); });
    NET.peer.on("connection",conn=>{ NET.conns.push(conn); conn.on("data",d=>hostOnData(conn,d)); conn.on("close",()=>{ NET.conns=NET.conns.filter(c=>c!==conn); NET.parts=NET.parts.filter(p=>p.peer!==conn.peer); delete NET.roles[conn.peer]; hostSyncLobby(); }); }); }); }
function hostOnData(conn,d){ if(!d) return; if(d.t==="hello"){ if(!NET.parts.find(p=>p.peer===conn.peer)){ NET.parts.push({peer:conn.peer,name:d.name||"プレイヤー"}); NET.roles[conn.peer]="spec"; NET.decks[conn.peer]=d.deck||null; } NET.mats[conn.peer]=d.mat||{img:"",adj:null}; hostSyncLobby(); } else if(d.t==="matUpdate"){ NET.mats[conn.peer]=d.mat||{img:"",adj:null}; hostBroadcastMats(); } else if(d.t==="resp"){ hostApplyResp(conn,d); } else if(d.t==="in"){ hostApplyIn(conn,d); } }
function joinRoom(code){ ensurePeerLib(()=>{ try{ NET.peer=new Peer(); }catch(e){ netLog("接続失敗"); return; } NET.isHost=false; NET.code=code;
    NET.peer.on("open",()=>{ const conn=NET.peer.connect(code,{reliable:true}); NET.conns=[conn];
      conn.on("open",()=>{ netLog("参加しました。オーナーの開始をお待ちください。"); try{ conn.send({t:"hello",name:(PLAYER_NAME||"プレイヤー"),deck:getActiveDeck(),mat:{img:MY_MAT,adj:MY_MAT_ADJ}}); }catch(e){} showLobby(); });
      conn.on("data",d=>clientOnData(d));
      conn.on("close",()=>{ netLog("接続が切断されました。"); }); });
    NET.peer.on("error",e=>{ netLog("接続エラー："+((e&&e.type)||e)+"（コードを確認）"); }); }); }
function mySeatFromRoles(){ const myId=NET.peer&&NET.peer.id; const r=NET.roles[myId]||"spec"; return (r==="A")?"self":(r==="B")?"opp":"spec"; }
/* ===== P2P 各自操作（入力中継） ===== */
function inputOwner(){ return (state&&state.inputOwner)?state.inputOwner:(state?state.active:null); }
function ownerIsLocal(seat){ if(!NET.active) return true; return NET.seat!=="spec" && seat===NET.seat; }
function seatOfPeer(peer){ const r=NET.roles[peer]; return r==="A"?"self":r==="B"?"opp":null; }
function netToSeat(seat,msg){ if(!NET.isHost) return; const peer=NET.seatPeer&&NET.seatPeer[seat]; const conn=NET.conns.find(c=>c.peer===peer); if(conn&&conn.open){ try{conn.send(msg);}catch(e){} } }
function hostWaiting(seat){ const nm=(state.players[seat]&&state.players[seat].name)||"相手"; document.getElementById("promptMsg").innerHTML=`<b>${nm}</b> の操作を待っています…`; document.getElementById("promptActs").innerHTML=""; document.getElementById("prompt").classList.add("on"); }
function netSendResp(d){ if(NET.isHost) return; const c=NET.conns[0]; if(c&&c.open){ try{ c.send(Object.assign({t:"resp"},d)); }catch(e){} } NET.clientPrompt=null; render(); }
function netSendIn(d){ if(NET.isHost) return; const c=NET.conns[0]; if(c&&c.open){ try{ c.send(Object.assign({t:"in"},d)); }catch(e){} } }
function activePick(){ if(NET.active&&!NET.isHost){ return (NET.clientPrompt&&NET.clientPrompt.kind==="pick")?NET.clientPrompt:null; } return state.pick; }
function clientShowPrompt(ui){
  if(ui.kind==="select"){ NET.clientPrompt={kind:"select",msg:ui.msg,labels:ui.labels}; }
  else if(ui.kind==="defense"){ NET.clientPrompt={kind:"defense",msg:ui.msg,canBlock:ui.canBlock,mustBlock:ui.mustBlock}; }
  else if(ui.kind==="pick"){ NET.clientPrompt={kind:"pick",banner:ui.banner,
    field: ui.field?{pid:ui.field.pid,slots:ui.field.slots,on:(slot)=>netSendResp({kind:"pickField",slot})}:null,
    hand: ui.hand?{pid:ui.hand.pid,on:(card)=>netSendResp({kind:"pickHand",uid:card.id})}:null,
    anyField: ui.anyField?{on:(pid,slot)=>netSendResp({kind:"pickAny",pid,slot})}:null,
    doneBtn: ui.done?{label:ui.done,fn:()=>netSendResp({kind:"done"})}:null,
    extraBtn: ui.extra?{label:ui.extra,fn:()=>netSendResp({kind:"extra"})}:null,
    cancel: ui.cancel?()=>netSendResp({kind:"cancel"}):null };
  }
  render();
}
function clientRenderPrompt(){ const cp=NET.clientPrompt; const pe=document.getElementById("prompt"); const msg=document.getElementById("promptMsg"), a=document.getElementById("promptActs");
  if(!cp){ pe.classList.remove("on"); return; }
  if(cp.kind==="select"){ msg.innerHTML=cp.msg; a.innerHTML=""; cp.labels.forEach((l,i)=>a.appendChild(pbtn(l,()=>netSendResp({kind:"select",i})))); pe.classList.add("on"); }
  else if(cp.kind==="defense"){ msg.innerHTML=cp.msg; a.innerHTML=""; if(!(cp.mustBlock&&cp.canBlock)) a.appendChild(pbtn("ライフで受ける (-1)",()=>netSendResp({kind:"defense",choice:"take"}))); if(cp.canBlock) a.appendChild(pbtn("ブロックする",()=>netSendResp({kind:"defense",choice:"block"}))); pe.classList.add("on"); }
  else if(cp.kind==="pick"){ msg.innerHTML=cp.banner; a.innerHTML=""; if(cp.doneBtn) a.appendChild(pbtn(cp.doneBtn.label,cp.doneBtn.fn)); if(cp.extraBtn) a.appendChild(pbtn(cp.extraBtn.label,cp.extraBtn.fn)); if(cp.cancel) a.appendChild(pbtn("やめる",cp.cancel)); pe.classList.add("on"); }
}
function hostApplyResp(conn,d){ const seat=seatOfPeer(conn.peer); if(!seat) return;
  if(d.kind==="select"){ if(seat!==inputOwner()) return; if(NET.await&&NET.await.kind==="select"){ const o=NET.await.options[d.i]; NET.await=null; if(o&&o.fn) o.fn(); } return; }
  if(d.kind==="defense"){ const pd=state.pending; if(!pd||seat!==pd.defender) return; NET.await=null; if(d.choice==="block") beginBlockSelect(); else resolveTake(); return; }
  const pk=state.pick; const owner=pk&&pk.owner||inputOwner();
  if(seat!==owner) return;
  if(d.kind==="pickField"){ if(pk&&pk.field) pk.field.on(d.slot); }
  else if(d.kind==="pickHand"){ if(pk&&pk.hand){ const c=state.players[pk.hand.pid].hand.find(x=>x.id===d.uid); if(c) pk.hand.on(c); } }
  else if(d.kind==="pickAny"){ if(pk&&pk.anyField) pk.anyField.on(d.pid,d.slot); }
  else if(d.kind==="done"){ if(pk&&pk.doneBtn) pk.doneBtn.fn(); }
  else if(d.kind==="extra"){ if(pk&&pk.extraBtn) pk.extraBtn.fn(); }
  else if(d.kind==="cancel"){ if(pk){ const c=pk.cancel; state.pick=null; hidePrompt(); c&&c(); render(); } }
}
function hostApplyIn(conn,d){ const seat=seatOfPeer(conn.peer); if(!seat) return;
  if(d.kind==="endTurn"){ if(state.active===seat && !state.pending) endTurn(); }
  else if(d.kind==="place"){ if(state.active===seat && state.placing && state.players[seat].field[d.slot]===null) placeCard(seat,d.slot); }
  else if(d.kind==="detailAct"){ if(d.pid!==seat && !(d.zone==="field"&&state.pending&&state.pending.defender===seat)) { /* allow only own cards / defender */ } netApplyDetailAct(seat,d,d.label); }
}
function netApplyDetailAct(seat,ref,label){ const P=state.players[ref.pid]; if(!P) return; let card=null; if(ref.zone==="field") card=P.field[ref.slot]; else if(ref.zone==="hand") card=P.hand.find(c=>c.id===ref.uid);
  if(!card||card.id!==ref.uid) return;
  openDetail(card,{zone:ref.zone,pid:ref.pid,slot:ref.slot});
  const btns=Array.prototype.slice.call(document.getElementById("dActs").querySelectorAll("button"));
  const b=btns.find(x=>x.textContent===label); if(b) b.click(); }
function clientOnData(d){ if(!d) return;
  if(d.t==="lobby"){ NET.code=d.code; NET.parts=d.parts||[]; NET.roles=d.roles||{}; NET.seat=mySeatFromRoles(); renderLobby(); }
  else if(d.t==="start"){ NET.active=true; NET.seat=mySeatFromRoles(); $("roomTag").textContent="ROOM "+NET.code; showScreen("Game"); netApplyState(d.snap); }
  else if(d.t==="state"){ NET.active=true; if(!NET.seat) NET.seat=mySeatFromRoles(); netApplyState(d.snap); }
  else if(d.t==="mats"){ NET.seatMats=d.mats||{self:{img:"",adj:null},opp:{img:"",adj:null}}; applyMats(); }
  else if(d.t==="special"){ showSpecialCard(d.card); }
  else if(d.t==="prompt"){ clientShowPrompt(d.ui); }
  else if(d.t==="clearPrompt"){ NET.clientPrompt=null; render(); } }
function hostStartGame(){ if(!NET.isHost) return; const aPeer=Object.keys(NET.roles).find(k=>NET.roles[k]==="A"); const bPeer=Object.keys(NET.roles).find(k=>NET.roles[k]==="B"); if(!aPeer||!bPeer){ netLog("対戦者A/Bを割り当ててください"); return; }
  P2P_DA=NET.decks[aPeer]||getActiveDeck(); P2P_DB=NET.decks[bPeer]||getActiveDeck();
  P2P_NA=(NET.parts.find(p=>p.peer===aPeer)||{}).name||"対戦者A"; P2P_NB=(NET.parts.find(p=>p.peer===bPeer)||{}).name||"対戦者B";
  MODE="p2p"; NET.active=true; NET.seatPeer={self:aPeer,opp:bPeer}; NET.seat=(NET.roles["host"]==="A")?"self":(NET.roles["host"]==="B")?"opp":"spec"; $("roomTag").textContent="ROOM "+NET.code; newGame(); showScreen("Game");
  NET.conns.forEach(c=>{ if(!c.open) return; const r=NET.roles[c.peer]||"spec"; const seat=r==="A"?"self":r==="B"?"opp":null; try{ c.send({t:"start",snap:netSnapshotFor(r,seat)}); }catch(e){} }); hostBroadcastMats(); }
$("roomJoin").onclick=()=>{ const c=($("roomInput").value||"").trim().toUpperCase(); if(!c){ $("roomInput").focus(); return; } joinRoom(c); };
$("roomCreate").onclick=()=>{ createRoom(); };
$("lobbyStart").onclick=()=>hostStartGame();

/* ===== デッキ構築（全カード / 検索 / 表紙） ===== */
let draft={}, draftCover=null, editingIdx=-1;
let filters=[{field:"",value:""},{field:"",value:""}];
let deckCat="";
const CATS=[{k:"",l:"全"},{k:"○",l:"○"},{k:"◇",l:"◇"},{k:"△",l:"△"},{k:"✕",l:"✕"},{k:"◎",l:"◎"},{k:"⬠",l:"⬠"},{k:"♡",l:"♡"},{k:"special",l:"特殊"},{k:"motif",l:"モチーフ"},{k:"friendlink",l:"FL"}];
function buildCats(){ const box=$("dCats"); if(!box) return; box.innerHTML=""; CATS.forEach(c=>{ const b=document.createElement("button"); b.className="dcat"+(deckCat===c.k?" on":""); b.textContent=c.l; b.onclick=()=>{ deckCat=c.k; buildCats(); renderDeckBuilder(); }; box.appendChild(b); }); }
const FIELDS=[{k:"",label:"指定なし"},{k:"name",label:"名前"},{k:"cp",label:"CP"},{k:"energy",label:"エネルギー"},{k:"color",label:"性質"},{k:"timing",label:"効果発動タイミング"}];
function openDeck(){ draft={}; draftCover=null; editingIdx=-1; deckCat=""; filters=[{field:"",value:""},{field:"",value:""}]; buildCats(); buildSearchUI(); renderDeckBuilder(); }
function openDeckEdit(idx){ const l=loadSavedDecks(); const d=l[idx]; if(!d) return; const o=decodeDeck(d.code); if(!o){ alert("このデッキは読み込めません"); return; }
  draft=o; draftCover=(d.cover!=null?d.cover:null); editingIdx=idx; deckCat=""; filters=[{field:"",value:""},{field:"",value:""}];
  const nameEl=$("deckName"); if(nameEl) nameEl.value=d.name||""; const hn=$("deckHeadName"); if(hn) hn.textContent="デッキ編集"; buildCats(); buildSearchUI(); renderDeckBuilder(); showScreen("Deck"); }
function draftCount(id){return draft[id]||0;}
function setDraft(id,n){const c=poolById(id); n=Math.max(0,Math.min(c.max,n)); if(n===0){ delete draft[id]; if(draftCover===id) draftCover=null; } else draft[id]=n; renderDeckBuilder();}
function buildSearchUI(){
  document.querySelectorAll("#screenDeck .frow").forEach(row=>{
    const i=+row.dataset.i; row.innerHTML="";
    const sel=document.createElement("select");
    FIELDS.forEach(f=>{const o=document.createElement("option"); o.value=f.k; o.textContent=f.label; sel.appendChild(o);});
    sel.value=filters[i].field;
    sel.onchange=()=>{ filters[i]={field:sel.value,value:""}; buildSearchUI(); renderDeckBuilder(); };
    row.appendChild(sel);
    row.appendChild(valueControl(i));
  });
}
function valueControl(i){ const f=filters[i]; let ctl;
  if(f.field==="name"){ ctl=document.createElement("input"); ctl.placeholder="名前を含む"; ctl.value=f.value; ctl.oninput=()=>{filters[i].value=ctl.value; renderDeckBuilder();}; }
  else if(f.field==="cp"||f.field==="energy"){ ctl=document.createElement("input"); ctl.type="number"; ctl.min="0"; ctl.placeholder=(f.field==="cp"?"CP":"エネルギー")+"の値"; ctl.value=f.value; ctl.oninput=()=>{filters[i].value=ctl.value; renderDeckBuilder();}; }
  else if(f.field==="color"){ ctl=document.createElement("select"); const o0=document.createElement("option"); o0.value=""; o0.textContent="色を選択"; ctl.appendChild(o0);
    COLORS.forEach(c=>{const o=document.createElement("option"); o.value=c.k; o.textContent=c.k; ctl.appendChild(o);}); ctl.value=f.value; ctl.onchange=()=>{filters[i].value=ctl.value; renderDeckBuilder();}; }
  else if(f.field==="timing"){ ctl=document.createElement("select"); const o0=document.createElement("option"); o0.value=""; o0.textContent="タイミングを選択"; ctl.appendChild(o0);
    TIMINGS.forEach(t=>{const o=document.createElement("option"); o.value=t; o.textContent=t; ctl.appendChild(o);}); ctl.value=f.value; ctl.onchange=()=>{filters[i].value=ctl.value; renderDeckBuilder();}; }
  else { ctl=document.createElement("input"); ctl.placeholder="—"; ctl.disabled=true; }
  return ctl;
}
function matchFilter(card,f){ if(!f.field||f.value==="") return true;
  switch(f.field){
    case "name": return card.name.includes(f.value);
    case "cp": return card.cp===Number(f.value);
    case "energy": return card.energy===Number(f.value);
    case "color": return card.colors.includes(f.value);
    case "timing": return (card.timings||[]).includes(f.value);
  } return true; }
function filteredCards(){ return CARD_POOL.filter(c=>{ if(deckCat){ const cc=(c.type==="character")?c.shape:c.type; if(cc!==deckCat) return false; } return filters.every(f=>matchFilter(c,f)); }); }
$("searchClear").onclick=()=>{ filters=[{field:"",value:""},{field:"",value:""}]; buildSearchUI(); renderDeckBuilder(); };
function renderDeckBuilder(){const list=$("deckList"); list.innerHTML="";
  const cards=filteredCards();
  if(!cards.length){ list.innerHTML='<div class="note">条件に合うカードがありません</div>'; }
  cards.forEach(c=>{const n=draftCount(c.id);
    const cell=document.createElement("div"); cell.className="dcell";
    const el=document.createElement("div"); el.className="card face"; const _im=cardImg(c); if(_im){el.style.backgroundImage=`url("${_im}")`; el.classList.remove("face");} else el.innerHTML=cardFaceHTML(c);
    cell.appendChild(el);
    if(n>0){ const b=document.createElement("div"); b.className="qbadge num"; b.textContent="×"+n; cell.appendChild(b); }
    if(draftCover===c.id){ const s=document.createElement("div"); s.className="cstar"; s.textContent="★"; cell.appendChild(s); }
    cell.onclick=()=>openDeckCardDetail(c);
    list.appendChild(cell);});
  renderCoverBox();
  const t=deckTotal(draft), ok=deckValid(draft); const tt=$("dTotal"); tt.textContent=`${t} / ${DECK_MIN}–${DECK_MAX}`; tt.classList.toggle("ok",ok);
  $("deckUse").disabled=!ok; $("codeField").value=encodeDeck(draft);}
// 画像タップで拡大＋この画面で枚数/表紙を操作
function openDeckCardDetail(card){
  const big=$("bigcard"); const _im=cardImg(card); big.style.backgroundImage=_im?`url("${_im}")`:""; big.className="bigcard"+(_im?"":" face"); big.innerHTML=cardFaceHTML(card);
  $("dName").textContent=card.name+(card.type&&card.type!=="character"?`（${TYPEJP[card.type]||card.type}）`:"");
  $("dCP").textContent=(card.varcp?"X（ダイス）":(card.cp==null?"—":card.cp));
  $("dEn").textContent=(card.energy?("★".repeat(card.energy)+`  (${card.energy})`):"—");
  $("dColors").innerHTML=(card.colors&&card.colors.length)?card.colors.map(k=>`<span class="cchip" style="background:${KEY2VAL[k]}"></span>`).join("")+" "+card.colors.join(" / "):"—";
  $("dTiming").textContent=(card.timings&&card.timings.length)?card.timings.map(t=>"【"+t+"】").join(""):"—";
  $("dLinkRow").style.display="none";
  $("dEff").textContent=`上限 ${card.max} 枚 ・ 効果：${card.effect?card.effect:"（なし）"}`;
  const acts=$("dActs"); acts.innerHTML=""; const n=draftCount(card.id);
  const qty=document.createElement("div"); qty.className="qtyrow";
  const minus=document.createElement("button"); minus.textContent="−"; minus.disabled=n<=0; minus.onclick=()=>{ setDraft(card.id,n-1); openDeckCardDetail(card); };
  const nn=document.createElement("span"); nn.className="qn num"; nn.textContent=n+" / "+card.max;
  const plus=document.createElement("button"); plus.textContent="+"; plus.disabled=n>=card.max||deckTotal(draft)>=DECK_MAX; plus.onclick=()=>{ setDraft(card.id,n+1); openDeckCardDetail(card); };
  qty.append(minus,nn,plus); acts.appendChild(qty);
  const isCover=draftCover===card.id;
  const cov=dact(isCover?"★ 表紙を解除":"表紙に設定", isCover?"blank":"play", ()=>{ if(draftCount(card.id)<=0) return; draftCover=isCover?null:card.id; renderDeckBuilder(); openDeckCardDetail(card); });
  if(draftCount(card.id)<=0){ cov.disabled=true; }
  acts.appendChild(cov);
  acts.appendChild(dact("閉じる","close",closeOverlay));
  $("overlay").classList.add("on");
}
function renderCoverBox(){const box=$("coverBox"); box.innerHTML="";
  if(draftCover==null||!draft[draftCover]){ box.innerHTML='<div class="empty">デッキ内のカードの「表紙に設定」で指定</div>'; return; }
  const c=poolById(draftCover); const row=document.createElement("div"); row.className="coverrow";
  const m=document.createElement("div"); const _im=cardImg(c); m.className="cmini"+(_im?"":" face"); if(_im) m.style.backgroundImage=`url("${_im}")`; else m.innerHTML=cardFaceHTML(c);
  const nm=document.createElement("div"); nm.className="cn"; nm.textContent=c.name; row.append(m,nm); box.appendChild(row);}
$("deckBack").onclick=()=>showScreen("Title");
$("deckClear").onclick=()=>{ draft={}; draftCover=null; renderDeckBuilder(); };
$("deckSave").onclick=()=>{ if(!deckValid(draft)){ alert(`デッキは${DECK_MIN}〜${DECK_MAX}枚にしてください（現在${deckTotal(draft)}枚）`); return; }
  const name=($("deckName").value||"").trim()||("デッキ "+new Date().toLocaleString("ja-JP",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}));
  const l=loadSavedDecks(); const entry={name, code:encodeDeck(draft), cover:draftCover};
  if(editingIdx>=0 && l[editingIdx]){ l[editingIdx]=entry; alert("更新しました："+name); } else { l.push(entry); alert("保存しました："+name); }
  saveSavedDecks(l); activeDeckName=name; };
$("deckUse").onclick=()=>{ if(!deckValid(draft)) return; setActiveDeck(Object.assign({},draft), activeDeckName||"カスタムデッキ", draftCover); refreshTitle(); showScreen("Title"); };
$("codeApply").onclick=()=>{ const o=decodeDeck($("codeField").value.trim()); if(o){ draft=o; draftCover=null; renderDeckBuilder(); } else alert("コードを読み取れません"); };
$("codeCopy").onclick=()=>copyText(encodeDeck(draft),"コードをコピーしました");
$("urlCopy").onclick=()=>copyText(location.origin+location.pathname+"?d="+encodeDeck(draft),"URLをコピーしました");
function copyText(t,msg){ (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>alert(msg)).catch(()=>prompt("コピーしてください",t)); }
$("imgInput").onchange=e=>{ const files=[...e.target.files]; if(!files.length) return; let done=0;
  files.forEach((f,i)=>{const r=new FileReader();r.onload=()=>{ if(CARD_POOL[i])CARD_POOL[i].img=r.result; USE_IMG=true; if(++done===files.length){ renderDeckBuilder(); } };r.readAsDataURL(f);}); };

/* 対戦画面 */
$("endBtn").onclick=endTurn;
$("stalemateBtn").onclick=stalemate;
$("logBtn").onclick=()=>$("logPanel").classList.toggle("on");
$("gvClose").onclick=closeGrave;
$("graveOv").onclick=e=>{ if(e.target.id==="graveOv") closeGrave(); };
$("overlay").onclick=e=>{ if(e.target.id==="overlay") closeOverlay(); };
$("rematchBtn").onclick=()=>{ $("modal").classList.remove("on"); newGame(); };
$("mTitle").onclick=()=>{ $("modal").classList.remove("on"); refreshTitle(); showScreen("Title"); };
document.querySelectorAll("[data-life]").forEach(b=>{b.onclick=()=>{const[pid,d]=b.dataset.life.split(",");setLife(pid,parseInt(d,10));};});

/* 起動 */
(function sndUI(){ const b=$("sndBtn"); if(!b) return;
  function sync(){ $("sfxToggle").textContent=Snd.isSfx()?"ON":"OFF"; $("sfxToggle").classList.toggle("on",Snd.isSfx());
    $("url_self0").value=SND_URLS.self[0]||""; $("url_self1").value=SND_URLS.self[1]||""; $("url_opp0").value=SND_URLS.opp[0]||""; $("url_opp1").value=SND_URLS.opp[1]||""; }
  b.onclick=()=>{ Snd.resume(); $("sndPanel").classList.toggle("on"); sync(); updateMatUI(); };
  $("sndClose").onclick=()=>$("sndPanel").classList.remove("on");
  $("sfxToggle").onclick=()=>{ Snd.play("click"); Snd.setSfx(!Snd.isSfx()); sync(); };
  $("urlSave").onclick=()=>{ SND_URLS={self:[$("url_self0").value.trim(),$("url_self1").value.trim()],opp:[$("url_opp0").value.trim(),$("url_opp1").value.trim()]}; try{localStorage.setItem("kk_urls",JSON.stringify(SND_URLS));}catch(e){} renderSoundButtons(); $("sndPanel").classList.remove("on"); };
  sync(); renderSoundButtons(); applyMats();
  const _syncMat=()=>{ if(NET.active){ if(NET.isHost) hostBroadcastMats(); else { const c=NET.conns[0]; if(c&&c.open) try{ c.send({t:"matUpdate",mat:{img:MY_MAT,adj:MY_MAT_ADJ}}); }catch(e){} } } };
  const ai=$("areaInput"); if(ai) ai.onchange=()=>readImg(ai,(u)=>{ MY_MAT=u; MY_MAT_ADJ={s:1,x:0,y:0}; try{localStorage.setItem("kk_area",u);}catch(e){} saveAdj(); applyMats(); updateMatUI(); _syncMat(); });
  const mc=$("matClear"); if(mc) mc.onclick=()=>{ MY_MAT=""; MY_MAT_ADJ={s:1,x:0,y:0}; try{localStorage.removeItem("kk_area");localStorage.removeItem("kk_area_adj");}catch(e){} applyMats(); updateMatUI(); _syncMat(); };
  const ed=$("matEdit"); let _drag=null;
  const liveMat=()=>{ const im=$("matEditImg"); if(im) im.style.transform=matAdjStr(MY_MAT_ADJ); applyMats(); };
  const commitMat=()=>{ saveAdj(); applyMats(); _syncMat(); };
  if(ed){ ed.addEventListener("pointerdown",e=>{ if(!MY_MAT) return; _drag={x:e.clientX,y:e.clientY}; try{ed.setPointerCapture(e.pointerId);}catch(_){} });
    ed.addEventListener("pointermove",e=>{ if(!_drag) return; const r=ed.getBoundingClientRect(); MY_MAT_ADJ.x=(MY_MAT_ADJ.x||0)+(e.clientX-_drag.x)/r.width*100; MY_MAT_ADJ.y=(MY_MAT_ADJ.y||0)+(e.clientY-_drag.y)/r.height*100; _drag={x:e.clientX,y:e.clientY}; liveMat(); });
    ed.addEventListener("pointerup",()=>{ if(_drag){ _drag=null; commitMat(); } });
    ed.addEventListener("pointercancel",()=>{ if(_drag){ _drag=null; commitMat(); } }); }
  const zm=$("matZoom"); if(zm){ zm.oninput=()=>{ MY_MAT_ADJ.s=parseFloat(zm.value)||1; liveMat(); }; zm.onchange=commitMat; }
  const mr=$("matReset"); if(mr) mr.onclick=()=>{ MY_MAT_ADJ={s:1,x:0,y:0}; if(zm) zm.value=1; liveMat(); commitMat(); };
})();
(function probeImg(){ const im=new Image(); im.onload=()=>{USE_IMG=true; try{if(state)render();}catch(e){} if($("screenDeck").classList.contains("on")) renderDeckBuilder();}; im.onerror=()=>{USE_IMG=false;}; im.src=IMG_BASE+"card_000.png"; })();
(function init(){
  try{ const code=new URLSearchParams(location.search).get("d"); if(code){ const o=decodeDeck(code); if(o&&deckValid(o)){ setActiveDeck(o,"URL共有デッキ"); } } }catch(e){}
  refreshTitle(); showScreen("Title");
})();
