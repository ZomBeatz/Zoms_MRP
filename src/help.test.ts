import { beforeEach, describe, expect, it } from "vitest";
import { NOTE_VISITS, PAGE_HELP, SECTION_DOCS, closeNote, noteFor } from "./help";

// The notes keep their count in browser storage; a plain one stands in for it here.
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0,
} as Storage;

describe("the note on a new page", () => {
  beforeEach(() => store.clear());

  it("shows on the first few visits, then stops by itself", () => {
    for (let i = 0; i < NOTE_VISITS; i++) expect(noteFor("planner")).not.toBeNull();
    expect(noteFor("planner")).toBeNull();
  });

  it("stops once closed", () => {
    expect(noteFor("planner")).not.toBeNull();
    closeNote("planner");
    expect(noteFor("planner")).toBeNull();
  });

  it("is only on new pages", () => {
    expect(noteFor("overview")).toBeNull();
  });
});

describe("help links", () => {
  it("every page with a Guide section points at one the Guide has", () => {
    for (const h of PAGE_HELP) if (h.guide) expect(SECTION_DOCS[h.guide], h.page).toBeDefined();
  });
});
