import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, updateDoc, onSnapshot, arrayUnion, arrayRemove, runTransaction } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ★ お前のConfig（埋め込み済み） ★
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

// 効果音（もし音が気に入らなければ、好きなmp3のURLに変えるか、GitHubにmp3を上げてファイル名を書け）
const screamAudio = new Audio('https://www.soundjay.com/human/sounds/scream-01.mp3'); 
const startAudio = new Audio('https://www.soundjay.com/buttons/sounds/button-3.mp3'); 

// ★音のロック解除用関数（ここが修正ポイント）★
function unlockAudio() {
    // 一瞬だけ再生してすぐに止めることで、ブラウザに「音出していいよ」と許可させる
    screamAudio.play().then(() => {
        screamAudio.pause();
        screamAudio.currentTime = 0;
    }).catch(e => console.log("Audio unlock failed", e));

    startAudio.play().then(() => {
        startAudio.pause();
        startAudio.currentTime = 0;
    }).catch(e => console.log("Start audio unlock failed", e));
}

// 状態変数
let roomCode = "";
// ユニークIDと名前を組み合わせる "名前|ID" の形式にする
let myUniqueId = Date.now().toString(36) + Math.random().toString(36).substr(2);
let myFullName = ""; 
let isTouching = false;
let currentStatus = "lobby"; 

// DOM要素
const ui = {
    lobby: document.getElementById("lobby-screen"),
    game: document.getElementById("game-screen"),
    result: document.getElementById("result-screen"),
    nameInput: document.getElementById("username-input"),
    codeInput: document.getElementById("room-code-input"),
    msg: document.getElementById("status-message"),
    tofu: document.getElementById("tofu-img"),
    area: document.getElementById("game-area")
};

// --- イベントリスナー ---
// ボタンを押した瞬間に「音のロック解除」を実行する
document.getElementById("create-btn").onclick = async () => {
    unlockAudio(); // ★ここでロック解除
    await createRoom();
};
document.getElementById("join-btn").onclick = async () => {
    unlockAudio(); // ★ここでロック解除
    await joinRoom();
};
document.getElementById("to-ready-btn").onclick = async () => {
    unlockAudio(); // ★念の為ここでも
    await goToReady();
};

// --- クリップボードコピー機能 ---
window.copyRoomCode = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode).then(() => {
        const tooltip = document.getElementById("copy-tooltip");
        tooltip.classList.add("show");
        setTimeout(() => tooltip.classList.remove("show"), 2000);
    }).catch(err => console.error(err));
};

// --- ヘルパー関数: 名前|ID から 名前だけ取り出す ---
function getName(fullName) {
    return fullName.split('|')[0] || "名無し";
}

// --- 部屋作成・参加ロジック ---
async function createRoom() {
    const name = ui.nameInput.value.trim();
    if (!name) return alert("名前を入力してくれ！");
    myFullName = `${name}|${myUniqueId}`; 

    roomCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    await setDoc(doc(db, "rooms", roomCode), {
        status: "waiting",
        members: [myFullName],
        readyPlayers: [], 
        traitor: ""
    });
    showWaitingUI();
}

async function joinRoom() {
    const name = ui.nameInput.value.trim();
    if (!name) return alert("名前を入力してくれ！");
    myFullName = `${name}|${myUniqueId}`;

    roomCode = ui.codeInput.value;
    if(!roomCode || roomCode.length !== 6) return alert("6桁のコードを入れろ");
    
    await updateDoc(doc(db, "rooms", roomCode), {
        members: arrayUnion(myFullName)
    });
    showWaitingUI();
}

function showWaitingUI() {
    document.getElementById("setup-ui").style.display = "none";
    document.getElementById("waiting-ui").classList.remove("hidden");
    document.getElementById("room-display").innerText = roomCode;
    startListening();
}

