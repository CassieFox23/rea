# Accessibility

REA has a website, a command-line tool and an MCP server. This page says what each does for accessibility today, what is missing, and how to report a barrier. It is kept honest: nothing here has been tested with a screen reader yet.

## What this covers

- The website at rea.tools and its GitHub Pages mirror (`website/public`).
- The `rea` command-line tool, including `rea setup` and `rea doctor`.
- The MCP server that agents talk to.
- The Markdown docs in this repository.

## Where things stand

### Website

- Every page declares `lang="en"`.
- Site pages have a "Skip to content" link and a `<main id="main">` landmark. The two sample apps under `examples/` (the Notes apps you analyse) do not.
- Keyboard focus shows as a 2px accent outline (`:focus-visible`).
- Every image has alt text. The four case-study SVGs also carry `<title>` and `<desc>` for the "Open figure" view.
- Copy buttons announce "Code copied" or "Code selected" through a polite live region.
- If your system asks for less motion, the terminal cursor stops blinking. Smooth scrolling turns off too.
- The FAQ uses native `<details>`. The main text still works with JavaScript off.
- The mini-game canvas is focusable and has a label that names the Jump button and the Space key.
- Colour scheme: light only today. <!-- TODO: update once the dark-mode change merges. -->

### Command line

- `rea setup --accessible` asks one yes/no question at a time, top to bottom, with Enter as the only key you need.
- `NO_COLOR=1` turns colour off.
- Prompts and progress go to stderr. Results go to stdout, so you can pipe them.
- Every command has `--json`. `rea doctor --json` gives the full readiness report as JSON.
- Each setup progress line starts with a symbol, then the step name. The symbols are `◇` started, `◆` done, `!` warning and `✗` failed.

### MCP server

Results are JSON for the agent you use. REA makes no accessibility claim here; your agent's own interface sets what you can do with the output.

## Known gaps

- No one has run a screen-reader pass on the website or the CLI. If you do, please tell us what you found, good or bad.
- Four website pages skip a heading level (the Touhou blog post, and the Aegis, CTF and TH04 showcases).
- Some figures use colour to mark the relevant operation. They have legends, but no colour-free version.
- The two sample apps under `examples/` have no skip link or main landmark.
- The bug report form has no "Accessibility" area yet, so use the nearest one (see below).
- Contrast of the secondary text colour on white is 5.9:1 (passes AA, not AAA).

## Report a barrier

1. Open a [bug report](https://github.com/morluto/rea/issues/new?template=bug_report.yml).
2. Start the title with `[Bug] Accessibility:` and say what you could not do.
3. In **Area**, pick **Documentation** for the website or docs, **CLI** for the terminal, or **Other**.
4. In **Interface**, pick what you were using. For **Earliest failure stage**, pick **Unknown** if none fits.
5. Tell us the page or command, and your system. Name your browser or terminal too.
6. If you use a tool like a screen reader, name it and its version.
7. Screenshots or a short recording help. Remove private paths and data first.

Questions or ideas that are not a bug go to [Discussions](https://github.com/morluto/rea/discussions).

For a security bug, use [SECURITY.md](SECURITY.md) instead.

## Who looks after this

<!-- TODO (maintainers): who reads these reports? -->
<!-- TODO (maintainers): say how fast you expect to reply, or say that there is no promise. -->

## How changes are checked

Before a merge, the website style guide asks for a few checks. They cover keyboard use, reduced motion and 320px screens. They also cover pages with JavaScript off. `python3 scripts/website.py check` tests links, metadata and SVG files. It does not test accessibility.

<!-- TODO (maintainers): list any checks you want people to run. -->
