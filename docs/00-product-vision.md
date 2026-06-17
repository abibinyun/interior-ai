# Product Vision — AI Interior Design Journey Builder

## Product Name

AI Interior Design Journey Builder

---

## 1. One-Line Definition

A guided interior design planning platform that walks homeowners from *"I have no idea what my house interior should look like"* to *"I have a complete and coherent interior design plan for my entire house."*

---

## 2. What This Product Is

This product is primarily:

- **A Design Planning Tool** — structured guidance through a multi-step house design journey.
- **A Design Decision Assistant** — helps users make and stick to coherent choices.
- **An Inspiration Tool** — produces visual concepts that inform decision-making.
- **A Consistency Engine** — ensures every room in a house follows the same design language.

---

## 3. What This Product Is NOT

This product is **not** primarily:

- An AI Art Generator (the image is a means, not the deliverable).
- A Prompt Playground (users should not need to engineer prompts).
- An Image Gallery (a gallery exists, but it is project-scoped, not the product).

The final value is **not** the generated images. The final value is **confidence, clarity, consistency, and a complete design plan**.

---

## 4. Core User Problem

Homeowners who are building, renovating, or redesigning a house struggle because they:

- Have no clear design vision.
- Cannot choose an interior style from dozens of options.
- Cannot maintain consistency between rooms.
- Feel overwhelmed by countless small decisions.
- Do not know how rooms should relate to each other.
- Need inspiration **and** structure, not inspiration alone.
- Want to leave with a complete house plan, not loose images.

---

## 5. Target User

### Primary Persona

**The Overwhelmed Homeowner**

- Building, renovating, or redesigning a house.
- Has no formal interior design training.
- Knows they want "something nice" but cannot articulate it.
- Has budget awareness but no specification language.
- Will abandon tools that feel like work.

### Secondary Persona

**The Design-Curious Hobbyist / Student**

- Exploring styles before committing to a real project.
- Uses the platform as a learning and practice surface.

---

## 6. Core User Promise

> Create one project. Pick one style. Design every room of your house with confidence that the rooms belong together. Walk away with a complete export bundle.

---

## 7. Product Principles

1. **Journey over destination.** The product is the path, not the image.
2. **One decision at a time.** The interface decomposes overwhelm into steps.
3. **Consistency is automatic.** Style carries across rooms by default.
4. **The plan is the artifact.** The export bundle matters more than any single image.
5. **Guided, not blank-canvas.** Users never face an empty prompt field alone.
6. **Backend is the source of truth.** All rules, prompts, and validation live in the backend.

---

## 8. Product Scope (v1)

### Included

- Project creation and management.
- Style profile definition with predefined styles.
- Room selection from a predefined room catalog.
- Design brief capture for each room.
- Multi-option AI generation per room (Option A / B / C).
- Refinement of a generated option (colors, objects, furniture, materials, lighting, layout).
- Per-room approval.
- Cross-room consistency enforcement.
- Complete-house export bundle.
- Persistent gallery per project.

### Excluded (v1)

- User authentication and accounts (session-based identification only).
- Multi-user collaboration on a single project.
- Mobile applications.
- Real-time multiplayer editing.
- Multiple AI provider routing (provider abstracted, but one active at a time).
- Payment, billing, subscriptions.
- Social sharing.
- Image upscaling, professional editing.
- Style discovery from uploaded images (deferred — see Roadmap).

---

## 9. Success Criteria

The product is successful when:

1. A new visitor can complete a first end-to-end journey in under 15 minutes.
2. Every room in an exported bundle shares a recognizable design language.
3. An approved room design is reproducible: regenerating with the same inputs yields the same intent (within provider tolerance).
4. A user can pause and resume a multi-room project across sessions without data loss.
5. The export bundle is self-contained and reviewable without the live product.
6. No AI provider API key ever reaches the browser.
7. Failure states (timeout, invalid prompt, broken response, storage failure) are recoverable and clearly communicated.
8. The system supports multiple concurrent users without cross-session data leakage.

---

## 10. Non-Goals

- Replacing a professional interior designer.
- Producing photorealistic, architecturally accurate floor plans.
- Furniture shopping or e-commerce integration.
- Construction documentation.
- AR/VR walkthroughs.

---

## 11. References

- Master brief: `/prompt.md`
- User journey: `01-user-journey.md`
- Domain model: `02-domain-model.md`
- Business rules: `03-business-rules.md`
- System architecture: `04-system-architecture.md`
