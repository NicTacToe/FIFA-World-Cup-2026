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
from datetime import datetime, timezone, timedelta

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)
IST = timezone(timedelta(hours=5, minutes=30))

KNOCKOUT_ROUNDS = [
    ("round_of_32", "Round of 32", "R32"),
    ("round_of_16", "Round of 16", "R16"),
    ("quarter_finals", "Quarter-finals", "QF"),
    ("semi_finals", "Semi-finals", "SF"),
    ("final", "Final", "F"),
]
KNOCKOUT_ROUND_BY_LABEL = {
    label.lower(): (key, label, short)
    for key, label, short in KNOCKOUT_ROUNDS
}

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
        round_key, round_label, round_short = _classify_round(round_raw)
        matchday   = re.sub(r"[^0-9]", "", round_raw) or "?"

        # Group label
        group_raw  = m.get("group", "")
        group_code = group_raw.replace("Group ", "") if group_raw.startswith("Group") else group_raw
        match_type = "knockout" if round_key else "group"
        if not round_key and not group_code and not (round_raw or "").lower().startswith("matchday"):
            match_type = "other"

        kickoff_utc = _parse_source_datetime(date_str, time_str)
        kickoff_ist = kickoff_utc.astimezone(IST) if kickoff_utc else None

        # Keep the legacy shape for the frontend, but convert the time into IST.
        display_date = _format_display_date(date_str, time_str)
        display_date_label = (
            _format_ist_datetime(kickoff_ist) if kickoff_ist else display_date
        )

        result.append({
            "id":                str(idx),
            "home_team_name_en": m.get("team1") or "TBD",
            "away_team_name_en": m.get("team2") or "TBD",
            "home_score":        str(ft[0]) if has_score else "0",
            "away_score":        str(ft[1]) if has_score else "0",
            "home_ht":           str(ht[0]) if ht else None,
            "away_ht":           str(ht[1]) if ht else None,
            "home_scorers_list": home_scorers,
            "away_scorers_list": away_scorers,
            "group":             group_code,
            "round":             round_label,
            "round_key":         round_key,
            "round_short":       round_short,
            "matchday":          matchday,
            "local_date":        display_date,
            "local_date_label":  display_date_label,
            "kickoff_ist_iso":   kickoff_ist.isoformat() if kickoff_ist else "",
            "stadium_city":      m.get("ground", ""),
            "status":            status,
            "status_label":      status_label,
            "type":              match_type,
            "type_label":        round_label if round_key else "Group Stage",
            "finished":          "TRUE" if has_score else "FALSE",
        })
    return result


def _classify_round(round_raw: str):
    """Return knockout round metadata, or empty values for group-stage matches."""
    normalized = re.sub(r"\s+", " ", (round_raw or "").strip()).lower()
    round_aliases = {
        "quarterfinals": "quarter-finals",
        "quarter final": "quarter-finals",
        "quarter finals": "quarter-finals",
        "quarter-final": "quarter-finals",
        "quarter-finals": "quarter-finals",
        "semifinals": "semi-finals",
        "semi final": "semi-finals",
        "semi finals": "semi-finals",
        "semi-final": "semi-finals",
        "semi-finals": "semi-finals",
    }
    normalized = round_aliases.get(normalized, normalized)

    if normalized in KNOCKOUT_ROUND_BY_LABEL:
        return KNOCKOUT_ROUND_BY_LABEL[normalized]
    return "", round_raw or "Group Stage", ""


def _determine_status(has_score: bool, date_str: str, time_str: str):
    """Return (status, status_label) based on score presence and date."""
    if has_score:
        return "finished", "FT"
    # Try to parse date/time to check if it's upcoming or live
    try:
        kickoff_utc = _parse_source_datetime(date_str, time_str)
        now_utc = datetime.now(timezone.utc)
        if kickoff_utc and kickoff_utc > now_utc:
            return "upcoming", "Upcoming"
    except Exception:
        pass
    # No score but date has passed → call it upcoming/TBD
    return "upcoming", "Upcoming"


def _format_display_date(date_str: str, time_str: str) -> str:
    """Return the legacy frontend date shape, converted to IST when possible."""
    try:
        kickoff_utc = _parse_source_datetime(date_str, time_str)
        if not kickoff_utc:
            raise ValueError("Unable to parse kickoff datetime")
        kickoff_ist = kickoff_utc.astimezone(IST)
        return kickoff_ist.strftime("%m/%d/%Y %H:%M")
    except Exception:
        # Fallback to the previous display format if parsing fails.
        try:
            time_part = time_str.split(" ")[0] if time_str else "00:00"
            dt = datetime.strptime(f"{date_str} {time_part}", "%Y-%m-%d %H:%M")
            return dt.strftime("%m/%d/%Y %H:%M")
        except Exception:
            return date_str


