# elevn design system

The design plan for the redesign that starts in November 2026. It replaces the navy look; treat
the old screens as what to move away from, not something to polish. Sources: impeccable 4.8
(pbakaus/impeccable@ac0966d) and tasteskill 2.5 (Leonxlnx/taste-skill@9b4bf93), read and applied by
hand. None of their scripts are run.
Synced with the live site on 2026-11-06: where this file and the code disagreed, the code won.

## The subject

elevn is fantasy football for people who hold the $ELEVN token on Solana. The people using it are
crypto-native football fans, mostly on their phones, checking their squad around kickoff. The site
has three jobs, and each page has one mode:

| Surface | Mode | Its job |
|---|---|---|
| Home | Persuade | Say what elevn is and get a squad built |
| League, squad, transfers | Operate | Pick players, see points, fast and scannable |
| About, How to play, Roadmap, News, FAQ | Read | Explain the rules plainly |

## The idea: night match

The page is a stadium at night: near-black and warm white carry about 90% of every screen, the way
Nike, PlayStation and Spotify keep their chrome neutral (compared through awesome-design on
2026-11-05). Trophy gold is the one colour, for the main action, active states, the captain and the
dot in "elevn.". Broadcast red appears only on LIVE. The pitch brings the green: striped grass,
darker at the far end, tilted in perspective on the home page. (Earlier themes: white / sky / pink,
then forest / jungle / pumpkin; both used too many saturated colours at once.)

Light: behind every page of the full site, React Bits' **SideRays** let gold light fall in from the
top right, drifting slowly and leaning a little toward the mouse ((site)/layout.tsx). The opening
screen runs taste's **grid-pulse**, a hairline grid with gold signals running along it behind the
logo. The home hero adds a static floodlight pool with a faint film grain (`.floodlit`).

## Colour

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#0A0B0D` | The night: page ground |
| `--surface` / `--surface-2` | `#131519` / `#1B1E23` | Cards and list tiles; table headers, inputs, the league band |
| `--text` | `#F4F4F1` | Warm white text, 17.9:1 |
| `--muted` | `#A4A8AF` | Labels and meta, 8.3:1 |
| `--accent` / `--link` / `--highlight` | `#F2C14E` | Trophy gold: main button (black label 11.7:1), links, active, focus, captain, the dot |
| `--live` | `#FF5A52` | LIVE only, black label 6.4:1 |
| `--pitch` / `--pitch-2` | `#1B4D2E` / `#1F5533` | The grass and its mowing stripe (`.pitch-grass`) |
| `--wash` | `#221E12` | Your own row, notices |
| `--ok` / `--danger` | `#3DDC84` / `#FF6B63` | Points gained or lost, errors |

Rules:
- One gold button per view. Secondary buttons are a 28% white outline.
- Red means a match is being played right now, nothing else.
- Difficulty chips run green (easy) to red (hard), the football convention.

## Type

Two families. **Sora** carries everything, with roles set by size and weight. **Barlow Condensed**
(600/700, `--font-display`) is the scoreboard face: league names in capitals on the league cards
and the "This gameweek" board, nowhere else. Numbers use tabular figures everywhere (points,
prices, ranks, countdowns), never a monospace face.

| Role | Size | Weight | Tracking | Use |
|---|---|---|---|---|
| Display | clamp(48px, 7vw, 96px) | 800 | -0.035em | The home h1 only |
| H1 | clamp(36px, 5vw, 56px) | 800 | -0.03em | Page titles |
| H2 | clamp(28px, 3vw, 40px) | 700 | -0.02em | Sections |
| H3 | 20px | 600 | -0.01em | Card and row titles |
| Scoreboard | 30px | 700 | 0 | Barlow Condensed, capitals: league names on boards and cards |
| Lead | 20px / 1.5 | 400 | 0 | One intro paragraph per page |
| Body | 16px / 1.6 | 400 | 0 | All reading text, 65ch max |
| Small | 14px / 1.5 | 500 | 0 | Table cells, meta |
| Label | 13px | 500 | 0 | Sentence case for ordinary labels |
| Board label | 12px | 600 | 0.16em | Capitals, muted: the small headings on a scoreboard panel ("This gameweek", "Deadline in") |

Headings use `text-wrap: balance`, body text `text-wrap: pretty`. The home h1 may end with the
logo's gold full stop: that's the brand mark, used once on the whole site.

## Layout

- One content width: 1360px with 24px gutters on phones and 80px from 1024px. Every block sits on
  those two edges; the nav uses the same width.
- Spacing scale 4, 8, 12, 16, 24, 32, 48, 64, 96, 128. Heading to content 48px (32 on a phone);
  more space above a heading than below it.
- Radius: 12px for cards and the pitch, 14–16px for list tiles and league cards, 24px for the
  floating glass board, 8px for inputs, 999px for buttons and badges.
- Cards and list tiles are solid `--surface` with an 8% white edge and no shadow. Panels that sit
  over the light (the "This gameweek" board) are glass: `--bg` at 55%, 10% white edge, background
  blur.
