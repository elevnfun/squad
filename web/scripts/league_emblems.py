"""League cards for the home page fan, built from the emblems in web/public/leagues.

The emblems are minimal flat versions of each league's mark: the same silhouette simplified to
straight edges, in navy with one hot-pink detail. This script wraps each one in a white card
with the league's country flag and name and writes web/public/fan/<slug>.svg.
Run from the repo root: python3 web/scripts/league_emblems.py web
"""
import re
import sys
from pathlib import Path

web = Path(sys.argv[1])
NAVY, PINK = "#0a0b0d", "#c8961f"
FONT = "font-family='Helvetica Neue, Helvetica, Arial, sans-serif' font-weight='700'"
LEAGUES = {"premier-league": ("Premier League", True, "england"), "la-liga": ("La Liga", True, "spain"),
           "bundesliga": ("Bundesliga", True, "germany"), "serie-a": ("Serie A", False, "italy"),
           "ligue-1": ("Ligue 1", False, "france")}

# Country flags, drawn in a 48x32 box (simple versions: Spain without its coat of arms)
FLAGS = {
    "england": "<rect width='48' height='32' fill='#ffffff'/><rect x='20' width='8' height='32' fill='#ce1124'/><rect y='12' width='48' height='8' fill='#ce1124'/>",
    "spain": "<rect width='48' height='32' fill='#c60b1e'/><rect y='8' width='48' height='16' fill='#ffc400'/>",
    "germany": "<rect width='48' height='11' fill='#000000'/><rect y='10.6' width='48' height='11' fill='#dd0000'/><rect y='21.3' width='48' height='10.7' fill='#ffce00'/>",
    "italy": "<rect width='16' height='32' fill='#009246'/><rect x='16' width='16' height='32' fill='#ffffff'/><rect x='32' width='16' height='32' fill='#ce2b37'/>",
    "france": "<rect width='16' height='32' fill='#0055a4'/><rect x='16' width='16' height='32' fill='#ffffff'/><rect x='32' width='16' height='32' fill='#ef4135'/>",
}

def flag(country, x, y):
    # rounded corners and a hairline edge so white stripes still show on the white card
    return (f"<g transform='translate({x} {y})'><clipPath id='fc'><rect width='48' height='32' rx='6'/></clipPath>"
            f"<g clip-path='url(#fc)'>{FLAGS[country]}</g>"
            f"<rect x='.5' y='.5' width='47' height='31' rx='5.5' fill='none' stroke='{NAVY}' stroke-opacity='.18'/></g>")

for slug, (name, live, country) in LEAGUES.items():
    emblem = (web / f"public/leagues/{slug}.svg").read_text()
    size = float(re.search(r"viewBox='0 0 ([\d.]+)", emblem).group(1))
    inner = emblem[emblem.index(">") + 1:emblem.rindex("</svg>")]
    scale = 270 / size  # the emblem sits in a 270px square near the top of the card
    blur = "" if live else " filter='url(#soon)'"
    footer = (f"<text x='200' y='452' text-anchor='middle' {FONT} font-size='20' fill='#0a0b0d'>Build your squad</text>" if live else
              f"<rect x='118' y='226' width='164' height='46' rx='23' fill='{PINK}'/>"
              f"<text x='200' y='256' text-anchor='middle' {FONT} font-size='18' letter-spacing='1' fill='{NAVY}'>COMING SOON</text>")
    card = f"""<svg xmlns='http://www.w3.org/2000/svg' width='400' height='500' viewBox='0 0 400 500'>
<defs>
<linearGradient id='wash' x1='0' y1='0' x2='0' y2='1'><stop offset='.6' stop-color='#ffffff'/><stop offset='1' stop-color='#f4efe2'/></linearGradient>
<filter id='soon' x='-10%' y='-10%' width='120%' height='120%'><feGaussianBlur stdDeviation='7'/></filter>
</defs>
<rect width='400' height='500' fill='url(#wash)'/>
<g{blur}>
<g transform='translate(65 48) scale({scale:.4f})'>{inner}</g>
<text x='200' y='{392 if live else 400}' text-anchor='middle' {FONT} font-size='32' letter-spacing='-0.5' fill='{NAVY}'>{name}</text>
</g>
{footer}
{flag(country, 24, 24)}
</svg>
"""
    (web / f"public/fan/{slug}.svg").write_text(card)
    print(slug, "ok")
