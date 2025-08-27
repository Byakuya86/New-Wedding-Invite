// src/emailAdminOnRsvp.ts
import { addDoc, collection } from "firebase/firestore";
import { db } from "./lib/firebase";

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (m) => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]!
  ));
}

export async function sendAdminRsvpEmail(
  to: string | string[],
  data: {
    status?: "attending" | "declined";       // ← NEW (optional)
    refCode: string;
    guestCode: string;
    name: string;
    email?: string;
    phone?: string;
    dietary?: string;
    message?: string;
    song?: string;
    guests?: number;                         // ← optional for decline
    guestNames?: string[];                   // ← optional for decline
    paymentMethod?: "none" | "hotel_counter" | "eft"; // ← optional for decline
  }
) {
  const toList = Array.isArray(to) ? to : [to];

  const guests = Number.isInteger(data.guests) ? (data.guests as number) : 0;
  const guestNamesArr = Array.isArray(data.guestNames) ? data.guestNames! : [];
  const guestNamesHtml = guestNamesArr.slice(0, guests).map((n, i) =>
    `<li>${i + 1}. ${escapeHtml(n || "(blank)")}</li>`
  ).join("");

  const statusLabel = data.status
    ? (data.status === "declined" ? "Declined" : "Attending")
    : "RSVP";

  const html = `
    <div style="font-family:Segoe UI,Roboto,Arial,sans-serif;line-height:1.5;color:#111">
      <h2>New RSVP received</h2>
      <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
        <tr><td><b>Status</b></td><td>${escapeHtml(statusLabel)}</td></tr>
        <tr><td><b>Main contact</b></td><td>${escapeHtml(data.name)}</td></tr>
        ${data.phone ? `<tr><td><b>Phone</b></td><td>${escapeHtml(data.phone)}</td></tr>` : ""}
        ${data.email ? `<tr><td><b>Email</b></td><td>${escapeHtml(data.email)}</td></tr>` : ""}
        ${data.dietary ? `<tr><td><b>Dietary</b></td><td>${escapeHtml(data.dietary)}</td></tr>` : ""}
        ${data.message ? `<tr><td><b>Notes</b></td><td>${escapeHtml(data.message)}</td></tr>` : ""}
        ${data.song ? `<tr><td><b>Song request</b></td><td>${escapeHtml(data.song)}</td></tr>` : ""}
        <tr><td><b>Seats booked</b></td><td>${guests}</td></tr>
        <tr><td><b>Guest names</b></td><td><ul style="margin:6px 0;padding-left:18px">${guestNamesHtml}</ul></td></tr>
        ${data.paymentMethod ? `<tr><td><b>Payment</b></td><td>${escapeHtml(data.paymentMethod.replace("_"," "))}</td></tr>` : ""}
        <tr><td><b>Ref code</b></td><td>${escapeHtml(data.refCode)}</td></tr>
        <tr><td><b>Invite code</b></td><td>${escapeHtml(data.guestCode || "(none)")}</td></tr>
      </table>
    </div>
  `.trim();

  const text = [
    `New RSVP received`,
    `Status: ${statusLabel}`,
    `Main contact: ${data.name}`,
    data.phone ? `Phone: ${data.phone}` : null,
    data.email ? `Email: ${data.email}` : null,
    data.dietary ? `Dietary: ${data.dietary}` : null,
    data.message ? `Notes: ${data.message}` : null,
    data.song ? `Song: ${data.song}` : null,
    `Seats booked: ${guests}`,
    ...guestNamesArr.slice(0, guests).map((n, i) => `  ${i + 1}. ${n || "(blank)"}`),
    data.paymentMethod ? `Payment: ${data.paymentMethod.replace("_"," ")}` : null,
    `Ref code: ${data.refCode}`,
    `Invite code: ${data.guestCode || "(none)"}`,
  ].filter(Boolean).join("\n");

  const subject = `RSVP • ${statusLabel} • ${data.name} (${data.refCode || data.guestCode || "?"})`;

  await addDoc(collection(db, "mail"), {
    to: toList,
    message: { subject, text, html },
  });
}
