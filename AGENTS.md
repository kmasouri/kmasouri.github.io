# Repository guidance

## Use the provided CSS libraries first

- For every design or styling need, use the capabilities already provided by `xp.css` or `tuicss` whenever either library covers it. This is a requirement, not a preference.
- Implement custom CSS only when neither `xp.css` nor `tuicss` provides the component, control, layout primitive, or visual treatment that the feature requires.
- Before adding custom CSS, inspect the relevant library documentation and selectors. For XP.css, check `node_modules/xp.css/README.md` and `node_modules/xp.css/dist/XP.css`.
- This site's desktop interface is built around `xp.css`, imported by `src/layouts/Desktop.astro`. Use its semantic primitives such as `.window`, `.title-bar`, `.window-body`, `.surface`, `.field-row`, `.field-row-stacked`, `.status-bar`, `.is-vertical`, and `.has-box-indicator` wherever applicable.
- Preserve the markup expected by XP.css. In particular, checkbox and radio inputs must be immediately followed by their `<label>` elements (`input + label`) for the supplied styling to work.
- Do not recreate buttons, sliders, checkboxes, text inputs, window chrome, or other controls already supplied by either library.
- Keep additions consistent with the existing Windows XP desktop, taskbar, window-management behavior, and responsive mobile rules.

## Audio behavior

- Browser autoplay may be blocked. Audio features must attempt autoplay and also provide a first-user-interaction fallback.
- The taskbar volume control is the shared source of truth for media volume and mute state. Feature scripts must not overwrite `audio.volume` or `audio.muted`.
- New audio controls should use XP.css range and checkbox primitives before adding custom styling.

## Verification

- Run `npm run build` after site changes.
- Verify new routes and static media return successfully from the local preview.
- Existing LightningCSS warnings originating from `xp.css` are known; do not mask new build failures.
- Preserve unrelated user work, including untracked content files.
