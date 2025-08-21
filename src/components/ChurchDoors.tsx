import { useEffect, useRef } from "react";
import "../styles/doors.css";

export default function ChurchDoors() {
  const churchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // small delay for dramatic effect and to ensure paint
    const t = setTimeout(() => {
      churchRef.current?.classList.add("open");
    }, 500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="church-hero">
      <div ref={churchRef} id="church-doors">
        <div className="door left-door" />
        <div className="door right-door" />
      </div>

      {/* Optional title overlay; tweak or remove */}
      <div className="hero-title">
        <h1>Lynn &amp; Llewellyn</h1>
        <p>05 December 2026 • Cape Town</p>
      </div>
    </div>
  );
}
