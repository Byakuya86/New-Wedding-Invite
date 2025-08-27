// Version: v2.2 (one-time RSVP by code; no prefill/cache for guest info; hosted bypass; per-invite amount; song in GuestInfo)

import React, { useEffect, useMemo, useRef, useState } from "react";
import { collection, addDoc, serverTimestamp, getDoc, doc, setDoc } from "firebase/firestore";
import { db } from "./lib/firebase";
import { createPortal } from "react-dom";
import { setLogLevel } from "firebase/firestore";
import { sendAdminRsvpEmail } from "./emailAdminOnRsvp";
console.log("Firestore projectId:", db.app.options.projectId);
setLogLevel("debug"); // see rule evaluations in the browser console


const COIN_PER_GAME = 25;
const SEAT_PRICE = 25;


function PageDimmer({ show, opacity = 0.25 }: { show: boolean; opacity?: number }) {
  if (!show) return null;
  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: `rgba(0,0,0,${opacity})`,
        pointerEvents: "none",
        zIndex: 2147483000,
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
  

  // Coins: keep as-is (ok to cache game currency)
  const [coins, setCoins] = useState<number>(() => {
    const saved = localStorage.getItem("invitation_coins");
    return saved ? Number(saved) : 0;
  });
  useEffect(() => {
    localStorage.setItem("invitation_coins", String(coins));
  }, [coins]);

  const [guestCount, setGuestCount] = useState(1);
  const [jackpotOpen, setJackpotOpen] = useState(false);
  const [prefillVersion, setPrefillVersion] = useState(0); // kept to not break signatures
  const [declined, setDeclined] = useState(false);
  const [customDoneMessage, setCustomDoneMessage] = useState<string | null>(null);

  const dimmed = !["door", "game1", "game2"].includes(screen) && !jackpotOpen;

  // URL ?g=CODE (no caching of this in localStorage anymore)
  const [guestCode, setGuestCode] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get("g");
    setGuestCode(urlCode ? urlCode.trim() : null);
  }, []);

  // Guest profile (+ per-invite amount)
  const [guestProfile, setGuestProfile] = useState<{
    name?: string;
    email?: string;
    seatsAllocated?: number;
    dietaryDefault?: string;
    messageDefault?: string;
    compedNights?: number;
    hostedStay?: boolean;
    amountDueZar?: number;
  } | null>(null);

  // RSVP form data (lifted to top-level; NO localStorage)
  const [rsvpData, setRsvpData] = useState<{
    primaryName: string;
    phone: string;
    dietary: string;
    message: string;
    guestNames: string[];
    song: string; // ← moved here
  }>({
    primaryName: "",
    phone: "",
    dietary: "None",
    message: "",
    guestNames: [],
    song: "", // ← default empty
  });

  // Ensure guestNames length matches seat count
  useEffect(() => {
    setRsvpData((prev) => {
      const arr = (prev.guestNames || []).slice(0, guestCount);
      while (arr.length < guestCount) arr.push("");
      return { ...prev, guestNames: arr };
    });
  }, [guestCount]);

  // Fetch guests/{code}, set seat limit; DO NOT prefill form or cache
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
        amountDueZar?: number;
      };
      setGuestProfile(g);

      if (Number.isFinite(g.seatsAllocated)) {
        setGuestCount(Math.max(1, Math.min(6, Number(g.seatsAllocated))));
      }

      // bump to trigger any dependent effects/components (kept for compatibility)
      setPrefillVersion((v) => v + 1);
    }
    loadGuest();
  }, [guestCode]);

