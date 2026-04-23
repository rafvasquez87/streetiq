// StreetIQ — app.js
// -----------------------------------------------------------------------------
// This file runs in the browser. It listens for the search form submission,
// sends the address to OpenStreetMap's Nominatim geocoder, and shows the result.
// Docs: https://nominatim.org/release-docs/latest/api/Search/
//
// Note on identification:
// Nominatim's usage policy asks every client to identify itself. Normally that's
// done with a User-Agent header, but browsers don't let JavaScript set that
// header — the browser controls it. Instead we rely on the Referer header the
// browser sends automatically (configured via referrerPolicy below), which
// Nominatim accepts for low-volume use. Keep traffic to ~1 request/second.

// Grab references to the elements we'll work with.
const form = document.getElementById("search-form");
const input = document.getElementById("address-input");
const button = document.getElementById("search-button");
const statusEl = document.getElementById("status");
const resultsEl = document.getElementById("results");

// Base URL for Nominatim's search endpoint.
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

// The five NYC boroughs. A valid NYC result must mention one of these.
const BOROUGHS = ["Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island"];

// Listen for the form's "submit" event (fires on button click AND Enter key).
form.addEventListener("submit", async (event) => {
  // Stop the browser's default form submission (which would reload the page).
  event.preventDefault();

  // Read and clean up the address the user typed.
  const address = input.value.trim();
  if (!address) return;

  // Update UI: disable button, show "Searching…", clear previous results.
  setLoading(true);
  setStatus("Searching…");
  resultsEl.hidden = true;
  resultsEl.innerHTML = "";

  try {
    // Build the request URL. We append ", New York, NY" to bias the search
    // toward NYC. encodeURIComponent escapes spaces, commas, etc.
    const query = `${address}, New York, NY`;
    const url =
      `${NOMINATIM_URL}?format=json&addressdetails=1&countrycodes=us` +
      `&q=${encodeURIComponent(query)}`;

    // fetch() makes the HTTP request. referrerPolicy ensures the browser
    // sends our site's origin as the Referer, which Nominatim uses to
    // identify the client.
    const response = await fetch(url, {
      referrerPolicy: "strict-origin-when-cross-origin",
    });

    if (!response.ok) {
      throw new Error(`Nominatim returned status ${response.status}`);
    }

    // Nominatim returns a plain JSON array of results (best match first).
    const data = await response.json();

    // Log the full result so you can inspect it in DevTools (F12 → Console).
    console.log("Nominatim result:", data);

    // If the array is empty, nothing was found.
    const result = data[0];
    if (!result) {
      setStatus("No results found. Try a more specific NYC address.", true);
      return;
    }

    // Pull out the fields we care about.
    const displayName = result.display_name || "";
    const addr = result.address || {};
    const postcode = addr.postcode || "";
    const state = addr.state || "";
    // Nominatim returns lat/lon as strings — convert to numbers for math/display.
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    // Validate: must be in New York state AND mention one of the five boroughs
    // somewhere in the display_name. This filters out non-NYC matches like
    // "5th Ave, Brooklyn, Wisconsin" or an upstate "New York" result.
    const inNewYork = state === "New York";
    const matchedBorough = BOROUGHS.find((b) => displayName.includes(b));
    if (!inNewYork || !matchedBorough) {
      setStatus("Please enter a valid NYC address.", true);
      return;
    }

    // Render the address card, then kick off the data cards. We don't await
    // them — each shows its own loading state and fills in later, so the
    // address result is visible instantly and the data cards load in parallel.
    renderResult({ displayName, lat, lng, postcode });
    renderCrimeCard(lat, lng);
    render311Card(postcode);
    renderRepsCard(postcode);
    renderPrecinctCard(postcode);
    // The meetings card references the local precinct number for its
    // Community Council row, so we pull it from the same lookup the
    // precinct card uses. undefined is fine — renderMeetingsCard handles it.
    const precinctEntry =
      typeof MANHATTAN_PRECINCTS !== "undefined"
        ? MANHATTAN_PRECINCTS[postcode]
        : null;
    renderMeetingsCard(postcode, precinctEntry && precinctEntry.precinct);
    setStatus(""); // clear the status line
  } catch (err) {
    // Network errors, CORS failures, or bad JSON land here.
    console.error(err);
    setStatus("Something went wrong. Check your connection and try again.", true);
  } finally {
    // Always re-enable the button, whether the request succeeded or failed.
    setLoading(false);
  }
});

