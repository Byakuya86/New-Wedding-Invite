// Version: v1.1 (2025-08-22) — adds hosted/comped guest handling on Details page

import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, addDoc, serverTimestamp, getDoc, doc } from "firebase/firestore";
import { db } from "./lib/firebase";
import { createPortal } from "react-dom";
//import ChurchDoors from "./components/ChurchDoors";

// Interactive Digital Wedding Invitation
// Single-file React component (use Tailwind CSS). No external assets required.
// Flow: Door -> Details -> Game1 -> Game2 -> Seats/RSVP -> Guest Info -> Song/Payment -> Done

const COIN_PER_GAME = 25;
const SEAT_PRICE = 25;
const [declined, setDeclined] = useState(false);


function PageDimmer({ show, opacity = 0.25 }: { show: boolean; opacity?: number }) {
  if (!show) return null;
  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: `rgba(0,0,0,${opacity})`,
        pointerEvents: "none",
        zIndex: 2147483000, // above everything
      }}
    />,
    document.body
  );
}

type Screen =
  | "door"
  | "details"
  | "game1"
  | "game2"
  | "seats"
  | "guestInfo"
  | "songAndPay"
  | "done";

export default function InvitationApp() {
  const [screen, setScreen] = useState<Screen>("door");
  const [coins, setCoins] = useState<number>(() => {
    const saved = localStorage.getItem("invitation_coins");
    return saved ? Number(saved) : 0;
  });
  const [guestCount, setGuestCount] = useState(1);
  const [jackpotOpen, setJackpotOpen] = useState(false);
  const [prefillVersion, setPrefillVersion] = useState(0);
  const dimmed = !["door", "game1", "game2"].includes(screen) && !jackpotOpen;

  useEffect(() => {
    localStorage.setItem("invitation_coins", String(coins));
  }, [coins]);

  const [guestCode, setGuestCode] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get("g");
    const stored = localStorage.getItem("guest_code");

    if (urlCode && urlCode !== stored) {
      localStorage.setItem("guest_code", urlCode);
      setGuestCode(urlCode);
    } else if (stored && !urlCode) {
      setGuestCode(stored);
    } else if (urlCode) {
      setGuestCode(urlCode);
    }
  }, []);

  // Guest profile shape (extended with hosted flags)
  const [guestProfile, setGuestProfile] = useState<{
    name?: string;
    email?: string;
    seatsAllocated?: number;
    dietaryDefault?: string;
    messageDefault?: string;
    compedNights?: number; // number of nights covered (e.g., 1)
    hostedStay?: boolean;  // or simple boolean
  } | null>(null);

  // Fetch guests/{code} and prefill localStorage + guestCount
  useEffect(() => {
    async function loadGuest() {
      if (!guestCode) return;

      const snap = await getDoc(doc(db, "guests", guestCode));
      if (!snap.exists()) return;

      const g = snap.data() as {
        name?: string;
        email?: string;
        seatsAllocated?: number;
        dietaryDefault?: string;
        messageDefault?: string;
        compedNights?: number;
        hostedStay?: boolean;
      };
      setGuestProfile(g);

      // Helper: read trimmed
      const get = (k: string) => (localStorage.getItem(k) || "").trim();

      if (!get("rsvp_name") && g.name) {
        localStorage.setItem("rsvp_name", g.name);
      }
      if (!get("rsvp_email") && g.email) {
        localStorage.setItem("rsvp_email", g.email);
      }
      if (!get("rsvp_dietary") && g.dietaryDefault) {
        localStorage.setItem("rsvp_dietary", g.dietaryDefault);
      }
      if (!get("rsvp_message") && g.messageDefault) {
        localStorage.setItem("rsvp_message", g.messageDefault);
      }
      if (!get("rsvp_guests") && Number.isFinite(g.seatsAllocated)) {
        localStorage.setItem("rsvp_guests", String(g.seatsAllocated));
        setGuestCount(Math.max(1, Math.min(6, Number(g.seatsAllocated))));
      }

      // Force dependent screens to re-read
      setPrefillVersion((v) => v + 1);
    }
    loadGuest();
  }, [guestCode]);

  return (
    <div
      className="
        relative min-h-screen w-full text-slate-800
        bg-[radial-gradient(1200px_600px_at_-10%_-10%,#ffe4e6_0%,transparent_60%),radial-gradient(1000px_500px_at_110%_-10%,#fff1c1_0%,transparent_60%),radial-gradient(1200px_600px_at_50%_120%,#e0f2fe_0%,transparent_60%)]
      "
    >
      {/* Global dimmer via portal */}
      <PageDimmer show={dimmed} opacity={0.28} />
      {screen === "door" ? (
        <DoorFullScreen onEnter={() => setScreen("details")} />
      ) : (
        <div className="min-h-screen w-full flex items-center justify-center p-4">
          <div className="w-full max-w-4xl">
            <Header coins={coins} guestCode={guestCode} />
            {guestCode && guestProfile && (
              <div className="px-6 mt-3 mb-1 text-center text-slate-800 text-sm">
                <span className="font-medium">
                  Welcome{guestProfile.name ? `, ${guestProfile.name}` : ""}!
                </span>
                {typeof guestProfile.seatsAllocated === "number" && (
                  <span className="ml-2">
                    You have <b>{guestProfile.seatsAllocated}</b> seat(s) reserved.
                  </span>
                )}
              </div>
            )}

            {screen === "details" && (
              <Details
                hosted={!!guestProfile?.hostedStay}
                onNext={() => setScreen("game1")}
                onOpenJackpot={() => setJackpotOpen(true)}
                onDecline={() => {
                  setDeclined(true);
                  setScreen("done");          // send to final screen after decline
              }}
            />
            )}
            {screen === "game1" && (
              <PetalClickGame
                onWin={() => {
                  setCoins((c) => c + COIN_PER_GAME);
                  setScreen("game2");
                }}
                onGiveUp={() => setScreen("game2")}
              />
            )}
            {screen === "game2" && (
              <ReactionGame
                onWin={() => {
                  setCoins((c) => c + COIN_PER_GAME);
                  setScreen("seats");
                }}
                onSkip={() => setScreen("seats")}
              />
            )}
            {screen === "seats" && (
              <SeatPurchase
                coins={coins}
                guestCount={guestCount}
                setGuestCount={setGuestCount}
                onNeedCoins={() => setJackpotOpen(true)}
                onPurchased={(spent) => {
                  // Persist selected guests for later saving
                  localStorage.setItem("rsvp_guests", String(guestCount));
                  setCoins((c) => c - spent);
                  setScreen("guestInfo");
                }}
                maxGuests={guestProfile?.seatsAllocated ?? 6}
              />
            )}
            {screen === "guestInfo" && (
              <GuestInfo
                prefillVersion={prefillVersion}
                onNext={() => setScreen("songAndPay")}
                onBack={() => setScreen("seats")}
              />
            )}
            {screen === "songAndPay" && <SongAndPayment onFinish={() => setScreen("done")} />}
            {screen === "done" && <Done declined={declined} />}
          </div>
        </div>
      )}

      {jackpotOpen && (
        <JackpotModal
          needed={Math.max(0, guestCount * SEAT_PRICE - coins)}
          onClose={() => setJackpotOpen(false)}
          onJackpot={(amount) => {
            setCoins((c) => c + amount);
            setJackpotOpen(false);
          }}
        />
      )}
    </div>
  );
}

function Header({ coins, guestCode }: { coins: number; guestCode?: string | null }) {
  return (
    <header className="px-6 pt-4 pb-2">
      {/* top-right badges */}
      <div className="flex justify-end gap-2 text-sm">
        {guestCode && (
          <span className="px-3 py-1 rounded-full bg-sky-100/70 shadow-sm">
            🎫 Code: <b>{guestCode}</b>
          </span>
        )}
        <span className="px-3 py-1 rounded-full bg-amber-100/70 shadow-sm">
          💰 Coins: <b>{coins}</b>
        </span>
      </div>

      {/* centered title/subtitle */}
      <div className="mt-2 text-center">
        <h1
          className="
            text-3xl md:text-4xl font-extrabold tracking-tight
            text-slate-900
            supports-[background-clip:text]:bg-clip-text
            bg-gradient-to-r from-rose-700 via-amber-700 to-sky-700
          "
        >
          Lynn &amp; Llewellyn Reception Invitation
        </h1>
      </div>
    </header>
  );
}

function DoorFullScreen({ onEnter }: { onEnter: () => void }) {
  const [open, setOpen] = useState(false);
  const IMAGE_SRC = "/images/doors-bg.jpg";
  const LEFT_DOOR_IMG = "/images/wood-door-left.png";
  const RIGHT_DOOR_IMG = "/images/wood-door-right.png";

  useEffect(() => {
    const t1 = setTimeout(() => setOpen(true), 180);
    const t2 = setTimeout(() => onEnter(), 4000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onEnter]);

  // Full viewport
  const wrap: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    width: "100%",
    height: "100dvh",
    minHeight: "100svh",
    overflow: "hidden",
    zIndex: 0,
  };

  // Blurred filler behind so "contain" doesn't show black bars
  const filler: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    backgroundImage: `url('${IMAGE_SRC}')`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    filter: "blur(24px) brightness(0.9)",
    transform: "scale(1.08)",
    zIndex: 0,
    pointerEvents: "none",
  };

  // Actual photo: fit entire image on screen
  const imgStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain", // <-- key change (fit, no crop)
    objectPosition: "center", // tweak e.g. "50% 30%" to shift focus
    zIndex: 1,
    pointerEvents: "none",
  };

  // Slight tint so doors/text pop (covers filler + image)
  const tint: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(rgba(0,0,0,.12), rgba(0,0,0,.22))",
    zIndex: 2,
    pointerEvents: "none",
  };

  // --- Door styling (wood + shading, rounded top) ---
  const doorBase: React.CSSProperties = {
    position: "absolute",
    top: 0,
    height: "100%",
    width: "50%",
    // gradient shading on top of optional wood
    backgroundImage:
      "linear-gradient(135deg, rgba(0,0,0,.15), rgba(0,0,0,.35)), url('/images/wood-door.png')",
    backgroundSize: "cover, cover",
    backgroundPosition: "center, center",
    boxShadow: "inset 0 0 80px rgba(0,0,0,.35)",
    transition: "transform 3s ease-in-out",
    willChange: "transform",
    zIndex: 3,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  };

  const leftDoor: React.CSSProperties = {
    ...doorBase,
    left: 0,
    transform: open ? "translateX(-100%)" : "translateX(0)",
    borderRight: "4px solid #2f1a0f",
    backgroundImage:
      `linear-gradient(135deg, rgba(0,0,0,.15), rgba(0,0,0,.35)), url('${LEFT_DOOR_IMG}')`,
    backgroundSize: "cover, cover",
    backgroundPosition: "center, center",
  };

  const rightDoor: React.CSSProperties = {
    ...doorBase,
    right: 0,
    transform: open ? "translateX(100%)" : "translateX(0)",
    borderLeft: "4px solid #2f1a0f",
    backgroundImage:
      `linear-gradient(135deg, rgba(0,0,0,.15), rgba(0,0,0,.35)), url('${RIGHT_DOOR_IMG}')`,
    backgroundSize: "cover, cover",
    backgroundPosition: "center, center",
  };

  // decorative elements

  // gold handle + key plate
  const handleBase: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    width: 14,
    height: 56,
    borderRadius: 9,
    background: "linear-gradient(180deg,#f7e39f,#ccab4d 50%,#f7e39f)",
    boxShadow: "0 1px 3px rgba(0,0,0,.5), inset 0 0 2px rgba(255,255,255,.8)",
    transform: "translateY(-50%)",
  };

  const keyDot: React.CSSProperties = {
    position: "absolute",
    top: "calc(50% + 38px)",
    width: 8,
    height: 8,
    borderRadius: 8,
    background: "radial-gradient(circle at 30% 30%, #fff, #d4b258 60%, #9c7b2c)",
    boxShadow: "0 0 2px rgba(0,0,0,.6)",
  };

  // hinges (decorative)
  const hinge: React.CSSProperties = {
    position: "absolute",
    width: 10,
    height: 26,
    borderRadius: 3,
    background: "linear-gradient(180deg,#e8d79a,#c6a544,#e8d79a)",
    boxShadow: "0 1px 2px rgba(0,0,0,.6)",
  };

  // Top-center headings
  const headingWrap: React.CSSProperties = {
    position: "absolute",
    left: "50%",
    transform: "translateX(-50%)",
    top: "calc(env(safe-area-inset-top, 0px) + 24px)",
    textAlign: "center",
    zIndex: 4,
    color: "#fff",
    textShadow: "0 2px 12px rgba(0,0,0,.7)",
    width: "90%",
    maxWidth: 900,
  };

  return (
    <div style={wrap}>
      <div style={filler} />
      <img src={IMAGE_SRC} alt="" style={imgStyle} />
      <div style={tint} />

      {/* LEFT DOOR */}
      <div style={leftDoor}>
        {/* handle + key */}
        <div style={{ ...handleBase, right: 18 }} />
        <div style={{ ...keyDot, right: 24 }} />
        {/* hinges */}
        <div style={{ ...hinge, left: -5, top: "20%" }} />
        <div style={{ ...hinge, left: -5, top: "48%" }} />
        <div style={{ ...hinge, left: -5, top: "76%" }} />
      </div>

      {/* RIGHT DOOR */}
      <div style={rightDoor}>
        <div style={{ ...handleBase, left: 18 }} />
        <div style={{ ...keyDot, left: 24 }} />
        <div style={{ ...hinge, right: -5, top: "20%" }} />
        <div style={{ ...hinge, right: -5, top: "48%" }} />
        <div style={{ ...hinge, right: -5, top: "76%" }} />
      </div>

      <div style={headingWrap}>
        <h2 className="text-2xl md:text-4xl font-semibold">Welcome to our celebration</h2>
        <p className="mt-1 md:mt-2 opacity-90">The doors are opening…</p>
      </div>
    </div>
  );
}

