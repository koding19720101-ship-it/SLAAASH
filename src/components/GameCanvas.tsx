"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { sfx } from "../utils/audio";

interface GameCanvasProps {
  equippedSkin: string;
  playerName: string;
  roomId: string;               // The partykit room ID (= matchmaking lobby ID)
  yourSide: "p1" | "p2";       // Which side you are
  opponentName: string;
  onGameEnd: (winner: "p1" | "p2", timeSeconds: number) => void;
  onOpponentLeft: () => void;
}

// Skins Definition
export const SKINS_DATA: Record<
  string,
  { name: string; color: string; trailColor: string; lengthBonus: number; width: number }
> = {
  shinai: { name: "죽도", color: "#d2b48c", trailColor: "rgba(210, 180, 140, 0.4)", lengthBonus: 0, width: 3 },
  cherry: { name: "벚꽃 검", color: "#ffb7c5", trailColor: "rgba(255, 183, 197, 0.5)", lengthBonus: 10, width: 4 },
  dark: { name: "흑도", color: "#1a1a24", trailColor: "rgba(255, 50, 50, 0.4)", lengthBonus: 15, width: 4.5 },
  laser: { name: "광선검", color: "#00ff88", trailColor: "rgba(0, 255, 136, 0.6)", lengthBonus: 20, width: 6 },
  legendary: { name: "전설의 명검", color: "#ffb700", trailColor: "rgba(255, 220, 0, 0.6)", lengthBonus: 30, width: 7 },
};

const getPartyKitHost = () => {
  if (typeof window !== "undefined") {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "localhost:1999";
    }
  }
  return process.env.NEXT_PUBLIC_PARTYKIT_HOST || "slaaash-game.YOUR_ACCOUNT.partykit.dev";
};

