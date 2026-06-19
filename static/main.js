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

// ── State ─────────────────────────────────────────────
let allData = { finished_live: [], upcoming: [] };
let activeFilter = 'results';

// ── DOM refs ──────────────────────────────────────────
const refreshBtn       = document.getElementById('refresh-btn');
const lastUpdatedEl    = document.getElementById('last-updated');
const loadingEl        = document.getElementById('loading');
const errorBanner      = document.getElementById('error-banner');
const errorMessage     = document.getElementById('error-message');
const retryBtn         = document.getElementById('retry-btn');
const matchesContainer = document.getElementById('matches-container');
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
    const res = await fetch('/api/matches');
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Unknown error');

    allData = data;
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
  matchesContainer.classList.remove('hidden');

  if (activeFilter === 'results') {
    resultsSection.style.display = '';
    upcomingSection.style.display = 'none';
    renderGrid(resultsGrid, allData.finished_live, 'No completed matches yet.');
  } else if (activeFilter === 'upcoming') {
    resultsSection.style.display = 'none';
    upcomingSection.style.display = '';
    renderGrid(upcomingGrid, allData.upcoming, 'No upcoming fixtures yet.');
  } else {
    // All — show both sections
    resultsSection.style.display = '';
    upcomingSection.style.display = '';
    renderGrid(resultsGrid, allData.finished_live, 'No completed matches yet.');
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

function buildCard(m) {
  const homeFlag  = getFlag(m.home_team_name_en || '');
  const awayFlag  = getFlag(m.away_team_name_en || '');
  const homeName  = m.home_team_name_en || m.home_team_label || '?';
  const awayName  = m.away_team_name_en || m.away_team_label || '?';

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
  const dateStr = formatDate(m.local_date);

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