function Details({ onNext, onOpenJackpot, hosted = false, onDecline, }: { onNext: () => void; onOpenJackpot?: () => void; hosted?: boolean; onDecline?: () => void; }) {
  return (
    <div className="px-6 py-10 text-center">
      <h2 className="text-3xl font-bold">You're invited!</h2>
      <p className="mt-2 text-base text-slate-700">
        Please read the details below, then play two quick games to collect coins and reserve your seat.
      </p>


<div className="mt-8 max-w-2xl mx-auto space-y-8">
  <section>
    <h3 className="text-xl font-semibold">Weekend Happenings</h3>
          <ul className="mt-3 list-disc list-inside leading-7 space-y-1">
            <li><b>Reception:</b> Saturday night at Houw Hoek</li>
            {hosted ? (
              <li>
                <b>Hotel Booking:</b> <span className="text-emerald-700 font-semibold">One night’s stay on us!</span>
              </li>
            ) : (
              <li>
                <b>Hotel Booking:</b> One night stay at own cost
              </li>
            )}
            {/* Only show payment + further details for non-hosted guests */}
            {!hosted && (
              <>
                <li><b>Payment Details:</b> Payment can be made via EFT or at the reception counter on the day; unfortunately no refunds.</li>
                <li><b>Further detailswill be provided at the end of the reservation.</b></li>
              </>
            )}
            <li>
              <b>Check-In:</b> 3 pm <span className="mx-1">|</span> <b>Check-Out:</b> 11 am next day
            </li>
            <li><b>Food &amp; Drinks:</b> Food provided and Cash Bar</li>
            <li><b>Additional Activities:</b> Optional, at own cost</li>
          </ul>
        </section>

        <section>
          <h3 className="text-xl font-semibold">How it works</h3>
          <ol className="mt-3 list-decimal list-inside leading-7 space-y-1">
            <li>Play 2 mini-games (25 coins each).</li>
            <li>Use coins (25/seat) to RSVP.</li>
            <li>If you don't have enough coins... Too Bad😂</li>
          </ol>
        </section>
      </div>

      <div className="mt-10 flex flex-col items-center gap-3">
  <button
    onClick={onNext}
    className="px-6 py-2 rounded-xl bg-rose-600 text-white shadow hover:brightness-110"
  >
    Next → Play
  </button>
  <DeclineButton onDecline={onDecline} />
</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-xl shadow-none bg-transparent">
      <h3 className="font-semibold mb-2">{title}</h3>
      {children}
    </div>
  );
}

