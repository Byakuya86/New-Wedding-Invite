import React, { useState } from "react";

export default function App() {
  const payshapNumber = "0699131700";
  const accountNumber = "10100146501";
  const accountName = "Llewellyn De Lange";
  const accountType = "Cheque";
  const branchCode = "051001";

  const [copied, setCopied] = useState("");

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(""), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <p style={styles.eyebrow}>Llewellyn & Lynn</p>
        <h1 style={styles.heading}>Wedding Gift</h1>
        <div style={styles.divider} />

        <p style={styles.intro}>
          Your presence at our wedding is the greatest gift of all.
          Should you wish to bless us with a gift, you may do so using the
          details below.
        </p>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>PayShap</h2>
          <p style={styles.detailLine}>
            <span style={styles.label}>Cell Number:</span> {payshapNumber}
          </p>

          <button
            style={styles.button}
            onClick={() => copyToClipboard(payshapNumber, "PayShap number copied")}
          >
            Copy PayShap Number
          </button>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Bank Details</h2>
          <p style={styles.detailLine}>
            <span style={styles.label}>Bank:</span> Standard Bank
          </p>
          <p style={styles.detailLine}>
            <span style={styles.label}>Account Name:</span> {accountName}
          </p>
          <p style={styles.detailLine}>
            <span style={styles.label}>Account Type:</span> {accountType}
          </p>
          <p style={styles.detailLine}>
            <span style={styles.label}>Account Number:</span> {accountNumber}
          </p>
          <p style={styles.detailLine}>
            <span style={styles.label}>Branch Code:</span> {branchCode}
          </p>

          <button
            style={styles.button}
            onClick={() => copyToClipboard(accountNumber, "Account number copied")}
          >
            Copy Account Number
          </button>
        </div>

        {copied && <p style={styles.copiedMessage}>{copied}</p>}

        <div style={styles.qrSection}>
          <div style={styles.qrFrame}>
            <img
              src="/gift-qr.png"
              alt="QR code for wedding gift details"
              style={styles.qrImage}
            />
          </div>
          <p style={styles.qrText}>Scan to open this page</p>
        </div>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    minHeight: "100vh",
    background:
      "linear-gradient(180deg, #f8f3eb 0%, #efe2cf 50%, #faf7f2 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: "680px",
    background: "rgba(255, 255, 255, 0.96)",
    borderRadius: "24px",
    padding: "40px 28px",
    boxShadow: "0 12px 40px rgba(0,0,0,0.10)",
    border: "1px solid rgba(201, 169, 97, 0.25)",
    textAlign: "center",
  },
  eyebrow: {
    margin: 0,
    fontSize: "14px",
    letterSpacing: "3px",
    textTransform: "uppercase",
    color: "#b08b57",
  },
  heading: {
    margin: "10px 0 8px",
    fontSize: "40px",
    fontFamily: "Georgia, serif",
    color: "#3f3426",
    fontWeight: "normal",
  },
  divider: {
    width: "80px",
    height: "2px",
    background: "#d4b483",
    margin: "16px auto 24px",
    borderRadius: "2px",
  },
  intro: {
    fontSize: "16px",
    lineHeight: "1.8",
    color: "#5c5042",
    marginBottom: "30px",
  },
  section: {
    marginTop: "28px",
    padding: "22px",
    background: "#fcfaf7",
    borderRadius: "18px",
    border: "1px solid rgba(212, 180, 131, 0.35)",
    textAlign: "left",
  },
  sectionTitle: {
    marginTop: 0,
    marginBottom: "14px",
    fontSize: "24px",
    fontFamily: "Georgia, serif",
    color: "#6d5330",
    fontWeight: "normal",
    textAlign: "center",
  },
  detailLine: {
    margin: "10px 0",
    fontSize: "16px",
    color: "#4b4135",
    lineHeight: "1.6",
  },
  label: {
    fontWeight: 600,
    color: "#8a6a3c",
  },
  button: {
    marginTop: "16px",
    width: "100%",
    padding: "14px 18px",
    background: "#c9a961",
    color: "#fff",
    border: "none",
    borderRadius: "12px",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: "0 6px 18px rgba(201, 169, 97, 0.28)",
  },
  copiedMessage: {
    marginTop: "20px",
    color: "#6d5330",
    fontWeight: 600,
    fontSize: "15px",
  },
  qrSection: {
    marginTop: "34px",
    textAlign: "center",
  },
  qrFrame: {
    display: "inline-block",
    padding: "14px",
    background: "#fff",
    borderRadius: "18px",
    border: "1px solid rgba(212, 180, 131, 0.4)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.06)",
  },
  qrImage: {
    width: "180px",
    height: "180px",
    objectFit: "contain",
    display: "block",
  },
  qrText: {
    marginTop: "12px",
    fontSize: "14px",
    color: "#7a6b59",
  },
};
