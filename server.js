const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;

// Nombre exacto del archivo de tu juego
const GAME = path.join(__dirname, "Space_Battle_X_online.html");

const rooms = new Map();

const server = http.createServer((req, res) => {
  // Página del juego
  if (req.url === "/" || req.url === "/Space_Battle_X_online.html") {
    fs.createReadStream(GAME).pipe(res);
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

const wss = new WebSocket.Server({ server });

function broadcast(room) {
  const players = {};

  for (const p of room.values()) {
    players[p.id] = {
      id: p.id,
      name: p.name,
      ship: p.ship,
      x: p.x,
      y: p.y,
      score: p.score
    };
  }

  for (const p of room.values()) {
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(JSON.stringify({
        type: "players",
        players: players
      }));
    }
  }
}

wss.on("connection", (ws) => {
  let player = null;

  ws.on("message", (raw) => {
    let m;

    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }

    // Entrar a una sala online
    if (m.type === "join") {
      const roomId = String(m.room || "PUBLIC").slice(0, 12);

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Map());
      }

      const room = rooms.get(roomId);

      const id = Math.random()
        .toString(36)
        .slice(2, 10);

      player = {
        id: id,
        ws: ws,
        room: roomId,
        name: String(m.name || "Jugador").slice(0, 16),
        ship: Number(m.ship) || 0,
        x: Number(m.x) || 210,
        y: Number(m.y) || 560,
        score: Number(m.score) || 0
      };

      room.set(id, player);

      broadcast(room);
    }

    // Actualizar posición del jugador
    else if (m.type === "update" && player) {
      player.x = Math.max(
        20,
        Math.min(400, Number(m.x) || 210)
      );

      player.y = Math.max(
        20,
        Math.min(620, Number(m.y) || 560)
      );

      player.ship = Math.max(
        0,
        Math.min(4, Number(m.ship) || 0)
      );

      player.name = String(
        m.name || player.name
      ).slice(0, 16);

      player.score = Number(m.score) || 0;

      const room = rooms.get(player.room);

      if (room) {
        broadcast(room);
      }
    }
  });

  // Cuando un jugador se desconecta
  ws.on("close", () => {
    if (player && rooms.has(player.room)) {
      const room = rooms.get(player.room);

      room.delete(player.id);

      broadcast(room);

      if (room.size === 0) {
        rooms.delete(player.room);
      }
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Space Battle X Online iniciado en el puerto ${PORT}`
  );
});
