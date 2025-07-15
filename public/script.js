
const socket = io();
let roomId = "";
let name = "";
let isFacilitator = false;
let hand = [];
let selectedCardIds = new Set();
let finalSelectionMode = false;
let evaluationMode = false;
let currentState = null;

//クライアント（script.js）でハードコードされがち	定数として使われるケース多い
let MAX_TURNS = 3;
let currentTurn = 1;
//サーバーから送られる動的な値	ファシリテーター設定によって変化	state.maxTurns で受信
//let maxTurns = 3;
//グローバルで手札の履歴を記憶
let previousHand = [];
let newCard = null; // 最初は null

document.addEventListener("DOMContentLoaded", () => {

  const drawNewBtn = document.getElementById("drawNewBtn");
  if (drawNewBtn) {
    console.log("取得 DOMContentLoaded1 drawNewBtn:",drawNewBtn);
    drawNewBtn.addEventListener("click", () => {
      console.log("取得 drawNewCard emit", roomId);
      socket.emit("drawNewCard", { roomId });
      //drawNewBtn.disabled = true;
      hideDrawOptions();
    });
  }else{
    console.log("取得 DOMContentLoaded2 drawNewBtn:",drawNewBtn);
  }
  const params = new URLSearchParams(window.location.search);
  roomId = params.get("id") || "";
  isFacilitator = roomId === "admin";

  if (isFacilitator) {
    document.getElementById("adminSetup").style.display = "block";
    document.getElementById("startBtn").addEventListener("click", startGame);
  } else {
    document.getElementById("playerJoin").style.display = "block";
    document.getElementById("joinBtn").addEventListener("click", joinGame);
  }

  document.getElementById("discardBtn").addEventListener("click", handleDiscard);
});

socket.on("connect", () => {
  console.log("🧩 クライアントID:", socket.id);
});

function resetState() {
  hand = [];
  selectedCardIds.clear();
  finalSelectionMode = false;
  evaluationMode = false;
  currentTurn = 1;
}

function startGame() {
  resetState();
  //console.log("📤 startGame:");
  name = document.getElementById("adminName").value || "ファシリテーター";
  roomId = document.getElementById("roomId").value || "1";
  MAX_TURNS = parseInt(document.getElementById("turns").value || "3");
  
  //console.log("startGame MAX_TURNS:",MAX_TURNS);
  
  const maxPlayers = parseInt(document.getElementById("players").value || "2");
  socket.emit("joinRoom", { name, roomId, isFacilitator: true });
  socket.emit("startGame", { roomId, maxTurns: MAX_TURNS });
  document.getElementById("adminSetup").style.display = "none";
}

function joinGame() {
  resetState();
  name = document.getElementById("playerName").value || "プレイヤー";
  console.log("📤 joinGame emit:", name, roomId);
  socket.emit("joinRoom", { name, roomId, isFacilitator: false });
  document.getElementById("playerJoin").style.display = "none";
}

socket.on("cards", (newHand) => {
  console.log("📥 カード配布を受信:", newHand);
  hand = newHand;
  selectedCardIds.clear();
  renderHand();
  
  console.log("socket.on_cards:", hand.length , currentTurn , MAX_TURNS);
  const discardBtn = document.getElementById("discardBtn");
  if (hand.length <= 5) {
    if(currentTurn >= MAX_TURNS || MAX_TURNS != 0){
      discardBtn.style.display = "none";
      //console.log("🟥cards1 discardBtn を非表示にしました");
    }else{
      discardBtn.style.display = "inline-block";
      //console.log("🟥cards1 discardBtn を表示しました");
    }     
  }else{    
    if (currentTurn < MAX_TURNS) {
      discardBtn.style.display = "none";
      //console.log("🟥cards2 discardBtn を非表示にしました");
    }else{
      discardBtn.style.display = "inline-block";
      //console.log("🟥cards2 discardBtn を表示しました");
    }
  }
});

