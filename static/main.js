/* =====================================================
   FIFA World Cup 2026 — Client-Side Logic
   ===================================================== */

// ── Country flag emoji lookup ──────────────────────────
const FLAG_MAP = {
  'Mexico':                        '🇲🇽',
  'South Africa':                  '🇿🇦',
  'South Korea':                   '🇰🇷',
  'Czech Republic':                '🇨🇿',
  'Canada':                        '🇨🇦',
  'Bosnia and Herzegovina':        '🇧🇦',
  'United States':                 '🇺🇸',
  'Paraguay':                      '🇵🇾',
  'Haiti':                         '🇭🇹',
  'Scotland':                      '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'Australia':                     '🇦🇺',
  'Turkey':                        '🇹🇷',
  'Brazil':                        '🇧🇷',
  'Morocco':                       '🇲🇦',
  'Qatar':                         '🇶🇦',
  'Switzerland':                   '🇨🇭',
  'Ivory Coast':                   '🇨🇮',
  'Ecuador':                       '🇪🇨',
  'Germany':                       '🇩🇪',
  'Curaçao':                       '🇨🇼',
  'Netherlands':                   '🇳🇱',
  'Japan':                         '🇯🇵',
  'Sweden':                        '🇸🇪',
  'Tunisia':                       '🇹🇳',
  'Iran':                          '🇮🇷',
  'New Zealand':                   '🇳🇿',
  'Belgium':                       '🇧🇪',
  'Egypt':                         '🇪🇬',
  'Spain':                         '🇪🇸',
  'Cape Verde':                    '🇨🇻',
  'Saudi Arabia':                  '🇸🇦',
  'Uruguay':                       '🇺🇾',
  'France':                        '🇫🇷',
  'Senegal':                       '🇸🇳',
  'Iraq':                          '🇮🇶',
  'Norway':                        '🇳🇴',
  'Argentina':                     '🇦🇷',
  'Algeria':                       '🇩🇿',
  'Austria':                       '🇦🇹',
  'Jordan':                        '🇯🇴',
  'Portugal':                      '🇵🇹',
  'Democratic Republic of the Congo': '🇨🇩',
  'Uzbekistan':                    '🇺🇿',
  'Colombia':                      '🇨🇴',
  'England':                       '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  'Croatia':                       '🇭🇷',
  'Ghana':                         '🇬🇭',
  'Panama':                        '🇵🇦',
};

function getFlag(teamName) {
  return FLAG_MAP[teamName] || '🏳️';
}

// ── TBD placeholder detector ───────────────────────────
// Matches openfootball placeholder patterns:
//   W<digits>         e.g.  W73  W89
//   <digit(s)><letter(s)>  e.g.  2C  1E  3A
//   combined         e.g.  3A/B/C/D/F
//   null / empty string
const TBD_RE = /^(W\d+|\d+[A-Z][A-Z/]*)$/;
function isTBD(name) {
  if (!name || name === 'TBD') return true;
  return TBD_RE.test(String(name).trim());
}
function teamName(raw) {
  if (!raw || raw === 'TBD') return 'TBD';
  const str = String(raw).trim();
  
  // e.g., "1L" -> "1st of Group L", "2J" -> "2nd of Group J"
  const groupMatch = str.match(/^(\d+)([A-Z]+(?:[/][A-Z]+)*)$/);
  if (groupMatch) {
    const pos = groupMatch[1];
    const group = groupMatch[2];
    let suffix = 'th';
    if (pos === '1') suffix = 'st';
    else if (pos === '2') suffix = 'nd';
    else if (pos === '3') suffix = 'rd';
    return `${pos}${suffix} of Group ${group}`;
  }
  
  // e.g., "W73" -> "Winner Match 73"
  const winnerMatch = str.match(/^W(\d+)$/);
  if (winnerMatch) {
    return `Winner Match ${winnerMatch[1]}`;
  }
  
  return isTBD(str) ? 'TBD' : str;
}

// ── State ─────────────────────────────────────────────
let allData = { finished_live: [], upcoming: [] };
let bracketData = { rounds: [] };
let activeFilter = 'results';

// ── DOM refs ──────────────────────────────────────────
const refreshBtn       = document.getElementById('refresh-btn');
const lastUpdatedEl    = document.getElementById('last-updated');
const loadingEl        = document.getElementById('loading');
const errorBanner      = document.getElementById('error-banner');
const errorMessage     = document.getElementById('error-message');
const retryBtn         = document.getElementById('retry-btn');
const matchesContainer = document.getElementById('matches-container');
const bracketSection   = document.getElementById('bracket-section');
const bracketBoard     = document.getElementById('bracket-board');
const resultsGrid      = document.getElementById('results-grid');
const upcomingGrid     = document.getElementById('upcoming-grid');
const resultsSection   = document.getElementById('results-section');
const upcomingSection  = document.getElementById('upcoming-section');
const filterBtns       = document.querySelectorAll('.filter-btn');