// One-time RSVP: no read of /rsvps due to rules; just peek test flag for behavior if needed
  useEffect(() => {
    async function checkAlreadyRSVPd() {
      if (!guestCode) return;
      try {
        const snap = await getDoc(doc(db, "rsvps", guestCode));
        if (snap.exists()) {
          // Optional: tailor the message based on status
          const status = snap.get("status");
          setCustomDoneMessage(
            status === "declined"
              ? "We’ve already received your RSVP. If this was a mistake, please contact the couple."
              : "We’ve already received your RSVP. See you there!"
          );
          setScreen("done");
        }
      } catch (e) {
        // ignore
      }
    }
    checkAlreadyRSVPd();
  }, [guestCode]);

  const isHosted = !!(guestProfile?.compedNights || guestProfile?.hostedStay);

  return (
    <div
      className="
        relative min-h-screen w-full text-slate-800
        bg-[radial-gradient(1200px_600px_at_-10%_-10%,#ffe4e6_0%,transparent_60%),radial-gradient(1000px_500px_at_110%_-10%,#fff1c1_0%,transparent_60%),radial-gradient(1200px_600px_at_50%_120%,#e0f2fe_0%,transparent_60%)]
      "
    >
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
                hosted={isHosted}
                payAmountZar={guestProfile?.amountDueZar} 
                onNext={() => setScreen("game1")}
                onDecline={() => {
                  setScreen("done");
                  setDeclined(true);
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
                  // no caching; just move forward and deduct coins
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
                guestsCount={guestCount}
                rsvpData={rsvpData}
                setRsvpData={setRsvpData}
              />
            )}

            {screen === "songAndPay" && (
              <SongAndPayment
                onFinish={() => setScreen("done")}
                rsvpData={rsvpData}
                guestCode={guestCode}
                guestCount={guestCount}
                coins={coins}
                setScreen={setScreen}
                setDoneMessage={setCustomDoneMessage}
                hosted={isHosted}
                payAmountZar={guestProfile?.amountDueZar}
              />
            )}

            {screen === "done" && <Done declined={declined} message={customDoneMessage} />}
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

  const wrap: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    width: "100%",
    height: "100dvh",
    minHeight: "100svh",
    overflow: "hidden",
    zIndex: 0,
  };
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
  const imgStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
    objectPosition: "center",
    zIndex: 1,
    pointerEvents: "none",
  };
  const tint: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    background: "linear-gradient(rgba(0,0,0,.12), rgba(0,0,0,.22))",
    zIndex: 2,
    pointerEvents: "none",
  };

  const doorBase: React.CSSProperties = {
    position: "absolute",
    top: 0,
    height: "100%",
    width: "50%",
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
    backgroundImage: `linear-gradient(135deg, rgba(0,0,0,.15), rgba(0,0,0,.35)), url('${LEFT_DOOR_IMG}')`,
    backgroundSize: "cover, cover",
    backgroundPosition: "center, center",
  };

  const rightDoor: React.CSSProperties = {
    ...doorBase,
    right: 0,
    transform: open ? "translateX(100%)" : "translateX(0)",
    borderLeft: "4px solid #2f1a0f",
    backgroundImage: `linear-gradient(135deg, rgba(0,0,0,.15), rgba(0,0,0,.35)), url('${RIGHT_DOOR_IMG}')`,
    backgroundSize: "cover, cover",
    backgroundPosition: "center, center",
  };

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
  const hinge: React.CSSProperties = {
    position: "absolute",
    width: 10,
    height: 26,
    borderRadius: 3,
    background: "linear-gradient(180deg,#e8d79a,#c6a544,#e8d79a)",
    boxShadow: "0 1px 2px rgba(0,0,0,.6)",
  };

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

      <div style={leftDoor}>
        <div style={{ ...handleBase, right: 18 }} />
        <div style={{ ...keyDot, right: 24 }} />
        <div style={{ ...hinge, left: -5, top: "20%" }} />
        <div style={{ ...hinge, left: -5, top: "48%" }} />
        <div style={{ ...hinge, left: -5, top: "76%" }} />
      </div>

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

function Details({
  onNext,
  hosted = false,
  onDecline,
  payAmountZar,
}: {
  onNext: () => void;
  onOpenJackpot?: () => void;
  hosted?: boolean;
  onDecline?: () => void;
  payAmountZar?: number;
}) {
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
    <b>Hotel Booking:</b>{" "}
    <span className="text-emerald-700 font-semibold">One night’s stay on us!</span>
  </li>
) : (
  <li><b>Hotel Booking:</b> One night stay at own cost</li>
)}
{!hosted && typeof payAmountZar === "number" && (
  <div className="mt-4 max-w-2xl mx-auto p-3 rounded-lg border-amber-300 bg-amber-50/60 text-sm">
    <div className="font-medium">
      <li><b>Amount due for your invite:</b> R {payAmountZar.toLocaleString("en-ZA")}</li>
    </div>
  </div>
)}
            {!hosted && (
              <>
                <li>
                  <b>Payment Details:</b> Payment can be made via EFT or at the reception counter on the
                  day; unfortunately no refunds. Please use your reference code when paying.
                </li>
                <li><b>Further details will be provided at the end of the reservation.</b></li>
              </>
            )}
            <li>
              <b>Check-In:</b> 3 pm <span className="mx-1">|</span> <b>Check-Out:</b> 11 am next day
            </li>
            <li><b>Food &amp; Drinks:</b> Food provided and Cash Bar</li>
            <li><b>Additional Activities:</b> Optional, at own cost</li>
            <li><b>Wedding Gifts:</b> Monetary value will be appreciated, Banking details will be provided on the day</li>
            <li><b>RSVP BY:</b> 30th October 2025</li>
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

      <div className="mt-10 flex justify-center gap-4">
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

