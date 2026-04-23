# StreetIQ

NYC neighborhood intelligence. Enter any Manhattan address, get a dashboard of crime trends, 311 activity, your elected representatives, local precinct, and community meetings.

**Live:** [streetiq.netlify.app](https://streetiq.netlify.app) *(update after deploy)*

## Built with
- Vanilla HTML / CSS / JavaScript (no build step)
- NYC Open Data APIs (NYPD Complaints, 311 Service Requests)
- OpenStreetMap Nominatim for geocoding
- Hardcoded ZIP lookup tables for Manhattan districts and precincts

## Why this exists
Most civic info is scattered across 8 different NYC government websites. StreetIQ pulls the most useful stuff into one page, keyed off the only thing users care about: their address.

## Status
v1 — Manhattan only. Shipped [April 2026].

## Roadmap (v2)
- All 5 boroughs
- Swap ZIP-based district lookup for NYC LocateNYC API (precise lat/lng → district)
- Parking / alternate side schedule
- Spanish translation

## Running locally
1. Clone this repo
2. Open `index.html` with Live Server (VS Code extension) or any local web server
3. Address geocoding requires an `http://` origin (not `file:///`)

## Data sources
- [NYPD Complaint Data YTD](https://data.cityofnewyork.us/Public-Safety/NYPD-Complaint-Data-Current-Year-To-Date-/5uac-w243)
- [NYC 311 Service Requests](https://data.cityofnewyork.us/Social-Services/311-Service-Requests-from-2010-to-Present/erm2-nwe9)
- [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org)

## Built by
[@rafvasquez87](https://github.com/rafvasquez87) — independent RevOps consultant at ClearpathOps
