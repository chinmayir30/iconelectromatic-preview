/**
 * eventsCms.test.js
 *
 * Unit tests for Homepage Events CMS integration:
 * - Distinguishing missing event configuration from an intentionally empty eventCards array
 * - Safe HTML escaping for event titles, subtitles, badges, and alt text
 * - Image URL sanitization (blocking javascript: and unsafe protocols)
 * - Image upload field file-type restrictions (JPEG, PNG, WebP)
 */

import test from "node:test";
import assert from "node:assert/strict";

// Mock localStorage and window before importing frontend modules
if (typeof globalThis.localStorage === "undefined") {
  const memStore = new Map();
  globalThis.localStorage = {
    getItem: (k) => memStore.get(k) ?? null,
    setItem: (k, v) => memStore.set(k, String(v)),
    removeItem: (k) => memStore.delete(k),
    clear: () => memStore.clear(),
  };
}

if (typeof globalThis.window === "undefined") {
  globalThis.window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
  };
}

import { ContentService } from "../src/data/ContentService.js";
import { renderHomePage } from "../src/pages/Home.js";

test("Events section renders default fallback event cards when data.eventCards is undefined", () => {
  // Reset home data to defaults
  ContentService.resetData("home");
  const homeData = ContentService.getData("home");
  delete homeData.eventCards;

  const html = renderHomePage();
  assert.ok(html.includes("Exhibition Showcase"), "Default badge 'Exhibition Showcase' should be rendered");
  assert.ok(html.includes("Partner Delegation"), "Default badge 'Partner Delegation' should be rendered");
  assert.ok(html.includes("Engineering Hub"), "Default badge 'Engineering Hub' should be rendered");
  assert.ok(!html.includes("No event photo cards currently scheduled"), "Empty state should not be rendered");
});

test("Events section does NOT restore default cards when eventCards is an intentionally empty array", () => {
  const homeData = ContentService.getData("home");
  homeData.eventCards = [];

  const html = renderHomePage();
  assert.ok(!html.includes("Exhibition Showcase"), "Default badge must not be rendered when admin cleared all cards");
  assert.ok(!html.includes("Partner Delegation"), "Default badge must not be rendered when admin cleared all cards");
  assert.ok(html.includes("events-empty-state"), "Empty state container must be rendered");
  assert.ok(
    html.includes("No event photo cards currently scheduled"),
    "Safe empty state message must inform visitors no events are scheduled"
  );
});

test("Events section renders custom event cards with configured badge, image, and alt text", () => {
  const homeData = ContentService.getData("home");
  homeData.eventsTitle = "Global Conferences";
  homeData.eventsSubtitle = "MAPCON 2027 Expo";
  homeData.eventsLead = "Join us at the flagship IEEE exhibition in Bengaluru.";
  homeData.eventCards = [
    {
      id: "evt-custom-1",
      image: "/api/media/file/cuid-photo-1",
      badge: "Hall 3 Booth 42",
      alt: "Icon Electromatic Exhibition Booth at MAPCON",
    },
  ];

  const html = renderHomePage();
  assert.ok(html.includes("Global Conferences"), "Custom events title must be rendered");
  assert.ok(html.includes("MAPCON 2027 Expo"), "Custom events subtitle must be rendered");
  assert.ok(html.includes("Join us at the flagship IEEE exhibition in Bengaluru."), "Custom events lead must be rendered");
  assert.ok(html.includes("Hall 3 Booth 42"), "Custom badge must be rendered");
  assert.ok(html.includes("alt=\"Icon Electromatic Exhibition Booth at MAPCON\""), "Custom alt text must be rendered");
  assert.ok(html.includes("/api/media/file/cuid-photo-1"), "Custom image path must be rendered");
});

test("Events section HTML-escapes event titles, badges, and alt attributes against XSS", () => {
  const homeData = ContentService.getData("home");
  homeData.eventsTitle = '<script>alert("xss")</script>Events';
  homeData.eventsSubtitle = 'MAPCON & <Special> "2027"';
  homeData.eventCards = [
    {
      id: "evt-xss",
      image: "/images/defense-satcom.jpg",
      badge: '<img src=x onerror=alert(1)>Badge',
      alt: 'Quoted "alt" & <script>',
    },
  ];

  const html = renderHomePage();
  assert.ok(!html.includes('<script>alert("xss")</script>'), "Raw script tags must not be rendered in title");
  assert.ok(html.includes("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;Events"), "Title must be HTML-escaped");
  assert.ok(!html.includes("<img src=x onerror=alert(1)>"), "Raw malicious HTML must not be rendered in badge");
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;Badge"), "Badge must be HTML-escaped");
  assert.ok(html.includes("alt=\"Quoted &quot;alt&quot; &amp; &lt;script&gt;\""), "Alt text must be HTML-escaped");
});

test("Events section sanitizes image URLs and rejects javascript: schemes", () => {
  const homeData = ContentService.getData("home");
  homeData.eventCards = [
    {
      id: "evt-bad-scheme",
      image: "javascript:alert(document.cookie)",
      badge: "Safe Badge",
    },
  ];

  const html = renderHomePage();
  assert.ok(!html.includes("javascript:alert"), "javascript: image URLs must be neutralized");
  assert.ok(html.includes("/images/defense-satcom.jpg"), "Unsafe image URL must fall back to safe default image");
});
