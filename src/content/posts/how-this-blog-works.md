---
title: "How This Blog Works"
date: 2026-10-05
description: "Astro, Markdown, XP.css, TuiCss, and a GitHub Action: the whole stack behind this site in five minutes."
tags: [meta, astro, web]
draft: false
---

This site is a small [Astro](https://astro.build) project. Here's the whole
pipeline:

1. I write a post as a Markdown file in `src/content/posts/`.
2. I push to the `main` branch on GitHub.
3. A GitHub Action runs `astro build`, which turns every post into a plain
   HTML page at `/posts/<file-name>/`.
4. GitHub Pages serves the result for free.

## The retro bits

The BIOS screen uses [TuiCss](https://github.com/vinibiavatti1/TuiCss) and the
desktop uses [XP.css](https://botoxparty.github.io/XP.css/). Both are just CSS,
so there's no big framework here. A small vanilla script handles the clock,
the Start menu, and dragging windows around.

> Every window is a real page. If you copy the address bar while reading
> this post, you get a link that opens this exact window.

## Frontmatter

Each post starts with a block like this:

```yaml
---
title: "How This Blog Works"
date: 2026-10-05
description: "Shown in the post list and search results."
tags: [meta, astro]
draft: false
---
```

Set `draft: true` and the post shows up in `npm run dev` but not on the live
site.
