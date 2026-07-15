"use client";

import React, { useState, useEffect, useRef } from "react";
import GameCanvas, { SKINS_DATA } from "../components/GameCanvas";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserProfile {
  email: string;
  name: string;
  coins: number;
  unlockedSkins: string[];
  equippedSkin: string;
  bestTime: number | null;
}

interface LeaderboardEntry {
  name: string;
  time: number;
  date: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const getPartyKitHost = () => {
  if (typeof window !== "undefined") {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return "localhost:1999";
    }
  }
  return process.env.NEXT_PUBLIC_PARTYKIT_HOST || "slaaash-game.YOUR_ACCOUNT.partykit.dev";
};

const MATCHMAKING_ROOM = "lobby"; // global lobby room everyone joins to be matched

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const [showShop, setShowShop] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  // Matchmaking states
  type Phase = "idle" | "matching" | "playing" | "round-over";
  const [phase, setPhase] = useState<Phase>("idle");
  const [matchRoomId, setMatchRoomId] = useState("");
  const [yourSide, setYourSide] = useState<"p1" | "p2">("p1");
  const [opponentName, setOpponentName] = useState("");
  const [queueCount, setQueueCount] = useState(0);
  const [matchmakingStatus, setMatchmakingStatus] = useState<"connecting" | "waiting" | "failed">("connecting");
  const [roundResult, setRoundResult] = useState<{ winner: "p1" | "p2"; time: number } | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lobbySocketRef = useRef<any>(null);
  const gameKey = useRef(0);

  // ─── Load saved data ────────────────────────────────────────────────────────
  useEffect(() => {
    const savedRankings = localStorage.getItem("slaaash_rankings");
    setLeaderboard(savedRankings ? JSON.parse(savedRankings) : []);

    const activeSession = localStorage.getItem("slaaash_active_user");
    if (activeSession) {
      const savedUserData = localStorage.getItem(`slaaash_user_${activeSession}`);
      if (savedUserData) setUser(JSON.parse(savedUserData));
    }
  }, []);

  // ─── Save user data ─────────────────────────────────────────────────────────
  const saveUserData = (updated: UserProfile) => {
    setUser(updated);
    localStorage.setItem(`slaaash_user_${updated.email}`, JSON.stringify(updated));
    localStorage.setItem("slaaash_active_user", updated.email);
  };

  // ─── Mock Google Login ──────────────────────────────────────────────────────
  const handleGoogleLogin = (email: string, name: string) => {
    const formatted = email.toLowerCase();
    const existing = localStorage.getItem(`slaaash_user_${formatted}`);
    if (existing) {
      const parsed = JSON.parse(existing);
      setUser(parsed);
      localStorage.setItem("slaaash_active_user", formatted);
    } else {
      const newUser: UserProfile = {
        email: formatted, name, coins: 100,
        unlockedSkins: ["shinai"], equippedSkin: "shinai", bestTime: null,
      };
      saveUserData(newUser);
    }
    setShowLoginModal(false);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("slaaash_active_user");
  };

  // ─── Matchmaking via Partykit ───────────────────────────────────────────────
  const startMatchmaking = async () => {
    setPhase("matching");
    setQueueCount(1);
    setMatchmakingStatus("connecting");
    setRoundResult(null);

    // Dynamic import to avoid SSR/Node.js trying to access WebSocket
    const { default: PartySocket } = await import("partysocket");

    const socket = new PartySocket({ host: getPartyKitHost(), room: MATCHMAKING_ROOM });
    lobbySocketRef.current = socket;

    // Timeout to detect connection failure (e.g. 3.5 seconds)
    const connTimeout = setTimeout(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        setMatchmakingStatus("failed");
      }
    }, 3500);

    socket.onopen = () => {
      clearTimeout(connTimeout);
      setMatchmakingStatus("waiting");
      socket.send(JSON.stringify({ type: "join", name: user?.name ?? "무명 플레이어" }));
    };

    socket.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);

      if (msg.type === "waiting") {
        setQueueCount(1);
      }

      if (msg.type === "matched") {
        clearTimeout(connTimeout);
        socket.close();
        lobbySocketRef.current = null;
        setOpponentName(msg.opponentName);
        setYourSide(msg.yourSide);
        setMatchRoomId(msg.roomId);
        gameKey.current += 1;
        setPhase("playing");
      }
    };

    socket.onerror = () => {
      clearTimeout(connTimeout);
      setMatchmakingStatus("failed");
    };

    socket.onclose = () => {
      clearTimeout(connTimeout);
    };
  };

  const cancelMatchmaking = () => {
    lobbySocketRef.current?.close();
    lobbySocketRef.current = null;
    setPhase("idle");
  };

  // ─── Game End ───────────────────────────────────────────────────────────────
  const handleGameEnd = (winner: "p1" | "p2", timeSeconds: number) => {
    setRoundResult({ winner, time: timeSeconds });
    setPhase("round-over");

    const iWon = (winner === "p1" && yourSide === "p1") || (winner === "p2" && yourSide === "p2");
    if (iWon && user) {
      const earnedCoins = Math.max(10, Math.floor(1000 / Math.max(1.0, timeSeconds)));
      const updatedUser = { ...user, coins: user.coins + earnedCoins };
      if (updatedUser.bestTime === null || timeSeconds < updatedUser.bestTime)
        updatedUser.bestTime = Number(timeSeconds.toFixed(2));
      saveUserData(updatedUser);

      const newEntry: LeaderboardEntry = {
        name: user.name, time: Number(timeSeconds.toFixed(2)),
        date: new Date().toISOString().split("T")[0],
      };
      const updated = [...leaderboard, newEntry].sort((a, b) => a.time - b.time).slice(0, 5);
      setLeaderboard(updated);
      localStorage.setItem("slaaash_rankings", JSON.stringify(updated));
    }
  };

  const handleOpponentLeft = () => {
    setRoundResult(null);
    setPhase("round-over");
  };

  // ─── Shop ───────────────────────────────────────────────────────────────────
  const buySkin = (skinId: string, cost: number) => {
    if (!user || user.coins < cost) return;
    const updated = { ...user, coins: user.coins - cost, unlockedSkins: [...user.unlockedSkins, skinId], equippedSkin: skinId };
    saveUserData(updated);
  };
  const equipSkin = (skinId: string) => {
    if (!user) return;
    saveUserData({ ...user, equippedSkin: skinId });
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  const iWon = roundResult && ((roundResult.winner === "p1" && yourSide === "p1") || (roundResult.winner === "p2" && yourSide === "p2"));

  return (
    <div className="relative w-full min-h-screen bg-[#07070a] flex flex-col justify-center items-center p-4">
      {phase !== "playing" && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(20,15,30,0.4)_0%,transparent_100%)] pointer-events-none" />
      )}

      {/* Google Login Header */}
      <div className="absolute top-6 left-6 z-20">
        {user ? (
          <div className="flex items-center gap-3 bg-[rgba(15,15,25,0.7)] backdrop-blur-md border border-[rgba(255,255,255,0.06)] py-2 px-4 rounded-xl shadow-lg">
            <div className="w-9 h-9 rounded-full bg-red-700 flex items-center justify-center font-extrabold text-white text-sm">
              {user.name.charAt(0)}
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-neutral-400 font-bold">{user.name}</span>
              <span className="text-sm font-black text-amber-400">🪙 {user.coins} 냥</span>
            </div>
            <button onClick={handleLogout} className="ml-3 text-[10px] text-red-400 hover:text-red-300 font-bold border border-red-500/20 px-2 py-1 rounded hover:bg-red-500/10 transition">
              로그아웃
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowLoginModal(true)}
            className="flex items-center gap-2.5 bg-white text-black hover:bg-neutral-100 font-bold text-xs py-2.5 px-4 rounded-xl shadow-md transition transform hover:-translate-y-0.5"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.504 0-6.35-2.846-6.35-6.35s2.846-6.35 6.35-6.35c1.674 0 3.15.654 4.256 1.714l3.162-3.162C19.243 1.95 15.932 1 12.24 1 5.92 1 1 5.92 1 12s4.92 11 11.24 11c6.26 0 10.76-4.4 10.76-10.92 0-.616-.062-1.222-.162-1.795H12.24z"/>
            </svg>
            Google 계정으로 로그인
          </button>
        )}
      </div>

      {/* Main Game Area */}
      <div className="w-full max-w-[1024px] aspect-[16/9] relative rounded-2xl overflow-hidden shadow-[0_25px_60px_rgba(0,0,0,0.9)] bg-black">

        {/* ── LOBBY ── */}
        {phase === "idle" && (
          <div className="absolute inset-0 flex flex-col justify-between p-12 z-10">
            <div className="text-center mt-4">
              <h1 className="text-7xl font-extrabold tracking-[0.6rem] text-transparent bg-clip-text bg-gradient-to-r from-white via-red-500 to-amber-500 font-title">
                SLAAASH
              </h1>
            </div>

            <div className="flex gap-8 justify-between my-4 max-h-[200px]">
              {/* Leaderboard */}
              <div className="w-1/2 bg-[rgba(15,15,25,0.7)] backdrop-blur-md border border-[rgba(255,255,255,0.06)] rounded-xl p-4 flex flex-col overflow-y-auto">
                <span className="text-xs font-black tracking-wider text-amber-400 mb-2 font-title flex items-center gap-1.5">🏆 명예의 전당 (최단 승리 기록)</span>
                <div className="flex flex-col gap-1.5 text-xs">
                  {leaderboard.length === 0 ? (
                    <div className="text-center text-neutral-500 py-8 font-serif">기록이 없습니다. 첫 승리를 차지하세요!</div>
                  ) : (
                    leaderboard.map((entry, idx) => (
                      <div key={idx} className="flex justify-between border-b border-white/5 pb-1">
                        <span className="text-neutral-300 font-semibold">{idx + 1}. {entry.name}</span>
                        <span className="text-red-400 font-extrabold font-mono">{entry.time.toFixed(2)}초</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Controls Guide */}
              <div className="w-1/2 bg-[rgba(15,15,25,0.7)] backdrop-blur-md border border-[rgba(255,255,255,0.06)] rounded-xl p-4 flex flex-col justify-between overflow-y-auto">
                <span className="text-xs font-black tracking-wider text-neutral-400 mb-2 block">⚔️ 조작 가이드</span>
                <div className="text-[11px] text-neutral-300 space-y-1.5 bg-black/35 p-3 rounded-lg border border-white/5 font-mono">
                  {[["좌우 이동","A / D"], ["방어 (가드)","F"], ["베기 (공격)","클릭"]].map(([label, key]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-neutral-500">{label}</span>
                      <span className="key-cap">{key}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-4 items-center justify-center">
              <button onClick={startMatchmaking} className="w-64 py-4 rounded-xl font-extrabold text-lg tracking-widest glow-btn-red">
                대결 시작
              </button>
              <button onClick={() => setShowShop(true)} className="w-40 py-4 rounded-xl font-extrabold text-sm tracking-widest bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)] border border-neutral-700 text-neutral-300 transition">
                상점 (검 스킨)
              </button>
            </div>
          </div>
        )}

        {/* ── MATCHMAKING QUEUE ── */}
        {phase === "matching" && (
          <div className="absolute inset-0 flex flex-col justify-center items-center bg-black/95 z-10 gap-4">
            {matchmakingStatus === "connecting" && (
              <>
                <div className="w-16 h-16 border-4 border-neutral-600 border-t-transparent rounded-full animate-spin" />
                <h2 className="text-2xl font-bold tracking-widest text-white animate-pulse">매칭 서버 연결 중...</h2>
              </>
            )}
            {matchmakingStatus === "waiting" && (
              <>
                <div className="w-16 h-16 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
                <h2 className="text-2xl font-bold tracking-widest text-white animate-pulse">상대를 찾는 중...</h2>
                <p className="text-xs text-neutral-400 font-serif">현재 대기 중인 플레이어: {queueCount}명</p>
                <p className="text-[10px] text-neutral-500 max-w-md text-center mt-2 px-6">
                  * 다른 브라우저 탭이나 시크릿 창을 열어 동일 주소로 접속하면 매칭이 완료됩니다.
                </p>
              </>
            )}
            {matchmakingStatus === "failed" && (
              <>
                <div className="w-12 h-12 flex items-center justify-center rounded-full bg-red-950 border border-red-500 text-red-500 text-xl font-bold">!</div>
                <h2 className="text-xl font-bold text-red-500">매칭 서버 연결 실패</h2>
                <p className="text-xs text-neutral-400 max-w-sm text-center px-6 leading-relaxed">
                  로컬에서 테스트 중인 경우, 다른 터미널에서 <code className="bg-neutral-800 px-1 py-0.5 rounded text-red-400 font-mono">npx partykit dev</code> 명령어가 정상 실행 중인지 확인하세요.
                </p>
              </>
            )}
            <button onClick={cancelMatchmaking} className="mt-4 text-xs text-neutral-500 hover:text-neutral-300 border border-white/10 px-4 py-2 rounded transition">
              취소
            </button>
          </div>
        )}

        {/* ── GAME CANVAS ── */}
        {(phase === "playing" || phase === "round-over") && (
          <div className="absolute inset-0 z-0">
            <GameCanvas
              key={gameKey.current}
              equippedSkin={user?.equippedSkin || "shinai"}
              playerName={user?.name ?? "무명 플레이어"}
              roomId={matchRoomId}
              yourSide={yourSide}
              opponentName={opponentName}
              onGameEnd={handleGameEnd}
              onOpponentLeft={handleOpponentLeft}
            />
          </div>
        )}

        {/* ── ROUND OVER ── */}
        {phase === "round-over" && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-10 flex flex-col justify-center items-center">
            {roundResult ? (
              <>
                <h2 className={`text-6xl font-black tracking-widest mb-2 font-title ${iWon ? "text-amber-400" : "text-red-500"}`}>
                  {iWon ? "승  리" : "패  배"}
                </h2>
                <p className="text-sm text-neutral-300 mt-2 font-mono">
                  소요 시간: <span className="font-bold text-lg text-white">{roundResult.time.toFixed(2)}초</span>
                </p>
                {iWon && (
                  <p className="text-xs text-amber-400 font-bold mt-1">
                    🪙 {Math.max(10, Math.floor(1000 / Math.max(1.0, roundResult.time)))} 냥 획득!
                  </p>
                )}
              </>
            ) : (
              <h2 className="text-3xl font-black text-neutral-400 font-title">상대방이 도망쳤습니다! 🏃</h2>
            )}
            <div className="flex gap-4 mt-8">
              <button onClick={startMatchmaking} className="w-40 py-3 rounded-lg font-bold text-sm glow-btn-red">다시 대결</button>
              <button onClick={() => setPhase("idle")} className="w-32 py-3 rounded-lg font-bold text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 transition">로비</button>
            </div>
          </div>
        )}
      </div>

      {/* ── GOOGLE LOGIN MODAL ── */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="bg-[#11111d] border border-white/10 rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl relative">
            <button onClick={() => setShowLoginModal(false)} className="absolute top-4 right-4 text-neutral-400 hover:text-white font-bold text-sm">✕</button>
            <h3 className="text-xl font-black text-white mb-6">Google 계정으로 로그인</h3>
            <div className="flex flex-col gap-4">
              <div className="text-left">
                <label className="text-[10px] text-neutral-400 font-bold block mb-1">닉네임</label>
                <input type="text" placeholder="예: 플레이어 홍길동" id="login-name" defaultValue="무명 플레이어"
                  className="w-full py-2.5 px-3 rounded-lg bg-black/45 border border-white/10 text-white text-sm focus:outline-none focus:border-amber-500" />
              </div>
              <div className="text-left">
                <label className="text-[10px] text-neutral-400 font-bold block mb-1">이메일</label>
                <input type="email" placeholder="name@gmail.com" id="login-email" defaultValue="user@gmail.com"
                  className="w-full py-2.5 px-3 rounded-lg bg-black/45 border border-white/10 text-white text-sm focus:outline-none focus:border-amber-500" />
              </div>
              <button
                onClick={() => {
                  const name = (document.getElementById("login-name") as HTMLInputElement).value || "무명 플레이어";
                  const email = (document.getElementById("login-email") as HTMLInputElement).value || "user@gmail.com";
                  handleGoogleLogin(email, name);
                }}
                className="flex items-center gap-2.5 justify-center w-full py-2.5 bg-white text-black font-extrabold rounded-lg text-sm hover:bg-neutral-100 transition mt-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.504 0-6.35-2.846-6.35-6.35s2.846-6.35 6.35-6.35c1.674 0 3.15.654 4.256 1.714l3.162-3.162C19.243 1.95 15.932 1 12.24 1 5.92 1 1 5.92 1 12s4.92 11 11.24 11c6.26 0 10.76-4.4 10.76-10.92 0-.616-.062-1.222-.162-1.795H12.24z"/>
                </svg>
                로그인
              </button>
            </div>
            <p className="text-[10px] text-neutral-500 mt-4 leading-relaxed">* 가상 로그인 창입니다. 전적과 스킨이 로컬에 저장됩니다.</p>
          </div>
        </div>
      )}

      {/* ── SHOP MODAL ── */}
      {showShop && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="bg-[#11111d] border border-white/10 rounded-2xl p-8 max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl relative">
            <button onClick={() => setShowShop(false)} className="absolute top-4 right-4 text-neutral-400 hover:text-white font-bold text-lg">✕</button>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-white">🌸 대장간 상점 (검 스킨)</h3>
              {user && <span className="text-amber-400 font-extrabold">🪙 {user.coins} 냥</span>}
            </div>

            {!user ? (
              <div className="text-center py-8 border border-white/5 rounded-xl bg-black/20 my-4">
                <p className="text-neutral-400 text-sm mb-4">로그인 하셔야 스킨을 구매할 수 있습니다.</p>
                <button onClick={() => { setShowShop(false); setShowLoginModal(true); }}
                  className="px-4 py-2 bg-white text-black font-bold text-xs rounded hover:bg-neutral-100 transition">
                  로그인 하러 가기
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(SKINS_DATA).map(([id, info]) => {
                  const isUnlocked = user.unlockedSkins.includes(id);
                  const isEquipped = user.equippedSkin === id;
                  const cost = id === "shinai" ? 0 : id === "cherry" ? 100 : id === "dark" ? 250 : id === "laser" ? 500 : 1000;
                  return (
                    <div key={id} className={`p-4 rounded-xl border flex flex-col justify-between bg-black/30 transition ${isEquipped ? "border-amber-500 bg-amber-500/5" : "border-white/5 hover:border-white/10"}`}>
                      <div>
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-white text-base">{info.name}</span>
                          <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: info.color, boxShadow: `0 0 10px ${info.color}` }} />
                        </div>
                        <p className="text-xs text-neutral-400 mt-2">길이 보너스: <span className="text-amber-400">+{info.lengthBonus}px</span></p>
                      </div>
                      <div className="mt-4">
                        {isEquipped ? (
                          <span className="text-xs font-bold text-amber-500 block text-center bg-amber-500/10 py-1.5 rounded">장착 완료</span>
                        ) : isUnlocked ? (
                          <button onClick={() => equipSkin(id)} className="w-full text-xs font-bold bg-neutral-800 text-white hover:bg-neutral-700 py-1.5 rounded transition">장착하기</button>
                        ) : (
                          <button onClick={() => buySkin(id, cost)} disabled={user.coins < cost}
                            className={`w-full text-xs font-bold py-1.5 rounded transition ${user.coins >= cost ? "bg-amber-500 hover:bg-amber-400 text-black font-extrabold" : "bg-neutral-800 text-neutral-500 cursor-not-allowed"}`}>
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
