const express = require("express");
const app = express();
const http = require("http").Server(app);
const io = require("socket.io")(http);
const path = require("path");

const PORT = process.env.PORT || 3000;
const allowedRooms = new Set();
const allCardIds = Array.from({ length: 101 }, (_, i) => i + 1);
const rooms = {};

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  const roomId = req.query.id;
  if (!roomId) {
    return res.status(404).send("❌ 不正なアクセスです");
  }
  if (roomId === "admin") {
    return res.sendFile(path.join(__dirname, "public", "index.html"));
  }
  if (allowedRooms.has(roomId)) {
    return res.sendFile(path.join(__dirname, "public", "index.html"));
  }
  return res.status(404).send("❌ 不明なルームIDです");
});

app.get("*", (req, res, next) => {
  const roomId = req.query.id;
  if (!roomId) return res.status(404).send("❌ id が指定されていません");
  if (roomId !== "admin" && !allowedRooms.has(roomId)) {
    return res.status(404).send("❌ このルームはまだ開始されていません");
  }
  next();
});

http.listen(PORT, () => console.log("✅ Server running on port", PORT));
io.on("connection", (socket) => {
  console.log('✅ ユーザー接続:', socket.id);

  socket.on("joinRoom", ({ name, roomId, isFacilitator }) => {
    console.log('joinRoom:isFacilitator:', isFacilitator);
    if (!isFacilitator && !allowedRooms.has(roomId)) {
      console.log("❌ 拒否: ルームが未開始", roomId);
      socket.emit("errorMessage", "このルームはまだ開始されていません。");
      return;
    }

    socket.join(roomId);
    socket.data = { name, roomId, isFacilitator };

    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: {},
        usedCardIds: new Set(),
        maxTurns: 0,
      };
    }

    rooms[roomId].players[socket.id] = {
      name,
      hand: [],
      discarded: [],
      sliderValues: {},
      currentTurn: 1,
    };

    if (allowedRooms.has(roomId) && rooms[roomId].maxTurns > 0) {
      const hand = getUniqueCards(rooms[roomId].usedCardIds, 6);
      rooms[roomId].players[socket.id].hand = hand;
      io.to(socket.id).emit("cards", hand);
    }

    broadcastState(roomId);
  });

  socket.on("startGame", ({ roomId, maxTurns }) => {
    allowedRooms.add(roomId);
    const room = rooms[roomId];
    if (!room) return;

    room.maxTurns = maxTurns;
    room.usedCardIds = new Set();

    Object.keys(room.players).forEach((playerId) => {
      const hand = getUniqueCards(room.usedCardIds, 6);
      room.players[playerId].hand = hand;
      io.to(playerId).emit("cards", hand);
    });

    broadcastState(roomId);
  });

  socket.on("discardCard", ({ roomId, cardId }) => {
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players[socket.id];
    if (!player) return;

    player.hand = player.hand.filter((id) => id !== cardId);
    player.discarded.push(cardId);

    io.to(socket.id).emit("cards", player.hand);

    if (player.hand.length === 5) {
      player.currentTurn++;
      if (player.currentTurn > room.maxTurns) {
        io.to(socket.id).emit("finalSelection", player.hand);
      }
    }

    broadcastState(roomId);
  });

  socket.on("finalDiscard", ({ roomId, cardIds }) => {
    const room = rooms[roomId];
    if (!room || !room.players[socket.id]) return;
    const player = room.players[socket.id];

    player.hand = player.hand.filter(id => !cardIds.includes(id));
    player.discarded.push(...cardIds);
    io.to(socket.id).emit("startEvaluation", player.hand);
    broadcastState(roomId);
  });

  socket.on("updateSlider", ({ roomId, cardId, value }) => {
    const room = rooms[roomId];
    if (!room || !room.players[socket.id]) return;

    room.players[socket.id].sliderValues[cardId] = value;
    broadcastState(roomId);
  });

  socket.on("drawFromTrash", ({ roomId, cardId }) => {
    const room = rooms[roomId];
    if (!room || !room.players[socket.id]) return;

    const owner = Object.values(room.players).find(p => p.discarded.includes(cardId));
    if (!owner) {
      socket.emit("errorMessage", "そのカードは捨て場に存在しません");
      return;
    }

    owner.discarded = owner.discarded.filter(id => id !== cardId);
    room.players[socket.id].hand.push(cardId);

    io.to(socket.id).emit("cards", room.players[socket.id].hand);
    broadcastState(roomId);
  });

  socket.on("drawNewCard", ({ roomId }) => {
    console.log("🟢 drawNewCard 受信:", socket.id, "roomId:", roomId);
    const room = rooms[roomId];
    if (!room || !room.players[socket.id]) return;

    const newCards = getUniqueCards(room.usedCardIds, 1);
    if (newCards.length === 0) {
      socket.emit("errorMessage", "もう新しいカードは残っていません。");
      return;
    }

   /* const newCard = newCards[0];
    room.players[socket.id].hand.push(newCard);
    io.to(socket.id).emit("cards", room.players[socket.id].hand);
    broadcastState(roomId);
    // ✅ ここが追加ポイント
    io.to(roomId).emit("stateUpdate", getRoomState(roomId, cardId));*/
    const newCardId = newCards[0]; // ✅ 変数名を明示
    room.players[socket.id].hand.push(newCardId);

    io.to(socket.id).emit("cards", room.players[socket.id].hand);

    // ✅ 修正：正しい変数を渡す
    io.to(roomId).emit("stateUpdate", getRoomState(roomId, newCardId));
  });

  socket.on("resetRoom", ({ roomId }) => {
    console.log("🔁 ルームリセット要求:", roomId);

    // 対象ルームを削除
    delete rooms[roomId];
    allowedRooms.delete(roomId);

    // そのルームの全員に初期化指示
    io.to(roomId).emit("forceReset");
  });

  socket.on("disconnect", () => {
    const roomId = socket.data?.roomId;
    if (!roomId || !rooms[roomId]) return;
    delete rooms[roomId].players[socket.id];

    if (Object.keys(rooms[roomId].players).length === 0) {
      delete rooms[roomId];
      allowedRooms.delete(roomId);
      console.log("🧹 ルーム削除（無人）:", roomId);
    } else {
      broadcastState(roomId);
    }
  });
});