// -------------------- Game 1 --------------------
function PetalClickGame({ onWin, onGiveUp }: { onWin: () => void; onGiveUp: () => void }) {
  const TARGET = 30;
  const DURATION = 25000;
  const PETAL_COUNT = 10;
  const SPEED = 2.0;

  const [lost, setLost] = useState(false);
  const startRef = useRef<number>(Date.now());
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [caught, setCaught] = useState(0);
  const caughtRef = useRef(0);
  const [ended, setEnded] = useState(false);
  caughtRef.current = caught;

  type Petal = {
    id: number; x: number; y: number; r: number; vx: number; vy: number;
    alive: boolean; pop: number;
  };

  const makePetalFromTop = (id: number): Petal => ({
    id,
    x: Math.random() * 0.88 + 0.06,
    y: -0.08,
    r: Math.random() * 360,
    vx: (Math.random() - 0.5) * 0.018,
    vy: (0.012 + Math.random() * 0.015) * SPEED,
    alive: true,
    pop: 0,
  });

  const [petals, setPetals] = useState<Petal[]>(
    () => Array.from({ length: PETAL_COUNT }, (_, i) => makePetalFromTop(i + 1))
  );

  useEffect(() => {
    const moveId = setInterval(() => {
      if (ended) return;

      setPetals(prev =>
        prev.map(p => {
          if (!p.alive) {
            const npop = Math.min(1, p.pop + 0.2);
            if (npop >= 1) return makePetalFromTop(p.id);
            return { ...p, pop: npop };
          }
          let nx = p.x + p.vx;
          if (nx < 0.06 || nx > 0.94) nx = Math.min(0.94, Math.max(0.06, nx));
          let ny = p.y + p.vy;
          if (ny > 1.05) ny = -0.05;
          return { ...p, x: nx, y: ny, r: (p.r + 2) % 360 };
        })
      );

      const left = DURATION - (Date.now() - startRef.current);
      setTimeLeft(Math.max(0, left));

      if (left <= 0) {
        clearInterval(moveId);
        setEnded(true);
        setPetals([]);

        if (caughtRef.current >= TARGET) {
          // allow Claim button to continue
        } else {
          setLost(true);
          setTimeout(() => onGiveUp(), 5000);
        }
      }
    }, 60);

    return () => clearInterval(moveId);
  }, [SPEED, ended, onGiveUp]);

  useEffect(() => {
    if (caught >= TARGET) {
      setEnded(true);
      setPetals([]);
    }
  }, [caught]);

  function catchPetal(id: number) {
    if (ended || caughtRef.current >= TARGET) return;
    setPetals(prev =>
      prev.map(p => (p.id === id && p.alive ? { ...p, alive: false, pop: 0 } : p))
    );
    setCaught(c => c + 1);
  }

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
    width: 80, height: 80,
    background: "#fff",
    borderRadius: 999,
    boxShadow: "0 10px 20px rgba(0,0,0,.15), 0 0 0 2px rgba(244,63,94,.6)",
  };

  return (
    <div style={wrapStyle}>
      <h2 className="text-xl font-semibold">Game 1 · Catch the petals 🌸</h2>
      <p className="text-slate-600 text-sm">Click {TARGET} petals before the timer runs out to earn 25 coins.</p>

      <div className="flex items-center gap-3 mt-3 text-sm">
        <span className="px-3 py-1 rounded-full bg-emerald-100">Caught: <b>{caught}</b>/{TARGET}</span>
        <span className="px-3 py-1 rounded-full bg-sky-100">Time: <b>{Math.ceil(timeLeft / 1000)}s</b></span>
      </div>

      {lost &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,.45)",
              zIndex: 2147483646,
              display: "grid",
              placeItems: "center",
              padding: 24,
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 480,
                borderRadius: 16,
                background: "#fff",
                padding: 24,
                boxShadow: "0 24px 64px rgba(0,0,0,.45)",
                textAlign: "center",
              }}
            >
              <div className="text-2xl font-semibold text-slate-900">Game Over</div>
              <p className="mt-2 text-slate-600">You didn’t catch {TARGET} petals in time.</p>
              <p className="mt-1 text-slate-500 text-sm">Moving to the next game in <b>5</b> seconds…</p>
              <button
                onClick={onGiveUp}
                className="mt-4 px-4 py-2 rounded-lg bg-rose-600 text-white hover:brightness-110"
              >
                Continue now
              </button>
            </div>
          </div>,
          document.body
        )
      }

      <div style={boxStyle}>
        {!ended && petals.map(p => {
          const left = p.x * 100, top = p.y * 100;
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
                transition: p.alive ? "none" : "transform 220ms ease, opacity 220ms ease",
                zIndex: 10001,
                cursor: p.alive ? "pointer" : "default",
              }}
            >
              <span style={petalChip}><span style={{ fontSize: 40, lineHeight: 1 }}>🌸</span></span>
            </button>
          );
        })}
      </div>

      {!lost && (
        <div className="mt-4 flex items-center justify-end">
          <button
            className="px-4 py-2 rounded-lg bg-rose-600 text-white disabled:opacity-50"
            onClick={() => caught >= TARGET && onWin()}
            disabled={caught < TARGET}
          >
            Claim 25 coins
          </button>
        </div>
      )}
    </div>
  );
}

