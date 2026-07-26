# Taluxa Chinese README Design

## Goal

Create a natural, complete Simplified Chinese README for Taluxa while keeping the existing English README unchanged.

## Output

- Create `README.zh-CN.md` at the repository root.
- Keep `README.md` as the English source document.
- Add a compact language switch at the top of the Chinese document: `中文 | [English](README.md)`.

## Translation Approach

Use natural Chinese localization rather than literal sentence-by-sentence translation.

- Preserve the meaning, scope, and technical accuracy of the English document.
- Use concise terms familiar to Chinese desktop application and media-player users.
- Keep product and technology names unchanged, including Taluxa, Emby, Electron, React, TypeScript, Vite, Vitest, and mpv.
- Keep commands, code blocks, file paths, and script names exactly as written in the English README.
- Translate image alt text into Chinese while reusing the existing files in `docs/assets/readme/`.

## Structure

Mirror the English README section order:

1. Project introduction
2. Visual product overview
3. Features
4. Technology stack
5. Getting started
6. Scripts
7. Project structure
8. Manual verification
9. Notes

The Chinese document must not add platform-specific setup claims, download links, or features that are absent from the English source.

## Maintenance

The English and Chinese documents remain separate files but share the same images and command examples. Future feature changes should update both documents together. The matching section order makes differences easy to review.

## Verification

- Confirm every English section has a Chinese counterpart.
- Confirm all three image paths resolve locally.
- Confirm fenced commands and project paths match the English README exactly.
- Confirm the language switch points to `README.md`.
- Scan for untranslated prose while allowing product names and technical terms to remain in English.
- Run Markdown whitespace and link checks before committing.