function getUniqueCards(usedSet, count) {
  const available = allCardIds.filter(id => !usedSet.has(id));
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, count);
  selected.forEach(id => usedSet.add(id));
  return selected;
}

function broadcastState(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const state = {
    playerHands: {},
    discardedCards: {},
    playerSliders: {},
    playerNames: {},
    playerTurns: {},
    currentTurn: room.currentTurn,
    maxTurns: room.maxTurns
  };

  Object.entries(room.players).forEach(([id, data]) => {
    state.playerHands[id] = data.hand;
    state.discardedCards[id] = data.discarded;
    state.playerSliders[id] = data.sliderValues;
    state.playerNames[id] = data.name;
    state.playerTurns[id] = data.currentTurn;
  });

  io.to(roomId).emit("stateUpdate", state);
}

function getRoomState(roomId, newlyDrawnCard = null) {
  const room = rooms[roomId];
  const state = {
    currentTurn: room.currentTurn,
    maxTurns: room.maxTurns,
    playerHands: {},
    discardedCards: {},
    playerNames: {},
    playerSliders: {},
    newlyDrawnCard, // ✅ 追加
  };

  for (const [socketId, player] of Object.entries(room.players)) {
    state.playerHands[socketId] = player.hand;
    state.discardedCards[socketId] = player.discarded;
    state.playerNames[socketId] = player.name;
    state.playerSliders[socketId] = player.sliderValues;
  }

  return state;
}

