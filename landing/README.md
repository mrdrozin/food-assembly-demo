# Food assembly monitoring — project card

A twelve-slide card about the project: what it does, how it is built, what it measured and what it
cannot see. Plain HTML, CSS and JavaScript — no build step, no framework, no network calls.

```
index.html          all twelve slides
css/style.css       the whole theme and layout
js/app.js           the slider: arrows, keys, wheel, swipe, #n in the URL
assets/img/*.jpg    stills from the recordings
assets/video/*.mp4  short loops, each with a .jpg poster next to it
```

## Running it

Double-click `index.html` — it works straight from the file system, with no build step.

To serve it locally instead:

```bash
python3 -m http.server 8777
```

## Publishing it on GitHub Pages

The page lives in `landing/` on `dev` and is published by `.github/workflows/pages.yml`.
GitHub Pages cannot serve an arbitrary folder from the simple branch setting — that one
offers only the repository root or `docs/`, and `docs/` already holds the project's
documentation — so the workflow uploads this folder instead.

One-time setup in the repository:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. Push `dev`. The workflow runs whenever anything under `landing/` changes, and it can
   also be started by hand from the Actions tab.
3. The address appears in the workflow run and under Settings → Pages. That is the
   address for the QR code.

Nothing here needs a server side, so any other static host works the same way: copy the
folder as it is.

## Moving around

Arrow keys, `Space`, `Home`/`End`, the arrows and dots at the bottom, a mouse wheel, or a swipe on a
phone. A slide taller than the window scrolls first and turns at its edge. `#7` in the address opens
slide 7 directly, which is handy for linking to one slide. `prefers-reduced-motion` turns the
transitions off and leaves the clips paused on their posters.

## Where the material came from

Everything is from the lab recording of 2026-09-23 (9 min 26 s, three cameras, four operators) and
from nine phone videos of the customer's line. The boxes, masks, zone names and operator names in the
pictures were drawn by the system while it ran — none of it was added by hand afterwards.

The numbers on the slides are the rows the system wrote, including the ones that are not flattering:
613 seconds of work no rule could name, one placement in the log too many against the eight sandwiches
the bench actually made, and only one placement tied to a named hand.

The assistant slides follow the service as it actually answers. A question about the process chart
runs the recipe check and comes back as a checklist — every step and ingredient with its own verdict
and the observations behind it; any other question is answered from the recording, with the citations
rendered as numbered links into the observations below the answer.

The two prose answers are real replies from the chat. The process check reproduces the interface and
the findings of a real run of that check for Operator 1 against recipe № 178, shortened to the rows
that fit on one slide.