// Stat elements
const statTotal    = document.querySelector('#stat-total .stat-num');
const statFinished = document.querySelector('#stat-finished .stat-num');
const statUpcoming = document.querySelector('#stat-upcoming .stat-num');
const statGoals    = document.querySelector('#stat-goals .stat-num');

// ── Fetch Data ─────────────────────────────────────────
async function fetchMatches() {
  setLoading(true);
  hideError();

  try {
    const [matchesRes, bracketRes] = await Promise.all([
      fetch('/api/matches'),
      fetch('/api/bracket')
    ]);
    if (!matchesRes.ok) throw new Error(`Server error ${matchesRes.status}`);
    if (!bracketRes.ok) throw new Error(`Server error ${bracketRes.status}`);

    const data = await matchesRes.json();
    const bracket = await bracketRes.json();
    if (!data.success) throw new Error(data.error || 'Unknown error');
    if (!bracket.success) throw new Error(bracket.error || 'Unknown bracket error');

    allData = data;
    bracketData = bracket;
    updateStats(data);
    renderCurrentFilter();
    lastUpdatedEl.textContent = `Updated: ${data.last_updated}`;
  } catch (err) {
    showError(err.message || 'Failed to fetch match data.');
  } finally {
    setLoading(false);
  }
}

// ── Render helpers ────────────────────────────────────
function renderCurrentFilter() {
  if (activeFilter === 'bracket') {
    matchesContainer.classList.add('hidden');
    bracketSection.classList.remove('hidden');
    renderBracket();
    return;
  }

  matchesContainer.classList.remove('hidden');
  bracketSection.classList.add('hidden');

  if (activeFilter === 'results') {
    resultsSection.style.display = '';
    upcomingSection.style.display = 'none';
    renderGrid(resultsGrid, allData.finished_live, 'No completed matches yet.');
  } else if (activeFilter === 'upcoming') {
    resultsSection.style.display = 'none';
    upcomingSection.style.display = '';
    renderGrid(upcomingGrid, allData.upcoming, 'No upcoming fixtures yet.');
  }
}

function renderGrid(gridEl, matches, emptyMsg) {
  if (!matches || matches.length === 0) {
    gridEl.innerHTML = `<div class="empty-state">${emptyMsg}</div>`;
    return;
  }
  gridEl.innerHTML = matches.map(buildCard).join('');
}

/* ─────────────────────────────────────────────────────
   Bracket rendering — true tournament tree layout
   ───────────────────────────────────────────────────── */

function renderBracket() {
  const rounds = bracketData.rounds || [];
  // Filter out rounds with no matches (semi-finals / final may be empty early on)
  const activeRounds = rounds.filter(r => (r.matches || []).length > 0);

  if (!activeRounds.length) {
    bracketBoard.innerHTML = '<div class="empty-state">No knockout fixtures available yet.</div>';
    return;
  }

  // The first round determines the base number of matches.
  // Every subsequent round has half the matches.
  // We compute the vertical spacing so each card sits centred
  // between its two "feeder" slots from the prior round.
  //
  // Card height + gap in the first round  → cardH
  // Each round doubles the effective slot height.

  bracketBoard.innerHTML = activeRounds.map((round, roundIdx) => {
    const matchCount = round.matches.length;
    const html = round.matches.map((match, matchIdx) =>
      buildBracketNode(match, roundIdx, matchIdx, matchCount)
    ).join('');

    return `
      <div class="bracket-round" data-round="${roundIdx}" aria-label="${escHtml(round.label)}">
        <div class="bracket-round-header">
          <span class="bracket-round-title">${escHtml(round.label)}</span>
        </div>
        <div class="bracket-match-list" data-count="${matchCount}">
          ${html}
        </div>
      </div>`;
  }).join('');

  // After DOM is built, apply vertical offsets so cards align like a real bracket.
  applyBracketSpacing(activeRounds);
}

// Card dimensions (must match CSS)
const CARD_H   = 110; // px — approximate rendered card height
const CARD_GAP =  16; // px — gap between cards in round 0