// --- リアルタイム監視 ---
function startListening() {
    onSnapshot(doc(db, "rooms", roomCode), (docSnap) => {
        const data = docSnap.data();
        if (!data) return;

        // メンバーリスト更新
        const count = data.members.length;
        document.getElementById("member-count").innerText = count;
        document.getElementById("total-count").innerText = count;
        document.getElementById("ready-count").innerText = data.readyPlayers.length;

        // 名前リストを表示
        const listEl = document.getElementById("member-names-list");
        listEl.innerHTML = "";
        data.members.forEach(m => {
            const li = document.createElement("li");
            li.textContent = "👤 " + getName(m);
            listEl.appendChild(li);
        });

        // 画面遷移：準備フェーズ
        if (data.status === "ready_check" && currentStatus !== "ready_check") {
            currentStatus = "ready_check";
            ui.lobby.classList.add("hidden");
            ui.game.classList.remove("hidden");
            ui.msg.innerText = "全員、豆腐に指を置け";
            ui.msg.style.color = "black";
            isTouching = false; 
            ui.area.classList.remove("touching");
            unlockAudio(); // 念押しでここでも許可を求める
        }

        // 画面遷移：ゲーム開始
        if (data.status === "playing" && currentStatus !== "playing") {
            currentStatus = "playing";
            ui.msg.innerText = "🔥🔥 離したら死ぬ 🔥🔥";
            ui.msg.style.color = "red";
            startAudio.play().catch(e => console.log("Start sound error", e));
            if (navigator.vibrate) navigator.vibrate(200);
        }

        // 画面遷移：死亡（戦犯の名前を表示）
        if (data.status === "dead" && currentStatus !== "dead") {
            currentStatus = "dead";
            document.body.classList.add("flash");
            
            // ★ここで叫ぶ
            screamAudio.play().catch(e => {
                console.log("Scream error", e);
                alert("ギャアアアア！（※iPhoneのマナーモードを解除しないと音が出ないぞ！）");
            });
            
            ui.game.classList.add("hidden");
            ui.result.classList.remove("hidden");
            document.getElementById("traitor-name").innerText = "戦犯：" + getName(data.traitor);
            
            if (navigator.vibrate) navigator.vibrate([100,50,100,50,500]);
        }
        
        // ホストによる自動スタート処理
        if (currentStatus === "ready_check" && 
            data.readyPlayers.length === data.members.length && 
            data.members.length > 0 &&
            data.members[0] === myFullName) {
            startGameTrigger();
        }
    });
}

async function goToReady() {
    await updateDoc(doc(db, "rooms", roomCode), { 
        status: "ready_check",
        readyPlayers: [] 
    });
}

async function startGameTrigger() {
    await updateDoc(doc(db, "rooms", roomCode), { status: "playing" });
}

// --- トランザクション付き死亡判定 ---
async function triggerDeath() {
    const roomRef = doc(db, "rooms", roomCode);
    try {
        await runTransaction(db, async (transaction) => {
            const sfDoc = await transaction.get(roomRef);
            if (!sfDoc.exists()) throw "Error!";

            if (sfDoc.data().status === "playing") {
                transaction.update(roomRef, { 
                    status: "dead", 
                    traitor: myFullName 
                });
            }
        });
    } catch (e) {
        console.log("Transaction logic: safe");
    }
}

// --- タッチ操作ロジック ---
const startEvents = ["touchstart", "mousedown"];
const endEvents = ["touchend", "mouseup", "mouseleave"];

startEvents.forEach(evt => {
    ui.tofu.addEventListener(evt, async (e) => {
        e.preventDefault();
        if (isTouching) return;
        
        // ★タッチした瞬間にも念の為ロック解除（iOS対策）
        if(currentStatus !== "playing") unlockAudio(); 

        isTouching = true;
        ui.area.classList.add("touching");

        if (currentStatus === "ready_check") {
            await updateDoc(doc(db, "rooms", roomCode), {
                readyPlayers: arrayUnion(myFullName)
            });
        }
    }, { passive: false });
});

endEvents.forEach(evt => {
    document.addEventListener(evt, async (e) => {
        if (!isTouching) return;

        isTouching = false;
        ui.area.classList.remove("touching");

        if (currentStatus === "ready_check") {
            await updateDoc(doc(db, "rooms", roomCode), {
                readyPlayers: arrayRemove(myFullName)
            });
        }

        if (currentStatus === "playing") {
            await triggerDeath();
        }
    });
});