// -------------------- Game 2 --------------------
function ReactionGame({ onWin, onSkip }: { onWin: () => void; onSkip: () => void }) {
  const SPEED = 4;
  const TICK = 16;
  const TARGET_START = 55;
  const TARGET_END = 65;
  const MAX_ATTEMPTS = 3;

  const [running, setRunning] = useState(true);
  const [pos, setPos] = useState(0);
  const [hit, setHit] = useState<null | boolean>(null);
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);
  const [lost, setLost] = useState(false);

  const dirRef = useRef(1);
  const runRef = useRef(true);
  useEffect(() => { runRef.current = running; }, [running]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!runRef.current || locked || lost) return;
      setPos(prev => {
        let np = prev + dirRef.current * SPEED;
        if (np >= 100) { np = 100; dirRef.current = -1; }
        if (np <= 0) { np = 0; dirRef.current = 1; }
        return np;
      });
    }, TICK);
    return () => clearInterval(id);
  }, [locked, lost]);

  function stop() {
    if (locked || lost) return;
    setRunning(false);
    const ok = pos >= TARGET_START && pos <= TARGET_END;
    setHit(ok);

    const next = attempts + 1;
    setAttempts(next);

    if (ok) {
      setTimeout(onWin, 220);
    } else if (next >= MAX_ATTEMPTS) {
      setLocked(true);
      setLost(true);
      setTimeout(() => onSkip(), 5000);
    }
  }

  function reset() {
    if (locked || lost) return;
    setHit(null);
    setRunning(true);
    runRef.current = true;
    dirRef.current = 1;
    setPos(0);
  }

  const wrap: React.CSSProperties = { position: "relative", zIndex: 10000, padding: 24 };
  const box: React.CSSProperties = {
    position: "relative", height: 170, marginTop: 16, borderRadius: 16, overflow: "hidden",
    background: "linear-gradient(180deg,#ffffff,#f8fafc)", outline: "1px solid rgba(148,163,184,.35)",
    boxShadow: "inset 0 6px 18px rgba(0,0,0,.08)"
  };
  const lane: React.CSSProperties = { position: "absolute", left: 16, right: 16, top: 0, bottom: 0 };
  const track: React.CSSProperties = {
    position: "absolute", left: 0, right: 0, top: "50%", height: 8, transform: "translateY(-50%)",
    background: "#e5e7eb", borderRadius: 999
  };
  const target: React.CSSProperties = {
    position: "absolute", top: "50%", height: 22, transform: "translateY(-50%)",
    left: `${TARGET_START}%`, width: `${TARGET_END - TARGET_START}%`,
    background: "rgba(16,185,129,.20)", border: "1px solid rgba(16,185,129,.45)", borderRadius: 8
  };
  const marker: React.CSSProperties = {
    position: "absolute", top: "50%", left: `${pos}%`, transform: "translate(-50%,-50%)",
    width: 20, height: 20, borderRadius: 999, background: "#f43f5e",
    boxShadow: "0 0 0 3px rgba(244,63,94,.35), 0 8px 14px rgba(0,0,0,.25)",
    outline: hit == null ? "none" : (hit ? "3px solid rgba(16,185,129,.65)" : "3px solid rgba(244,63,94,.65)")
  };

  return (
    <div style={wrap}>
      <h2 className="text-xl font-semibold">Game 2 · Perfect timing ⏱️</h2>
      <p className="text-slate-600 text-sm">Stop the slider inside the highlighted zone to earn 25 coins.</p>
      <p className="text-xs text-slate-500 mt-1">
        Attempts: <b>{attempts}</b> / {MAX_ATTEMPTS}
        {locked && " — out of attempts."}
      </p>

      <div style={box}>
        {!lost && (
          <div style={lane}>
            <div style={track} />
            <div style={target} />
            <div style={marker} />
          </div>
        )}
      </div>

      {!lost && (
        <div className="mt-4 flex gap-3 justify-end">
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
      )}

      {lost &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,.45)",
              zIndex: 2147483646,
              display: "grid",
              placeItems: "center",
              padding: 24,
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 480,
                borderRadius: 16,
                background: "#fff",
                padding: 24,
                boxShadow: "0 24px 64px rgba(0,0,0,.45)",
                textAlign: "center",
              }}
            >
              <div className="text-2xl font-semibold text-slate-900">Game Over</div>
              <p className="mt-2 text-slate-600">You missed all {MAX_ATTEMPTS} attempts.</p>
              <p className="mt-1 text-slate-500 text-sm">Moving to the next game in <b>5</b> seconds…</p>
              <button
                onClick={onSkip}
                className="mt-4 px-4 py-2 rounded-lg bg-rose-600 text-white hover:brightness-110"
              >
                Continue now
              </button>
            </div>
          </div>,
          document.body
        )
      }
    </div>
  );
}