function applyBracketSpacing(activeRounds) {
  const board = bracketBoard;
  const roundEls = board.querySelectorAll('.bracket-round');

  // First pass: position all cards vertically
  roundEls.forEach((roundEl, roundIdx) => {
    const matchList = roundEl.querySelector('.bracket-match-list');
    const cards = matchList.querySelectorAll('.bracket-node-wrap');

    const baseSlot = CARD_H + CARD_GAP;
    const slotH = baseSlot * Math.pow(2, roundIdx);

    cards.forEach((card, cardIdx) => {
      const slotTop  = cardIdx * slotH;
      const cardTop  = slotTop + (slotH - CARD_H) / 2;
      card.style.top = `${cardTop}px`;
    });

    const totalCards = cards.length;
    const totalH     = totalCards * slotH;
    matchList.style.height = `${totalH}px`;
  });

  // Second pass: draw vertical connectors that join pairs of cards.
  // We skip the last round because it has no outgoing connectors.
  const roundElsArr = Array.from(roundEls);
  roundElsArr.forEach((roundEl, roundIdx) => {
    if (roundIdx === roundElsArr.length - 1) return;

    const matchList = roundEl.querySelector('.bracket-match-list');
    const cards     = Array.from(matchList.querySelectorAll('.bracket-node-wrap'));

    // Process cards in pairs (each pair feeds one card in the next round)
    for (let i = 0; i + 1 < cards.length; i += 2) {
      const cardA = cards[i];
      const cardB = cards[i + 1];

      // Vertical midpoint of each card relative to the match-list
      const midA = parseFloat(cardA.style.top) + CARD_H / 2;
      const midB = parseFloat(cardB.style.top) + CARD_H / 2;

      // Attach a vertical line element to cardA's horizontal connector stub.
      // The stub is at midA height within the match-list, so the vertical line
      // runs downward by (midB - midA) pixels from the stub's end.
      const stubA = cardA.querySelector('.bn-connector-h');
      if (!stubA) continue;

      const vertEl = document.createElement('div');
      vertEl.className = 'bn-connector-v';
      vertEl.style.cssText = [
        'position:absolute',
        'right:0',
        'top:50%',        // centre on the stub (stub is 2px tall, centred on midA)
        `height:${midB - midA}px`,
        'width:2px',
        'transform:translateY(-1px)',  // align top of line with stub centre
        'background:rgba(245,200,66,0.28)',
        'pointer-events:none',
      ].join(';');
      stubA.appendChild(vertEl);
    }
  });
}

function buildBracketNode(match, roundIdx, matchIdx, _totalInRound) {
  const home = teamName(match.home_team_name_en);
  const away = teamName(match.away_team_name_en);
  const homeFlag = isTBD(match.home_team_name_en) ? '' : getFlag(match.home_team_name_en);
  const awayFlag = isTBD(match.away_team_name_en) ? '' : getFlag(match.away_team_name_en);

  const hasScore = match.home_score !== null && match.home_score !== undefined
    && match.away_score !== null && match.away_score !== undefined;

  const homeWon = hasScore && Number(match.home_score) > Number(match.away_score);
  const awayWon = hasScore && Number(match.away_score) > Number(match.home_score);

  const kickoffLine = match.kickoff_date
    ? `<span class="bn-date">${escHtml(match.kickoff_day)} ${escHtml(match.kickoff_date)}</span><span class="bn-time">${escHtml(match.kickoff_time)}</span>`
    : `<span class="bn-date">Date TBD</span>`;

  const homeScoreStr = hasScore ? escHtml(match.home_score) : '';
  const awayScoreStr = hasScore ? escHtml(match.away_score) : '';

  const statusCls = `status-${escHtml(match.status || 'upcoming')}`;

  return `
    <div class="bracket-node-wrap" data-round="${roundIdx}" data-match="${matchIdx}">
      <article class="bracket-node ${statusCls}" aria-label="${escHtml(home)} vs ${escHtml(away)}">
        <div class="bn-kickoff">${kickoffLine}</div>
        <div class="bn-team ${homeWon ? 'winner' : (awayWon ? 'loser' : '')}">
          <span class="bn-flag">${homeFlag}</span>
          <span class="bn-name">${escHtml(home)}</span>
          ${hasScore ? `<span class="bn-score">${homeScoreStr}</span>` : ''}
        </div>
        <div class="bn-divider"></div>
        <div class="bn-team ${awayWon ? 'winner' : (homeWon ? 'loser' : '')}">
          <span class="bn-flag">${awayFlag}</span>
          <span class="bn-name">${escHtml(away)}</span>
          ${hasScore ? `<span class="bn-score">${awayScoreStr}</span>` : ''}
        </div>
      </article>
      <div class="bn-connector-h"></div>
    </div>`;
}