// Game 1: Click floating petals to reach target before time ends
function PetalClickGame({ onWin, onGiveUp }: { onWin: () => void; onGiveUp: () => void }) {
  // ---- Settings ----
  const TARGET = 30; // you set this higher
  const DURATION = 30000; // ms
  const PETAL_COUNT = 10; // concurrent petals
  const SPEED = 2.0; // increase if you want faster fall (e.g., 1.5 or 2)

  // ---- State ----
  const startRef = useRef<number>(Date.now());
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [caught, setCaught] = useState(0);
  const caughtRef = useRef(0);
  const [ended, setEnded] = useState(false);
  caughtRef.current = caught;

  type Petal = {
    id: number;
    x: number;
    y: number;
    r: number;
    vx: number;
    vy: number;
    alive: boolean;
    pop: number;
  };

  const makePetalFromTop = (id: number): Petal => ({
    id,
    x: Math.random() * 0.88 + 0.06, // 6%..94%
    y: -0.08, // just above the top
    r: Math.random() * 360,
    vx: (Math.random() - 0.5) * 0.018,
    vy: (0.012 + Math.random() * 0.015) * SPEED,
    alive: true,
    pop: 0,
  });

  const [petals, setPetals] = useState<Petal[]>(() =>
    Array.from({ length: PETAL_COUNT }, (_, i) => makePetalFromTop(i + 1))
  );

  // ---- Animation loop ----
  useEffect(() => {
    const moveId = setInterval(() => {
      // if time has ended, do nothing
      if (ended) return;
      setPetals((prev) =>
        prev.map((p) => {
          if (!p.alive) {
            // pop-out animation, then RESPAWN at the top
            const npop = Math.min(1, p.pop + 0.2);
            if (npop >= 1) return makePetalFromTop(p.id); // <-- key line
            return { ...p, pop: npop };
          }
          let nx = p.x + p.vx;
          if (nx < 0.06 || nx > 0.94) nx = Math.min(0.94, Math.max(0.06, nx));
          let ny = p.y + p.vy;
          if (ny > 1.05) ny = -0.05; // wrap from bottom to top
          return { ...p, x: nx, y: ny, r: (p.r + 2) % 360 };
        })
      );

      const left = DURATION - (Date.now() - startRef.current);
      setTimeLeft(Math.max(0, left));
      if (left <= 0) {
        clearInterval(moveId);
        setEnded(true);
        setPetals([]);
        if (caughtRef.current >= TARGET) onWin();
      }
    }, 60);

    return () => clearInterval(moveId);
  }, [onWin, SPEED, ended]);

  // Finish early when target reached
  useEffect(() => {
    if (caught >= TARGET) onWin();
  }, [caught, onWin]);

  function catchPetal(id: number) {
    setPetals((prev) =>
      prev.map((p) => (p.id === id && p.alive ? { ...p, alive: false, pop: 0 } : p))
    );
    setCaught((c) => c + 1);
  }

  // ---- UI ----
  const wrapStyle: React.CSSProperties = { position: "relative", zIndex: 10000, padding: 24 };
  const boxStyle: React.CSSProperties = {
    position: "relative",
    height: 320,
    marginTop: 16,
    borderRadius: 16,
    overflow: "hidden",
    background: "linear-gradient(180deg,#fff7f9,#ffeef2)",
    outline: "1px solid rgba(244,63,94,.35)",
  };
  const petalChip: React.CSSProperties = {
    display: "grid",
    placeItems: "center",
    width: 80,
    height: 80,
    background: "#fff",
    borderRadius: 999,
    boxShadow: "0 10px 20px rgba(0,0,0,.15), 0 0 0 2px rgba(244,63,94,.6)",
  };

  return (
    <div style={wrapStyle}>
      <h2 className="text-xl font-semibold">Game 1 · Catch the petals 🌸</h2>
      <p className="text-slate-600 text-sm">
        Click {TARGET} petals before the timer runs out to earn 25 coins.
      </p>

      <div className="flex items-center gap-3 mt-3 text-sm">
        <span className="px-3 py-1 rounded-full bg-emerald-100 border">
          Caught: <b>{caught}</b>/{TARGET}
        </span>
        <span className="px-3 py-1 rounded-full bg-sky-100 border">
          Time: <b>{Math.ceil(timeLeft / 1000)}s</b>
        </span>
      </div>

      {/* PLAY AREA */}
      <div style={boxStyle}>
        {petals.map((p) => {
          const left = p.x * 100,
            top = p.y * 100;
          const scale = p.pop ? 1 + p.pop * 0.5 : 1;
          const opacity = p.pop ? 1 - p.pop : 1;
          return (
            <button
              key={p.id}
              onClick={() => p.alive && catchPetal(p.id)}
              disabled={!p.alive}
              aria-label="petal"
              style={{
                position: "absolute",
                left: `${left}%`,
                top: `${top}%`,
                transform: `translate(-50%,-50%) rotate(${p.r}deg) scale(${scale})`,
                opacity,
                transition: p.alive
                  ? "none"
                  : "transform 220ms ease, opacity 220ms ease",
                zIndex: 10001,
                cursor: p.alive ? "pointer" : "default",
              }}
            >
              <span style={petalChip}>
                <span style={{ fontSize: 40, lineHeight: 1 }}>🌸</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button className="px-4 py-2 rounded-lg border" onClick={onGiveUp}>
          Skip
        </button>
        <button
          className="px-4 py-2 rounded-lg bg-rose-600 text-white disabled:opacity-50"
          onClick={() => caught >= TARGET && onWin()}
          disabled={caught < TARGET}
        >
          Claim 25 coins
        </button>
      </div>
    </div>
  );
}

// Game 2: Reaction timing — stop pointer inside target zone
function ReactionGame({ onWin, onSkip }: { onWin: () => void; onSkip: () => void }) {
  // ---- Tuning ----
  const SPEED = 4; // % per tick
  const TICK = 16; // ms
  const TARGET_START = 55; // %
  const TARGET_END = 65; // %
  const MAX_ATTEMPTS = 3;

  // ---- State/refs ----
  const [running, setRunning] = useState(true);
  const [pos, setPos] = useState(0);
  const [hit, setHit] = useState<null | boolean>(null);
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false); // out of attempts

  const dirRef = useRef(1);
  const runRef = useRef(true);
  useEffect(() => {
    runRef.current = running;
  }, [running]);

  // Movement loop
  useEffect(() => {
    const id = setInterval(() => {
      if (!runRef.current || locked) return;
      setPos((prev) => {
        let np = prev + dirRef.current * SPEED;
        if (np >= 100) {
          np = 100;
          dirRef.current = -1;
        }
        if (np <= 0) {
          np = 0;
          dirRef.current = 1;
        }
        return np;
      });
    }, TICK);
    return () => clearInterval(id);
  }, [locked]);

  // Actions
  function stop() {
    if (locked) return;
    setRunning(false);
    const ok = pos >= TARGET_START && pos <= TARGET_END;
    setHit(ok);

    const next = attempts + 1;
    setAttempts(next);

    if (ok) {
      setTimeout(onWin, 220);
    } else if (next >= MAX_ATTEMPTS) {
      // out of attempts — lock the game; user can only Skip
      setLocked(true);
    }
  }

  function reset() {
    if (locked) return; // no more resets when out of attempts
    setHit(null);
    setRunning(true);
    runRef.current = true;
    dirRef.current = 1;
    setPos(0);
  }

  // Styles
  const wrap: React.CSSProperties = { position: "relative", zIndex: 10000, padding: 24 };
  const box: React.CSSProperties = {
    position: "relative",
    height: 170,
    marginTop: 16,
    borderRadius: 16,
    overflow: "hidden",
    background: "linear-gradient(180deg,#ffffff,#f8fafc)",
    outline: "1px solid rgba(148,163,184,.35)",
    boxShadow: "inset 0 6px 18px rgba(0,0,0,.08)",
  };
  const lane: React.CSSProperties = { position: "absolute", left: 16, right: 16, top: 0, bottom: 0 };
  const track: React.CSSProperties = {
    position: "absolute",
    left: 0,
    right: 0,
    top: "50%",
    height: 8,
    transform: "translateY(-50%)",
    background: "#e5e7eb",
    borderRadius: 999,
  };
  const target: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    height: 22,
    transform: "translateY(-50%)",
    left: `${TARGET_START}%`,
    width: `${TARGET_END - TARGET_START}%`,
    background: "rgba(16,185,129,.20)",
    border: "1px solid rgba(16,185,129,.45)",
    borderRadius: 8,
  };
  const marker: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    left: `${pos}%`,
    transform: "translate(-50%,-50%)",
    width: 20,
    height: 20,
    borderRadius: 999,
    background: "#f43f5e",
    boxShadow: "0 0 0 3px rgba(244,63,94,.35), 0 8px 14px rgba(0,0,0,.25)",
    outline:
      hit == null
        ? "none"
        : hit
        ? "3px solid rgba(16,185,129,.65)"
        : "3px solid rgba(244,63,94,.65)",
  };

  return (
    <div style={wrap}>
      <h2 className="text-xl font-semibold">Game 2 · Perfect timing ⏱️</h2>
      <p className="text-slate-600 text-sm">
        Stop the slider inside the highlighted zone to earn 25 coins.
      </p>
      <p className="text-xs text-slate-500 mt-1">
        Attempts: <b>{attempts}</b> / {MAX_ATTEMPTS}
        {locked && " — out of attempts (you can Skip)."}
      </p>

      <div style={box}>
        <div style={lane}>
          <div style={track} />
          <div style={target} />
          <div style={marker} />
        </div>
      </div>

      <div className="mt-4 flex gap-3 justify-end">
        <button className="px-4 py-2 rounded-lg border" onClick={onSkip}>
          Skip
        </button>
        <button className="px-4 py-2 rounded-lg border" onClick={reset} disabled={locked}>
          Reset
        </button>
        <button
          className="px-4 py-2 rounded-lg bg-rose-600 text-white disabled:opacity-50"
          onClick={stop}
          disabled={locked || !running}
        >
          Stop
        </button>
      </div>
    </div>
  );
}

function SeatPurchase({
  coins,
  guestCount,
  setGuestCount,
  onNeedCoins,
  onPurchased,
  maxGuests = 6,
}: {
  coins: number;
  guestCount: number;
  setGuestCount: (n: number) => void;
  onNeedCoins: () => void;
  onPurchased: (spent: number) => void;
  maxGuests?: number;
}) {
  const SEAT_PRICE = 25;
  const totalCost = guestCount * SEAT_PRICE;
  const enough = coins >= totalCost && guestCount > 0;
  const deficit = Math.max(0, totalCost - coins);

  function onChangeGuests(n: number) {
    const clamped = Math.max(1, Math.min(maxGuests, isNaN(n) ? 1 : n));
    setGuestCount(clamped);
  }

  return (
    <div className="px-6 py-12 text-center">
      <h2 className="text-3xl font-bold">Reserve your seat(s) 🎟️</h2>
      <p className="mt-3 text-base text-slate-700">
        Seats cost {SEAT_PRICE} coins each. Use your winnings to RSVP.
      </p>

      {/* Centered column with bigger vertical rhythm */}
      <div className="mt-20 max-w-xl mx-auto space-y-10">
        {/* Selection */}
        <section className="space-y-4">
          <div className="flex items-center justify-center gap-3">
            <label className="text-sm font-medium">Guests</label>
            <input
              type="number"
              min={1}
              max={maxGuests}
              value={guestCount}
              onChange={(e) => onChangeGuests(Number(e.target.value))}
              className="w-24 px-3 py-2 rounded-lg border text-center"
            />
          </div>

          {maxGuests < 6 && (
            <div className="text-xs text-slate-500">
              (Max allowed for your invite: {maxGuests})
            </div>
          )}

          <div className="mt-4 text-sm space-y-5">
            <div>
              Total cost: <b>{totalCost}</b> coins
            </div>
            <div>
              Balance after purchase: <b>{coins - totalCost}</b>
            </div>
          </div>
        </section>

        {/* Status */}
        <section className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1  bg-amber-50">
            💰 You have <b>{coins}</b> coins
          </div>
          {!enough && (
            <div className="text-rose-700 text-sm">
              You need <b>{deficit}</b> more coin{deficit === 1 ? "" : "s"}.
            </div>
          )}
        </section>

        {/* Actions */}
        <section className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
          {!enough && (
            <button
              onClick={onNeedCoins}
              className="px-5 py-2 rounded-xl bg-amber-500 text-white shadow hover:brightness-110"
            >
              Get bonus coins (slot machine)
            </button>
          )}

          <button
            disabled={!enough}
            onClick={() => onPurchased(totalCost)}
            className={`px-6 py-2 rounded-xl text-white shadow ${
              enough ? "bg-emerald-600 hover:brightness-110" : "bg-slate-300"
            }`}
          >
            Purchase & Continue
          </button>
        </section>
      </div>
    </div>
  );
}

function JackpotModal({
  needed,
  onClose,
  onJackpot,
}: {
  needed: number;
  onClose: () => void;
  onJackpot: (amount: number) => void;
}) {
  // --- knobs ---
  const SPIN_MS = 1200; // total spin duration
  const TICK_MS = 80; // reel update speed
  const award = Math.max(needed, 25);

  // --- state/refs ---
  const [spinning, setSpinning] = React.useState(false);
  const [result, setResult] = React.useState<string[]>(["💍", "💒", "💖"]);
  const spinningRef = React.useRef(false); // guards StrictMode double-effect

  // run exactly once per open
  React.useEffect(() => {
    if (spinningRef.current) return;
    spinningRef.current = true;

    // lock page scroll
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // keyboard shortcuts
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && !spinningRef.current) onJackpot(award);
    };
    window.addEventListener("keydown", onKey);

    // spin
    const symbols = ["💍", "💒", "💖", "🎉", "🥂", "🌹", "🎁"];
    setSpinning(true);

    const spinId = setInterval(() => {
      setResult([
        symbols[Math.floor(Math.random() * symbols.length)],
        symbols[Math.floor(Math.random() * symbols.length)],
        symbols[Math.floor(Math.random() * symbols.length)],
      ]);
    }, TICK_MS);

    const stopId = setTimeout(() => {
      clearInterval(spinId);
      setResult(["🎉", "🎉", "🎉"]);
      setSpinning(false);
      spinningRef.current = false; // now Enter can claim
    }, SPIN_MS);

    // cleanup
    return () => {
      clearInterval(spinId);
      clearTimeout(stopId);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      spinningRef.current = false;
    };
  }, [award, onClose, onJackpot]);

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 2147483647 }}>
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }}
      />
      {/* dialog */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 480,
          margin: "12vh auto 0",
          background: "#fff",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 24px 64px rgba(0,0,0,.45)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ fontSize: 18, fontWeight: 600 }}>Bonus Slot Machine 🎰</h3>
          <button onClick={onClose} style={{ color: "#64748b" }}>✕</button>
        </div>

        <p style={{ marginTop: 6, fontSize: 14, color: "#475569" }}>
          Automatic jackpot to cover your missing coins.
        </p>
        <p style={{ marginTop: 4, fontSize: 14 }}>
          You’ll receive <b>{award}</b> coins.
        </p>

        <div
          style={{
            marginTop: 16,
            border: "1px solid rgba(244,63,94,.25)",
            borderRadius: 12,
            padding: 16,
            background: "linear-gradient(180deg,#fff1f5,#ffe4e6)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
              fontSize: 40,
              textAlign: "center",
              opacity: spinning ? 0.9 : 1,
              transition: "opacity 150ms",
            }}
          >
            {result.map((r, i) => (
              <div
                key={i}
                style={{
                  borderRadius: 12,
                  background: "#fff",
                  boxShadow: "inset 0 6px 18px rgba(0,0,0,.06)",
                  padding: "12px 0",
                }}
              >
                {r}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg border">
            Close
          </button>
          {!spinning && (
            <button
              onClick={() => onJackpot(award)}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white"
              autoFocus
            >
              Claim Jackpot
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function GuestInfo({ prefillVersion, onNext, onBack }: { prefillVersion: number; onNext: () => void; onBack: () => void }) {
  const [form, setForm] = useState({
    primaryName: localStorage.getItem("rsvp_name") || "",
    email: localStorage.getItem("rsvp_email") || "",
    phone: localStorage.getItem("rsvp_phone") || "",
    dietary: localStorage.getItem("rsvp_dietary") || "None",
    message: localStorage.getItem("rsvp_message") || "",
  });

  // Rehydrate when parent bumps version (after guest fetch)
  useEffect(() => {
    setForm((prev) => ({
      primaryName: prev.primaryName || localStorage.getItem("rsvp_name") || "",
      email: prev.email || localStorage.getItem("rsvp_email") || "",
      phone: prev.phone || localStorage.getItem("rsvp_phone") || "",
      dietary:
        prev.dietary && prev.dietary !== "None"
          ? prev.dietary
          : localStorage.getItem("rsvp_dietary") || "None",
      message: prev.message || localStorage.getItem("rsvp_message") || "",
    }));
  }, [prefillVersion]);

  function handleNext() {
    localStorage.setItem("rsvp_name", form.primaryName.trim());
    localStorage.setItem("rsvp_email", form.email.trim());
    localStorage.setItem("rsvp_phone", form.phone.trim());
    localStorage.setItem("rsvp_dietary", form.dietary);
    localStorage.setItem("rsvp_message", form.message.trim());
    onNext();
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold">Guest details 📝</h2>
      <p className="text-slate-600 text-sm">
        Tell us who’s coming. You can add additional names in the message box.
      </p>

      <div className="mt-4 grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <Labeled label="Name of Guests">
            <input
              className="w-full px-3 py-2 rounded-lg border"
              value={form.primaryName}
              onChange={(e) => setForm({ ...form, primaryName: e.target.value })}
            />
          </Labeled>
          <Labeled label="Email">
            <input
              type="email"
              className="w-full px-3 py-2 rounded-lg border"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Labeled>
          <Labeled label="Phone">
            <input
              className="w-full px-3 py-2 rounded-lg border"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Labeled>
          <Labeled label="Dietary preferences">
            <select
              className="w-full px-3 py-2 rounded-lg border"
              value={form.dietary}
              onChange={(e) => setForm({ ...form, dietary: e.target.value })}
            >
              <option>None</option>
              <option>Vegetarian</option>
              <option>Vegan</option>
              <option>Halaal</option>
              <option>Kosher</option>
              <option>Allergy (specify in message)</option>
            </select>
          </Labeled>
        </div>
        <div>
          <Labeled label="Message">
            <textarea
              rows={9}
              className="w-full px-3 py-2 rounded-lg border"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
          </Labeled>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <button onClick={onBack} className="px-4 py-2 rounded-lg border">
          Back
        </button>
        <button
          onClick={handleNext}
          disabled={!form.primaryName || !form.email}
          className={`px-6 py-2 rounded-xl text-white shadow ${
            !form.primaryName || !form.email
              ? "bg-slate-300"
              : "bg-rose-600 hover:brightness-110"
          }`}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function SongAndPayment({ onFinish }: { onFinish: () => void }) {
  const [song, setSong] = useState("");
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"eft" | "hotel_counter">(
    "hotel_counter"
  );

  // Bank details stay (EFT option)
  const bank = useMemo(
    () => ({
      accountName: "Houw Hoek Hotel",
      bank: "First National Bank Commercial",
      accNo: "62643591060",
      branch: "210554",
    }),
    []
  );

  // Build a stable reference code (prefer guest_code; else initials + last4 phone)
  const refCode = useMemo(() => {
    const fromUrl = (localStorage.getItem("guest_code") || "").trim();
    if (fromUrl) return fromUrl.toUpperCase();

    const rawName = (localStorage.getItem("rsvp_name") || "").trim();
    const rawPhone = localStorage.getItem("rsvp_phone") || "";

    const initials = rawName
      ? rawName
          .split(/\s+/)
          .map((s) => s[0])
          .join("")
          .slice(0, 3)
          .toUpperCase()
      : "GUEST";

    const digits = (rawPhone.match(/\d/g) || []).join("");
    const last4 = digits.slice(-4) || String(Math.floor(Math.random() * 9000) + 1000);
    return `${initials}-${last4}`;
  }, []);

  function copyEftDetails() {
    const txt = `Account Name: ${bank.accountName}
Bank: ${bank.bank}
Account No: ${bank.accNo}
Branch: ${bank.branch}
Reference: ${refCode}`;
    navigator.clipboard.writeText(txt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  async function handleFinish() {
    setSaving(true);
    setError(null);
    try {
      // Pull everything stored across the flow
      const name = localStorage.getItem("rsvp_name") || "";
      const rEmail = localStorage.getItem("rsvp_email") || "";
      const phone = localStorage.getItem("rsvp_phone") || "";
      const dietary = localStorage.getItem("rsvp_dietary") || "None";
      const message = localStorage.getItem("rsvp_message") || "";
      const guests = parseInt(localStorage.getItem("rsvp_guests") || "1", 10);
      const coins = parseInt(localStorage.getItem("invitation_coins") || "0", 10);

      if (!name) throw new Error("Please provide your name in the previous step.");
      if (guests < 1 || guests > 6)
        throw new Error("Guest count must be between 1 and 6.");

      await addDoc(collection(db, "rsvps"), {
        name,
        email: rEmail,
        phone,
        dietary,
        message,
        guests,
        coins,
        song,
        paymentMethod, // <- "eft" or "hotel_counter"
        refCode, // <- store the reference code for both methods
        createdAt: serverTimestamp(),
      });

      onFinish();
    } catch (e: any) {
      setError(e?.message || "Could not save RSVP. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold">Final touches 🎶💳</h2>

      {/* Payment method selector */}
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <span className="text-sm text-slate-600">Choose how you’ll pay:</span>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="pm"
            value="hotel_counter"
            checked={paymentMethod === "hotel_counter"}
            onChange={() => setPaymentMethod("hotel_counter")}
          />
          Pay at hotel counter
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="pm"
            value="eft"
            checked={paymentMethod === "eft"}
            onChange={() => setPaymentMethod("eft")}
          />
          EFT (bank transfer)
        </label>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        {/* Song request */}
        <Card title="Song request">
          <input
            className="w-full px-3 py-2 rounded-lg border"
            placeholder="Artist – Song Title"
            value={song}
            onChange={(e) => setSong(e.target.value)}
          />
          <p className="text-xs text-slate-500 mt-2">
            We'll do our best to get it on the playlist!
          </p>
        </Card>

        {/* Payment options side-by-side */}
        <Card title="Payment options">
          <div className="text-sm space-y-10">
            {/* Pay at counter */}
            <div
              className={`p-3 rounded-lg border ${
                paymentMethod === "hotel_counter"
                  ? "border-emerald-400 bg-emerald-50/40"
                  : "border-slate-200"
              }`}
            >
              <div className="font-medium">Pay at the hotel counter</div>
              <p className="mt-1">
                Please settle your accommodation at the <b>Houw Hoek Hotel</b> reception desk on
                arrival.
              </p>
              <p className="mt-1">
                Quote your unique reference code so we can match your payment to your RSVP:
              </p>

              {/* NOTE the mb-10 here creates a clear gap before the EFT section */}
              <div className="mt-2 mb-10 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 border text-base">
                <span className="font-mono font-semibold tracking-wider">{refCode}</span>
                <button
                  onClick={() => navigator.clipboard.writeText(refCode)}
                  className="px-2 py-1 rounded border bg-white"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* EFT */}
            <div
              className={`p-3 rounded-lg border ${
                paymentMethod === "eft"
                  ? "border-amber-400 bg-amber-50/40"
                  : "border-slate-200"
              }`}
            >
              <div className="font-medium">EFT (bank transfer)</div>
              <div className="mt-1 space-y-1">
                <div>
                  <b>Account:</b> {bank.accountName}
                </div>
                <div>
                  <b>Bank:</b> {bank.bank}
                </div>
                <div>
                  <b>Number:</b> {bank.accNo}
                </div>
                <div>
                  <b>Branch:</b> {bank.branch}
                </div>
                <div>
                  <b>Reference:</b> <span className="font-mono">{refCode}</span>{" "}
                  <span className="text-xs text-slate-500">(please use this)</span>
                </div>
              </div>

              <div className="mt-2 flex gap-2">
                <button onClick={copyEftDetails} className="px-3 py-2 rounded-lg border">
                  {copied ? "Copied!" : "Copy EFT details"}
                </button>
                <input
                  type="email"
                  placeholder="or enter email for a payment link"
                  className="flex-1 px-3 py-2 rounded-lg border"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <button
                  className="px-3 py-2 rounded-lg bg-rose-600 text-white"
                  onClick={() =>
                    alert(`A payment link will be emailed to: ${email || "(no email)"}`)
                  }
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-5 flex items-center justify-end">
        <button
          onClick={handleFinish}
          disabled={saving}
          className="px-6 py-2 rounded-xl bg-emerald-600 text-white disabled:opacity-60"
        >
          {saving ? "Saving..." : "Finish"}
        </button>
      </div>

      {error && <p className="text-rose-600 text-sm mt-2">{error}</p>}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Done({ declined = false }: { declined?: boolean }) {
  return (
    <div className="p-6 text-center">
      <h2 className="text-2xl font-bold">
        {declined ? "Thanks for letting us know" : "All set — see you soon!"}
      </h2>
      <p className="mt-3 text-slate-600">
        {declined
          ? "We’re sorry you can’t make it, but we truly appreciate the RSVP."
          : "Thank you for RSVPing — we’ve received your details and look forward to celebrating with you."}
      </p>
    </div>
  );
}

// small helper used by Details
function DeclineButton({ onDecline }: { onDecline?: () => void }) {
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function handleDecline() {
    const ok = confirm("Are you sure you want to decline the invitation?");
    if (!ok) return;
    try {
      setSaving(true);
      setErr(null);
      const name = (localStorage.getItem("rsvp_name") || "").trim();
      const email = (localStorage.getItem("rsvp_email") || "").trim();
      const code = (localStorage.getItem("guest_code") || "").trim();
      await addDoc(collection(db, "rsvps"), {
        name,
        email,
        guestCode: code || null,
        status: "declined",
        createdAt: serverTimestamp(),
      });
      onDecline && onDecline();
    } catch (e: any) {
      setErr(e?.message || "Could not record decline. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="text-center">
      <button
        onClick={handleDecline}
        disabled={saving}
        className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      >
        {saving ? "Sending…" : "Can’t make it? Decline"}
      </button>
      {err && <div className="text-rose-600 text-xs mt-2">{err}</div>}
    </div>
  );
}

console.log("FB project:", import.meta.env.VITE_FB_PROJECT_ID);