// -------------------- Seats --------------------
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
      <p className="mt-3 text-base text-slate-700">Seats cost {SEAT_PRICE} coins each. Use your winnings to RSVP.</p>

      <div className="mt-20 max-w-xl mx-auto space-y-10">
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
            <div className="text-xs text-slate-500">(Max allowed for your invite: {maxGuests})</div>
          )}

          <div className="mt-4 text-sm space-y-5">
            <div>Total cost: <b>{totalCost}</b> coins</div>
            <div>Balance after purchase: <b>{coins - totalCost}</b></div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-50">
            💰 You have <b>{coins}</b> coins
          </div>
          {!enough && (
            <div className="text-rose-700 text-sm">
              You need <b>{deficit}</b> more coin{deficit === 1 ? "" : "s"}.
            </div>
          )}
        </section>

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
  const SPIN_MS = 1200;
  const TICK_MS = 80;
  const award = Math.max(needed, 25);

  const [spinning, setSpinning] = React.useState(false);
  const [result, setResult] = React.useState<string[]>(["💍", "💒", "💖"]);
  const spinningRef = React.useRef(false);

  React.useEffect(() => {
    if (spinningRef.current) return;
    spinningRef.current = true;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && !spinningRef.current) onJackpot(award);
    };
    window.addEventListener("keydown", onKey);

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
      setResult(["💍", "💍", "💍"]);
      setSpinning(false);
      spinningRef.current = false;
    }, SPIN_MS);

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
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
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

        <p style={{ marginTop: 6, fontSize: 14, color: "#475569" }}>Automatic jackpot to cover your missing coins.</p>
        <p style={{ marginTop: 4, fontSize: 14 }}>You’ll receive <b>{award}</b> coins.</p>

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
          <button onClick={onClose} className="px-4 py-2 rounded-lg border">Close</button>
          {!spinning && (
            <button onClick={() => onJackpot(award)} className="px-4 py-2 rounded-lg bg-emerald-600 text-white" autoFocus>
              Claim Jackpot
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// -------------------- Guest Info (now includes Song) --------------------
function GuestInfo({
  onNext,
  onBack,
  guestsCount,
  rsvpData,
  setRsvpData,
}: {
  prefillVersion: number; // unused now
  onNext: () => void;
  onBack: () => void;
  guestsCount: number;
  rsvpData: { primaryName: string; phone: string; dietary: string; message: string; guestNames: string[]; song: string };
  setRsvpData: React.Dispatch<React.SetStateAction<{
    primaryName: string; phone: string; dietary: string; message: string; guestNames: string[]; song: string;
  }>>;
}) {
  const names = rsvpData.guestNames.length === guestsCount
    ? rsvpData.guestNames
    : Array.from({ length: guestsCount }, (_, i) => rsvpData.guestNames[i] || "");

  const allGuestNamesFilled =
    names.slice(0, guestsCount).every((n) => !!(n || "").trim()) &&
    !!rsvpData.primaryName.trim();

  function handleNext() {
    onNext();
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold">Guest details 📝</h2>
      <p className="text-slate-600 text-sm">Tell us who’s coming. We’ve added a name field for each seat you selected.</p>

      <div className="mt-4 grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <Labeled label="Primary contact name">
            <input
              className="w-full px-3 py-2 rounded-lg border"
              value={rsvpData.primaryName}
              onChange={(e) => setRsvpData((prev) => ({ ...prev, primaryName: e.target.value }))}
            />
          </Labeled>

          <Labeled label="Phone">
            <input
              className="w-full px-3 py-2 rounded-lg border"
              value={rsvpData.phone}
              onChange={(e) => setRsvpData((prev) => ({ ...prev, phone: e.target.value }))}
            />
          </Labeled>

          <Labeled label="Dietary preferences (general)">
            <select
              className="w-full px-3 py-2 rounded-lg border"
              value={rsvpData.dietary}
              onChange={(e) => setRsvpData((prev) => ({ ...prev, dietary: e.target.value }))}
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
          <Labeled label="Message / special notes">
            <textarea
              rows={5}
              className="w-full px-3 py-2 rounded-lg border"
              value={rsvpData.message}
              onChange={(e) => setRsvpData((prev) => ({ ...prev, message: e.target.value }))}
            />
          </Labeled>

          <div className="mt-3">
            <Labeled label="Song request">
              <input
                className="w-full px-3 py-2 rounded-lg border"
                placeholder="Artist – Song Title"
                value={rsvpData.song}
                onChange={(e) => setRsvpData((prev) => ({ ...prev, song: e.target.value }))}
              />
            </Labeled>
            <p className="text-xs text-slate-500 mt-2">We'll do our best to get it on the playlist!</p>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-slate-700">Guest names ({guestsCount})</h3>
        <div className="mt-2 grid md:grid-cols-2 gap-3">
          {names.map((name, i) => (
            <Labeled key={i} label={`Guest ${i + 1} name`}>
              <input
                className="w-full px-3 py-2 rounded-lg border"
                value={name}
                onChange={(e) => {
                  const arr = [...names];
                  arr[i] = e.target.value;
                  setRsvpData((prev) => ({ ...prev, guestNames: arr }));
                }}
              />
            </Labeled>
          ))}
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <button onClick={onBack} className="px-4 py-2 rounded-lg border">Back</button>
        <button
          onClick={handleNext}
          disabled={!allGuestNamesFilled}
          className={`px-6 py-2 rounded-xl text-white shadow ${
            !allGuestNamesFilled ? "bg-slate-300" : "bg-rose-600 hover:brightness-110"
          }`}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

// -------------------- Payment & Submit (one-time by code) --------------------
function SongAndPayment({
  onFinish,
  rsvpData,
  guestCode,
  guestCount,
  coins,
  setDoneMessage,
  hosted = false,
  payAmountZar,
}: {
  onFinish: () => void;
  rsvpData: { primaryName: string; phone: string; dietary: string; message: string; guestNames: string[]; song: string };
  guestCode: string | null;
  guestCount: number;
  coins: number;
  setScreen: (s: Screen) => void;
  setDoneMessage: (m: string) => void;
  hosted?: boolean;
  payAmountZar?: number;
}) {
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"none" | "eft" | "hotel_counter">(
    hosted ? "none" : "hotel_counter"
  );

  useEffect(() => {
    if (hosted) setPaymentMethod("none");
  }, [hosted]);

  const bank = useMemo(
    () => ({
      accountName: "Houw Hoek Hotel",
      bank: "First National Bank Commercial",
      accNo: "62643591060",
      branch: "210554",
    }),
    []
  );

  // Reference code: prefer guestCode; else initials+last4 of phone from rsvpData
  const refCode = useMemo(() => {
    const code = (guestCode || "").trim();
    if (code) return code.toUpperCase();

    const rawName = rsvpData.primaryName.trim();
    const rawPhone = rsvpData.phone;
    const initials = rawName
      ? rawName.split(/\s+/).map((s) => s[0]).join("").slice(0, 3).toUpperCase()
      : "GUEST";
    const digits = (rawPhone.match(/\d/g) || []).join("");
    const last4 = digits.slice(-4) || String(Math.floor(Math.random() * 9000) + 1000);
    return `${initials}-${last4}`;
  }, [guestCode, rsvpData.primaryName, rsvpData.phone]);

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

  // ---- Send EFT details via Firebase Email extension (/mail) ----
  async function sendEftEmail(toEmail: string) {
    if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
      throw new Error("Please enter a valid email address.");
    }

    const subject = "Your Houw Hoek payment details";
    const text = [
      "Thanks for RSVPing to Lynn & Llewellyn's reception!",
      "",
      "Banking details:",
      `Account Name: ${bank.accountName}`,
      `Bank: ${bank.bank}`,
      `Account No: ${bank.accNo}`,
      `Branch: ${bank.branch}`,
      `Reference: ${refCode}`,
      ...(typeof payAmountZar === "number"
        ? ["", `Amount due: R ${payAmountZar.toLocaleString("en-ZA")}`]
        : []),
      "",
      "Please include the reference in your payment.",
    ].join("\n");

    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.5">
        <p>Thanks for RSVPing to <b>Lynn &amp; Llewellyn's</b> reception!</p>
        <h3 style="margin:16px 0 8px">Banking details</h3>
        <table cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr><td style="padding:4px 8px"><b>Account Name:</b></td><td style="padding:4px 8px">${bank.accountName}</td></tr>
          <tr><td style="padding:4px 8px"><b>Bank:</b></td><td style="padding:4px 8px">${bank.bank}</td></tr>
          <tr><td style="padding:4px 8px"><b>Account No:</b></td><td style="padding:4px 8px">${bank.accNo}</td></tr>
          <tr><td style="padding:4px 8px"><b>Branch:</b></td><td style="padding:4px 8px">${bank.branch}</td></tr>
          <tr><td style="padding:4px 8px"><b>Reference:</b></td>
              <td style="padding:4px 8px"><code style="background:#f1f5f9;padding:2px 6px;border-radius:6px">${refCode}</code></td></tr>
        </table>
        ${typeof payAmountZar === "number"
          ? `<p style="margin-top:12px"><b>Amount due:</b> R ${payAmountZar.toLocaleString("en-ZA")}</p>`
          : ""}
        <p style="margin-top:16px">Please include the reference in your payment so we can match it to your RSVP.</p>
      </div>
    `;

    // Write to /mail — Firebase Email extension will send it
    await addDoc(collection(db, "mail"), {
      to: [toEmail],
      message: { subject, text, html },
    });
  }

  async function handleFinish() {
  setSaving(true);
  setError(null);
  const code = (guestCode || "").trim();
const guestRef = doc(db, "guests", code);
const guestSnap = await getDoc(guestRef);
console.log("guest exists?", guestSnap.exists(), "hostedStay:", guestSnap.get("hostedStay"), "compedNights:", guestSnap.get("compedNights"));

const rsvpRef = doc(db, "rsvps", code);
const rsvpSnap = await getDoc(rsvpRef);
console.log("existing RSVP?", rsvpSnap.exists(), "paymentMethod about to send:", hosted ? "none" : paymentMethod);
  try {
    const code = (guestCode || "").trim();
    if (!code) throw new Error("Missing invite code in the URL (?g=CODE).");

    // ----- PRE-CHECKS that mirror your Firestore rules -----

    // /guests/{code} must exist (case-sensitive) or rules will deny
    const guestRef = doc(db, "guests", code);
    const guestSnap = await getDoc(guestRef);
    if (!guestSnap.exists()) {
      throw new Error(
        `Invite code not found. Please create /guests/${code} first (case-sensitive).`
      );
    }

    // Basic validation
    if (!rsvpData.primaryName.trim()) throw new Error("Please provide your name.");
    if (guestCount < 1 || guestCount > 6) throw new Error("Guest count must be between 1 and 6.");
    if (rsvpData.guestNames.slice(0, guestCount).some((n) => !(n || "").trim())) {
      throw new Error("Please fill all guest names.");
    }

    // Payment method must be valid for hosted / non-hosted per your rules
    // (hosted => 'none' | 'hotel_counter' | 'eft'; non-hosted => 'hotel_counter' | 'eft')
    const pm = hosted ? (paymentMethod || "none") : paymentMethod;
    if (!pm || (!hosted && !["hotel_counter", "eft"].includes(pm))) {
      throw new Error("Please select a valid payment method.");
    }

    // Make sure numbers are integers (rules require int for guests/coins)
    const guestsInt = Number(guestCount);
    const coinsInt = Number(coins);
    if (!Number.isInteger(guestsInt) || !Number.isInteger(coinsInt)) {
      throw new Error("Guests and coins must be whole numbers.");
    }

    // ----- WRITE -----
    const ref = doc(db, "rsvps", code);
    const payload = {
      guestCode: code,
      status: "attending",
      name: rsvpData.primaryName.trim(),
      // email is OPTIONAL in rules; empty string is OK. Omit if truly empty:
      ...(email?.trim() ? { email: email.trim() } : {}),
      // the following are OPTIONAL in rules; include them only if you collect them
      ...(rsvpData.phone ? { phone: rsvpData.phone.trim() } : {}),
      ...(rsvpData.dietary ? { dietary: rsvpData.dietary } : {}),
      ...(rsvpData.message ? { message: rsvpData.message.trim() } : {}),
      ...(rsvpData.song ? { song: rsvpData.song } : {}),
      guests: guestsInt,
      guestNames: rsvpData.guestNames.slice(0, guestsInt).map((s) => (s || "").trim()),
      coins: coinsInt,
      paymentMethod: pm,
      refCode,
      // amountDueZar is not validated in rules; null is fine, or omit
      ...(typeof payAmountZar === "number" ? { amountDueZar: payAmountZar } : {}),
      createdAt: serverTimestamp(),
    };

    console.log("RSVP path about to write:", `rsvps/${code}`, payload);
    await setDoc(ref, payload, { merge: false });

    // Verify immediately so you know it really exists
    const verifySnap = await getDoc(ref);
    console.log("Post-write exists?", verifySnap.exists(), verifySnap.data());

    // ADD: send admin notification email
await sendAdminRsvpEmail(
  ["l.delange97@gmail.com", "lynnishot@gmail.com"], // ← replace with your real recipient(s)
  {
    refCode,
    guestCode: code,
    name: rsvpData.primaryName.trim(),
    email: (email ?? "").trim() || undefined,
    phone: rsvpData.phone?.trim() || undefined,
    dietary: rsvpData.dietary || undefined,
    message: rsvpData.message?.trim() || undefined,
    song: rsvpData.song?.trim() || undefined,
    guests: guestCount,
    guestNames: rsvpData.guestNames.slice(0, guestCount),
    paymentMethod: hosted ? "none" : paymentMethod,
  }
);

    setDoneMessage(
      "Your RSVP has been received, if you have any concerns feel free to contact the couple getting married."
    );
    onFinish();
  } catch (e: any) {
    console.error("RSVP write failed:", e?.code, e?.message, e);
    setError(e?.message || "Could not save RSVP. Please try again.");
  } finally {
    setSaving(false);
  }
}



  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold">Final touches 🎶💳</h2>

      {/* Hosted: show banner and HIDE payment UI */}
      {hosted && (
        <div className="mt-3 p-3 rounded-lg border-emerald-300 bg-emerald-50/60 text-sm">
          <div className="font-medium">No payment needed for your invite 🎉</div>
          <p className="mt-2">Your accommodation is covered. Just bring yourself and your dancing shoes!</p>
          <p className="mt-2">Keep your reference code below when checking in at the Hotel.</p>
          <div className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 border text-base">
            <span className="font-mono font-semibold tracking-wider">{refCode}</span>
            <button onClick={() => navigator.clipboard.writeText(refCode)} className="px-2 py-1 rounded border bg-white">
              Copy
            </button>
          </div>
        </div>
      )}

      {/* Per-invite amount for NON-hosted guests */}
      {!hosted && typeof payAmountZar === "number" && (
        <div className="mt-3 p-3 rounded-lg border-amber-300 bg-amber-50/60 text-sm">
          <div className="font-medium">
            Amount due for your invite: R {payAmountZar.toLocaleString("en-ZA")}
          </div>
          <div className="text-slate-600 mt-1">Please use your reference code when you pay.</div>
        </div>
      )}

      {/* NON-hosted only: payment selection + options */}
      {!hosted && (
        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <Card title="Payment options">
            <div className="text-sm space-y-10">
              <div className={`p-3 rounded-lg border ${paymentMethod === "hotel_counter" ? "border-emerald-400 bg-emerald-50/40" : "border-slate-200"}`}>
                <div className="font-medium">Pay at the hotel counter</div>
                <p className="mt-1">Please settle your accommodation at the <b>Houw Hoek Hotel</b> reception desk on arrival.</p>
                <p className="mt-1">Quote your unique reference code so we can match your payment to your RSVP:</p>
                <div className="mt-2 mb-10 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 border text-base">
                  <span className="font-mono font-semibold tracking-wider">{refCode}</span>
                  <button onClick={() => navigator.clipboard.writeText(refCode)} className="px-2 py-1 rounded border bg-white">
                    Copy
                  </button>
                </div>
                <div className="mt-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="pm"
                      value="hotel_counter"
                      checked={paymentMethod === "hotel_counter"}
                      onChange={() => setPaymentMethod("hotel_counter")}
                    />
                    Select hotel counter
                  </label>
                </div>
              </div>

              <div className={`p-3 rounded-lg border ${paymentMethod === "eft" ? "border-amber-400 bg-amber-50/40" : "border-slate-200"}`}>
                <div className="font-medium">EFT (bank transfer)</div>
                <div className="mt-1 space-y-1">
                  <div><b>Account:</b> {bank.accountName}</div>
                  <div><b>Bank:</b> {bank.bank}</div>
                  <div><b>Number:</b> {bank.accNo}</div>
                  <div><b>Branch:</b> {bank.branch}</div>
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
                    className="px-3 py-2 rounded-lg bg-rose-600 text-white disabled:opacity-60"
                  disabled={!email || saving}
                  onClick={async () => {
                    try {
                      setSaving(true);
                      await sendEftEmail(email.trim());
                      alert("Banking details have been emailed to you. Please check your inbox (and spam).");
                    } catch (err: any) {
                      alert(err?.message || "Could not send email. Please double-check the address and try again.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                    Send
                  </button>
                </div>

                

                <div className="mt-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="pm"
                      value="eft"
                      checked={paymentMethod === "eft"}
                      onChange={() => setPaymentMethod("eft")}
                    />
                    Select EFT
                  </label>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

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

function Done({ declined, message }: { declined: boolean; message?: string | null }) {
  return (
    <div className="p-6 text-center">
      <h2 className="text-2xl font-bold">
        {message ? "RSVP received" : declined ? "Thanks for letting us know" : "All set — see you soon!"}
      </h2>
      <p className="mt-3 text-slate-600">
        {message
          ? message
          : declined
          ? "We're sorry you can't make it. If you change your mind, please get in touch!"
          : "Thank you for RSVPing — we’ve received your details and look forward to celebrating with you."}
      </p>
    </div>
  );
}

// Decline creates/sets RSVP as declined, one-time by code
function DeclineButton({ onDecline }: { onDecline?: () => void }): React.ReactElement {
  const [saving, setSaving] = React.useState(false);

  async function handleDecline() {
  const ok = confirm("Are you sure you want to decline the invitation?");
  if (!ok) return;

  setSaving(true);
  try {
    const params = new URLSearchParams(window.location.search);
    const guestCode = (params.get("g") || "").trim();
    if (!guestCode) {
      // Anonymous decline path (allowed by rules)
      await addDoc(collection(db, "rsvps"), {
        status: "declined",
        createdAt: serverTimestamp(),
      });

      // ✅ SEND ADMIN EMAIL (anonymous decline)
      await sendAdminRsvpEmail(
        ["you@example.com", "partner@example.com"],   // <-- your recipients
        {
          status: "declined",
          refCode: "(no-ref)",
          guestCode: "",
          name: "(Anonymous decline)",
          guests: 0,
          guestNames: [],
          paymentMethod: "none",
        }
      );

      onDecline && onDecline();
      return;
    }

    const ref = doc(db, "rsvps", guestCode);
    // Lookup guest info so we can include the name
    const guestRef = doc(db, "guests", guestCode);
    const guestSnap = await getDoc(guestRef);
    const guestName = guestSnap.exists() ? guestSnap.data().name : "Unknown";

    // Try create without reading; if exists, rules reject and we treat as done
    await setDoc(ref, {
      guestCode,
      status: "declined",
      createdAt: serverTimestamp(),
    });

    // ✅ SEND ADMIN EMAIL (coded decline)
    await sendAdminRsvpEmail(
      ["l.delange97@gmail.com", "lynnishot@gmail.com"],     // <-- your recipients
      {
        status: "declined",
        refCode: guestCode,       // we use the code as the reference
        guestCode,
        name: guestName,       // you can swap to a real name if you capture it
        guests: 0,
        guestNames: [],
        paymentMethod: "none",
      }
    );

    onDecline && onDecline();
  } catch (e: any) {
    console.error("Decline write failed:", e?.code, e?.message, e);
    alert("Could not record your response. Please reload and try again, or contact the couple.");
  } finally {
    setSaving(false);
  }
}

  return (
    <button
      onClick={handleDecline}
      disabled={saving}
      className="px-6 py-2 rounded-xl bg-slate-500 text-white shadow hover:brightness-110 disabled:opacity-60"
    >
      {saving ? "Sending…" : "Can’t make it? Decline"}
    </button>
  );
  
}

console.log("FB project:", import.meta.env.VITE_FB_PROJECT_ID);
