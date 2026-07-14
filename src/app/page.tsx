"use client";

import React, { useState, useEffect } from "react";
import GameCanvas, { SKINS_DATA } from "../components/GameCanvas";

// Mock User Data Type
interface UserProfile {
  email: string;
  name: string;
  avatar: string;
  coins: number;
  unlockedSkins: string[];
  equippedSkin: string;
  bestTime: number | null; // null means no win yet
}

interface LeaderboardEntry {
  name: string;
  time: number;
  date: string;
}

const OPPONENT_NAMES = [
  "떠돌이 무사 지로",
  "낭인 겐지",
  "어둠의 자객 한조",
  "북풍의 검객 렌",
  "가시나무 요시",
  "검객 이와오",
  "바람의 검심 야스오",
];

export default function Home() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  // Modals & States
  const [showShop, setShowShop] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [matchingState, setMatchingState] = useState<"idle" | "matching" | "playing" | "round-over">("idle");
  const [matchOpponent, setMatchOpponent] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "normal" | "hard">("normal");

  // Game active control
  const [gameKey, setGameKey] = useState(0);
  const [roundResult, setRoundResult] = useState<{ winner: "p1" | "p2"; time: number } | null>(null);

  // Load user data & rankings
  useEffect(() => {
    // 1. Leaderboard
    const savedRankings = localStorage.getItem("slaaash_rankings");
    if (savedRankings) {
      setLeaderboard(JSON.parse(savedRankings));
    } else {
      // Default placeholder rankings
      const defaultRankings = [
        { name: "검성 신짱", time: 1.84, date: "2026-07-10" },
        { name: "무사 박씨", time: 2.95, date: "2026-07-12" },
        { name: "훈련병 최씨", time: 5.22, date: "2026-07-14" },
      ];
      localStorage.setItem("slaaash_rankings", JSON.stringify(defaultRankings));
      setLeaderboard(defaultRankings);
    }

    // 2. Active login session check
    const activeSession = localStorage.getItem("slaaash_active_user");
    if (activeSession) {
      const savedUserData = localStorage.getItem(`slaaash_user_${activeSession}`);
      if (savedUserData) {
        setUser(JSON.parse(savedUserData));
      }
    }
  }, []);

  // Save user data
  const saveUserData = (updated: UserProfile) => {
    setUser(updated);
    localStorage.setItem(`slaaash_user_${updated.email}`, JSON.stringify(updated));
    localStorage.setItem("slaaash_active_user", updated.email);
  };

  // Mock Google Login Process
  const handleGoogleLogin = (mockEmail: string, mockName: string) => {
    const formattedEmail = mockEmail.toLowerCase();
    const existing = localStorage.getItem(`slaaash_user_${formattedEmail}`);

    if (existing) {
      const parsed = JSON.parse(existing);
      setUser(parsed);
      localStorage.setItem("slaaash_active_user", formattedEmail);
    } else {
      // Create new user profile
      const newUser: UserProfile = {
        email: formattedEmail,
        name: mockName,
        avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(mockName)}`,
        coins: 100, // starting gift
        unlockedSkins: ["shinai"],
        equippedSkin: "shinai",
        bestTime: null,
      };
      saveUserData(newUser);
    }
    setShowLoginModal(false);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("slaaash_active_user");
  };

  // Matchmaking Simulation
  const startMatchmaking = () => {
    setMatchingState("matching");
    setRoundResult(null);

    // Randomize opponent
    const name = OPPONENT_NAMES[Math.floor(Math.random() * OPPONENT_NAMES.length)];
    setMatchOpponent(name);

    setTimeout(() => {
      setMatchingState("playing");
      setGameKey((prev) => prev + 1);
    }, 2200); // 2.2 seconds matching delay
  };

  // Handle Game End
  const handleGameEnd = (winner: "p1" | "p2", timeSeconds: number) => {
    setRoundResult({ winner, time: timeSeconds });
    setMatchingState("round-over");

    if (winner === "p1") {
      // Calculate reward coins based on speed
      // Faster time = larger reward. Base 10, up to 300 coins.
      const earnedCoins = Math.max(10, Math.floor(1000 / Math.max(1.0, timeSeconds)));
      
      // Update User Data
      if (user) {
        const updatedUser = { ...user };
        updatedUser.coins += earnedCoins;
        if (updatedUser.bestTime === null || timeSeconds < updatedUser.bestTime) {
          updatedUser.bestTime = Number(timeSeconds.toFixed(2));
        }
        saveUserData(updatedUser);
      }

      // Add to Leaderboard
      const newEntry: LeaderboardEntry = {
        name: user ? user.name : "게스트 무사",
        time: Number(timeSeconds.toFixed(2)),
        date: new Date().toISOString().split("T")[0],
      };

      const updatedRankings = [...leaderboard, newEntry]
        .sort((a, b) => a.time - b.time)
        .slice(0, 5); // top 5 only

      setLeaderboard(updatedRankings);
      localStorage.setItem("slaaash_rankings", JSON.stringify(updatedRankings));
    }
  };

  // Shop purchase handler
  const buySkin = (skinId: string, cost: number) => {
    if (!user) return;
    if (user.coins < cost) return;

    const updated = { ...user };
    updated.coins -= cost;
    updated.unlockedSkins.push(skinId);
    updated.equippedSkin = skinId;
    saveUserData(updated);
  };

  const equipSkin = (skinId: string) => {
    if (!user) return;
    const updated = { ...user };
    updated.equippedSkin = skinId;
    saveUserData(updated);
  };

  return (
    <div className="relative w-full min-h-screen bg-[#07070a] flex flex-col justify-center items-center p-4">
      {/* Background drifting cherry blossom visual overlay for Lobby */}
      {matchingState !== "playing" && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(20,15,30,0.4)_0%,transparent_100%)] pointer-events-none" />
      )}

      {/* Header Panel (Google Login & Profile) */}
      <div className="absolute top-6 left-6 z-20">
        {user ? (
          <div className="flex items-center gap-3 bg-[rgba(15,15,25,0.7)] backdrop-blur-md border border-[rgba(255,255,255,0.06)] py-2 px-4 rounded-xl shadow-lg">
            <img src={user.avatar} alt="avatar" className="w-9 h-9 rounded-full border border-neutral-700 bg-neutral-900" />
            <div className="flex flex-col">
              <span className="text-xs text-neutral-400 font-bold">{user.name}</span>
              <span className="text-sm font-black text-amber-400">🪙 {user.coins} 냥</span>
            </div>
            <button
              onClick={handleLogout}
              className="ml-3 text-[10px] text-red-400 hover:text-red-300 font-bold border border-red-500/20 px-2 py-1 rounded hover:bg-red-500/10 transition"
            >
              로그아웃
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowLoginModal(true)}
            className="flex items-center gap-2.5 bg-white text-black hover:bg-neutral-100 font-bold text-xs py-2.5 px-4 rounded-xl shadow-md transition transform hover:-translate-y-0.5 active:translate-y-0"
          >
            {/* Google Icon SVG */}
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.504 0-6.35-2.846-6.35-6.35s2.846-6.35 6.35-6.35c1.674 0 3.15.654 4.256 1.714l3.162-3.162C19.243 1.95 15.932 1 12.24 1 5.92 1 1 5.92 1 12s4.92 11 11.24 11c6.26 0 10.76-4.4 10.76-10.92 0-.616-.062-1.222-.162-1.795H12.24z"
              />
            </svg>
            Google 계정으로 로그인
          </button>
        )}
      </div>

      {/* Main Container */}
      <div className="w-full max-w-[1024px] aspect-[16/9] relative rounded-2xl overflow-hidden shadow-[0_25px_60px_rgba(0,0,0,0.9)] bg-black">
        {/* LOBBY STATE */}
        {matchingState === "idle" && (
          <div className="absolute inset-0 flex flex-col justify-between p-12 z-10">
            {/* Title / Logo */}
            <div className="text-center mt-6">
              <h1 className="text-7xl font-extrabold tracking-[0.6rem] text-transparent bg-clip-text bg-gradient-to-r from-white via-red-500 to-amber-500 premium-glow-red font-title">
                SLAAASH
              </h1>
              <p className="text-xs font-bold tracking-[0.5rem] text-neutral-500 mt-2 font-serif">일 격 필 살</p>
            </div>

            {/* Content Mid Area: Controls / Rankings */}
            <div className="flex gap-8 justify-between my-4 max-h-[190px]">
              {/* Leaderboard / Ranking */}
              <div className="w-1/2 bg-[rgba(15,15,25,0.7)] backdrop-blur-md border border-[rgba(255,255,255,0.06)] rounded-xl p-4 flex flex-col overflow-y-auto">
                <span className="text-xs font-black tracking-wider text-amber-400 mb-2 font-title flex items-center gap-1.5">
                  🏆 명예의 전당 (최단 승리 기록)
                </span>
                <div className="flex flex-col gap-1.5 text-xs">
                  {leaderboard.map((entry, idx) => (
                    <div key={idx} className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-neutral-300 font-semibold">
                        {idx + 1}. {entry.name}
                      </span>
                      <span className="text-red-400 font-extrabold font-mono">{entry.time.toFixed(2)}초</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Game Settings & Guide */}
              <div className="w-1/2 bg-[rgba(15,15,25,0.7)] backdrop-blur-md border border-[rgba(255,255,255,0.06)] rounded-xl p-4 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-black tracking-wider text-neutral-400 mb-2 block">
                    ⚙️ 난이도 설정 (AI 무사 등급)
                  </span>
                  <div className="flex gap-2">
                    {(["easy", "normal", "hard"] as const).map((lvl) => (
                      <button
                        key={lvl}
                        onClick={() => setDifficulty(lvl)}
                        className={`flex-1 text-xs py-1.5 rounded font-bold border capitalize transition ${
                          difficulty === lvl
                            ? "bg-amber-500/10 border-amber-500 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                            : "bg-transparent border-white/10 text-neutral-500 hover:text-neutral-300"
                        }`}
                      >
                        {lvl === "easy" ? "훈련병" : lvl === "normal" ? "무사" : "검성"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-[11px] text-neutral-400 mt-2 bg-black/35 p-2 rounded border border-white/5">
                  <div className="flex justify-between">
                    <span>좌우 이동: <span className="key-cap">A</span> / <span className="key-cap">D</span></span>
                    <span>방어: <span className="key-cap">F</span></span>
                    <span>베기: <span className="key-cap">클릭</span></span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex gap-4 items-center justify-center">
              <button
                onClick={startMatchmaking}
                className="w-64 py-4 rounded-xl font-extrabold text-lg tracking-widest glow-btn-red"
              >
                대결 시작
              </button>

              <button
                onClick={() => setShowShop(true)}
                className="w-40 py-4 rounded-xl font-extrabold text-sm tracking-widest bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)] border border-neutral-700 text-neutral-300 transition"
              >
                상점 (검 스킨)
              </button>
            </div>
          </div>
        )}

        {/* MATCHMAKING QUEUE STATE */}
        {matchingState === "matching" && (
          <div className="absolute inset-0 flex flex-col justify-center items-center bg-black/95 z-10">
            <div className="w-16 h-16 border-4 border-red-500 border-t-transparent rounded-full animate-spin mb-6" />
            <h2 className="text-2xl font-bold tracking-widest text-white animate-pulse">
              적합한 상대와 매칭하는 중...
            </h2>
            <p className="text-xs text-neutral-400 mt-2 font-serif">상대: {matchOpponent} (대기 중)</p>
          </div>
        )}

        {/* PLAYING STATE */}
        {(matchingState === "playing" || matchingState === "round-over") && (
          <div className="absolute inset-0 z-0">
            <GameCanvas
              key={gameKey}
              equippedSkin={user?.equippedSkin || "shinai"}
              difficulty={difficulty}
              onGameEnd={handleGameEnd}
              gameActive={matchingState === "playing"}
            />
          </div>
        )}

        {/* ROUND OVER / WIN LOSE OVERLAY */}
        {matchingState === "round-over" && roundResult && (
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm z-10 flex flex-col justify-center items-center">
            <h2
              className={`text-6xl font-black tracking-widest mb-2 font-title ${
                roundResult.winner === "p1" ? "text-amber-400 premium-glow-blue" : "text-red-500 premium-glow-red"
              }`}
            >
              {roundResult.winner === "p1" ? "승 리" : "패 배"}
            </h2>
            <p className="text-sm text-neutral-300 mt-2 font-mono">
              소요 시간: <span className="font-bold text-lg text-white">{roundResult.time.toFixed(2)}초</span>
            </p>
            {roundResult.winner === "p1" && (
              <p className="text-xs text-amber-400 font-bold mt-1">
                🪙 {Math.max(10, Math.floor(1000 / Math.max(1.0, roundResult.time)))} 냥 획득!
              </p>
            )}

            <div className="flex gap-4 mt-8">
              <button onClick={startMatchmaking} className="w-40 py-3 rounded-lg font-bold text-sm glow-btn-red">
                다시 대결 (Restart)
              </button>
              <button
                onClick={() => setMatchingState("idle")}
                className="w-32 py-3 rounded-lg font-bold text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition"
              >
                로비로 이동
              </button>
            </div>
          </div>
        )}
      </div>

      {/* GOOGLE LOGIN MOCK MODAL */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 animate-[fadeIn_0.2s_ease]">
          <div className="bg-[#11111d] border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl relative">
            <button
              onClick={() => setShowLoginModal(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white font-bold text-sm"
            >
              ✕
            </button>
            <h3 className="text-xl font-black text-white mb-6">구글 계정으로 로그인</h3>
            
            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleGoogleLogin("musanim@gmail.com", "검객 무사님")}
                className="flex items-center gap-3 w-full justify-center py-2.5 px-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-lg text-sm transition"
              >
                <div className="w-6 h-6 bg-red-600 rounded-full flex items-center justify-center font-bold text-xs text-white">무</div>
                검객 무사님으로 로그인 (musanim@gmail.com)
              </button>

              <button
                onClick={() => handleGoogleLogin("swpar@gmail.com", "Slaaash 달인")}
                className="flex items-center gap-3 w-full justify-center py-2.5 px-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-lg text-sm transition"
              >
                <div className="w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center font-bold text-xs text-white">달</div>
                Slaaash 달인으로 로그인 (swpar@gmail.com)
              </button>

              <button
                onClick={() => handleGoogleLogin("newbie@gmail.com", "새싹 무사")}
                className="flex items-center gap-3 w-full justify-center py-2.5 px-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-lg text-sm transition"
              >
                <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center font-bold text-xs text-white">새</div>
                새싹 무사로 로그인 (newbie@gmail.com)
              </button>
            </div>
            <p className="text-[10px] text-neutral-500 mt-4 leading-relaxed">
              * 실제 OAuth Client 설정 없이 작동하는 가상 로그인 창입니다. 로그인 정보를 로컬 스토리지에 안전하게 보관하여 전적과 스킨이 유지됩니다.
            </p>
          </div>
        </div>
      )}

      {/* SHOP MODAL */}
      {showShop && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="bg-[#11111d] border border-white/10 rounded-2xl p-8 max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl relative">
            <button
              onClick={() => setShowShop(false)}
              className="absolute top-4 right-4 text-neutral-400 hover:text-white font-bold text-lg"
            >
              ✕
            </button>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-white">🌸 대장간 상점 (검 스킨)</h3>
              {user && <span className="text-amber-400 font-extrabold">보유 코인: 🪙 {user.coins} 냥</span>}
            </div>

            {!user && (
              <div className="text-center py-8 border border-white/5 rounded-xl bg-black/20 my-4">
                <p className="text-neutral-400 text-sm mb-4">로그인 하셔야 스킨을 구매하고 소유 자금을 연동할 수 있습니다.</p>
                <button
                  onClick={() => {
                    setShowShop(false);
                    setShowLoginModal(true);
                  }}
                  className="px-4 py-2 bg-white text-black font-bold text-xs rounded hover:bg-neutral-100 transition"
                >
                  로그인 하러 가기
                </button>
              </div>
            )}

            {user && (
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(SKINS_DATA).map(([id, info]) => {
                  const isUnlocked = user.unlockedSkins.includes(id);
                  const isEquipped = user.equippedSkin === id;
                  const cost = id === "shinai" ? 0 : id === "cherry" ? 100 : id === "dark" ? 250 : id === "laser" ? 500 : 1000;

                  return (
                    <div
                      key={id}
                      className={`p-4 rounded-xl border flex flex-col justify-between bg-black/30 transition ${
                        isEquipped ? "border-amber-500 bg-amber-500/5" : "border-white/5 hover:border-white/10"
                      }`}
                    >
                      <div>
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-white text-base">{info.name}</span>
                          <span
                            className="w-3.5 h-3.5 rounded-full"
                            style={{ backgroundColor: info.color, boxShadow: `0 0 10px ${info.color}` }}
                          />
                        </div>
                        <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                          길이 보너스: <span className="text-amber-400">+{info.lengthBonus}px</span>
                        </p>
                      </div>

                      <div className="mt-4">
                        {isEquipped ? (
                          <span className="text-xs font-bold text-amber-500 block text-center bg-amber-500/10 py-1.5 rounded">
                            장착 완료
                          </span>
                        ) : isUnlocked ? (
                          <button
                            onClick={() => equipSkin(id)}
                            className="w-full text-xs font-bold bg-neutral-800 text-white hover:bg-neutral-700 py-1.5 rounded transition"
                          >
                            장착하기
                          </button>
                        ) : (
                          <button
                            onClick={() => buySkin(id, cost)}
                            disabled={user.coins < cost}
                            className={`w-full text-xs font-bold py-1.5 rounded transition ${
                              user.coins >= cost
                                ? "bg-amber-500 hover:bg-amber-400 text-black font-extrabold"
                                : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                            }`}
                          >
                            구매하기 (🪙 {cost} 냥)
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