- Nav (72px, fixed): logo left; from 1024px the pages you play on follow it as 14px muted links
  (a borderless **Leagues ▾** picker, Chat, How to play; white on hover, the current page white
  with a gold dot under it); the wallet sign-in and "Menu +" on the right. It slides away while
  scrolling down and returns on the way up, with a blurred backing once below the top. The menu is
  React Bits' **StaggeredMenu** and holds what the bar doesn't: from 1024px a side panel with
  About, Roadmap, News and FAQ as big white words; on phones and tablets a full-screen sheet with
  the three leagues and Chat as big words and a small "Learn the game" row (How to play, About,
  Roadmap, News, FAQ). The logo is the way home; Payouts sits in the wallet menu. At most four big
  words, so the menu reads at a glance (navbar plus secondary menu, as Linear and Vercel split it;
  compared through awesome-design on 2026-11-14).

### Home

The home page scrolls as full-screen slides that snap into place (firmly on large screens, gently
on phones).

```
┌──────────────────────────────────────────────────────────────┐
│ elevn.                                       [wallet]  Menu + │
├──────────────────────────────────────────────────────────────┤
│ Fantasy football for          ┌──────── the pitch ───────┐   │
│ $ELEVN holders.               │   ●      ●      ●        │   │
│ No entry fee: hold 150,000    │ ●    ●      ●      ●     │   │
│ $ELEVN for each squad.        │   ●    ● (C) ●           │   │
│ [Build a squad] (How to play) │        ●                 │   │
│                               └─ top squad · GW · pts ───┘   │
├──────────────────────── Pick your league ────────────────────┤
│  fan of league cards                    ┌ This gameweek ─────┐│
│  [PL] [La Liga] [Bundesliga] [SA] [L1]  │ league ▾           ││
│                                         │ PREMIER LEAGUE     ││
│                                         │ deadline clock     ││
│                                         │ [Build a squad]    ││
│                                         └────────────────────┘│
├──────────────────────────────────────────────────────────────┤
│ Your prizes (only when you have some)                         │
├──────────────────────────────────────────────────────────────┤
│ Four steps to your first squad (a real sequence, so numbered) │
│ Where the prize money comes from: one bar, 60 / 20 / 10 / 10  │
├──────────────────────────────────────────────────────────────┤
│ footer: elevn. large, links, legal                            │
└──────────────────────────────────────────────────────────────┘
```

Left-aligned throughout. On a phone the hero stacks words first, then the pitch, and the board
drops below the cards.

### League, squad and transfers (Operate)

The squad sits on the same pitch, players as white shirts with their points under them, the
captain marked. Your squads, the leaderboard and the injury list are React Bits **AnimatedList**s
in the night palette: tiles that slide or fade in one after another, select on hover or keyboard,
and open on click. Leaderboard tiles show rank (gold disc for 1st, gold ring for 2nd and 3rd),
squad and points, with a gold "You" tag on your own squad. LIVE is a small red badge.

### Info pages (Read)

Dark like the rest of the site, 65ch text column, ruled lists, one gold "Choose a league" button at
the end.

## Motion

The site moves, but softly: ease-out curves, 150ms for hover, about 700ms for arrivals.

- **The authored moment:** the opening intro (video, the ball flies into the logo's dot).
- **Ambient:** the SideRays light behind every page and the grid-pulse on the opening screen.
- **Arrivals:** each home slide fades in as it snaps into view and its parts (heading, text,
  buttons, board) follow one after another; a slide you've left dims and sinks back behind the next
  one instead of vanishing. The hero squad walks on shirt by shirt. The four steps come in one
  after another; the fee bar fills share by share and its numbers count up when it comes into
  view; list tiles slide or fade in.
- **Connecting:** every page except home fades in on arrival (app/(site)/template.tsx); the
  current nav link's gold underline slides across to the new page; on large screens a rail of
  short lines down the right edge of the home page marks the current slide and glides to any other.
  Info-page sections and rows rise in once as you reach them, the roadmap line draws down, and
  FAQ answers open and close smoothly.
- **Hover:** buttons step up 1px and press down on click, links draw their underline, linked cards
  lift, list tiles brighten.
- Other React Bits pieces in use: StaggeredMenu (phone menu), GlideSelect (dropdowns),
  LatticeLoader (loading), CountUp (numbers). The league cards' fan is our own (components/league-fan).
- No sparks, shimmer, tilt-on-hover or cursor effects. Under reduced motion everything rests,
  except the SideRays light, which slows to a third of its speed.

## What goes

ShinyText (looping shine), GooeyNav (pill nav), ClickSpark, CursorGrid, GlareHover, and the
pitch-line background behind every page. The fan of league cards stays, and the fold-in logo stays
because the intro lands in it.

## Quality floor

Text contrast 4.5:1 (large text 3:1) checked on real pairs; visible gold focus ring; selection,
caret and scrollbars themed from the palette; hover, disabled, loading, error and empty states
designed; checked at 390, 768, 1024 and 1440 wide; reduced motion respected.