// ---------- Small helper functions ----------

// Toggle the "loading" state of the search button.
function setLoading(isLoading) {
  button.disabled = isLoading;
  button.textContent = isLoading ? "Searching…" : "Search";
}

// Update the status line. Pass isError=true to style it red.
function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

// Render the address card. Creates a new DOM node and appends it so later
// cards (crime, zoning, etc.) can be added below without clobbering this one.
function renderResult({ displayName, lat, lng, postcode }) {
  const card = document.createElement("div");
  card.className = "card card--full-width";
  card.innerHTML = `
    <h2>Address found</h2>
    <p class="muted">${escapeHtml(displayName)}</p>
    <p class="coords">lat: ${lat.toFixed(6)} &nbsp; lng: ${lng.toFixed(6)}</p>
    <p class="coords">zip: ${escapeHtml(postcode) || "—"}</p>
  `;
  resultsEl.appendChild(card);
  resultsEl.hidden = false;
}

// ---------- Crime Trends card ----------
// Fetches NYPD complaint data from NYC Open Data (Socrata) for two windows:
// the last 90 days and the 90 days before that, both within 500m of the
// address. Renders a card with the total, a trend pill vs. the prior window,
// and the top 5 offense types.
// Dataset: NYPD Complaint Data — Year To Date (5uac-w243). Updated quarterly,
// unlike the Historic dataset (qgea-i56i) which only refreshes each April.
// https://data.cityofnewyork.us/Public-Safety/NYPD-Complaint-Data-Year-To-Date-/5uac-w243
const NYPD_URL = "https://data.cityofnewyork.us/resource/5uac-w243.json";

async function renderCrimeCard(lat, lng) {
  // Insert a placeholder card immediately so the user sees something happening.
  const card = document.createElement("div");
  card.className = "card card--crime";
  card.innerHTML = crimeCardShell(500, `<p class="muted">Loading…</p>`);
  resultsEl.appendChild(card);

  try {
    // Step 1: Anchor the windows to the latest date in the dataset.
    // The YTD dataset lags real-time by 2–4 months, so a raw "last 90 days
    // from today" query returns nothing. We ask Socrata for max(cmplnt_fr_dt)
    // and use that as our window anchor instead. If that lookup fails for
    // any reason we fall back to today so the card still renders.
    let latestDate;
    try {
      latestDate = await fetchLatestDate();
    } catch (err) {
      console.warn("max(cmplnt_fr_dt) lookup failed, falling back to today:", err);
      latestDate = new Date();
    }

    // Step 2: Three anchor points give us the two windows:
    //   previous: [start, mid)   current: [mid, end]
    const end   = soqlDate(latestDate);
    const mid   = soqlDate(new Date(latestDate.getTime() -  90 * 86400000));
    const start = soqlDate(new Date(latestDate.getTime() - 180 * 86400000));

    // Try the tight 500m radius first. If that block is sparse we retry at
    // 1000m so suburban-feeling neighborhoods aren't stuck at the empty state.
    // Retry refetches BOTH windows at the wider radius so the trend
    // comparison stays apples-to-apples.
    let radius = 500;
    let { current, previous } = await fetchCrimeWindows(
      lat, lng, radius, start, mid, end
    );

    if (current.length === 0) {
      radius = 1000;
      ({ current, previous } = await fetchCrimeWindows(
        lat, lng, radius, start, mid, end
      ));
    }

    const currentCount  = current.length;
    const previousCount = previous.length;

    // Empty state: still nothing after the widen.
    if (currentCount === 0) {
      card.innerHTML = crimeCardShell(
        radius,
        `<p class="muted">No incidents reported in this area for the last 90 days.</p>`
      );
      return;
    }

    // Aggregate offense types client-side. slice(0, 5) naturally returns
    // fewer than 5 rows when there are fewer distinct offenses — no padding.
    const counts = {};
    for (const row of current) {
      const name = row.ofns_desc || "Unknown";
      counts[name] = (counts[name] || 0) + 1;
    }
    const topOffenses = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Trend pill — hidden when previous window is 0 (per spec) or when
    // the two windows are equal (no meaningful direction to show).
    let pillHtml = "";
    if (previousCount > 0 && currentCount !== previousCount) {
      const pct = Math.round(((currentCount - previousCount) / previousCount) * 100);
      const isUp = pct > 0;
      const cls = isUp ? "trend-pill trend-pill--up" : "trend-pill trend-pill--down";
      const arrow = isUp ? "↑" : "↓";
      pillHtml = `<span class="${cls}">${arrow} ${Math.abs(pct)}%</span>`;
    }

    const offenseRows = topOffenses
      .map(
        ([name, count]) => `
          <li class="offense-row">
            <span>${escapeHtml(titleCase(name))}</span>
            <span class="offense-count">${count}</span>
          </li>`
      )
      .join("");

    card.innerHTML = crimeCardShell(radius, `
      <div class="crime-summary">
        <span class="big-number">${currentCount}</span>
        ${pillHtml}
      </div>
      <ul class="offense-list">${offenseRows}</ul>
      <p class="data-through">Data through: ${escapeHtml(formatDisplayDate(latestDate))}</p>
    `);
  } catch (err) {
    console.error("Crime card failed:", err);
    card.innerHTML = crimeCardShell(
      500,
      `<p class="muted">Crime data temporarily unavailable.</p>`
    );
  }
}

