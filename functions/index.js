// index.js (CommonJS, Firebase Functions v2)
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const nodemailer = require("nodemailer");

// Secrets (already set earlier with functions:secrets:set)
const SMTP_HOST = defineSecret("SMTP_HOST");
const SMTP_PORT = defineSecret("SMTP_PORT");
const SMTP_SECURE = defineSecret("SMTP_SECURE");
const SMTP_USER  = defineSecret("SMTP_USER");
const SMTP_PASS  = defineSecret("SMTP_PASS");
const FROM_ADDRESS = defineSecret("FROM_ADDRESS");

// NEW NAME so it doesn't collide with the existing HTTPS function
exports.firestoreSendMail = onDocumentCreated(
  {
    document: "mail/{docId}",
    region: "africa-south1",
    secrets: [SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, FROM_ADDRESS],
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const host = SMTP_HOST.value();
    const port = parseInt(SMTP_PORT.value() || "465", 10);
    const secure = (SMTP_SECURE.value() || "true") === "true";
    const user = SMTP_USER.value();
    const pass = SMTP_PASS.value();
    const defaultFrom = FROM_ADDRESS.value() || "noreply@example.com";

    const transporter = nodemailer.createTransport({
      host, port, secure,
      auth: user && pass ? { user, pass } : undefined,
    });

    const to = Array.isArray(data.to) ? data.to.join(",") : data.to;
    if (!to) return;

    const msg = data.message || {};
    await transporter.sendMail({
      from: data.from || defaultFrom,
      to,
      cc: Array.isArray(data.cc) ? data.cc.join(",") : data.cc,
      bcc: Array.isArray(data.bcc) ? data.bcc.join(",") : data.bcc,
      replyTo: data.replyTo,
      subject: msg.subject || "(no subject)",
      text: msg.text,
      html: msg.html,
    });
  }
);

const { onDocumentWritten } = require("firebase-functions/v2/firestore");

// CHANGE THIS to your email(s)
const ADMIN_NOTIFY_TO = ["L.delange97@gmail.com"]; // you can add more

/*exports.notifyOnRsvp = onDocumentWritten(
  {
    document: "rsvps/{code}",     // <-- your RSVP collection
    region: "africa-south1",
  },
  async (event) => {
    const before = event.data?.before?.data() || null;
    const after  = event.data?.after?.data() || null;
    const code   = event.params.code;

    // If somehow no new data, do nothing
    if (!after) return;

    // Decide what happened
    const isCreate = !before;
    const statusBefore = before?.attending ?? null;  // true / false / null
    const statusAfter  = after?.attending ?? null;

    // Only notify on create or when `attending` changes
    const attendingChanged = statusBefore !== statusAfter;
    if (!isCreate && !attendingChanged) return;

    // Build a human-friendly summary
    const name     = after.name || "(no name)";
    const email    = after.email || "(no email)";
    const seats    = after.seatsAllocated ?? after.seats ?? "-";
    const song     = after.songRequest || "-";
    const notes    = after.notes || after.message || "-";
    const attendingText =
      statusAfter === true ? "ATTENDING ✅"
      : statusAfter === false ? "DECLINED ❌"
      : "UNKNOWN";

    const subject = isCreate
      ? `RSVP • ${attendingText} • ${name} (${code})`
      : `RSVP UPDATED • ${attendingText} • ${name} (${code})`;

    // Plain text body (good for deliverability)
    const textLines = [
      `RSVP ${isCreate ? "created" : "updated"} for: ${name} (${email})`,
      `Code: ${code}`,
      `Status: ${attendingText}`,
      `Seats: ${seats}`,
      `Song request: ${song}`,
      `Notes: ${notes}`,
      "",
      `Raw data: ${JSON.stringify(after, null, 2)}`,
    ];
    const textBody = textLines.join("\n");

    // Simple HTML
    const htmlBody = `
      <h3>${subject}</h3>
      <ul>
        <li><b>Name:</b> ${name}</li>
        <li><b>Email:</b> ${email}</li>
        <li><b>Code:</b> ${code}</li>
        <li><b>Status:</b> ${attendingText}</li>
        <li><b>Seats:</b> ${seats}</li>
        <li><b>Song request:</b> ${song}</li>
        <li><b>Notes:</b> ${notes}</li>
      </ul>
      <pre>${JSON.stringify(after, null, 2)}</pre>
    `;

    // Write to mail/ so your existing firestoreSendMail sends it
    const { getFirestore } = require("firebase-admin/firestore");
    const admin = require("firebase-admin");
    try { admin.app(); } catch { admin.initializeApp(); }
    const db = getFirestore();

    await db.collection("mail").add({
      to: ADMIN_NOTIFY_TO,
      message: {
        subject,
        text: textBody,
        html: htmlBody,
      },
      // optional: where to route replies
      replyTo: "l.delange97@gmail.com",
    });
  }
);*/
