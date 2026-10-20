#!/usr/bin/env node
// One combined tool for the after-class routine: attach that night's
// Google Slides link AND meeting notes link to its recording, then
// commit + push once. Replaces running add-slides.js and add-notes.js
// separately.
//
// Usage:
//   node upload-notes-and-slides.js
// Then follow the prompts: pick tonight's recording, paste the slides
// link, paste the notes link (press Enter to skip either one).

const fs = require("fs");
const path = require("path");
const readline = require("readline/promises");
const { execSync } = require("child_process");

const REPO_DIR = __dirname;
const JSON_PATH = path.join(REPO_DIR, "recordings.json");

function run(cmd) {
  return execSync(cmd, { cwd: REPO_DIR, stdio: ["ignore", "pipe", "pipe"] })
    .toString()
    .trim();
}

async function main() {
  if (!fs.existsSync(JSON_PATH)) {
    console.error(`Could not find ${JSON_PATH}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(JSON_PATH, "utf8");
  let recordings;
  try {
    recordings = JSON.parse(raw);
  } catch (err) {
    console.error("recordings.json is not valid JSON right now:", err.message);
    console.error("Fix that first — this script won't overwrite broken JSON.");
    process.exit(1);
  }

  if (!Array.isArray(recordings) || recordings.length === 0) {
    console.error("recordings.json has no entries yet — nothing to attach links to.");
    process.exit(1);
  }

  // Most recent first, matching how the frontend sorts them.
  const sorted = [...recordings].sort((a, b) =>
    (b.start || "").localeCompare(a.start || "")
  );

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log("\nWhich recording is this for? (tonight's class is usually #1)\n");
  sorted.forEach((rec, i) => {
    const flags = [];
    if (rec.slides) flags.push("has slides");
    if (rec.notes) flags.push("has notes");
    console.log(`  ${i + 1}. ${rec.topic || rec.id}${flags.length ? "  [" + flags.join(", ") + "]" : ""}`);
  });

  const choiceRaw = await rl.question(`\nEnter a number (1-${sorted.length}, default 1): `);
  const choice = parseInt(choiceRaw.trim(), 10) || 1;
  const target = sorted[choice - 1];

  if (!target) {
    console.error("That number isn't in the list.");
    rl.close();
    process.exit(1);
  }

  const slidesRaw = (await rl.question(
    `\nPaste the Google Slides link${target.slides ? " (already set — Enter to keep it)" : " (Enter to skip)"}: `
  )).trim();
  const notesRaw = (await rl.question(
    `Paste the meeting notes link${target.notes ? " (already set — Enter to keep it)" : " (Enter to skip)"}: `
  )).trim();

  rl.close();

  if (slidesRaw && !/^https?:\/\//i.test(slidesRaw)) {
    console.error("The slides link doesn't look like a URL (should start with http:// or https://). Nothing changed.");
    process.exit(1);
  }
  if (notesRaw && !/^https?:\/\//i.test(notesRaw)) {
    console.error("The notes link doesn't look like a URL (should start with http:// or https://). Nothing changed.");
    process.exit(1);
  }

  if (!slidesRaw && !notesRaw) {
    console.log("\nNothing entered — nothing to save.");
    return;
  }

  // Mutate the original array (not the sorted copy) so we write back
  // in the same order the file was already in.
  const original = recordings.find((r) => r.id === target.id);
  const updated = [];
  if (slidesRaw) {
    original.slides = slidesRaw;
    updated.push("slides link");
  }
  if (notesRaw) {
    original.notes = notesRaw;
    updated.push("notes link");
  }

  fs.writeFileSync(JSON_PATH, JSON.stringify(recordings, null, 2) + "\n", "utf8");
  console.log(`\nUpdated "${target.topic || target.id}" with the ${updated.join(" and ")}.`);

  try {
    run("git add recordings.json");
    const label = target.topic || target.id;
    run(`git commit -m "Add ${updated.join(" and ")} for ${label.replace(/"/g, "'")}"`);
    run("git push");
    console.log("Committed and pushed. Students will see the update within a few minutes.");
  } catch (err) {
    console.error("\nCouldn't commit/push automatically:");
    console.error(err.stdout ? err.stdout.toString() : err.message);
    console.error("\nThe JSON file itself was still updated locally — you can commit and push it by hand.");
    process.exit(1);
  }
}

main();