// Ask Socrata for the newest cmplnt_fr_dt in the dataset. Throws if the
// response is malformed so the caller can fall back.
async function fetchLatestDate() {
  const select = "max(cmplnt_fr_dt) as latest";
  const where  = "cmplnt_fr_dt IS NOT NULL";
  const url =
    `${NYPD_URL}?$select=${encodeURIComponent(select)}` +
    `&$where=${encodeURIComponent(where)}`;

  console.log("Crime fetch (latest date):", url);
  const data = await fetchJson(url);
  const latest = data && data[0] && data[0].latest;
  if (!latest) throw new Error("max(cmplnt_fr_dt) returned no date");
  return new Date(latest);
}

// Fire the two-window fetch at a given radius. Returns {current, previous}
// as raw row arrays. Logs each request URL so you can paste them into a
// browser tab to inspect the raw Socrata response while debugging.
async function fetchCrimeWindows(lat, lng, radius, start, mid, end) {
  // The `lat_lon` column holds the point geometry on this dataset.
  const geo = `within_circle(lat_lon,${lat},${lng},${radius})`;
  const currentWhere  =
    `${geo} AND cmplnt_fr_dt >= '${mid}' AND cmplnt_fr_dt <= '${end}'`;
  const previousWhere =
    `${geo} AND cmplnt_fr_dt >= '${start}' AND cmplnt_fr_dt < '${mid}'`;

  // $limit=5000 is the Socrata default cap; typical 500–1000m / 90-day
  // queries stay well under this.
  const currentUrl  = `${NYPD_URL}?$where=${encodeURIComponent(currentWhere)}&$limit=5000`;
  const previousUrl = `${NYPD_URL}?$where=${encodeURIComponent(previousWhere)}&$limit=5000`;

  console.log(`Crime fetch (current, ${radius}m):`, currentUrl);
  console.log(`Crime fetch (previous, ${radius}m):`, previousUrl);

  const [current, previous] = await Promise.all([
    fetchJson(currentUrl),
    fetchJson(previousUrl),
  ]);
  return { current, previous };
}

// The crime card's fixed header (title + subtitle) wrapped around whatever
// body content we're showing right now: loading, empty, error, or data.
// Subtitle reflects the actual radius used, which may have been widened.
function crimeCardShell(radius, bodyHtml) {
  return `
    <h2>Crime Trends</h2>
    <p class="card-subtitle">Latest 90 days · within ${radius}m</p>
    ${bodyHtml}
  `;
}

