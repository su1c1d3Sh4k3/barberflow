# Design System Strategy: The Polished Artisan

## 1. Overview & Creative North Star
The "Polished Artisan" is the Creative North Star for this design system. It is a philosophy that marries the high-efficiency rigor of a developer tool (Linear/Notion) with the tactile, welcoming atmosphere of a high-end grooming lounge. 

Unlike standard SaaS platforms that feel sterile and grid-locked, this system uses **Soft Minimalism** to break the "template" look. We achieve this through intentional asymmetry—where large display type breathes in wide margins—and "Organic Layering," where UI elements don't just sit on a page, but float and nest like physical objects on a clean workbench. The goal is a digital experience that feels as intentional as a master barber’s precision cut.

---

## 2. Colors & Surface Philosophy
The palette utilizes high-contrast Deep Navy (`#0F172A`) against an airy Off-white (`#FAFAF9`) to establish authority, while the Warm Amber (`#F59E0B`) provides a playful, high-energy spark.

### The "No-Line" Rule
To maintain a premium editorial feel, **1px solid borders are prohibited** for sectioning content. Boundaries must be defined through:
*   **Background Shifts:** Distinguish the sidebar from the main canvas using `surface-container-low` against `background`.
*   **Tonal Transitions:** Use subtle shifts in value to guide the eye, rather than "boxing" the user in.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Use the surface-container tiers to create "nested" depth:
*   **Base:** `surface` (#f9f9f8) for the main application canvas.
*   **Mid-Level:** `surface-container-low` (#f3f4f3) for secondary navigation or utility panels.
*   **Top-Tier:** `surface-container-lowest` (#ffffff) for the primary interactive cards and content areas.

### The "Glass & Gradient" Rule
For floating modals or popovers, use **Glassmorphism**. Apply `surface` colors at 80% opacity with a `24px` backdrop-blur. To provide "soul" to the primary CTAs, use a subtle radial gradient: `primary` (#000000) transitioning slightly to `primary-container` (#131b2e) at the top-right corner.

---

## 3. Typography: The Editorial Voice
We utilize **Inter** with an aggressive hierarchy scale to create a "magazine" feel. This moves the app away from "utility" and toward "lifestyle."

*   **Display & Headlines:** (3.5rem to 1.5rem) Set at **600-700 weight**. These are the "anchors" of the page. Use generous letter-spacing (-0.02em) to keep bold headers feeling modern.
*   **Title & Body:** (1.125rem to 0.875rem). The contrast between a massive `display-lg` and a tight `body-md` creates the "Notion-esque" sophisticated rhythm.
*   **Labels:** (0.75rem). Always uppercase with +0.05em tracking when used for metadata to ensure they feel like intentional design elements rather than small text.

---

## 4. Elevation & Depth
In this system, depth is earned, not forced.

*   **The Layering Principle:** Place a `surface-container-lowest` card (Pure White) on top of a `surface-container-low` (Light Grey) background. This creates a natural "lift" that mimics fine paper without a single shadow.
*   **Ambient Shadows:** For floating elements (Modals/Dropdowns), use an "Extra-Diffused" shadow: `y-12, blur-40, spread-0, color: on-surface (4% opacity)`. This mimics soft, natural studio lighting.
*   **The "Ghost Border" Fallback:** If accessibility requires a border, use `outline-variant` at **15% opacity**. It should be felt, not seen.
*   **Roundedness Scale:**
    *   **Cards/Containers:** `2rem` (32px) for a soft, friendly "squircle" feel.
    *   **Buttons:** `1.5rem` (24px) for a pill-like, tactile quality.
    *   **Inputs:** `0.75rem` (12px) to maintain a slight structure amidst the softness.

---

## 5. Components

### Buttons
*   **Primary:** `primary` background, `on-primary` text. No border. Subtle gradient (top-to-bottom).
*   **Secondary:** `secondary-fixed` (Warm Amber) with `on-secondary-fixed` text. This is your "Action" color.
*   **Tertiary:** Transparent background, `on-surface` text. Only a background shift to `surface-container-high` on hover.

### Cards & Lists
*   **No Dividers:** Prohibit the use of horizontal rules. Use **24px - 32px of vertical whitespace** to separate list items.
*   **Interaction:** On hover, a card should shift from `surface-container-lowest` to a subtle `surface-bright` or gain a 2px "Ghost Border."

### Inputs
*   **Style:** `surface-container-lowest` background with a `12px` radius. 
*   **States:** On focus, the `outline` token should be applied at 40% opacity as a soft outer glow rather than a hard ring.

### Custom Components: "The Appointment Grain"
*   **Time Slots:** Use rounded `sm` (8px) chips. "Available" slots use `surface-container-highest`, while "Booked" slots use `primary-container` with 50% opacity to look "occupied" but elegant.

---

## 6. Do's and Don'ts

### Do
*   **Do** use asymmetrical layouts (e.g., a left-aligned headline with a right-aligned action button far across the white space).
*   **Do** use Lucide icons at `1.5` stroke weight to match the "Inter" font weight.
*   **Do** favor "breathing room" over information density. If it feels empty, you're doing it right.

### Don't
*   **Don't** use pure black (#000000) for text; use `on-surface` (#1a1c1c) to keep the "Soft Minimalist" vibe.
*   **Don't** use standard "Alert Red" for errors if possible. Use the `error` (#ba1a1a) token inside an `error_container` with a high blur to keep the interface friendly even during friction.
*   **Don't** use hard corners. Every element should feel safe to touch.