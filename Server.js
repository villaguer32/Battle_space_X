const http = require("http");
const { WebSocketServer } = require("ws");

const port = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Battle Space X Online funcionando");
});

const wss = new WebSocketServer({ server });

const rooms = new Map();

wss.on("connection", (ws) => {
  let currentRoom = null;
  let playerId = Math.random().toString(36).substring(2, 10);

  ws.send(JSON.stringify({
    type: "connected",
    id: playerId
  }));

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message.toString());

      if (data.type === "join") {
        currentRoom = data.room || "principal";

        if (!rooms.has(currentRoom)) {
          rooms.set(currentRoom, new Map());
        }

        rooms.get(currentRoom).set(playerId, {
          id: playerId,
          name: data.name || "Jugador",
          x: data.x || 210,
          y: data.y || 500,
          ship: data.ship || 0
        });

        broadcastRoom(currentRoom, {
          type: "players",
          players: Array.from(rooms.get(currentRoom).values())
        });
      }

      if (data.type === "move" && currentRoom && rooms.has(currentRoom)) {
        const player = rooms.get(currentRoom).get(playerId);

        if (player) {
          player.x = data.x;
          player.y = data.y;
          player.ship = data.ship;

          broadcastRoom(currentRoom, {
            type: "playerMove",
            player
          }, ws);
        }
      }

    } catch (error) {
      console.log("Mensaje inválido");
    }
  });

  ws.on("close", () => {
    if (currentRoom && rooms.has(currentRoom)) {
      rooms.get(currentRoom).delete(playerId);

      broadcastRoom(currentRoom, {
        type: "playerLeft",
        id: playerId
      });

      if (rooms.get(currentRoom).size === 0) {
        rooms.delete(currentRoom);
      }
    }
  });
});

function broadcastRoom(roomName, data, except = null) {
  if (!rooms.has(roomName)) return;

  const message = JSON.stringify(data);

  for (const ws of wss.clients) {
    if (
      ws !== except &&
      ws.readyState === ws.OPEN
    ) {
      ws.send(message);
    }
  }
}

server.listen(port, "0.0.0.0", () => {
  console.log(`Battle Space X Online iniciado en puerto ${port}`);
});