export default function GameCanvas({
  equippedSkin,
  playerName,
  roomId,
  yourSide,
  opponentName,
  onGameEnd,
  onOpponentLeft,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const socketRef = useRef<any>(null);
  const [p1Instability, setP1Instability] = useState(0);
  const [p2Instability, setP2Instability] = useState(0);

  const handleOpponentLeft = useCallback(onOpponentLeft, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    const skinInfo = SKINS_DATA[equippedSkin] || SKINS_DATA.shinai;
    const groundY = 480;

    // Async init for dynamic PartySocket import
    let socketCleanup: (() => void) | null = null;

    const initGame = async () => {
      const { default: PartySocket } = await import("partysocket");

    // ─── Input ────────────────────────────────────────────────────────────────
    const keys: Record<string, boolean> = {};
    const onKeyDown = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = true;
      if (e.key === "Shift") keys["shift"] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = false;
      if (e.key === "Shift") keys["shift"] = false;
    };
    const onMouseDown = () => { keys["click"] = true; };
    const onMouseUp = () => { keys["click"] = false; };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);

    // ─── Screen Shake ─────────────────────────────────────────────────────────
    let shakeIntensity = 0;
    const triggerShake = (v: number) => { shakeIntensity = v; };

    // ─── Characters ───────────────────────────────────────────────────────────
    // me = local player (P1 or P2 logically, always drawn as left or right)
    const isP1 = yourSide === "p1";

    const me = {
      x: isP1 ? 200 : 780,
      y: groundY - 80,
      vx: 0, vy: 0,
      width: 40, height: 80,
      isGrounded: true,
      facingLeft: !isP1,
      color: isP1 ? "#ff3b3f" : "#00e5ff",
      isBlocking: false, instability: 0, isGroggy: false, groggyTimer: 0,
      isAttacking: false, attackCooldown: 0, attackProgress: 0, attackDuration: 12,
      dashCooldown: 0, dashTimer: 0,
    };

    // opponent – state comes from server
    const opp = {
      x: isP1 ? 780 : 200,
      y: groundY - 80,
      vx: 0, vy: 0,
      width: 40, height: 80,
      isGrounded: true,
      facingLeft: isP1,
      color: isP1 ? "#00e5ff" : "#ff3b3f",
      isBlocking: false, instability: 0, isGroggy: false, groggyTimer: 0,
      isAttacking: false, attackCooldown: 0, attackProgress: 0, attackDuration: 12,
    };

    // ─── Particles ────────────────────────────────────────────────────────────
    interface Particle { x:number; y:number; vx:number; vy:number; color:string; size:number; life:number; maxLife:number; }
    interface CherryPetal { x:number; y:number; speedX:number; speedY:number; angle:number; spinSpeed:number; size:number; }
    const particles: Particle[] = [];
    const cherryPetals: CherryPetal[] = Array.from({ length: 40 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      speedX: -1 - Math.random() * 2, speedY: 0.5 + Math.random() * 1.5,
      angle: Math.random() * Math.PI * 2, spinSpeed: -0.02 + Math.random() * 0.04,
      size: 4 + Math.random() * 6,
    }));

    const createSparks = (x: number, y: number, color: string) => {
      for (let i = 0; i < 15; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.6) * 10 - 2, color, size: 2 + Math.random() * 3, life: 0, maxLife: 20 + Math.random() * 20 });
    };
    const createBlood = (x: number, y: number) => {
      for (let i = 0; i < 20; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.7) * 8 - 2, color: "#ff1122", size: 3 + Math.random() * 4, life: 0, maxLife: 30 + Math.random() * 15 });
    };

    // ─── Game State ───────────────────────────────────────────────────────────
    let roundEnded = false;
    const startTime = Date.now();

    // ─── WebSocket ────────────────────────────────────────────────────────────
    const socket = new PartySocket({ host: getPartyKitHost(), room: roomId });
    socketRef.current = socket;

    socket.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);

      if (msg.type === "opponent_state") {
        opp.x = msg.x;
        opp.y = msg.y;
        opp.vx = msg.vx;
        opp.vy = msg.vy;
        opp.facingLeft = msg.facingLeft;
        opp.isAttacking = msg.isAttacking;
        opp.attackProgress = msg.attackProgress;
        opp.isBlocking = msg.isBlocking;
        opp.isGroggy = msg.isGroggy;
        opp.instability = msg.instability;
      }

      if (msg.type === "opponent_event") {
        if (msg.event === "clash") {
          sfx.playClash();
          triggerShake(5);
          createSparks(
            (me.x + opp.x) / 2,
            (me.y + opp.y) / 2 + 20,
            "#ffffff"
          );
        }
        if (msg.event === "death") {
          // Opponent says I died
          createBlood(me.x + me.width / 2, me.y + me.height / 3);
          triggerShake(20);
          roundEnded = true;
          sfx.playLose();
          const winTime = (Date.now() - startTime) / 1000;
          setTimeout(() => onGameEnd(isP1 ? "p2" : "p1", winTime), 800);
        }
      }

      if (msg.type === "opponent_left") {
        handleOpponentLeft();
      }
    };

    // ─── Send my state to server ~60fps ───────────────────────────────────────
    let sendTick = 0;
    const sendState = () => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({
        type: "state",
        x: me.x, y: me.y, vx: me.vx, vy: me.vy,
        facingLeft: me.facingLeft,
        isAttacking: me.isAttacking,
        attackProgress: me.attackProgress,
        isBlocking: me.isBlocking,
        isGroggy: me.isGroggy,
        instability: me.instability,
      }));
    };

    // ─── Hit Detection (local authority on MY attacks) ───────────────────────
    const detectHit = () => {
      if (!me.isAttacking || roundEnded) return;
      const reach = 85 + skinInfo.lengthBonus;
      const swordX = me.facingLeft ? me.x - reach : me.x + me.width;
      const swordBox = { x: swordX, y: me.y + 10, w: reach, h: me.height - 10 };
      const oppBox = { x: opp.x, y: opp.y, w: opp.width, h: opp.height };

      const overlapping =
        swordBox.x < oppBox.x + oppBox.w &&
        swordBox.x + swordBox.w > oppBox.x &&
        swordBox.y < oppBox.y + oppBox.h &&
        swordBox.y + swordBox.h > oppBox.y;

      if (overlapping && me.attackProgress > 0.1 && me.attackProgress < 0.6) {
        if (opp.isBlocking) {
          // Clash – notify opponent
          opp.instability = Math.min(100, opp.instability + 22);
          me.isAttacking = false;
          createSparks(opp.facingLeft ? opp.x : opp.x + opp.width, me.y + 35, "#ffffff");
          sfx.playClash();
          triggerShake(5);
          socket.send(JSON.stringify({ type: "event", event: "clash", targetId: "" }));
        } else {
          // Kill – notify opponent of their death
          createBlood(opp.x + opp.width / 2, opp.y + opp.height / 3);
          triggerShake(20);
          roundEnded = true;
          sfx.playWin();
          socket.send(JSON.stringify({ type: "event", event: "death", targetId: "" }));
          const winTime = (Date.now() - startTime) / 1000;
          setTimeout(() => onGameEnd(isP1 ? "p1" : "p2", winTime), 800);
        }
      }
    };

    // ─── Main Render Loop ─────────────────────────────────────────────────────
    const tick = () => {
      ctx.save();
      if (shakeIntensity > 0) {
        ctx.translate((Math.random() - 0.5) * shakeIntensity, (Math.random() - 0.5) * shakeIntensity);
        shakeIntensity *= 0.85;
        if (shakeIntensity < 0.5) shakeIntensity = 0;
      }

      // Background
      ctx.fillStyle = "#0c0c16";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Moon
      ctx.fillStyle = "#fff5e6";
      ctx.shadowColor = "rgba(255, 230, 180, 0.4)";
      ctx.shadowBlur = 80;
      ctx.beginPath();
      ctx.arc(canvas.width / 2, 180, 120, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Silhouette
      ctx.fillStyle = "#06060c";
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(200, 320); ctx.lineTo(450, 420); ctx.lineTo(700, 290); ctx.lineTo(1024, groundY);
      ctx.closePath();
      ctx.fill();

      // Ground
      ctx.fillStyle = "#11111d";
      ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
      ctx.fillStyle = "#ff3b3f";
      ctx.fillRect(0, groundY, canvas.width, 4);

      // Cherry petals
      ctx.fillStyle = "rgba(255, 182, 193, 0.7)";
      cherryPetals.forEach((p) => {
        p.x += p.speedX; p.y += p.speedY; p.angle += p.spinSpeed;
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.y > canvas.height) { p.y = -10; p.x = Math.random() * canvas.width; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.angle);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size / 1.5);
        ctx.restore();
      });

      // ── Local player (me) logic ──
      if (!roundEnded) {
        me.vx = 0;
        if (keys["a"] || keys["ㅁ"]) { me.vx = -5; me.facingLeft = true; }
        if (keys["d"] || keys["ㅇ"]) { me.vx = 5; me.facingLeft = false; }

        me.isBlocking = (keys["f"] || keys["ㄹ"]) && !me.isGroggy;

        if (keys["click"] && me.attackCooldown <= 0 && !me.isBlocking && !me.isGroggy) {
          me.isAttacking = true; me.attackProgress = 0; me.attackCooldown = 35;
          sfx.playSlash();
        }
      }

      // Physics (No vertical movement or dash)
      me.x += me.vx;
      me.x = Math.max(0, Math.min(canvas.width - me.width, me.x));
      if (me.attackCooldown > 0) me.attackCooldown--;

      if (me.isAttacking) {
        me.attackProgress += 1 / me.attackDuration;
        if (me.attackProgress >= 1) { me.isAttacking = false; me.attackProgress = 0; }
      }

      // Guard instability
      if (me.isBlocking) {
        me.instability = Math.min(100, me.instability + 1.2);
        if (me.instability >= 100) {
          me.isGroggy = true; me.groggyTimer = 90; me.isBlocking = false;
          sfx.playBreak(); triggerShake(12);
        }
      } else if (me.isGroggy) {
        me.groggyTimer--;
        if (me.groggyTimer <= 0) { me.isGroggy = false; me.instability = 0; }
      } else {
        me.instability = Math.max(0, me.instability - 0.4);
      }

      // Send state every 2 frames
      sendTick++;
      if (sendTick % 2 === 0) sendState();

      // Hit detection (I check if MY sword hits opponent)
      detectHit();

      // ── Sword Rendering Helper ──
      const drawSword = (
        char: {
          x: number;
          y: number;
          width: number;
          height: number;
          facingLeft: boolean;
          isAttacking: boolean;
          attackProgress: number;
          isBlocking: boolean;
          isGroggy: boolean;
        },
        sColor: string,
        sWidth: number,
        sLengthBonus: number,
        tColor: string
      ) => {
        const handX = char.facingLeft ? char.x + 8 : char.x + char.width - 8;
        const handY = char.y + char.height / 2 + 5;
        const sLen = 60 + sLengthBonus;
        let ang = 0;

        if (char.isGroggy) {
          ang = Math.PI / 2; // Pointing down
        } else if (char.isAttacking) {
          // Horizontal Slash (가로 베기)
          const startAng = char.facingLeft ? Math.PI - 1.2 : -1.2;
          const endAng = char.facingLeft ? Math.PI + 1.2 : 1.2;
          ang = startAng + char.attackProgress * (endAng - startAng);
        } else if (char.isBlocking) {
          // Blocking: sword held vertically in front
          ang = char.facingLeft ? -Math.PI / 2 - 0.2 : -Math.PI / 2 + 0.2;
        } else {
          // Idle ready stance (breathing bob)
          const bob = Math.sin(Date.now() / 200) * 0.05;
          ang = char.facingLeft ? -Math.PI * 0.75 + bob : -Math.PI * 0.25 + bob;
        }

        const endX = handX + Math.cos(ang) * sLen;
        const endY = handY + Math.sin(ang) * sLen;

        // Draw attack trail
        if (char.isAttacking && char.attackProgress > 0.05) {
          ctx.strokeStyle = tColor;
          ctx.lineWidth = sWidth * 2.0;
          ctx.beginPath();
          const startAng = char.facingLeft ? Math.PI - 1.2 : -1.2;
          ctx.arc(handX, handY, sLen, startAng, ang, char.facingLeft);
          ctx.stroke();
        }

        // Draw guard
        ctx.strokeStyle = "#2a2a2a";
        ctx.lineWidth = sWidth + 2;
        ctx.beginPath();
        const guardAng = ang + Math.PI / 2;
        const guardLen = 8;
        ctx.moveTo(handX + Math.cos(guardAng) * guardLen, handY + Math.sin(guardAng) * guardLen);
        ctx.lineTo(handX - Math.cos(guardAng) * guardLen, handY - Math.sin(guardAng) * guardLen);
        ctx.stroke();

        // Draw blade
        ctx.strokeStyle = sColor;
        ctx.lineWidth = sWidth;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(handX, handY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Extra glow when blocking
        if (char.isBlocking) {
          ctx.strokeStyle = char.facingLeft ? "rgba(255, 59, 63, 0.45)" : "rgba(0, 229, 255, 0.45)";
          ctx.lineWidth = sWidth + 6;
          ctx.beginPath();
          ctx.moveTo(handX, handY);
          ctx.lineTo(endX, endY);
          ctx.stroke();

          // Subtle shield crescent near the sword
          ctx.strokeStyle = char.facingLeft ? "rgba(255, 59, 63, 0.2)" : "rgba(0, 229, 255, 0.2)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(handX, handY, sLen + 10, -Math.PI / 2 - 0.4, -Math.PI / 2 + 0.4);
          ctx.stroke();
        }
      };

      // ── Render Me ──
      ctx.fillStyle = me.isGroggy ? (isP1 ? "#553333" : "#333355") : me.color;
      ctx.fillRect(me.x, me.y, me.width, me.height);
      drawSword(me, skinInfo.color, skinInfo.width, skinInfo.lengthBonus, skinInfo.trailColor);

      // ── Render Opponent ──
      ctx.fillStyle = opp.isGroggy ? (isP1 ? "#333355" : "#553333") : opp.color;
      ctx.fillRect(opp.x, opp.y, opp.width, opp.height);
      drawSword(opp, opp.color, 3, 0, opp.color + "66");

      // Name tags
      ctx.font = "bold 13px Outfit, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = me.color;
      ctx.fillText(playerName, me.x + me.width / 2, me.y - 10);
      ctx.fillStyle = opp.color;
      ctx.fillText(opponentName, opp.x + opp.width / 2, opp.y - 10);

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life++;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
        if (p.life >= p.maxLife) particles.splice(i, 1);
      }

      // Sync instability to HUD
      if (isP1) { setP1Instability(Math.round(me.instability)); setP2Instability(Math.round(opp.instability)); }
      else { setP1Instability(Math.round(opp.instability)); setP2Instability(Math.round(me.instability)); }

      ctx.restore();
      animationFrameId = requestAnimationFrame(tick);
    };

      tick();

      // Store cleanup
      socketCleanup = () => {
        cancelAnimationFrame(animationFrameId);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        window.removeEventListener("mousedown", onMouseDown);
        window.removeEventListener("mouseup", onMouseUp);
        socket.close();
      };
    }; // end initGame

    initGame();

    return () => {
      if (socketCleanup) socketCleanup();
    };
  }, [equippedSkin, roomId, yourSide]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        width={1024}
        height={576}
        className="w-full h-full block rounded-xl border border-[rgba(255,255,255,0.06)] shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
      />
      <div className="absolute top-6 left-12 right-12 flex justify-between pointer-events-none z-10 font-mono">
        <div className="flex flex-col gap-1 w-52">
          <div className="flex justify-between text-xs font-bold tracking-widest text-[#ff3b3f]">
            <span>P1 POSTURE</span><span>{p1Instability}%</span>
          </div>
          <div className="h-2 w-full bg-[rgba(255,255,255,0.1)] rounded-full overflow-hidden border border-[rgba(255,59,63,0.2)]">
            <div className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-75" style={{ width: `${p1Instability}%` }} />
          </div>
          {p1Instability >= 100 && <span className="text-[10px] text-red-500 font-bold tracking-widest animate-pulse mt-0.5">★ 가드 해제 (GROGGY)</span>}
        </div>
        <div className="flex flex-col gap-1 w-52 items-end">
          <div className="flex justify-between w-full text-xs font-bold tracking-widest text-[#00e5ff]">
            <span>{p2Instability}%</span><span>P2 POSTURE</span>
          </div>
          <div className="h-2 w-full bg-[rgba(255,255,255,0.1)] rounded-full overflow-hidden border border-[rgba(0,229,255,0.2)]">
            <div className="h-full bg-gradient-to-l from-cyan-500 to-cyan-300 transition-all duration-75 float-right" style={{ width: `${p2Instability}%` }} />
          </div>
          {p2Instability >= 100 && <span className="text-[10px] text-cyan-400 font-bold tracking-widest animate-pulse mt-0.5">★ 가드 해제 (GROGGY)</span>}
        </div>
      </div>
    </div>
  );
}
