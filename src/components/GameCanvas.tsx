"use client";

import React, { useEffect, useRef, useState } from "react";
import { sfx } from "../utils/audio";

interface GameCanvasProps {
  equippedSkin: string;
  difficulty: "easy" | "normal" | "hard";
  onGameEnd: (winner: "p1" | "p2", timeSeconds: number) => void;
  gameActive: boolean;
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

export default function GameCanvas({
  equippedSkin,
  difficulty,
  onGameEnd,
  gameActive,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Instability states (shared with UI or rendered on-canvas)
  const [p1Instability, setP1Instability] = useState(0);
  const [p2Instability, setP2Instability] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    // Keys state
    const keys: Record<string, boolean> = {};

    const handleKeyDown = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = true;
      if (e.key === "Shift") keys["shift"] = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = false;
      if (e.key === "Shift") keys["shift"] = false;
    };

    const handleMouseDown = () => {
      if (gameActive) keys["click"] = true;
    };

    const handleMouseUp = () => {
      keys["click"] = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);

    // Game variables
    const groundY = 480;
    const skinInfo = SKINS_DATA[equippedSkin] || SKINS_DATA.shinai;

    // Screen Shake state
    let shakeIntensity = 0;

    const triggerShake = (intensity: number) => {
      shakeIntensity = intensity;
    };

    // Characters
    const p1 = {
      x: 200,
      y: groundY - 80,
      vx: 0,
      vy: 0,
      width: 40,
      height: 80,
      isGrounded: true,
      facingLeft: false,
      color: "#ff3b3f",
      // Combat
      isBlocking: false,
      instability: 0,
      isGroggy: false,
      groggyTimer: 0,
      // Attack state
      isAttacking: false,
      attackCooldown: 0,
      attackProgress: 0, // 0 to 1
      attackDuration: 12, // frames
      // Dash
      dashCooldown: 0,
      dashTimer: 0,
    };

    const p2 = {
      x: 800,
      y: groundY - 80,
      vx: 0,
      vy: 0,
      width: 40,
      height: 80,
      isGrounded: true,
      facingLeft: true,
      color: "#00e5ff",
      // Combat
      isBlocking: false,
      instability: 0,
      isGroggy: false,
      groggyTimer: 0,
      // Attack state
      isAttacking: false,
      attackCooldown: 0,
      attackProgress: 0,
      attackDuration: 12,
      // Dash
      dashCooldown: 0,
      dashTimer: 0,
    };

    // Particles
    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: string;
      size: number;
      life: number;
      maxLife: number;
    }

    interface CherryPetal {
      x: number;
      y: number;
      speedX: number;
      speedY: number;
      angle: number;
      spinSpeed: number;
      size: number;
    }