// Format a Date for the "Data through:" caption, e.g. "Mar 15, 2026".
// timeZone: 'UTC' prevents off-by-one when the ISO string parses as UTC
// midnight but the browser is in a behind-UTC timezone.
function formatDisplayDate(d) {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ---------- 311 Activity card ----------
// Fetches NYC 311 service requests for the user's ZIP over a rolling 30-day
// window anchored to the latest created_date in that ZIP (same lag-handling
// pattern as the crime card). Renders a card with a total, top 5 complaint
// types, and an OPEN/CLOSED split per type.
// Dataset: 311 Service Requests from 2010 to Present (erm2-nwe9).
// https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2010-to-Present/erm2-nwe9
const NYC311_URL = "https://data.cityofnewyork.us/resource/erm2-nwe9.json";

async function render311Card(zip) {
  const card = document.createElement("div");
  card.className = "card card--311";
  card.innerHTML = card311Shell(zip, `<p class="muted">Loading…</p>`);
  resultsEl.appendChild(card);

  // Guard: without a valid 5-digit ZIP we can't build a meaningful query.
  // Also protects the SoQL from any odd characters in incident_zip.
  if (!zip || !/^\d{5}$/.test(zip)) {
    card.innerHTML = card311Shell(
      zip,
      `<p class="muted">ZIP code unavailable for this address.</p>`
    );
    return;
  }

  try {
    // Step 1: find the newest created_date for this ZIP. Fall back to today
    // if the lookup fails so the card still renders something useful.
    let latestDate;
    try {
      latestDate = await fetchLatest311Date(zip);
    } catch (err) {
      console.warn("311 max(created_date) lookup failed, falling back to today:", err);
      latestDate = new Date();
    }

    // Step 2: rolling 30-day window anchored to latestDate.
    const end   = soqlDate(latestDate);
    const start = soqlDate(new Date(latestDate.getTime() - 30 * 86400000));

    // Step 3: fetch the rows in the window. $limit=10000 is generous for a
    // single ZIP over 30 days; most zips won't come close.
    const where =
      `incident_zip='${zip}' AND created_date >= '${start}' AND created_date <= '${end}'`;
    const url = `${NYC311_URL}?$where=${encodeURIComponent(where)}&$limit=10000`;
    console.log(`311 fetch (zip ${zip}):`, url);
    const data = await fetchJson(url);

    if (data.length === 0) {
      card.innerHTML = card311Shell(
        zip,
        `<p class="muted">No 311 activity reported for ZIP ${escapeHtml(zip)} in the last 30 days.</p>`
      );
      return;
    }

    // Step 4: aggregate by complaint type, tracking open vs. closed counts.
    // 311 status field uses "Closed" for resolved tickets; everything else
    // (Open, In Progress, Assigned, Pending…) counts as open.
    // Key the map on the lowercased name so "NOISE" and "Noise" merge into
    // one bucket. titleCase() re-lowercases before capitalizing, so the
    // rendered label comes out consistent regardless of the source casing.
    const counts = {};
    for (const row of data) {
      const key = (row.complaint_type || "Unknown").toLowerCase();
      if (!counts[key]) counts[key] = { total: 0, open: 0, closed: 0 };
      counts[key].total += 1;
      if (row.status === "Closed") counts[key].closed += 1;
      else counts[key].open += 1;
    }
    const topComplaints = Object.entries(counts)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5);

    const rows = topComplaints
      .map(
        ([name, c]) => `
          <li class="complaint-row">
            <span class="complaint-name">${escapeHtml(titleCase(name))}</span>
            <span class="complaint-counts">
              <span class="status-open">● OPEN: ${c.open}</span>
              <span class="status-divider">|</span>
              <span class="status-closed">CLOSED: ${c.closed}</span>
            </span>
          </li>`
      )
      .join("");

    card.innerHTML = card311Shell(zip, `
      <div class="crime-summary">
        <span class="big-number">${data.length}</span>
      </div>
      <ul class="complaint-list">${rows}</ul>
      <p class="data-through">Data through: ${escapeHtml(formatDisplayDate(latestDate))}</p>
    `);
  } catch (err) {
    console.error("311 card failed:", err);
    card.innerHTML = card311Shell(
      zip,
      `<p class="muted">311 data temporarily unavailable.</p>`
    );
  }
}

// Ask Socrata for the newest created_date in this ZIP. Same shape as the
// crime card's latest-date lookup, just a different column + dataset.
async function fetchLatest311Date(zip) {
  const select = "max(created_date) as latest";
  const where  = `incident_zip='${zip}'`;
  const url =
    `${NYC311_URL}?$select=${encodeURIComponent(select)}` +
    `&$where=${encodeURIComponent(where)}`;

  console.log(`311 fetch (latest date, zip ${zip}):`, url);
  const data = await fetchJson(url);
  const latest = data && data[0] && data[0].latest;
  if (!latest) throw new Error("max(created_date) returned no date");
  return new Date(latest);
}

// The 311 card's fixed header. Subtitle omits the " · ZIP {zip}" portion
// when zip is missing, so we don't render an awkward "ZIP " with nothing
// after it.
function card311Shell(zip, bodyHtml) {
  const zipPart = zip ? ` · ZIP ${escapeHtml(zip)}` : "";
  return `
    <h2>311 Activity</h2>
    <p class="card-subtitle">Latest 30 days${zipPart}</p>
    ${bodyHtml}
  `;
}

// ---------- Generic helpers ----------