function buildCard(m) {
  const homeFlag  = isTBD(m.home_team_name_en) ? '🏳️' : getFlag(m.home_team_name_en || '');
  const awayFlag  = isTBD(m.away_team_name_en) ? '🏳️' : getFlag(m.away_team_name_en || '');
  const homeName  = teamName(m.home_team_name_en || m.home_team_label || '?');
  const awayName  = teamName(m.away_team_name_en || m.away_team_label || '?');

  // Group label
  const groupLabel = m.group
    ? (m.group.startsWith('R') || ['QF','SF'].includes(m.group)
        ? m.type_label || m.group
        : `Group ${m.group} · MD ${m.matchday}`)
    : '';

  // Status chip
  const chipClass  = `status-chip-${m.status}`;
  const statusText = m.status === 'live'
    ? `🔴 ${m.status_label}`
    : m.status_label;

  // Score or TBD
  let scoreHTML;
  if (m.status === 'upcoming') {
    scoreHTML = `<span class="score-tbd">vs</span>`;
  } else {
    scoreHTML = `
      <span class="score-num">${m.home_score ?? 0}</span>
      <span class="score-divider">–</span>
      <span class="score-num">${m.away_score ?? 0}</span>
    `;
  }

  // Scorers
  const homeScorers = (m.home_scorers_list || []).map(s =>
    `<div class="scorer-item"><span class="scorer-icon">⚽</span>${escHtml(s)}</div>`
  ).join('');
  const awayScorers = (m.away_scorers_list || []).map(s =>
    `<div class="scorer-item"><span class="scorer-icon">⚽</span>${escHtml(s)}</div>`
  ).join('');

  const hasScorers = homeScorers || awayScorers;
  const scorersHTML = hasScorers && m.status !== 'upcoming' ? `
    <div class="scorers-row">
      <div class="scorer-list">${homeScorers}</div>
      <div class="scorer-list">${awayScorers}</div>
    </div>` : '';

  // Date formatting
  const dateStr = m.local_date_label || formatDate(m.local_date);

  return `
    <article class="match-card status-${m.status}" aria-label="${escHtml(homeName)} vs ${escHtml(awayName)}">
      <div class="card-meta">
        <span class="card-group">${escHtml(groupLabel)}</span>
        <span class="card-status ${chipClass}">${statusText}</span>
      </div>

      <div class="teams-row">
        <div class="team">
          <span class="team-flag" aria-hidden="true">${homeFlag}</span>
          <span class="team-name">${escHtml(homeName)}</span>
        </div>
        <div class="score-box">${scoreHTML}</div>
        <div class="team">
          <span class="team-flag" aria-hidden="true">${awayFlag}</span>
          <span class="team-name">${escHtml(awayName)}</span>
        </div>
      </div>

      ${scorersHTML}

      <div class="card-footer">
        <span class="card-datetime">📅 ${escHtml(dateStr)}</span>
        <span class="card-type">${escHtml(m.type_label || '')}</span>
      </div>
    </article>`;
}

// ── Stats ─────────────────────────────────────────────
function updateStats(data) {
  const finished = data.finished_live || [];
  const upcoming = data.upcoming || [];

  animateNum(statTotal,    finished.length + upcoming.length);
  animateNum(statFinished, finished.length);
  animateNum(statUpcoming, upcoming.length);

  // Count goals
  let goals = 0;
  finished.forEach(m => {
    goals += (parseInt(m.home_score) || 0) + (parseInt(m.away_score) || 0);
  });
  animateNum(statGoals, goals);
}

function animateNum(el, target) {
  const start = parseInt(el.textContent) || 0;
  const diff  = target - start;
  const steps = 20;
  let step = 0;
  const interval = setInterval(() => {
    step++;
    el.textContent = Math.round(start + (diff * step / steps));
    if (step >= steps) clearInterval(interval);
  }, 18);
}

// ── Filter Tabs ───────────────────────────────────────
filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    filterBtns.forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    activeFilter = btn.dataset.filter;
    renderCurrentFilter();
  });
});

// ── Refresh Button ────────────────────────────────────
refreshBtn.addEventListener('click', () => {
  if (refreshBtn.disabled) return;
  refreshBtn.disabled = true;
  refreshBtn.classList.add('spinning');
  fetchMatches().finally(() => {
    setTimeout(() => {
      refreshBtn.disabled = false;
      refreshBtn.classList.remove('spinning');
    }, 800);
  });
});

retryBtn.addEventListener('click', fetchMatches);

// ── UI helpers ────────────────────────────────────────
function setLoading(on) {
  loadingEl.classList.toggle('hidden', !on);
  if (on) matchesContainer.classList.add('hidden');
  if (on) bracketSection.classList.add('hidden');
}

function showError(msg) {
  errorMessage.textContent = msg;
  errorBanner.classList.remove('hidden');
}

function hideError() {
  errorBanner.classList.add('hidden');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(localDate) {
  if (!localDate) return '—';
  // Format: "MM/DD/YYYY HH:MM"
  try {
    const [datePart, timePart] = localDate.split(' ');
    const [month, day, year] = datePart.split('/');
    const date = new Date(`${year}-${month}-${day}T${timePart}:00`);
    return date.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch (_) {
    return localDate;
  }
}

// ── Init ──────────────────────────────────────────────
fetchMatches();
