import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(import.meta.dirname, "..");
const INPUT = path.join(ROOT, "name-person-insights.js");
const DATE_KEY_RE = /^\d{2}-\d{2}$/;
const FULL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function daysInMonth(month) {
  return new Date(2024, month, 0).getDate();
}

function expectedKeys() {
  const keys = [];
  for (let month = 1; month <= 12; month += 1) {
    for (let day = 1; day <= daysInMonth(month); day += 1) {
      keys.push(`${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    }
  }
  return keys;
}

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(INPUT, "utf8"), context, { filename: INPUT });

const calendar = context.window.NAME_PERSON_INSIGHTS;
if (!calendar || typeof calendar !== "object") {
  fail("NAME_PERSON_INSIGHTS is missing or invalid.");
  process.exit(1);
}

const keys = Object.keys(calendar).sort();
const expected = expectedKeys();
if (keys.length !== expected.length) {
  fail(`Expected ${expected.length} date keys, found ${keys.length}.`);
}

for (const key of expected) {
  if (!Object.hasOwn(calendar, key)) fail(`Missing date key ${key}.`);
}

for (const key of keys) {
  if (!DATE_KEY_RE.test(key)) fail(`Invalid date key ${key}.`);
}

const names = new Map();
let personCount = 0;
for (const [key, people] of Object.entries(calendar)) {
  if (!Array.isArray(people)) {
    fail(`${key} should be an array.`);
    continue;
  }

  for (const person of people) {
    personCount += 1;
    if (!person?.name) fail(`${key} has a person without name.`);
    if (!FULL_DATE_RE.test(person?.date || "")) {
      fail(`${person?.name || key} has invalid date ${person?.date}.`);
      continue;
    }
    if (person.date.slice(5, 10) !== key) {
      fail(`${person.name} is under ${key}, but birth date is ${person.date}.`);
    }
    const previous = names.get(person.name);
    if (previous && previous !== key) {
      fail(`${person.name} appears under both ${previous} and ${key}.`);
    }
    names.set(person.name, key);
  }
}

if (process.exitCode) process.exit(process.exitCode);

console.log(`Validated ${keys.length} dates and ${personCount} verified people.`);