// Fetch JSON and throw on non-2xx so Promise.all rejects cleanly.
async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

// Format a Date as Socrata's floating-timestamp string: YYYY-MM-DDT00:00:00.
// We use UTC pieces so the output doesn't drift with the user's timezone.
function soqlDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}T00:00:00`;
}

// Convert "ASSAULT 3 & RELATED OFFENSES" → "Assault 3 & Related Offenses".
function titleCase(str) {
  return String(str)
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------- Representatives card ----------
// Pure lookup against MANHATTAN_REPS (defined in lookups.js, which is loaded
// before this script). No network calls — renders synchronously.
function renderRepsCard(zip) {
  const card = document.createElement("div");
  card.className = "card card--reps";
  resultsEl.appendChild(card);

  const entry =
    typeof MANHATTAN_REPS !== "undefined" ? MANHATTAN_REPS[zip] : null;
  console.log("Reps lookup for ZIP:", zip, entry);

  if (!entry) {
    card.innerHTML = repsCardShell(
      zip,
      `<p class="muted">Representative lookup is Manhattan-only for v1.</p>`
    );
    return;
  }

  const sections = [
    { role: "City Council",   data: entry.cityCouncil },
    { role: "State Assembly", data: entry.stateAssembly },
    { role: "State Senate",   data: entry.stateSenate },
  ];
  card.innerHTML = repsCardShell(
    zip,
    sections.map((s) => renderRepSection(s.role, s.data)).join("")
  );
}

// Render one role section (City Council / State Assembly / State Senate).
// Handles the placeholder case where we only have `{ name: "Representative
// info unavailable" }` without contact details.
function renderRepSection(role, rep) {
  if (!rep || rep.name === "Representative info unavailable") {
    return `
      <div class="rep-row">
        <p class="rep-role">${escapeHtml(role)}</p>
        <p class="muted">Representative info unavailable</p>
      </div>`;
  }

  const district = rep.district
    ? `<span class="rep-district">District ${rep.district}</span>`
    : "";

  // Build the contact links. Only include fields that are actually present,
  // so partial entries don't render stray separators.
  const links = [];
  if (rep.phone) {
    links.push(
      `<a href="tel:${escapeHtml(rep.phone)}">${escapeHtml(rep.phone)}</a>`
    );
  }
  if (rep.website) {
    links.push(
      `<a href="${escapeHtml(rep.website)}" target="_blank" rel="noopener">Website</a>`
    );
  }
  if (rep.email) {
    links.push(
      `<a href="mailto:${escapeHtml(rep.email)}">Email</a>`
    );
  }

  return `
    <div class="rep-row">
      <p class="rep-role">${escapeHtml(role)}</p>
      <p class="rep-name"><strong>${escapeHtml(rep.name)}</strong>${district}</p>
      <p class="rep-links">${links.join(` <span class="rep-sep">·</span> `)}</p>
    </div>`;
}

function repsCardShell(zip, bodyHtml) {
  const zipLabel = zip ? `ZIP ${escapeHtml(zip)} · ` : "";
  return `
    <h2>Your Representatives</h2>
    <p class="card-subtitle">${zipLabel}Based on ZIP code — verify exact district at nyc.gov</p>
    ${bodyHtml}
  `;
}

// ---------- Local Precinct card ----------
function renderPrecinctCard(zip) {
  const card = document.createElement("div");
  card.className = "card card--precinct";
  resultsEl.appendChild(card);

  const entry =
    typeof MANHATTAN_PRECINCTS !== "undefined" ? MANHATTAN_PRECINCTS[zip] : null;
  console.log("Precinct lookup for ZIP:", zip, entry);

  if (!entry) {
    card.innerHTML = precinctCardShell(
      zip,
      `<p class="muted">Precinct lookup is Manhattan-only for v1.</p>`
    );
    return;
  }

  // Google Maps search URL — opens the address in a map, works on both
  // mobile (launches the Maps app) and desktop.
  const mapsUrl =
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(entry.address);

  card.innerHTML = precinctCardShell(zip, `
    <div class="crime-summary">
      <span class="big-number">${entry.precinct}</span>
    </div>
    <p class="precinct-name"><strong>${escapeHtml(entry.name)}</strong></p>
    <p class="precinct-line">
      <a class="precinct-link" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener">
        ${escapeHtml(entry.address)}
      </a>
    </p>
    <p class="precinct-line">
      <a class="precinct-link" href="tel:${escapeHtml(entry.phone)}">
        ${escapeHtml(entry.phone)}
      </a>
    </p>
  `);
}

function precinctCardShell(zip, bodyHtml) {
  const zipLabel = zip ? `ZIP ${escapeHtml(zip)}` : "Unknown ZIP";
  return `
    <h2>Local Precinct</h2>
    <p class="card-subtitle">${zipLabel}</p>
    ${bodyHtml}
  `;
}

// ---------- Community Meetings card ----------
// Directory card — three tappable rows pointing users to civic-meeting
// resources. Pure lookup against MANHATTAN_COMMUNITY_BOARDS plus a
// precinctNumber passed in from the caller.
const NYC_CALENDAR_URL = "https://www1.nyc.gov/events/index.html";

function renderMeetingsCard(zip, precinctNumber) {
  const card = document.createElement("div");
  card.className = "card card--meetings card--full-width";
  resultsEl.appendChild(card);

  const cb =
    typeof MANHATTAN_COMMUNITY_BOARDS !== "undefined"
      ? MANHATTAN_COMMUNITY_BOARDS[zip]
      : null;
  console.log("Meetings lookup for ZIP:", zip, { communityBoard: cb, precinctNumber });

  // Empty state: ZIP is outside Manhattan or otherwise unmapped.
  if (!cb) {
    card.innerHTML = meetingsCardShell(
      zip,
      `<p class="muted">
        Community meetings lookup is Manhattan-only for v1.
        <a class="inline-link" href="${NYC_CALENDAR_URL}" target="_blank" rel="noopener noreferrer">Browse all NYC meetings →</a>
       </p>`
    );
    return;
  }

  const rows = [];

  // Row 1 — Community Board meetings.
  rows.push(renderMeetingRow({
    icon: "🏛️",
    label: cb.boardName,
    desc:  "Monthly public meetings on local issues, land use, budget",
    link:  cb.meetingsUrl,
  }));

  // Row 2 — Precinct Community Council. Skipped if we didn't get a precinct
  // number from the caller (shouldn't happen for Manhattan ZIPs but we don't
  // want to render "th Precinct Community Council" if it does).
  if (precinctNumber) {
    const query = `${precinctNumber}th Precinct NYPD Community Council meeting`;
    const searchUrl =
      "https://www.google.com/search?q=" + encodeURIComponent(query);
    rows.push(renderMeetingRow({
      icon: "🚔",
      label: `${ordinal(precinctNumber)} Precinct Community Council`,
      desc:  "Monthly meetings with your local police precinct",
      link:  searchUrl,
    }));
  }

  // Row 3 — Citywide calendar.
  rows.push(renderMeetingRow({
    icon: "📅",
    label: "NYC Public Calendar",
    desc:  "Town halls, borough board meetings, civic events",
    link:  NYC_CALENDAR_URL,
  }));

  card.innerHTML = meetingsCardShell(zip, rows.join(""));
}

// One directory row: icon + label/description + "View →" action. The whole
// row is a single <a> so the entire rectangle is tappable (important on
// mobile — users shouldn't have to aim for the tiny "View →" text).
function renderMeetingRow({ icon, label, desc, link }) {
  return `
    <a class="meeting-row" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">
      <span class="meeting-icon" aria-hidden="true">${icon}</span>
      <span class="meeting-text">
        <span class="meeting-label">${escapeHtml(label)}</span>
        <span class="meeting-desc">${escapeHtml(desc)}</span>
      </span>
      <span class="meeting-action">View →</span>
    </a>`;
}

function meetingsCardShell(zip, bodyHtml) {
  const zipLabel = zip ? `ZIP ${escapeHtml(zip)} · ` : "";
  return `
    <h2>Community Meetings</h2>
    <p class="card-subtitle">${zipLabel}Public meetings &amp; civic events</p>
    ${bodyHtml}
  `;
}

// Ordinal suffix: 1 → "1st", 2 → "2nd", 3 → "3rd", 11 → "11th", 23 → "23rd".
// Covers the handful of Manhattan precinct numbers (1, 5, 6, 7, 9, 10, 13,
// 14, 17, 18, 19, 20, 23, 24, 25, 26, 28, 30, 32, 33, 34) correctly — so
// we don't render "1th Precinct" or "23th Precinct".
function ordinal(n) {
  const v = n % 100;
  const suffixes = ["th", "st", "nd", "rd"];
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

// Escape user-supplied text before putting it into HTML, to avoid any
// chance of it being interpreted as markup. Good habit even for safe data.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
