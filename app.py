"""
FIFA World Cup 2026 — Flask backend
Data source: openfootball/worldcup.json (GitHub raw) — always reachable,
             with an optional attempt at worldcup26.ir for richer scorer data.
"""

import re
import json
import requests
import urllib3
from flask import Flask, Response, render_template
from datetime import datetime, timezone

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)

# ── Data sources (tried in order) ────────────────────────────────────────────
OPENFOOTBALL_URL = (
    "https://raw.githubusercontent.com/openfootball/"
    "world-cup.json/master/2026/worldcup.json"
)

WORLDCUP26_URL = "https://worldcup26.ir/get/games"

REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, */*",
}


# ── Fetch helpers ─────────────────────────────────────────────────────────────

def _get(url: str, timeout: int = 15) -> dict:
    """GET a URL and return parsed JSON (forces UTF-8 decoding)."""
    r = requests.get(url, headers=REQUEST_HEADERS, timeout=timeout, verify=False)
    r.raise_for_status()
    r.encoding = "utf-8"
    return r.json()


def fetch_openfootball() -> list[dict]:
    """
    Fetch from openfootball's GitHub raw JSON.
    Returns a normalised list of match dicts.
    """
    data = _get(OPENFOOTBALL_URL)
    matches = data.get("matches", [])
    result = []
    for idx, m in enumerate(matches, start=1):
        score = m.get("score", {})
        ft    = score.get("ft")          # [home, away] or None
        ht    = score.get("ht")

        has_score = ft is not None

        # Goals → scorer strings
        def fmt_goals(goals):
            out = []
            for g in (goals or []):
                name = g.get("name", "")
                minute = g.get("minute", "")
                suffix = " (p)" if g.get("penalty") else ""
                out.append(f"{name} {minute}'{suffix}".strip())
            return out

        home_scorers = fmt_goals(m.get("goals1", []))
        away_scorers = fmt_goals(m.get("goals2", []))

        # Determine status
        date_str = m.get("date", "")
        time_str = m.get("time", "")
        status, status_label = _determine_status(has_score, date_str, time_str)

        # Round → matchday number
        round_raw = m.get("round", "Matchday ?")
        matchday   = re.sub(r"[^0-9]", "", round_raw) or "?"

        # Group label
        group_raw  = m.get("group", "")
        group_code = group_raw.replace("Group ", "") if group_raw.startswith("Group") else group_raw

        # Formatted local_date for display
        display_date = _format_display_date(date_str, time_str)

        result.append({
            "id":                str(idx),
            "home_team_name_en": m.get("team1", "TBD"),
            "away_team_name_en": m.get("team2", "TBD"),
            "home_score":        str(ft[0]) if has_score else "0",
            "away_score":        str(ft[1]) if has_score else "0",
            "home_ht":           str(ht[0]) if ht else None,
            "away_ht":           str(ht[1]) if ht else None,
            "home_scorers_list": home_scorers,
            "away_scorers_list": away_scorers,
            "group":             group_code,
            "matchday":          matchday,
            "local_date":        display_date,
            "stadium_city":      m.get("ground", ""),
            "status":            status,
            "status_label":      status_label,
            "type":              "group",
            "type_label":        "Group Stage",
            "finished":          "TRUE" if has_score else "FALSE",
        })
    return result


def _determine_status(has_score: bool, date_str: str, time_str: str):
    """Return (status, status_label) based on score presence and date."""
    if has_score:
        return "finished", "FT"
    # Try to parse date/time to check if it's upcoming or live
    try:
        # time_str format: "12:00 UTC-6", "20:00 UTC+0", etc.
        time_part = time_str.split(" ")[0]  # "12:00"
        tz_part   = time_str.split(" ")[1] if " " in time_str else "UTC+0"
        tz_offset = int(re.sub(r"UTC([+-]\d+)", r"\1", tz_part))
        dt_str    = f"{date_str} {time_part}"
        dt        = datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
        # Shift by tz_offset to get UTC
        from datetime import timedelta
        dt_utc    = dt - timedelta(hours=tz_offset)
        now_utc   = datetime.now(timezone.utc).replace(tzinfo=None)
        if dt_utc > now_utc:
            return "upcoming", "Upcoming"
    except Exception:
        pass
    # No score but date has passed → call it upcoming/TBD
    return "upcoming", "Upcoming"


def _format_display_date(date_str: str, time_str: str) -> str:
    """Return a human-readable date string like 'Jun 11, 13:00'."""
    try:
        time_part = time_str.split(" ")[0] if time_str else "00:00"
        dt = datetime.strptime(f"{date_str} {time_part}", "%Y-%m-%d %H:%M")
        return dt.strftime("%m/%d/%Y %H:%M")
    except Exception:
        return date_str


def parse_date_key(m: dict):
    try:
        return datetime.strptime(m.get("local_date", "01/01/2000 00:00"), "%m/%d/%Y %H:%M")
    except Exception:
        return datetime.min


def _json_response(payload: dict, status: int = 200) -> Response:
    """Return a Flask Response with UTF-8 encoded JSON."""
    body = json.dumps(payload, ensure_ascii=False)
    return Response(body, status=status, mimetype="application/json; charset=utf-8")


# ── Routes ────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/matches")
def get_matches():
    try:
        games = fetch_openfootball()

        finished_live = sorted(
            [g for g in games if g["status"] in ("finished", "live")],
            key=parse_date_key, reverse=True
        )
        upcoming = sorted(
            [g for g in games if g["status"] == "upcoming"],
            key=parse_date_key
        )

        # Count total goals
        total_goals = sum(
            (int(g.get("home_score") or 0) + int(g.get("away_score") or 0))
            for g in finished_live
        )

        return _json_response({
            "success":       True,
            "finished_live": finished_live,
            "upcoming":      upcoming,
            "total":         len(games),
            "total_goals":   total_goals,
            "last_updated":  datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
            "source":        "openfootball/worldcup.json",
        })

    except Exception as exc:
        import traceback
        traceback.print_exc()
        return _json_response({"success": False, "error": str(exc)}, status=500)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
