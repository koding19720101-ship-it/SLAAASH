import type * as Party from "partykit/server";

// Message types for game communication
export type MsgType =
  | { type: "join"; name: string }
  | { type: "state"; x: number; y: number; vx: number; vy: number; facingLeft: boolean; isAttacking: boolean; attackProgress: number; isBlocking: boolean; isGroggy: boolean; instability: number }
  | { type: "event"; event: "hit" | "death" | "clash"; targetId: string }
  | { type: "matched"; opponentName: string; yourSide: "p1" | "p2"; roomId: string }
  | { type: "opponent_state"; x: number; y: number; vx: number; vy: number; facingLeft: boolean; isAttacking: boolean; attackProgress: number; isBlocking: boolean; isGroggy: boolean; instability: number }
  | { type: "opponent_event"; event: "hit" | "death" | "clash" }
  | { type: "opponent_left" }
  | { type: "waiting" };

interface PlayerInfo {
  id: string;
  name: string;
  conn: Party.Connection;
  side: "p1" | "p2";
}

export default class GameRoom implements Party.Server {
  players: Map<string, PlayerInfo> = new Map();

  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    // No-op: wait for join message
  }

  onMessage(message: string, sender: Party.Connection) {
    let msg: MsgType;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    if (msg.type === "join") {
      const alreadyInRoom = this.players.get(sender.id);
      if (alreadyInRoom) return;

      const playerCount = this.players.size;
      if (playerCount >= 2) {
        // Room is full
        sender.send(JSON.stringify({ type: "waiting" }));
        return;
      }

      const side: "p1" | "p2" = playerCount === 0 ? "p1" : "p2";

      this.players.set(sender.id, {
        id: sender.id,
        name: msg.name,
        conn: sender,
        side,
      });

      if (this.players.size === 2) {
        // Both players connected – start the match
        const playerList = Array.from(this.players.values());
        const [p1, p2] = playerList[0].side === "p1" ? [playerList[0], playerList[1]] : [playerList[1], playerList[0]];

        p1.conn.send(JSON.stringify({ type: "matched", opponentName: p2.name, yourSide: "p1", roomId: this.room.id }));
        p2.conn.send(JSON.stringify({ type: "matched", opponentName: p1.name, yourSide: "p2", roomId: this.room.id }));
      } else {
        // First player is waiting
        sender.send(JSON.stringify({ type: "waiting" }));
      }
      return;
    }

    // Relay state & event messages to the opponent
    const sender_info = this.players.get(sender.id);
    if (!sender_info) return;

    for (const [id, player] of this.players) {
      if (id !== sender.id) {
        if (msg.type === "state") {
          player.conn.send(JSON.stringify({
            type: "opponent_state",
            x: msg.x,
            y: msg.y,
            vx: msg.vx,
            vy: msg.vy,
            facingLeft: msg.facingLeft,
            isAttacking: msg.isAttacking,
            attackProgress: msg.attackProgress,
            isBlocking: msg.isBlocking,
            isGroggy: msg.isGroggy,
            instability: msg.instability,
          }));
        } else if (msg.type === "event") {
          player.conn.send(JSON.stringify({ type: "opponent_event", event: msg.event }));
        }
      }
    }
  }

  onClose(conn: Party.Connection) {
    this.players.delete(conn.id);
    // Notify remaining player that opponent left
    for (const [, player] of this.players) {
      player.conn.send(JSON.stringify({ type: "opponent_left" }));
    }
  }

  onError(conn: Party.Connection, err: Error) {
    this.players.delete(conn.id);
  }
}

GameRoom satisfies Party.Worker;