socket.on("finalSelection", (finalHand) => {
  finalSelectionMode = true;
  hand = finalHand;
  selectedCardIds.clear();
  renderHand();
});

socket.on("startEvaluation", (final3) => {
  evaluationMode = true;
  hand = final3;
  selectedCardIds.clear();
  if (currentState && currentState.playerHands && socket.id) {
    currentState.playerHands[socket.id] = final3;
  }
  renderEvaluation();
});


socket.on("forceReset", () => {
  location.reload(); // 全員トップ画面へ戻る
});


// stateUpdate で捨て札も描画
socket.on("stateUpdate", (state) => {
  currentState = state;
  if (evaluationMode) {
    document.body.classList.add("evaluation-mode");
    renderEvaluation();
  } else {
    document.body.classList.remove("evaluation-mode");
  }
  
  //console.log("📥 stateUpdate 受信:", state);
  let currentTurn = state.currentTurn; // ← ローカル変数として再宣言
  
  //console.log("socket.on_stateUpdate:", hand.length , currentTurn , MAX_TURNS);
  
  
  currentTurn = state.currentTurn;
  //maxTurns = state.maxTurns;
  //MAX_TURNS = state.maxTurns;  // or maxTurns
  renderTrash(state.discardedCards);
  
  //
  const discardBtn = document.getElementById("discardBtn");
  if (hand.length <= 5) {
    if(currentTurn >= MAX_TURNS || MAX_TURNS != 0){
      discardBtn.style.display = "none";
      //console.log("🟥stateUpdate1 discardBtn を非表示にしました");
    }else{
      discardBtn.style.display = "inline-block";
      //console.log("🟥stateUpdate1 discardBtn を表示しました");
    }     
  }else{    
    if (currentTurn < MAX_TURNS) {
      discardBtn.style.display = "none";
      //console.log("🟥stateUpdate2 discardBtn を非表示にしました");
    }else{
      discardBtn.style.display = "inline-block";
      //console.log("🟥stateUpdate2 discardBtn を表示しました");
    }
  }
  //他プレイヤーのカード表示
  renderOtherPlayers(state); // ←これが必要
  // どのカードが新規追加されたかを特定
  newCard = state.newlyDrawnCard || null;
});


currentTurn

function renderHand() {
  const handDiv = document.getElementById("hand");
  const infoDiv = document.getElementById("turnInfo");
  handDiv.innerHTML = "";
  infoDiv.textContent = evaluationMode
    ? "▶ 残った3枚に価値の強度（1〜10）をつけてください"
    : finalSelectionMode
    ? "▶ 5枚から2枚を選んで捨ててください"
    : `▶ ターン ${currentTurn} / ${MAX_TURNS}`;
  //console.log("renderHand:", MAX_TURNS , currentTurn);
  hand.forEach((cardId) => {
    const img = document.createElement("img");
    img.src = `cards/card_${String(cardId).padStart(3, "0")}.png`;
    // ✅ アニメーションを付加
    img.className = "card";
    if (cardId === newCard) {
      img.classList.add("newly-drawn");
      setTimeout(() => img.classList.remove("newly-drawn"), 400);
    }
  
    if (selectedCardIds.has(cardId)) img.classList.add("selected");
    img.onclick = () => {
      if (evaluationMode) return;
      if (finalSelectionMode) {
        if (selectedCardIds.has(cardId)) {
          selectedCardIds.delete(cardId);
        } else if (selectedCardIds.size < 2) {
          selectedCardIds.add(cardId);
        }
      } else {
        selectedCardIds.clear();
        selectedCardIds.add(cardId);
      }
      renderHand();
    };
    handDiv.appendChild(img);
  });
  
  // 250711追加 start
  const drawBtn = document.getElementById("drawNewBtn");
  const discardBtn = document.getElementById("discardBtn");
  
  if (evaluationMode || finalSelectionMode) {
    console.log("📥 renderHand 1:", finalSelectionMode , evaluationMode, currentTurn);  
    drawBtn.style.display = "none";
    discardBtn.style.display = "inline-block";
  } else if (currentTurn === MAX_TURNS) {
    // ✅ 最終ターン中
    if (hand.length === 6) {
      console.log("📥 renderHand 2:", finalSelectionMode , evaluationMode, currentTurn);
      // カードを取得した直後
      drawBtn.style.display = "none";
      discardBtn.style.display = "inline-block";
    } else if (hand.length === 5) {
      console.log("📥 renderHand 3:", finalSelectionMode , evaluationMode, currentTurn);
      // 捨てたあと
      drawBtn.style.display = "inline-block";
      discardBtn.style.display = "inline-block";
    }
  } else {
    console.log("📥 renderHand 4:", finalSelectionMode , evaluationMode, currentTurn);
    // 通常ターン
    drawBtn.style.display = "inline-block";
    discardBtn.style.display = hand.length > 4 ? "inline-block" : "none";
  }
  // 250711追加 end

  
}