    const particles: Particle[] = [];
    const cherryPetals: CherryPetal[] = Array.from({ length: 40 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      speedX: -1 - Math.random() * 2,
      speedY: 0.5 + Math.random() * 1.5,
      angle: Math.random() * Math.PI * 2,
      spinSpeed: -0.02 + Math.random() * 0.04,
      size: 4 + Math.random() * 6,
    }));

    const createSparks = (x: number, y: number, color: string) => {
      for (let i = 0; i < 15; i++) {
        particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 12,
          vy: (Math.random() - 0.6) * 10 - 2,
          color,
          size: 2 + Math.random() * 3,
          life: 0,
          maxLife: 20 + Math.random() * 20,
        });
      }
    };

    const createBlood = (x: number, y: number) => {
      for (let i = 0; i < 20; i++) {
        particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 10 + (p1.facingLeft ? -4 : 4),
          vy: (Math.random() - 0.7) * 8 - 2,
          color: "#ff1122",
          size: 3 + Math.random() * 4,
          life: 0,
          maxLife: 30 + Math.random() * 15,
        });
      }
    };

    let startTime = Date.now();
    let matchWinner: "p1" | "p2" | null = null;
    let roundEnded = false;

    // AI Logic Controller
    const updateAI = () => {
      if (roundEnded || !gameActive) return;

      const dist = Math.abs(p2.x - p1.x);
      const isPlayerAttacking = p1.isAttacking && p1.attackProgress < 0.6;

      // Reset block
      p2.isBlocking = false;

      // Handle AI Groggy
      if (p2.isGroggy) return;

      // AI attributes based on difficulty
      let rxTime = 0.95; // Attack probability scale
      let blockChance = 0.5;
      let dashChance = 0.01;

      if (difficulty === "easy") {
        rxTime = 0.5;
        blockChance = 0.1;
        dashChance = 0.002;
      } else if (difficulty === "hard") {
        rxTime = 0.99;
        blockChance = 0.85;
        dashChance = 0.05;
      }

      // 1. Defend / Parry logic
      if (isPlayerAttacking && dist < 160 && !p2.isGroggy) {
        if (Math.random() < blockChance && p2.instability < 90) {
          p2.isBlocking = true;
        }
      }

      // 2. Dash logic
      if (isPlayerAttacking && dist < 120 && Math.random() < dashChance && p2.dashCooldown <= 0) {
        p2.dashTimer = 8;
        p2.dashCooldown = 60;
        p2.vx = p2.facingLeft ? -15 : 15;
      }

      // 3. Movement & Attack logic
      p2.facingLeft = p1.x < p2.x;

      if (!p2.isBlocking && p2.dashTimer <= 0) {
        if (dist > 130 + skinInfo.lengthBonus) {
          // Approach player
          p2.vx = p2.facingLeft ? -4 : 4;
        } else if (dist < 80) {
          // Back off slightly
          p2.vx = p2.facingLeft ? 3 : -3;
        } else {
          p2.vx = 0;
          // Slash chance
          if (Math.random() < rxTime * 0.08 && p2.attackCooldown <= 0) {
            p2.isAttacking = true;
            p2.attackProgress = 0;
            p2.attackCooldown = 40;
            sfx.playSlash();
          }
        }
      }
    };

    // Main Game Loop
    const tick = () => {
      // 1. Screen Shake computation
      ctx.save();
      if (shakeIntensity > 0) {
        const dx = (Math.random() - 0.5) * shakeIntensity;
        const dy = (Math.random() - 0.5) * shakeIntensity;
        ctx.translate(dx, dy);
        shakeIntensity *= 0.85;
        if (shakeIntensity < 0.5) shakeIntensity = 0;
      }

      // Render Background
      ctx.fillStyle = "#0c0c16";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Render Giant Moon
      ctx.fillStyle = "#fff5e6";
      ctx.shadowColor = "rgba(255, 230, 180, 0.4)";
      ctx.shadowBlur = 80;
      ctx.beginPath();
      ctx.arc(canvas.width / 2, 180, 120, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0; // reset shadow

      // Silhouette mountains
      ctx.fillStyle = "#06060c";
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(200, 320);
      ctx.lineTo(450, 420);
      ctx.lineTo(700, 290);
      ctx.lineTo(1024, groundY);
      ctx.closePath();
      ctx.fill();

      // Render Ground
      ctx.fillStyle = "#11111d";
      ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
      ctx.fillStyle = "#ff3b3f";
      ctx.fillRect(0, groundY, canvas.width, 4);

      // Cherry Petals drift
      ctx.fillStyle = "rgba(255, 182, 193, 0.7)";
      cherryPetals.forEach((petal) => {
        petal.x += petal.speedX;
        petal.y += petal.speedY;
        petal.angle += petal.spinSpeed;
        if (petal.x < -10) petal.x = canvas.width + 10;
        if (petal.y > canvas.height) {
          petal.y = -10;
          petal.x = Math.random() * canvas.width;
        }

        ctx.save();
        ctx.translate(petal.x, petal.y);
        ctx.rotate(petal.angle);
        ctx.fillRect(-petal.size / 2, -petal.size / 2, petal.size, petal.size / 1.5);
        ctx.restore();
      });

      // Update Player 1 Mechanics
      if (!roundEnded && gameActive) {
        // Horizontal Movement
        p1.vx = 0;
        if (keys["a"] || keys["ㅁ"]) {
          p1.vx = -5;
          p1.facingLeft = true;
        }
        if (keys["d"] || keys["ㅇ"]) {
          p1.vx = 5;
          p1.facingLeft = false;
        }

        // Jump
        if ((keys["w"] || keys["ㅈ"]) && p1.isGrounded) {
          p1.vy = -12;
          p1.isGrounded = false;
        }

        // Guard / Defense (F)
        p1.isBlocking = (keys["f"] || keys["ㄹ"]) && !p1.isGroggy;

        // Dash (Shift)
        if (keys["shift"] && p1.dashCooldown <= 0 && p1.dashTimer <= 0) {
          p1.dashTimer = 8;
          p1.dashCooldown = 50;
          p1.vx = p1.facingLeft ? -16 : 16;
        }

        // Attack (Click)
        if (keys["click"] && p1.attackCooldown <= 0 && !p1.isBlocking && !p1.isGroggy) {
          p1.isAttacking = true;
          p1.attackProgress = 0;
          p1.attackCooldown = 35;
          sfx.playSlash();
        }
      }

      // Physics & Timers (P1)
      p1.vy += 0.6; // Gravity
      p1.x += p1.vx;
      p1.y += p1.vy;

      if (p1.y >= groundY - p1.height) {
        p1.y = groundY - p1.height;
        p1.vy = 0;
        p1.isGrounded = true;
      }
      p1.x = Math.max(0, Math.min(canvas.width - p1.width, p1.x));

      if (p1.attackCooldown > 0) p1.attackCooldown--;
      if (p1.dashCooldown > 0) p1.dashCooldown--;

      if (p1.dashTimer > 0) {
        p1.dashTimer--;
        // Shadow trail effect
        ctx.fillStyle = "rgba(255, 59, 63, 0.25)";
        ctx.fillRect(p1.x, p1.y, p1.width, p1.height);
      }

      // P1 Attack progress
      if (p1.isAttacking) {
        p1.attackProgress += 1 / p1.attackDuration;
        if (p1.attackProgress >= 1) {
          p1.isAttacking = false;
          p1.attackProgress = 0;
        }
      }

      // P1 Guard Instability logic
      if (p1.isBlocking) {
        p1.instability = Math.min(100, p1.instability + 1.2);
        if (p1.instability >= 100) {
          p1.isGroggy = true;
          p1.groggyTimer = 90; // Stun for 1.5s
          p1.isBlocking = false;
          sfx.playBreak();
          triggerShake(12);
        }
      } else {
        if (p1.isGroggy) {
          p1.groggyTimer--;
          if (p1.groggyTimer <= 0) {
            p1.isGroggy = false;
            p1.instability = 0;
          }
        } else {
          p1.instability = Math.max(0, p1.instability - 0.4);
        }
      }

      // Update Player 2 (AI) Mechanics
      updateAI();

      // Physics & Timers (P2)
      p2.vy += 0.6; // Gravity
      p2.x += p2.vx;
      p2.y += p2.vy;

      if (p2.y >= groundY - p2.height) {
        p2.y = groundY - p2.height;
        p2.vy = 0;
        p2.isGrounded = true;
      }
      p2.x = Math.max(0, Math.min(canvas.width - p2.width, p2.x));

      if (p2.attackCooldown > 0) p2.attackCooldown--;
      if (p2.dashCooldown > 0) p2.dashCooldown--;

      if (p2.dashTimer > 0) {
        p2.dashTimer--;
        ctx.fillStyle = "rgba(0, 229, 255, 0.25)";
        ctx.fillRect(p2.x, p2.y, p2.width, p2.height);
      }

      if (p2.isAttacking) {
        p2.attackProgress += 1 / p2.attackDuration;
        if (p2.attackProgress >= 1) {
          p2.isAttacking = false;
          p2.attackProgress = 0;
        }
      }

      // P2 Guard Instability logic
      if (p2.isBlocking) {
        p2.instability = Math.min(100, p2.instability + 1.2);
        if (p2.instability >= 100) {
          p2.isGroggy = true;
          p2.groggyTimer = 90;
          p2.isBlocking = false;
          sfx.playBreak();
          triggerShake(12);
        }
      } else {
        if (p2.isGroggy) {
          p2.groggyTimer--;
          if (p2.groggyTimer <= 0) {
            p2.isGroggy = false;
            p2.instability = 0;
          }
        } else {
          p2.instability = Math.max(0, p2.instability - 0.4);
        }
      }

      // Sync instability states with React HUD (throttled/state)
      setP1Instability(Math.round(p1.instability));
      setP2Instability(Math.round(p2.instability));

      // HITBOX DETECTIONS & COMBAT COLLISION
      const detectHit = (attacker: typeof p1, defender: typeof p1) => {
        if (!attacker.isAttacking || roundEnded) return;

        // Attacker sword slash range
        const reach = 85 + skinInfo.lengthBonus;
        const swordX = attacker.facingLeft ? attacker.x - reach : attacker.x + attacker.width;
        const swordW = reach;

        // Check if defender overlaps the sword zone
        const swordBox = { x: swordX, y: attacker.y + 10, w: swordW, h: attacker.height - 10 };
        const defenderBox = { x: defender.x, y: defender.y, w: defender.width, h: defender.height };

        const isOverlapping =
          swordBox.x < defenderBox.x + defenderBox.w &&
          swordBox.x + swordBox.w > defenderBox.x &&
          swordBox.y < defenderBox.y + defenderBox.h &&
          swordBox.y + swordBox.h > defenderBox.y;

        if (isOverlapping && attacker.attackProgress > 0.1 && attacker.attackProgress < 0.6) {
          // Defend checked
          if (defender.isBlocking) {
            // Guarded! Increment defender's instability
            defender.instability = Math.min(100, defender.instability + 22);
            attacker.isAttacking = false; // Stop attack
            createSparks(
              defender.facingLeft ? defender.x : defender.x + defender.width,
              attacker.y + 35,
              "#ffffff"
            );
            sfx.playClash();
            triggerShake(5);
          } else {
            // Dead!
            createBlood(defender.x + defender.width / 2, defender.y + defender.height / 3);
            triggerShake(20);
            roundEnded = true;

            if (attacker === p1) {
              matchWinner = "p1";
              sfx.playWin();
            } else {
              matchWinner = "p2";
              sfx.playLose();
            }

            const winTime = (Date.now() - startTime) / 1000;
            setTimeout(() => {
              onGameEnd(matchWinner!, winTime);
            }, 1000);
          }
        }
      };

      if (!roundEnded) {
        detectHit(p1, p2);
        detectHit(p2, p1);
      }

      // RENDER CHARACTERS

      // Player 1 (Red Samurai)
      ctx.fillStyle = p1.isGroggy ? "#553333" : p1.color;
      ctx.fillRect(p1.x, p1.y, p1.width, p1.height);
      // Sword rendering (Red Samurai)
      if (p1.isAttacking) {
        ctx.strokeStyle = skinInfo.color;
        ctx.lineWidth = skinInfo.width;
        ctx.beginPath();
        const angle = p1.facingLeft
          ? Math.PI - p1.attackProgress * Math.PI
          : p1.attackProgress * Math.PI;
        const swordLen = 50 + skinInfo.lengthBonus;
        ctx.moveTo(p1.x + p1.width / 2, p1.y + p1.height / 2);
        ctx.lineTo(
          p1.x + p1.width / 2 + Math.cos(angle) * swordLen,
          p1.y + p1.height / 2 + Math.sin(angle) * swordLen
        );
        ctx.stroke();
      } else if (p1.isBlocking) {
        // Shield bubble
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p1.x + (p1.facingLeft ? 0 : p1.width), p1.y + p1.height / 2, 45, -Math.PI / 2, Math.PI / 2, p1.facingLeft);
        ctx.stroke();
      }

      // Player 2 (Blue Samurai / AI)
      ctx.fillStyle = p2.isGroggy ? "#333355" : p2.color;
      ctx.fillRect(p2.x, p2.y, p2.width, p2.height);
      // Sword rendering (Blue Samurai)
      if (p2.isAttacking) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        const angle = p2.facingLeft
          ? Math.PI - p2.attackProgress * Math.PI
          : p2.attackProgress * Math.PI;
        ctx.moveTo(p2.x + p2.width / 2, p2.y + p2.height / 2);
        ctx.lineTo(
          p2.x + p2.width / 2 + Math.cos(angle) * 50,
          p2.y + p2.height / 2 + Math.sin(angle) * 50
        );
        ctx.stroke();
      } else if (p2.isBlocking) {
        ctx.strokeStyle = "rgba(0, 229, 255, 0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p2.x + (p2.facingLeft ? 0 : p2.width), p2.y + p2.height / 2, 45, -Math.PI / 2, Math.PI / 2, p2.facingLeft);
        ctx.stroke();
      }

      // RENDER PARTICLES
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life++;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
        }
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [equippedSkin, difficulty, gameActive]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        width={1024}
        height={576}
        className="w-full h-full block rounded-xl border border-[rgba(255,255,255,0.06)] shadow-[0_20px_50px_rgba(0,0,0,0.8)]"
      />

      {/* Instability HUD rendered on-top overlay */}
      {gameActive && (
        <div className="absolute top-6 left-12 right-12 flex justify-between pointer-events-none z-10 font-mono">
          {/* P1 Instability */}
          <div className="flex flex-col gap-1 w-52">
            <div className="flex justify-between text-xs font-bold tracking-widest text-[#ff3b3f]">
              <span>P1 POSTURE</span>
              <span>{p1Instability}%</span>
            </div>
            <div className="h-2 w-full bg-[rgba(255,255,255,0.1)] rounded-full overflow-hidden border border-[rgba(255,59,63,0.2)]">
              <div
                className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-75"
                style={{ width: `${p1Instability}%` }}
              />
            </div>
            {p1Instability >= 100 && (
              <span className="text-[10px] text-red-500 font-bold tracking-widest animate-pulse mt-0.5">
                ★ 가드 해제 (GROGGY)
              </span>
            )}
          </div>

          {/* P2 Instability */}
          <div className="flex flex-col gap-1 w-52 items-end">
            <div className="flex justify-between w-full text-xs font-bold tracking-widest text-[#00e5ff]">
              <span>{p2Instability}%</span>
              <span>OPPONENT POSTURE</span>
            </div>
            <div className="h-2 w-full bg-[rgba(255,255,255,0.1)] rounded-full overflow-hidden border border-[rgba(0,229,255,0.2)]">
              <div
                className="h-full bg-gradient-to-l from-cyan-500 to-cyan-300 transition-all duration-75 float-right"
                style={{ width: `${p2Instability}%` }}
              />
            </div>
            {p2Instability >= 100 && (
              <span className="text-[10px] text-cyan-400 font-bold tracking-widest animate-pulse mt-0.5">
                ★ 가드 해제 (GROGGY)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
