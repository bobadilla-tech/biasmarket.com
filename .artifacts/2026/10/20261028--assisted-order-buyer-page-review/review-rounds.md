# Review rounds

## Round 0 (independent cold review, 3 subagents, runtime)

Web (#357/#358), checkout race (#359), related orders + ghosts (#360/#361).
Claim ledger: see review-notes.md. I re-verified myself: pickup date timezone,
alias U+2060/U+00AD/U+3164/tag chars, void flow precondition (dropped agent F4),
anchors.

## Round 1 (A adversarial + D author's advocate, one agent) and Round B (cold gap hunt, one agent)

Changes: 357-1 downgraded to nit and reworded (seller-typed, cosmetic; DTO gap
pre-existing); 358-2 reworded (8 component-test survivors + 2 guard bypasses =
the 10 of 27; gcTime "privacy promise" framing dropped); 358-4 dropped
(invalid.body already tells the buyer to ask the store); 358-5 reworded
(direction keep-list vs plan acceptance 3); 358-6 numbers untraceable removed;
359 email-case marked pre-existing/disclosed; 360-1 garbage-phone claim softened
(main already calls bare normalizePhone). Added from the gap hunt (nits, in
bodies): loading.tsx role=status on main, error.tsx no heading/focus, dates
without year, randomUUID vs cuid, lockBuyerPhone type. Dropped: G4 (pre-existing
shared components), G7 alias content (design choice in the plan; "alias as first
name" is already in follow-up ticket 3). Traceability: figures (17/27 mutations,
40-way stress 8-9 of 40 500s, EXPLAIN 60k, e2e 5/5 and 6/6, curl headers) were
produced by the Round 0 subagents' own runs and reported in their hand-backs;
only the stack-top logs are saved (scratchpad d/*.log).