function handleDiscard() {
  if (evaluationMode) return;
  if (finalSelectionMode && selectedCardIds.size === 2) {
    socket.emit("finalDiscard", { roomId, cardIds: [...selectedCardIds] });
    document.getElementById("discardBtn").style.display = "none";
  } else if (!finalSelectionMode && selectedCardIds.size === 1) {
    const cardId = [...selectedCardIds][0];
    socket.emit("discardCard", { roomId, cardId });
    // 通常ターンで捨てたあとに手札が5枚になる場合、ボタンを非表示にする
    console.log("handleDiscard_1:", hand.length - 1 , currentTurn , MAX_TURNS);

    /*if (hand.length - 1 === 5 && currentTurn <= MAX_TURNS) {
      console.log("通常ターンで捨てたあと捨てるボタン非表示2:", hand.length - 1 , currentTurn , MAX_TURNS);
      const discardBtn = document.getElementById("discardBtn");
      if (discardBtn) {
        discardBtn.style.display = "none";
        console.log("🟥 discardBtn を非表示にしました");
        //exit;
      }
    }*/
    showDrawOptions();
    selectedCardIds.clear();
    if (currentTurn < MAX_TURNS) currentTurn++;
  } else {
    alert(finalSelectionMode ? "2枚選んでください" : "1枚選んでください");
  }
}

function renderEvaluation() {
  const handDiv = document.getElementById("hand");
  const infoDiv = document.getElementById("turnInfo");
  handDiv.innerHTML = "";
  infoDiv.textContent = "▶ 残った3枚に価値の強度（1〜10）をつけてください";

  if (!currentState || !currentState.playerHands) return;

  // 🔁 自分のIDを先に表示するようソート
  const sortedEntries = Object.entries(currentState.playerHands).sort(([idA], [idB]) => {
    if (idA === socket.id) return -1;
    if (idB === socket.id) return 1;
    return 0;
  });

  sortedEntries.forEach(([id, cards]) => {
    const group = document.createElement("div");
    group.className = "slider-group";

    const nameTag = document.createElement("div");
    nameTag.textContent = currentState.playerNames?.[id] || "プレイヤー";
    nameTag.style.fontWeight = "bold";
    group.appendChild(nameTag);

    cards.forEach((cardId) => {
      const wrapper = document.createElement("div");
      wrapper.className = "slider-wrapper";

      const img = document.createElement("img");
      img.src = `cards/card_${String(cardId).padStart(3, "0")}.png`;
      img.className = "card";
      wrapper.appendChild(img);

      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = 1;
      slider.max = 10;
      slider.value = currentState.playerSliders?.[id]?.[cardId] || 5;

      // ✅ 数値ラベルを表示
      const valueLabel = document.createElement("div");
      valueLabel.textContent = slider.value;
      valueLabel.style.marginTop = "4px";
      valueLabel.style.fontSize = "14px";
      valueLabel.style.fontWeight = "bold";

      if (id !== socket.id) {
        slider.disabled = true;
        slider.style.opacity = 0.5;
      } else {
        slider.oninput = function () {
          const val = parseInt(this.value);
          valueLabel.textContent = val;
          socket.emit("updateSlider", { roomId, cardId, value: val });

          const percent = ((val - 1) / 9) * 100;
          this.style.background =
            "linear-gradient(to right, #3399ff " + percent + "%, #88ccff " + percent + "%)";
        };
      }

      wrapper.appendChild(slider);
      wrapper.appendChild(valueLabel);
      group.appendChild(wrapper);
    });

    handDiv.appendChild(group);
  });
  
  if (isFacilitator && evaluationMode) {
    const resetBtn = document.createElement("button");
    resetBtn.textContent = "🔁 リセット";
    resetBtn.onclick = () => {
      socket.emit("resetRoom", { roomId });
      location.reload(); // 自分自身もリロード
    };
    document.getElementById("hand").appendChild(resetBtn);
  }

}




