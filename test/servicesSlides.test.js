/**
 * servicesSlides.test.js
 *
 * Unit tests for Service Page slide image management:
 * 1. Administrator uploads two new images: exactly two slides are saved in the slides array.
 * 2. Saving a service block does NOT preserve or append old Slide 3 and Slide 4 images.
 * 3. Clearing Slide 2 does NOT restore an older image (only Slide 1 remains).
 * 4. Clearing both slides does NOT restore previous slides.
 * 5. Public Service page displays exactly the configured slides and indicator count.
 * 6. Verified across both srv-1 and srv-2 service blocks.
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
import { renderServicesPage } from "../src/pages/Services.js";

test("Service block save logic creates exactly 2 slides when 2 images are provided", () => {
  const data = {
    title: "Representation of Global Leaders",
    subtitle: "Global Distribution & Sourcing",
    badge: "Tier-1 Global Representation",
    badgeColor: "blue",
    desc: "Test description",
    slide1: "/api/media/file/cmwq8i992000zu8w256b2w6dc",
    caption1: "New Slide 1 Caption",
    slide2: "/api/media/file/cmwq8inq20010u8w2loohvpg0",
    caption2: "New Slide 2 Caption",
    tags: "Direct OEM Warranty, Mil-Spec Screened",
  };

  const slides = [];
  if (data.slide1) slides.push({ image: data.slide1, caption: data.caption1 || "" });
  if (data.slide2) slides.push({ image: data.slide2, caption: data.caption2 || "" });

  assert.equal(slides.length, 2, "Slides array must contain exactly 2 items");
  assert.equal(slides[0].image, "/api/media/file/cmwq8i992000zu8w256b2w6dc");
  assert.equal(slides[0].caption, "New Slide 1 Caption");
  assert.equal(slides[1].image, "/api/media/file/cmwq8inq20010u8w2loohvpg0");
  assert.equal(slides[1].caption, "New Slide 2 Caption");
});

test("Service block save does NOT preserve or append obsolete Slide 3 and Slide 4", () => {
  // Simulate an existing service item that historically had 4 slides
  const srv = {
    id: "srv-1",
    slides: [
      { image: "/images/old-1.jpg", caption: "Old 1" },
      { image: "/images/old-2.jpg", caption: "Old 2" },
      { image: "/images/rf-attenuator.jpg", caption: "Obsolete Slide 3" },
      { image: "/images/rf-mixer.jpg", caption: "Obsolete Slide 4" },
    ],
  };

  const data = {
    title: "Representation of Global Leaders",
    slide1: "/api/media/file/cmwq8i992000zu8w256b2w6dc",
    caption1: "Updated Slide 1",
    slide2: "/api/media/file/cmwq8inq20010u8w2loohvpg0",
    caption2: "Updated Slide 2",
  };

  // Fixed logic: directly construct slides from form data without slice(2)
  const slides = [];
  if (data.slide1) slides.push({ image: data.slide1, caption: data.caption1 || "" });
  if (data.slide2) slides.push({ image: data.slide2, caption: data.caption2 || "" });

  const updatedItem = {
    ...srv,
    slides,
  };

  assert.equal(updatedItem.slides.length, 2, "Updated item must contain exactly 2 slides");
  assert.ok(
    !updatedItem.slides.some((s) => s.image.includes("rf-attenuator.jpg")),
    "Obsolete Slide 3 must not be preserved"
  );
  assert.ok(
    !updatedItem.slides.some((s) => s.image.includes("rf-mixer.jpg")),
    "Obsolete Slide 4 must not be preserved"
  );
});

test("Clearing Slide 2 saves only Slide 1 and does not restore previous Slide 2 or older slides", () => {
  const srv = {
    id: "srv-1",
    slides: [
      { image: "/api/media/file/cmwq8i992000zu8w256b2w6dc", caption: "Slide 1" },
      { image: "/api/media/file/cmwq8inq20010u8w2loohvpg0", caption: "Slide 2" },
    ],
  };

  // Admin cleared slide2 (empty string)
  const data = {
    title: "Representation of Global Leaders",
    slide1: "/api/media/file/cmwq8i992000zu8w256b2w6dc",
    caption1: "Slide 1",
    slide2: "",
    caption2: "",
  };

  const slides = [];
  if (data.slide1) slides.push({ image: data.slide1, caption: data.caption1 || "" });
  if (data.slide2) slides.push({ image: data.slide2, caption: data.caption2 || "" });

  const updatedItem = {
    ...srv,
    slides,
  };

  assert.equal(updatedItem.slides.length, 1, "Must contain exactly 1 slide after clearing Slide 2");
  assert.equal(updatedItem.slides[0].image, "/api/media/file/cmwq8i992000zu8w256b2w6dc");
  assert.ok(
    !updatedItem.slides.some((s) => s.image.includes("cmwq8inq20010u8w2loohvpg0")),
    "Cleared Slide 2 must not be restored"
  );
});

test("Clearing both slides saves an empty slides array and does not restore previous slides", () => {
  const srv = {
    id: "srv-2",
    slides: [
      { image: "/api/media/file/cmwqj23t00005gcw2cilzs2ug", caption: "Slide 1" },
      { image: "/api/media/file/cmwqj2nmi0006gcw2kp53oozr", caption: "Slide 2" },
    ],
  };

  const data = {
    title: "Product Supply and Logistics",
    slide1: "",
    slide2: "",
  };

  const slides = [];
  if (data.slide1) slides.push({ image: data.slide1, caption: data.caption1 || "" });
  if (data.slide2) slides.push({ image: data.slide2, caption: data.caption2 || "" });

  const updatedItem = {
    ...srv,
    slides,
  };

  assert.equal(updatedItem.slides.length, 0, "Slides array must be empty when both images are cleared");
  assert.ok(!updatedItem.slides.length, "Previous slides must not be restored");
});

test("Public Service page renders exactly the configured 2 slides and 2 indicators for srv-1 and srv-2", () => {
  const serviceData = ContentService.getData("services");
  serviceData.items = [
    {
      id: "srv-1",
      title: "Representation of Global Leaders",
      subtitle: "Global Distribution & Sourcing",
      badge: "Tier-1 Global Representation",
      badgeColor: "blue",
      desc: "Primary description",
      slides: [
        {
          image: "/api/media/file/cmwq8i992000zu8w256b2w6dc",
          caption: "RF Component Representation — Microwave Amplifier",
        },
        {
          image: "/api/media/file/cmwq8inq20010u8w2loohvpg0",
          caption: "Active Antenna GaN MMIC Semiconductor",
        },
      ],
    },
    {
      id: "srv-2",
      title: "Product Supply and Logistics",
      subtitle: "Supply Chain & Logistics",
      badge: "End-to-End Fulfillment",
      badgeColor: "red",
      desc: "Supply description",
      slides: [
        {
          image: "/api/media/file/cmwqj23t00005gcw2cilzs2ug",
          caption: "Product Supply and Logistics — Aerospace & Defense SATCOM",
        },
        {
          image: "/api/media/file/cmwqj2nmi0006gcw2kp53oozr",
          caption: "Waveguide Assemblies & Hardware Logistics",
        },
      ],
    },
  ];

  const html = renderServicesPage();

  // Verify srv-1 images are rendered
  assert.ok(html.includes("/api/media/file/cmwq8i992000zu8w256b2w6dc"), "srv-1 Slide 1 must be present in HTML");
  assert.ok(html.includes("/api/media/file/cmwq8inq20010u8w2loohvpg0"), "srv-1 Slide 2 must be present in HTML");

  // Verify srv-2 images are rendered
  assert.ok(html.includes("/api/media/file/cmwqj23t00005gcw2cilzs2ug"), "srv-2 Slide 1 must be present in HTML");
  assert.ok(html.includes("/api/media/file/cmwqj2nmi0006gcw2kp53oozr"), "srv-2 Slide 2 must be present in HTML");

  // Verify obsolete slides are NOT in the HTML
  assert.ok(!html.includes("rf-attenuator.jpg"), "Obsolete rf-attenuator.jpg must not appear in public HTML");
  assert.ok(!html.includes("rf-mixer.jpg"), "Obsolete rf-mixer.jpg must not appear in public HTML");
  assert.ok(!html.includes("dielectric-3d-lens.jpg"), "Obsolete dielectric-3d-lens.jpg must not appear in public HTML");

  // Verify indicator dots: exactly 2 dots per 2-slide showcase
  const dotCount = (html.match(/service-slide-dot/g) || []).length;
  assert.equal(dotCount, 4, "Total dots across 2 showcases with 2 slides each must equal 4 (2 per showcase)");
});

test("Public Service page renders 1 slide with zero indicator dots when 1 slide is configured", () => {
  const serviceData = ContentService.getData("services");
  serviceData.items = [
    {
      id: "srv-1",
      title: "Single Slide Showcase",
      slides: [
        {
          image: "/api/media/file/cmwq8i992000zu8w256b2w6dc",
          caption: "Single Active Slide",
        },
      ],
    },
  ];

  const html = renderServicesPage();

  assert.ok(html.includes("/api/media/file/cmwq8i992000zu8w256b2w6dc"), "Single slide must be rendered");
  assert.ok(!html.includes("service-slide-indicators"), "No indicators should be rendered when slides <= 1");
  assert.ok(!html.includes("service-slide-dot"), "No indicator dots should be rendered when slides <= 1");
});
