
const socket = io();
let roomId = "";
let name = "";
let isFacilitator = false;
let hand = [];
let selectedCardIds = new Set();
let finalSelectionMode = false;
let evaluationMode = false;
let MAX_TURNS = 3;
let currentTurn = 1;

document.addEventListener("DOMContentLoaded", () => {
  const drawNewBtn = document.getElementById("drawNewBtn");
  if (drawNewBtn) {
    drawNewBtn.addEventListener("click", () => {
      console.log("📤 drawNewCard emit", roomId);
      socket.emit("drawNewCard", { roomId });
      drawNewBtn.disabled = true;
      hideDrawOptions();
    });
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
  name = document.getElementById("adminName").value || "ファシリテーター";
  roomId = document.getElementById("roomId").value || "1";
  MAX_TURNS = parseInt(document.getElementById("turns").value || "3");
  const maxPlayers = parseInt(document.getElementById("players").value || "2");
  socket.emit("joinRoom", { name, roomId, isFacilitator: true });
  socket.emit("startGame", { roomId, maxTurns: MAX_TURNS });
  document.getElementById("adminSetup").style.display = "none";
}

function joinGame() {
  resetState();
  name = document.getElementById("playerName").value || "プレイヤー";
  console.log("📤 joinRoom emit:", name, roomId);
  socket.emit("joinRoom", { name, roomId, isFacilitator: false });
  document.getElementById("playerJoin").style.display = "none";
}

socket.on("cards", (newHand) => {
  console.log("📥 カード配布を受信:", newHand);
  hand = newHand;
  selectedCardIds.clear();
  renderHand();
  document.getElementById("discardBtn").style.display = "inline-block";
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
  renderEvaluation();
});

socket.on("stateUpdate", (state) => {
  console.log("📥 stateUpdate 受信:", state);
});

function renderHand() {
  const handDiv = document.getElementById("hand");
  const infoDiv = document.getElementById("turnInfo");
  handDiv.innerHTML = "";
  infoDiv.textContent = evaluationMode
    ? "▶ 残った3枚に価値の強度（1〜10）をつけてください"
    : finalSelectionMode
    ? "▶ 5枚から2枚を選んで捨ててください"
    : `▶ ターン ${currentTurn} / ${MAX_TURNS}`;

  hand.forEach((cardId) => {
    const img = document.createElement("img");
    img.src = `cards/card_${String(cardId).padStart(3, "0")}.png`;
    img.className = "card";
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
}

function handleDiscard() {
  if (evaluationMode) return;
  if (finalSelectionMode && selectedCardIds.size === 2) {
    socket.emit("finalDiscard", { roomId, cardIds: [...selectedCardIds] });
    document.getElementById("discardBtn").style.display = "none";
  } else if (!finalSelectionMode && selectedCardIds.size === 1) {
    const cardId = [...selectedCardIds][0];
    socket.emit("discardCard", { roomId, cardId });
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

  hand.forEach((cardId) => {
    const container = document.createElement("div");
    container.style.margin = "10px";

    const img = document.createElement("img");
    img.src = `cards/card_${String(cardId).padStart(3, "0")}.png`;
    img.className = "card";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = 1;
    slider.max = 10;
    slider.value = 1;
    slider.oninput = () => {
      socket.emit("updateSlider", { roomId, cardId, value: parseInt(slider.value) });
    };

    container.appendChild(img);
    container.appendChild(slider);
    handDiv.appendChild(container);
  });
}

// 補充ボタン表示
function showDrawOptions() {
  document.getElementById("drawButtons").style.display = "block";
}

function hideDrawOptions() {
  document.getElementById("drawButtons").style.display = "none";
}

// stateUpdate で捨て札も描画
socket.on("stateUpdate", (state) => {
  console.log("📥 stateUpdate 受信:", state);
  currentTurn = state.currentTurn;
  maxTurns = state.maxTurns;
  renderTrash(state.discardedCards);
});

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

    if (hand.length === 5 && currentTurn > maxTurns) {
      // STEP4（最終選別）に入ったら捨て場カードを無効化
      img.style.opacity = 0.2;
      img.style.cursor = "not-allowed";
      img.onclick = null;
    } else if (hand.length < 6) {
      img.style.opacity = 0.5;
      img.style.cursor = "pointer";
      img.onclick = () => {
        socket.emit("drawFromTrash", { roomId, cardId });
        hideDrawOptions();
      };
    } else {
      img.style.opacity = 0.2;
      img.style.cursor = "not-allowed";
    }

    trashDiv.appendChild(img);
  });
}



