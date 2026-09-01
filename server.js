const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const GAME = path.join(__dirname, "Space_Battle_X_online.html");
const rooms = new Map();

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function players(room) {
  const out = {};

  for (const p of room.values()) {
    out[p.id] = {
      id: p.id,
      name: p.name,
      ship: p.ship,
      x: p.x,
      y: p.y,
      score: p.score,
      hp: p.hp,
      maxHp: p.maxHp
    };
  }

  return out;
}

function broadcast(room) {
  const ps = players(room);

  for (const p of room.values()) {
    send(p.ws, {
      type: "players",
      players: ps
    });
  }
}

function confirmJoin(room) {
  const ps = players(room);

  for (const p of room.values()) {
    const data = {
      ok: true,
      playerId: p.id,
      room: p.room,
      players: ps
    };

    send(p.ws, { type: "joined", ...data });
    send(p.ws, { type: "room_joined", ...data });
    send(p.ws, { type: "join_ok", ...data });
    send(p.ws, { type: "room", ...data });
  }
}

const server = http.createServer((req, res) => {

  if (
    req.url === "/" ||
    req.url === "/Space_Battle_X_online.html"
  ) {
    if (!fs.existsSync(GAME)) {
      res.writeHead(500, {
        "Content-Type": "text/plain"
      });

      return res.end(
        "Falta Space_Battle_X_online.html"
      );
    }

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    });

    return fs.createReadStream(GAME).pipe(res);
  }

  if (req.url === "/health") {
    res.writeHead(200, {
      "Content-Type": "text/plain"
    });

    return res.end(
      "OK - Space Battle X Online"
    );
  }

  res.writeHead(404);
  res.end("Not found");
});

const wss = new WebSocket.Server({
  server
});

wss.on("connection", ws => {

  let player = null;

  send(ws, {
    type: "connected",
    ok: true
  });

  ws.on("message", raw => {

    let m;

    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }

    /* =========================
       ENTRAR EN SALA
       ========================= */

    if (m.type === "join") {

      if (player) {
        const room = rooms.get(player.room);

        if (room) {
          confirmJoin(room);
        }

        return;
      }

      const roomId =
        String(m.room || "PUBLIC")
          .trim()
          .slice(0, 20) || "PUBLIC";

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Map());
      }

      const room = rooms.get(roomId);

      if (room.size >= 2) {
        return send(ws, {
          type: "room_full",
          ok: false,
          room: roomId
        });
      }

      const id =
        Math.random()
          .toString(36)
          .slice(2, 10);

      player = {
        id,
        ws,
        room: roomId,

        name:
          String(m.name || "Jugador")
            .slice(0, 16),

        ship:
          Number(m.ship) || 0,

        x: 210,

        y:
          room.size === 0
            ? 560
            : 100,

        score: 0,

        maxHp: 100,
        hp: 100
      };

      room.set(id, player);

      confirmJoin(room);
      broadcast(room);

      /* Cuando hay 2 jugadores */
      if (room.size === 2) {

        const ps = players(room);

        for (const p of room.values()) {

          send(p.ws, {
            type: "game_start",
            ok: true,
            players: ps
          });

          send(p.ws, {
            type: "start_game",
            ok: true,
            players: ps
          });
        }
      }

      return;
    }

    /* =========================
       PING
       ========================= */

    if (m.type === "ping") {
      return send(ws, {
        type: "pong",
        time: Date.now()
      });
    }

    if (!player) return;

    /* =========================
       ACTUALIZAR JUGADOR
       ========================= */

    if (m.type === "update") {

      player.x = Math.max(
        20,
        Math.min(
          400,
          Number(m.x) || player.x
        )
      );

      player.y = Math.max(
        20,
        Math.min(
          620,
          Number(m.y) || player.y
        )
      );

      if (m.ship !== undefined) {
        player.ship = Math.max(
          0,
          Math.min(
            4,
            Number(m.ship) || 0
          )
        );
      }

      if (m.name !== undefined) {
        player.name =
          String(
            m.name || player.name
          ).slice(0, 16);
      }

      if (m.score !== undefined) {
        player.score =
          Number(m.score) || 0;
      }

      if (m.hp !== undefined) {
        player.hp = Math.max(
          0,
          Math.min(
            player.maxHp,
            Number(m.hp) || 0
          )
        );
      }

      const room =
        rooms.get(player.room);

      if (room) {
        broadcast(room);
      }

      return;
    }

    /* =========================
       DISPAROS
       ========================= */

    if (
      m.type === "shoot" ||
      m.type === "bullet"
    ) {

      const room =
        rooms.get(player.room);

      if (!room) return;

      const shot = {

        type: "shoot",

        playerId: player.id,

        x:
          Number(m.x) || player.x,

        y:
          Number(m.y) || player.y,

        vx:
          Number(m.vx) || 0,

        vy:
          Number(m.vy) || 0,

        damage:
          Math.max(
            1,
            Math.min(
              50,
              Number(m.damage) || 10
            )
          )
      };

      for (const p of room.values()) {

        if (p.id !== player.id) {
          send(p.ws, shot);
        }
      }

      return;
    }

    /* =========================
       DAÑO
       ========================= */

    if (
      m.type === "hit" ||
      m.type === "damage"
    ) {

      const room =
        rooms.get(player.room);

      if (!room) return;

      const target =
        room.get(
          String(m.targetId || "")
        );

      if (
        !target ||
        target.id === player.id
      ) {
        return;
      }

      const damage =
        Math.max(
          1,
          Math.min(
            50,
            Number(m.damage) || 10
          )
        );

      target.hp =
        Math.max(
          0,
          target.hp - damage
        );

      broadcast(room);

      /* Jugador derrotado */
      if (target.hp <= 0) {

        player.score++;

        send(target.ws, {
          type: "defeated",
          winnerId: player.id
        });

        send(player.ws, {
          type: "victory",
          loserId: target.id
        });

        setTimeout(() => {

          const r =
            rooms.get(player.room);

          if (!r) return;

          for (const p of r.values()) {

            p.hp = p.maxHp;

            p.y =
              p.id === player.id
                ? 560
                : 100;

            p.x = 210;
          }

          broadcast(r);

        }, 1200);
      }
    }
  });

  /* =========================
     DESCONECTAR
     ========================= */

  ws.on("close", () => {

    if (!player) return;

    const room =
      rooms.get(player.room);

    if (room) {

      room.delete(player.id);

      broadcast(room);

      if (room.size === 0) {
        rooms.delete(player.room);
      }
    }

    player = null;
  });
});

/* =========================
   INICIAR SERVIDOR
   ========================= */

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "Space Battle X Online iniciado en el puerto " +
      PORT
    );
  }
);