def _parse_source_datetime(date_str: str, time_str: str) -> datetime | None:
    """Parse source match date/time into an aware UTC datetime."""
    try:
        time_part = (time_str or "").split(" ")[0] or "00:00"
        tz_part = (time_str or "").split(" ")[1] if " " in (time_str or "") else "UTC+0"

        source_local = datetime.strptime(f"{date_str} {time_part}", "%Y-%m-%d %H:%M")
        source_offset = _parse_utc_offset(tz_part)

        # Source timestamps are expressed in their local UTC offset.
        return (source_local - source_offset).replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _parse_utc_offset(tz_part: str) -> timedelta:
    """Parse offsets like UTC+0, UTC-6, or UTC+5:30 into a timedelta."""
    match = re.fullmatch(r"UTC([+-])(\d{1,2})(?::(\d{2}))?", (tz_part or "").strip())
    if not match:
        return timedelta(0)

    sign = 1 if match.group(1) == "+" else -1
    hours = int(match.group(2))
    minutes = int(match.group(3) or 0)
    return timedelta(hours=sign * hours, minutes=sign * minutes)


def _format_ist_datetime(dt: datetime) -> str:
    """Format a timezone-aware datetime as '11 Jun 2026, 8:30 PM IST'."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=IST)
    dt = dt.astimezone(IST)
    hour = dt.strftime("%I").lstrip("0") or "12"
    return f"{dt.day} {dt.strftime('%b %Y')}, {hour}:{dt.strftime('%M')} {dt.strftime('%p')} IST"


def _format_ist_time(dt: datetime) -> str:
    dt = dt.astimezone(IST)
    hour = dt.strftime("%I").lstrip("0") or "12"
    return f"{hour}:{dt.strftime('%M')} {dt.strftime('%p')} IST"


def parse_date_key(m: dict):
    try:
        kickoff_ist = m.get("kickoff_ist_iso", "")
        if kickoff_ist:
            return datetime.fromisoformat(kickoff_ist)
        return datetime.strptime(m.get("local_date", "01/01/2000 00:00"), "%m/%d/%Y %H:%M")
    except Exception:
        return datetime.min


def _bracket_match(m: dict) -> dict:
    """Project the normalized match into the smaller bracket API shape."""
    finished = m.get("finished") == "TRUE"
    kickoff_ist = None
    try:
        kickoff_ist = datetime.fromisoformat(m.get("kickoff_ist_iso", "")).astimezone(IST)
    except Exception:
        pass

    return {
        "id": m.get("id", ""),
        "round": m.get("round", ""),
        "round_key": m.get("round_key", ""),
        "home_team_name_en": m.get("home_team_name_en") or "TBD",
        "away_team_name_en": m.get("away_team_name_en") or "TBD",
        "home_score": m.get("home_score") if finished else None,
        "away_score": m.get("away_score") if finished else None,
        "status": m.get("status", "upcoming"),
        "status_label": m.get("status_label", "Upcoming"),
        "local_date": m.get("local_date", ""),
        "local_date_label": m.get("local_date_label", ""),
        "kickoff_day": kickoff_ist.strftime("%a") if kickoff_ist else "",
        "kickoff_date": f"{kickoff_ist.day} {kickoff_ist.strftime('%b %Y')}" if kickoff_ist else "",
        "kickoff_time": _format_ist_time(kickoff_ist) if kickoff_ist else "",
        "kickoff_ist_iso": m.get("kickoff_ist_iso", ""),
    }


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
            "last_updated":  _format_ist_datetime(datetime.now(timezone.utc)),
            "source":        "openfootball/worldcup.json",
        })

    except Exception as exc:
        import traceback
        traceback.print_exc()
        return _json_response({"success": False, "error": str(exc)}, status=500)


@app.route("/api/bracket")
def get_bracket():
    try:
        games = fetch_openfootball()
        knockout = [g for g in games if g["type"] == "knockout"]

        rounds = []
        for round_key, round_label, _ in KNOCKOUT_ROUNDS:
            matches = sorted(
                [g for g in knockout if g.get("round_key") == round_key],
                key=parse_date_key
            )
            rounds.append({
                "key": round_key,
                "label": round_label,
                "matches": [_bracket_match(m) for m in matches],
            })

        return _json_response({
            "success": True,
            "rounds": rounds,
            "last_updated": _format_ist_datetime(datetime.now(timezone.utc)),
            "source": "openfootball/worldcup.json",
        })

    except Exception as exc:
        import traceback
        traceback.print_exc()
        return _json_response({"success": False, "error": str(exc)}, status=500)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