// 補充ボタン表示
function showDrawOptions() {
  document.getElementById("drawButtons").style.display = "block";
}

function hideDrawOptions() {
  document.getElementById("drawButtons").style.display = "none";
}


// 捨て場表示
function renderTrash(discardedCards) {
  const trashDiv = document.getElementById("trashArea");
  trashDiv.innerHTML = "<h3>捨て場</h3>";
  const allCards = Object.values(discardedCards).flat();
  const uniqueCards = [...new Set(allCards)];

  uniqueCards.forEach((cardId) => {
    const img = document.createElement("img");
    img.src = `cards/card_${String(cardId).padStart(3, "0")}.png`;
    img.className = "card";

    if (hand.length === 5 && currentTurn > MAX_TURNS) {
      //console.log("🟥 renderTrash 1:", hand.length , currentTurn , maxTurns) ;

      // STEP4（最終選別）に入ったら捨て場カードを無効化
      img.style.opacity = 0.2;
      img.style.cursor = "not-allowed";
      img.onclick = null;
    } else if (hand.length < 6) {
      if (currentTurn > MAX_TURNS) {
        //console.log("🟥 renderTrash 2:", hand.length , currentTurn , maxTurns) ;
        img.style.opacity = 0.2;
        img.style.cursor = "not-allowed";
      }else{
        if (evaluationMode || finalSelectionMode) {
          //console.log("🟥 renderTrash 3:", hand.length , currentTurn , maxTurns, evaluationMode, finalSelectionMode) ;
          img.style.opacity = 0.2;
          img.style.cursor = "not-allowed";
          document.getElementById("trashArea").style.display = "none"; // ✅ 非表示
        }else{
          //console.log("🟥 renderTrash 4:", hand.length , currentTurn , maxTurns, evaluationMode, finalSelectionMode) ;
          img.style.opacity = 0.5;
          img.style.cursor = "pointer";
          img.onclick = () => {
            socket.emit("drawFromTrash", { roomId, cardId });
            hideDrawOptions();
          };
        }
      }
    } else {
      //console.log("🟥 renderTrash 5:", hand.length , currentTurn , maxTurns) ;
      img.style.opacity = 0.2;
      img.style.cursor = "not-allowed";
    }

    trashDiv.appendChild(img);
  });
}



function renderOtherPlayers() {
  const othersArea = document.getElementById("othersArea");
  if (!othersArea || !currentState || !currentState.playerHands) return;

  othersArea.innerHTML = "";

  Object.entries(currentState.playerHands).forEach(([id, cards]) => {
    if (id === socket.id) return;
    if (evaluationMode && currentState.playerSliders?.[id]) return;

    const nameTag = document.createElement("div");
    nameTag.textContent = currentState.playerNames?.[id] || "他プレイヤー";

    const container = document.createElement("div");
    container.className = "other-player-hand";
    container.appendChild(nameTag);

    cards.forEach((cardId) => {
      const img = document.createElement("img");
      img.src = `cards/card_${String(cardId).padStart(3, "0")}.png`;
      img.className = "card";
      img.style.opacity = 0.5;
      container.appendChild(img);
    });

    othersArea.appendChild(container);
  });
}

