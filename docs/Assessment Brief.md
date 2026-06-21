# Assessment Brief

## Source

This project is built as a submission for the **Software Engineer Assignment** from **Actual Inc (Indonesia)**.

## Objective

Build a full-stack web application from a given brief, integrate a real AI image API, and prove it works even when things go wrong.

The assessment is not looking for impressive engineering — it's looking for engineers who:

- Ship clean, reliable software on top of systems they didn't build
- Architect scalable systems from scratch
- Demonstrate clear thinking and deliberate decision-making

## Requirements

### What to Build

A niche-focused AI image generation web app with a personal gallery:

- Pick a specific niche (architecture, manga, interior design, fashion, game concept art, etc.)
- AI Image Generation web app with personal gallery
- Generated images and prompts must be saved and visible
- Gallery must persist after page refresh
- Re-generation: pick any saved result, tweak the prompt, and re-generate without starting over

### Non-Negotiable Constraints

| # | Constraint |
|---|------------|
| 1 | AI API calls go through backend only, never the browser |
| 2 | Images must be stored server-side |
| 3 | Gallery must persist across page refreshes |
| 4 | Must work correctly with multiple concurrent users |
| 5 | Loading must be meaningful (10–30 seconds is normal) |
| 6 | Handle failure states: API timeout, invalid prompt, broken response |
| 7 | App must be live via a public URL at submission |
| 8 | Use any free AI image API (Pollinations.ai, Gemini Flash Image API) |

## Submission Requirements

1. **Repository** — GitHub or GitLab with meaningful commits
2. **Documentation** — System design, tech stack reasoning, build process
3. **Demo Recording** — Loom showing full flow, gallery, re-generation, and failure states
4. **Live URL** — Deployed and fully working at review time

## Scoring Criteria

| Category | Weight | What We Look For |
|----------|--------|------------------|
| Level of Thinking | 25% | Planning, request journey clarity, tech stack justification, intentional process |
| Level of Execution | 35% | Usable frontend, persistent gallery, clean re-generation, backend quality, concurrent load handling, README, meaningful commits |
| Data and Validation | 20% | Live URL working, real API responses, failure states demonstrated, understanding of shortcomings |
| Problem Solving | 20% | Niche shapes product, complexity handling, what was chosen not to build and why, real understanding of AI image generation |

## Logistics

- **Deadline**: 7 days after receiving and accepting this assignment
- **Budget**: Up to $25 reimbursement for paid services
- **Submission Email**: dic@actu-al.co, chm@actu-al.co, peb@actu-al.co

