# Taluxa README Visuals Design

## Goal

Make the Taluxa README more inviting and easier to understand at a glance by adding a small, cohesive set of product-focused visuals.

## Visual Direction

Use a designed product-showcase style rather than raw screenshots or a purely illustrative brand image. The visuals should resemble Taluxa's real dark desktop interface while using only fictional media data and original abstract artwork.

The tone is quiet, cinematic, and polished. Deep navy and charcoal surfaces provide the base, with restrained cyan and violet accents matching a modern media-player experience.

## Image Set

Create three local WebP images in `docs/assets/readme/`:

1. `hero.webp`
   - A wide, approximately 2:1 composition.
   - Combines the Taluxa name, the line “Cinema at home, without the noise,” and a desktop home-screen presentation.
   - Shows a poster-first library and continue-watching row using abstract posters and fictional titles such as “Signal Beyond,” “Cloud Harbor,” “The Last Orbit,” and “Violet Static.”
   - Serves as the README's primary visual immediately below the project introduction.

2. `browsing.webp`
   - A 16:9 feature image focused on browsing and item context.
   - Suggests poster browsing, artwork, metadata, seasons, streams, and related titles.
   - Uses the visual label “Browse without friction” and the supporting idea “Everything in context.”

3. `playback.webp`
   - A 16:9 feature image focused on bundled mpv playback.
   - Suggests resume progress, audio selection, playback progress, and precise keyboard volume control.
   - Uses the visual label “mpv, built in” and the supporting idea “Playback in your control.”

## Content and Rights Constraints

- Do not use real Emby accounts, server addresses, user names, access tokens, or library data.
- Do not use recognizable film artwork, actor likenesses, studio marks, or copyrighted promotional images.
- Build posters from original gradients, geometric forms, light effects, and typography.
- Use fictional titles and generic metadata only.
- Keep all README images in the repository; do not depend on remote image hosts.

## README Integration

Keep the existing README language and technical sections intact, with focused additions:

- Refine the opening into a compact brand introduction.
- Place `hero.webp` directly after the introduction so the first viewport establishes the product's identity.
- Add a short visual feature section before the existing feature list.
- Present `browsing.webp` and `playback.webp` with concise headings and one-line explanations.
- Reference images using repository-relative Markdown paths so they render on GitHub and offline.
- Provide useful alt text that describes the product capability rather than repeating decorative text.

Avoid HTML layout tricks that could render inconsistently across Markdown viewers. The feature images should remain readable when stacked vertically on narrow screens.

## Asset Requirements

- Use WebP to keep repository and page weight reasonable.
- Export at sufficient resolution for crisp rendering on high-density desktop displays.
- Keep text large enough to remain legible at typical GitHub README widths.
- Use consistent corner radii, shadows, spacing, and accent colors across all three images.
- Preserve the approved one-primary-plus-two-supporting visual hierarchy.

## Verification

- Confirm all three files exist and can be decoded as WebP.
- Confirm README image paths resolve with the repository checked out locally.
- Preview the rendered README at desktop and narrow widths.
- Confirm no image contains real account data, copyrighted media art, or remote dependencies.
- Review the final diff to ensure unrelated README sections and user changes remain untouched.
