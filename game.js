import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, arrayUnion, arrayRemove, deleteField } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

 // ★ここにFirebaseコンソールの設定をコピペせよ★
    const firebaseConfig = {
  apiKey: "AIzaSyDY8AWBkOS5H8ynYkODpogLl7SYoRF2JvY",
  authDomain: "tofu1-66cb7.firebaseapp.com",
  projectId: "tofu1-66cb7",
  storageBucket: "tofu1-66cb7.firebasestorage.app",
  messagingSenderId: "96663536524",
  appId: "1:96663536524:web:0de179a9ed218268598ca9",
  measurementId: "G-68E9Q4Y7FR"
};

// --- 初期化 ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 効果音
const screamAudio = new Audio('https://www.soundjay.com/human/sounds/scream-01.mp3'); 
const startAudio = new Audio('https://www.soundjay.com/buttons/sounds/button-3.mp3'); // ピッ！

// 状態変数
let roomCode = "";
let myId = "ID" + Math.floor(Math.random() * 100000); // 重複しないID
let myName = "User " + myId.slice(-4);
let isTouching = false;
let currentStatus = "lobby"; // lobby, ready_check, playing, dead

// DOM要素
const ui = {
    lobby: document.getElementById("lobby-screen"),
    game: document.getElementById("game-screen"),
    result: document.getElementById("result-screen"),
    input: document.getElementById("room-code-input"),
    msg: document.getElementById("status-message"),
    tofu: document.getElementById("tofu-img"),
    area: document.getElementById("game-area")
};

// --- イベントリスナー設定 ---
document.getElementById("create-btn").onclick = createRoom;
document.getElementById("join-btn").onclick = joinRoom;
document.getElementById("to-ready-btn").onclick = goToReady;

// --- 部屋作成・参加ロジック ---

async function createRoom() {
    roomCode = Math.floor(100000 + Math.random() * 900000).toString();
    await setDoc(doc(db, "rooms", roomCode), {
        status: "waiting",
        members: [myId],
        readyPlayers: [], // 準備完了した人のリスト
        traitor: ""
    });
    showWaitingUI();
}

async function joinRoom() {
    roomCode = ui.input.value;
    if(!roomCode || roomCode.length !== 6) return alert("6桁のコードを入れろ");
    
    // 参加登録
    await updateDoc(doc(db, "rooms", roomCode), {
        members: arrayUnion(myId)
    });
    showWaitingUI();
}

function showWaitingUI() {
    document.getElementById("setup-ui").style.display = "none";
    document.getElementById("waiting-ui").classList.remove("hidden");
    document.getElementById("room-display").innerText = "CODE: " + roomCode;
    
    // 監視開始
    startListening();
}

// --- リアルタイム監視 ---

function startListening() {
    onSnapshot(doc(db, "rooms", roomCode), (docSnap) => {
        const data = docSnap.data();
        if (!data) return;

        // メンバー数更新
        document.getElementById("member-count").innerText = data.members.length;
        document.getElementById("total-count").innerText = data.members.length;
        document.getElementById("ready-count").innerText = data.readyPlayers.length;

        // ステータス変更検知
        if (data.status === "ready_check" && currentStatus !== "ready_check") {
            // ゲーム画面へ移動（準備フェーズ）
            currentStatus = "ready_check";
            ui.lobby.classList.add("hidden");
            ui.game.classList.remove("hidden");
            ui.msg.innerText = "全員、豆腐に指を置け";
            ui.msg.style.color = "black";
        }

        if (data.status === "playing" && currentStatus !== "playing") {
            // ゲーム開始！
            currentStatus = "playing";
            ui.msg.innerText = "🔥🔥 離したら死ぬ 🔥🔥";
            ui.msg.style.color = "red";
            startAudio.play();
            // 振動
            if (navigator.vibrate) navigator.vibrate(200);
        }

        if (data.status === "dead" && currentStatus !== "dead") {
            // 死亡
            currentStatus = "dead";
            document.body.classList.add("flash");
            screamAudio.play();
            
            ui.game.classList.add("hidden");
            ui.result.classList.remove("hidden");
            document.getElementById("traitor-name").innerText = "戦犯：" + data.traitor;
            if (navigator.vibrate) navigator.vibrate([100,50,100,50,500]);
        }
        
        // 【ホスト役の自動処理】全員準備完了したらスタートさせる
        // ※競合を防ぐため、メンバーリストの先頭の人だけが実行権を持つことにする
        if (currentStatus === "ready_check" && 
            data.readyPlayers.length === data.members.length && 
            data.members[0] === myId) {
                
            startGameTrigger();
        }
    });
}

// ホストが「準備へ」ボタンを押した時
async function goToReady() {
    await updateDoc(doc(db, "rooms", roomCode), { 
        status: "ready_check",
        readyPlayers: [] // リセット
    });
}

// ゲーム開始トリガー（自動）
async function startGameTrigger() {
    await updateDoc(doc(db, "rooms", roomCode), { status: "playing" });
}

// --- タッチ操作ロジック ---

// PC/スマホ両対応イベント
const startEvents = ["touchstart", "mousedown"];
const endEvents = ["touchend", "mouseup", "mouseleave"];

startEvents.forEach(evt => {
    ui.tofu.addEventListener(evt, async (e) => {
        e.preventDefault(); // 拡大などを防ぐ
        if (isTouching) return; // 二重反応防止
        
        isTouching = true;
        ui.area.classList.add("touching");

        // 準備フェーズなら「準備OK」を送信
        if (currentStatus === "ready_check") {
            await updateDoc(doc(db, "rooms", roomCode), {
                readyPlayers: arrayUnion(myId)
            });
        }
    }, { passive: false });
});

endEvents.forEach(evt => {
    document.addEventListener(evt, async (e) => {
        if (!isTouching) return;

        isTouching = false;
        ui.area.classList.remove("touching");

        // 準備フェーズなら「キャンセル」を送信
        if (currentStatus === "ready_check") {
            await updateDoc(doc(db, "rooms", roomCode), {
                readyPlayers: arrayRemove(myId)
            });
        }

        // ゲーム中なら「死亡」確定
        if (currentStatus === "playing") {
            await updateDoc(doc(db, "rooms", roomCode), {
                status: "dead",
                traitor: myId
            });
        }
    });
});