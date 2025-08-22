// scripts/import-guests.js
// Usage: node scripts/import-guests.js guests.csv
// Reads a CSV with headers:
// name,email,seatsAllocated,dietaryDefault,messageDefault,code
// and writes to Firestore: guests/{code}

const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse");
const admin = require("firebase-admin");

// Load service account from project root
const keyPath = path.join(process.cwd(), "serviceAccountKey.json");
if (!fs.existsSync(keyPath)) {
  console.error("Missing serviceAccountKey.json in project root.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(require(keyPath)),
});

const db = admin.firestore();

async function main() {
  const csvPath = process.argv[2] || "guests.csv";
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  console.log(`Importing from ${csvPath} ...`);

  const parser = fs
    .createReadStream(csvPath)
    .pipe(parse({ columns: true, trim: true, skip_empty_lines: true }));

  let count = 0;
  for await (const row of parser) {
    // Normalize fields and validate
    const code = (row.code || "").toString().trim();
    const name = (row.name || "").toString().trim();
    const email = (row.email || "").toString().trim();
    const seatsAllocated = Number(row.seatsAllocated || 0);
    const dietaryDefault = (row.dietaryDefault || "").toString().trim();
    const messageDefault = (row.messageDefault || "").toString().trim();

    if (!code) {
      console.warn("Skipping row with empty code:", row);
      continue;
    }
    if (!name) {
      console.warn(`Skipping code ${code}: missing name`);
      continue;
    }
    if (!Number.isFinite(seatsAllocated) || seatsAllocated <= 0) {
      console.warn(`Skipping code ${code}: invalid seatsAllocated`);
      continue;
    }

    const docRef = db.collection("guests").doc(code);
    const data = {
      name,
      email,
      seatsAllocated,
      dietaryDefault,
      messageDefault,
      // You can add more fields later if needed
    };

    await docRef.set(data, { merge: true });
    count++;
    if (count % 25 === 0) console.log(`  ...${count} imported`);
  }

  console.log(`Done. Imported ${count} guest(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
