# Design System: Brutal Constructivist Editorial

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Sonic Machine."**

This is not a standard audio interface; it is a digital manifestation of an industrial assembly. Drawing heavy inspiration from early 20th-century Constructivism, the system treats the screen as a mechanical floor plan where intersecting planes, heavy structural joints, and bold geometric collisions create a sense of raw, avant-garde power.

Unlike traditional "clean" UIs that hide their architecture, this system celebrates its own construction. We break the grid intentionally—allowing typography to bleed off edges and containers to overlap as if they were physical sheets of metal or heavy paper. The experience is tactile, high-contrast, and unapologetically bold, designed for an audio platform that views sound as an industrial force.

---

## 2. Colors
Our palette is rooted in a "functional-industrial" aesthetic, utilizing high-contrast signals against a desaturated, architectural base.

### The Palette
- **The Foundation:** We use `background` (#fef9ea), a desaturated cream, as our primary "paper" surface.
- **The Machine:** `on_background` (#1d1c13) functions as our deep charcoal, used for heavy structural strokes and primary text.
- **The Signal:** `primary` (#b60013) is our high-alert red. It is used sparingly for critical interactive elements and branding moments.
- **The High-Voltage:** `secondary_fixed_dim` (#00dbe9) acts as a neon cyan highlight. This is the "electricity" in the machine, used for playback progress, active states, and focus indicators.

### Surface Hierarchy & Mechanical Nesting
- **The "Heavy Stroke" Rule:** Unlike modern "borderless" trends, this system uses `outline` (#926e6b) for heavy, visible seams. Sections are defined by 2px to 4px borders that look like structural joints.
- **Tonal Layering:** To create depth without soft shadows, use the surface-container tiers. Place a `surface_container_highest` (#e7e2d3) module over a `surface` background to create a "plate" effect.
- **Industrial Texture:** All surfaces must incorporate a subtle, 5% opacity "mechanical grain" SVG overlay to simulate the tactile quality of a blueprint or vintage paper.

---

## 3. Typography
The typography is the backbone of the "Sonic Machine." We utilize **Space Grotesk** for its industrial, wide-aperture characteristics.

- **Display & Large Scale:** `display-lg` (3.5rem) and `display-md` (2.75rem) should be used with `font-weight: 700`. These elements are encouraged to overlap container edges or background circular elements.
- **The Industrial Label:** Labels (`label-md`) must be treated as technical annotations. Use uppercase and increased letter spacing (0.1rem) to mimic technical drafting.
- **Information Density:** Title and Body scales provide the necessary legibility against the chaotic background elements. `title-lg` (1.375rem) serves as the primary navigation and track title weight.

---

## 4. Elevation & Depth: The "Hard Offset" Principle
This system rejects the "natural" soft shadows of the modern web. Depth is an intentional mechanical assembly.

- **Hard Shadows:** For elements that need to "pop" (like a floating player bar or a primary CTA), use a hard-edged, offset shadow. Use a 4px to 8px offset with 100% opacity using `on_surface` (#1d1c13) or a tinted `primary` (#b60013).
- **Intersecting Planes:** Depth is achieved by "breaking" the Z-axis. A navigation circle might be tucked *underneath* a main content panel (`surface_container_high`) but overlap the global `background`.
- **Glassmorphism (The "Observation Window"):** For overlays, use semi-transparent `surface_variant` (#e7e2d3) at 80% opacity with a heavy `backdrop-blur` (20px). This mimics the look of a frosted glass gauge on a machine.

---

## 5. Components

### Structural Elements
- **Circular Layout Anchors:** Large, non-functional circular arcs (using `outline_variant` or `secondary_container`) should be pinned to corners or centers of the UI, acting as the "gears" that content wraps around.
- **The Seams:** Dividers are not 1px grey lines. They are 2px wide strokes using `outline` (#926e6b) and often feature "crosshair" icons at intersections.

### Interaction Components
- **Buttons (The Power Switches):**
- **Primary:** `primary` background, `on_primary` text, 0px border-radius, and a hard 4px offset shadow in `on_background`.
- **Secondary:** Transparent background with a heavy 2px `on_surface` border.
- **Inputs:** Text fields should look like technical forms. Use `surface_container_low` with a bottom-only 2px stroke in `on_surface`. Focus states trigger the `secondary_fixed_dim` (Cyan) glow.
- **Playback Progress:** Use a thick, 8px bar. The "track" is `surface_container_highest`, and the "progress" is a solid block of `secondary_fixed_dim`.
- **Cards:** Forbid standard rounded cards. Cards are rectangular "plates." Distinguish them from the background through a `surface_container_highest` fill and a heavy `outline`.

---

## 6. Do's and Don'ts

### Do:
- **Do** overlap a track title (`display-sm`) over a circular navigation element.
- **Do** use 0px border-radius for every single element. Roundness comes from structural circles, not corner clipping.
- **Do** treat "White Space" as "Machine Space"—it should feel like the gap between mechanical parts, often bridged by structural lines.
- **Do** use hard-edge cyan (`secondary_fixed_dim`) highlights for all hover/active states to provide "electrical" feedback.

### Don't:
- **Don't** use soft, blurred shadows. If it doesn't have a hard edge, it doesn't belong.
- **Don't** use standard 1px borders. If a border exists, it must be thick and intentional (2px+).
- **Don't** center everything perfectly. Use the Constructivist principle of "Dynamic Equilibrium"—balance a large left-aligned title with a heavy right-aligned geometric block.
- **Don't** use gradients to simulate light. Use them only for "brand soul" (e.g., `primary` to `primary_container`) within large geometric shapes.