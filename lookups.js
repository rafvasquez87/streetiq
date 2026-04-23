// StreetIQ — lookups.js
// -----------------------------------------------------------------------------
// Hardcoded ZIP → representative / precinct lookup tables.
//
// Scope for v1: Manhattan ZIPs only. Other boroughs fall through to the
// card's "Manhattan-only for v1" empty state.
//
// Accuracy:
//   - City Council members shown are the 2024–2027 term (elected Nov 2023).
//   - NY State Assembly & Senate members shown are the 2025–2026 term
//     (elected Nov 2024).
//   - Where recent turnover makes the current officeholder uncertain we use
//     `name: "Representative info unavailable"` rather than guess. Known
//     gaps: City Council District 4 (Keith Powers term-limited), Assembly
//     District 70 (Inez Dickens retired). Update when confirmed.
//   - Many NYC ZIPs straddle two or more districts. We assign the district
//     covering the majority of the ZIP's residential area and flag the
//     split in an inline comment. Users are told to verify exact district
//     at nyc.gov via the card subtitle.
//   - NYPD precinct addresses and phone numbers are stable public records;
//     confidence is high on these.

// ---------- Source tables (reused across many ZIPs) ----------

// NYC City Council — Manhattan districts, 2024–2027 term.
const COUNCIL = {
  1:  { name: "Christopher Marte",    district: 1,  phone: "212-788-7259", email: "district1@council.nyc.gov",  website: "https://council.nyc.gov/district-1/" },
  2:  { name: "Carlina Rivera",       district: 2,  phone: "212-677-1077", email: "district2@council.nyc.gov",  website: "https://council.nyc.gov/district-2/" },
  3:  { name: "Erik Bottcher",        district: 3,  phone: "212-564-7757", email: "district3@council.nyc.gov",  website: "https://council.nyc.gov/district-3/" },
  4:  { name: "Representative info unavailable" }, // Keith Powers term-limited 2023; successor not confirmed.
  5:  { name: "Julie Menin",          district: 5,  phone: "212-860-1950", email: "district5@council.nyc.gov",  website: "https://council.nyc.gov/district-5/" },
  6:  { name: "Gale Brewer",          district: 6,  phone: "212-873-0282", email: "district6@council.nyc.gov",  website: "https://council.nyc.gov/district-6/" },
  7:  { name: "Shaun Abreu",          district: 7,  phone: "212-928-6814", email: "district7@council.nyc.gov",  website: "https://council.nyc.gov/district-7/" },
  8:  { name: "Diana Ayala",          district: 8,  phone: "212-828-9800", email: "district8@council.nyc.gov",  website: "https://council.nyc.gov/district-8/" },
  9:  { name: "Yusef Salaam",         district: 9,  phone: "212-678-4505", email: "district9@council.nyc.gov",  website: "https://council.nyc.gov/district-9/" },
  10: { name: "Carmen De La Rosa",    district: 10, phone: "212-788-7053", email: "district10@council.nyc.gov", website: "https://council.nyc.gov/district-10/" },
};

// NY State Assembly — Manhattan districts, 2025–2026 term.
const ASSEMBLY = {
  65: { name: "Grace Lee",          district: 65, phone: "212-982-9030", website: "https://nyassembly.gov/mem/Grace-Lee/" },
  66: { name: "Deborah Glick",      district: 66, phone: "212-674-5153", website: "https://nyassembly.gov/mem/Deborah-J-Glick/" },
  67: { name: "Linda Rosenthal",    district: 67, phone: "212-873-6368", website: "https://nyassembly.gov/mem/Linda-B-Rosenthal/" },
  68: { name: "Eddie Gibbs",        district: 68, phone: "212-828-3953", website: "https://nyassembly.gov/mem/Eddie-Gibbs/" },
  69: { name: "Daniel O'Donnell",   district: 69, phone: "212-866-3970", website: "https://nyassembly.gov/mem/Daniel-J-O-Donnell/" },
  70: { name: "Representative info unavailable" }, // Inez Dickens retired; successor unconfirmed.
  71: { name: "Al Taylor",          district: 71, phone: "212-234-1430", website: "https://nyassembly.gov/mem/Al-Taylor/" },
  72: { name: "Manny De Los Santos",  district: 72, phone: "212-928-2828", website: "https://nyassembly.gov/mem/Manuel-De-Los-Santos/" },
  73: { name: "Alex Bores",         district: 73, phone: "212-605-0937", website: "https://nyassembly.gov/mem/Alex-Bores/" },
  74: { name: "Harvey Epstein",     district: 74, phone: "212-979-9696", website: "https://nyassembly.gov/mem/Harvey-Epstein/" },
  75: { name: "Tony Simone",        district: 75, phone: "212-866-3970", website: "https://nyassembly.gov/mem/Tony-Simone/" },
  76: { name: "Rebecca Seawright",  district: 76, phone: "212-288-4607", website: "https://nyassembly.gov/mem/Rebecca-A-Seawright/" },
};

// NY State Senate — Manhattan-covering districts, 2025–2026 term.
const SENATE = {
  27: { name: "Brian Kavanagh",      district: 27, phone: "212-298-5565", website: "https://www.nysenate.gov/senators/brian-kavanagh" },
  28: { name: "Liz Krueger",         district: 28, phone: "212-490-9535", website: "https://www.nysenate.gov/senators/liz-krueger" },
  29: { name: "José M. Serrano",     district: 29, phone: "212-828-5829", website: "https://www.nysenate.gov/senators/jose-m-serrano" },
  30: { name: "Cordell Cleare",      district: 30, phone: "212-222-7315", website: "https://www.nysenate.gov/senators/cordell-cleare" },
  31: { name: "Robert Jackson",      district: 31, phone: "212-928-5578", website: "https://www.nysenate.gov/senators/robert-jackson" },
  47: { name: "Brad Hoylman-Sigal",  district: 47, phone: "212-633-8052", website: "https://www.nysenate.gov/senators/brad-hoylman-sigal" },
};

// Manhattan Community Boards. Website and meetings pages follow the same
// NYC.gov URL pattern, so we fill them in from the board number.
const CB = {};
for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
  CB[n] = {
    boardNumber: n,
    boardName: `Manhattan Community Board ${n}`,
    website:      `https://www.nyc.gov/site/manhattancb${n}/index.page`,
    meetingsUrl:  `https://www.nyc.gov/site/manhattancb${n}/meetings/meetings.page`,
  };
}

// NYPD Manhattan precincts — addresses and main desk numbers.
const PRECINCT = {
  1:  { precinct: 1,  name: "1st Precinct",           address: "16 Ericsson Place, New York, NY 10013",              phone: "212-334-0611" },
  5:  { precinct: 5,  name: "5th Precinct",           address: "19 Elizabeth Street, New York, NY 10013",            phone: "212-334-0711" },
  6:  { precinct: 6,  name: "6th Precinct",           address: "233 West 10th Street, New York, NY 10014",           phone: "212-741-4811" },
  7:  { precinct: 7,  name: "7th Precinct",           address: "19½ Pitt Street, New York, NY 10002",                phone: "212-477-7311" },
  9:  { precinct: 9,  name: "9th Precinct",           address: "321 East 5th Street, New York, NY 10003",            phone: "212-477-7811" },
  10: { precinct: 10, name: "10th Precinct",          address: "230 West 20th Street, New York, NY 10011",           phone: "212-741-8211" },
  13: { precinct: 13, name: "13th Precinct",          address: "230 East 21st Street, New York, NY 10010",           phone: "212-477-7411" },
  14: { precinct: 14, name: "Midtown South Precinct", address: "357 West 35th Street, New York, NY 10001",           phone: "212-239-9811" },
  17: { precinct: 17, name: "17th Precinct",          address: "167 East 51st Street, New York, NY 10022",           phone: "212-826-3211" },
  18: { precinct: 18, name: "Midtown North Precinct", address: "306 West 54th Street, New York, NY 10019",           phone: "212-760-8300" },
  19: { precinct: 19, name: "19th Precinct",          address: "153 East 67th Street, New York, NY 10065",           phone: "212-452-0600" },
  20: { precinct: 20, name: "20th Precinct",          address: "120 West 82nd Street, New York, NY 10024",           phone: "212-580-6411" },
  23: { precinct: 23, name: "23rd Precinct",          address: "164 East 102nd Street, New York, NY 10029",          phone: "212-860-6411" },
  24: { precinct: 24, name: "24th Precinct",          address: "151 West 100th Street, New York, NY 10025",          phone: "212-678-1811" },
  25: { precinct: 25, name: "25th Precinct",          address: "120 East 119th Street, New York, NY 10035",          phone: "212-860-6511" },
  26: { precinct: 26, name: "26th Precinct",          address: "520 West 126th Street, New York, NY 10027",          phone: "212-678-1311" },
  28: { precinct: 28, name: "28th Precinct",          address: "2271-89 Frederick Douglass Blvd, New York, NY 10027", phone: "212-678-1611" },
  30: { precinct: 30, name: "30th Precinct",          address: "451 West 151st Street, New York, NY 10031",          phone: "212-690-8811" },
  32: { precinct: 32, name: "32nd Precinct",          address: "250 West 135th Street, New York, NY 10030",          phone: "212-690-6311" },
  33: { precinct: 33, name: "33rd Precinct",          address: "2207 Amsterdam Avenue, New York, NY 10032",          phone: "212-927-3200" },
  34: { precinct: 34, name: "34th Precinct",          address: "4295 Broadway, New York, NY 10033",                  phone: "212-927-9711" },
};

// ---------- Public lookup tables ----------

// ZIP → representatives. Each entry references the source tables above so
// a rep's details live in exactly one place.
const MANHATTAN_REPS = {
  "10001": { cityCouncil: COUNCIL[3],  stateAssembly: ASSEMBLY[75], stateSenate: SENATE[47] }, // Chelsea / Hudson Yards
  "10002": { cityCouncil: COUNCIL[1],  stateAssembly: ASSEMBLY[65], stateSenate: SENATE[27] }, // LES / Chinatown — spans Council D1 & D2; using D1 as majority
  "10003": { cityCouncil: COUNCIL[2],  stateAssembly: ASSEMBLY[74], stateSenate: SENATE[27] }, // East Village / Gramercy — Senate spans 27 & 28
  "10004": { cityCouncil: COUNCIL[1],  stateAssembly: ASSEMBLY[65], stateSenate: SENATE[27] }, // Financial District
  "10005": { cityCouncil: COUNCIL[1],  stateAssembly: ASSEMBLY[65], stateSenate: SENATE[27] },
  "10006": { cityCouncil: COUNCIL[1],  stateAssembly: ASSEMBLY[65], stateSenate: SENATE[27] },
  "10007": { cityCouncil: COUNCIL[1],  stateAssembly: ASSEMBLY[65], stateSenate: SENATE[27] },
  "10009": { cityCouncil: COUNCIL[2],  stateAssembly: ASSEMBLY[74], stateSenate: SENATE[27] }, // East Village / Alphabet City
  "10010": { cityCouncil: COUNCIL[2],  stateAssembly: ASSEMBLY[74], stateSenate: SENATE[28] }, // Gramercy / Stuy Town — Senate spans 27 & 28
  "10011": { cityCouncil: COUNCIL[3],  stateAssembly: ASSEMBLY[75], stateSenate: SENATE[47] }, // Chelsea / West Village
  "10012": { cityCouncil: COUNCIL[1],  stateAssembly: ASSEMBLY[66], stateSenate: SENATE[47] }, // SoHo / NoHo — Senate spans 27 & 47
  "10013": { cityCouncil: COUNCIL[1],  stateAssembly: ASSEMBLY[65], stateSenate: SENATE[27] }, // Tribeca / Chinatown
  "10014": { cityCouncil: COUNCIL[3],  stateAssembly: ASSEMBLY[66], stateSenate: SENATE[47] }, // West Village
  "10016": { cityCouncil: COUNCIL[4],  stateAssembly: ASSEMBLY[73], stateSenate: SENATE[28] }, // Murray Hill / Kips Bay — Council D4 placeholder
  "10017": { cityCouncil: COUNCIL[4],  stateAssembly: ASSEMBLY[73], stateSenate: SENATE[28] }, // Midtown East
  "10018": { cityCouncil: COUNCIL[3],  stateAssembly: ASSEMBLY[75], stateSenate: SENATE[47] }, // Garment District
  "10019": { cityCouncil: COUNCIL[3],  stateAssembly: ASSEMBLY[75], stateSenate: SENATE[47] }, // Hell's Kitchen
  "10020": { cityCouncil: COUNCIL[4],  stateAssembly: ASSEMBLY[75], stateSenate: SENATE[47] }, // Rockefeller Center (mostly commercial)
  "10021": { cityCouncil: COUNCIL[5],  stateAssembly: ASSEMBLY[73], stateSenate: SENATE[28] }, // UES — AD spans 73 & 76
  "10022": { cityCouncil: COUNCIL[4],  stateAssembly: ASSEMBLY[73], stateSenate: SENATE[28] }, // Midtown East / UES south
  "10023": { cityCouncil: COUNCIL[6],  stateAssembly: ASSEMBLY[67], stateSenate: SENATE[47] }, // UWS south — Senate spans 47 & 31
  "10024": { cityCouncil: COUNCIL[6],  stateAssembly: ASSEMBLY[67], stateSenate: SENATE[31] }, // UWS
  "10025": { cityCouncil: COUNCIL[6],  stateAssembly: ASSEMBLY[67], stateSenate: SENATE[31] }, // UWS / Morningside — Council spans 6 & 7
  "10026": { cityCouncil: COUNCIL[9],  stateAssembly: ASSEMBLY[70], stateSenate: SENATE[30] }, // Central Harlem
  "10027": { cityCouncil: COUNCIL[9],  stateAssembly: ASSEMBLY[70], stateSenate: SENATE[30] }, // Harlem / Morningside — AD spans 70 & 69
  "10028": { cityCouncil: COUNCIL[5],  stateAssembly: ASSEMBLY[76], stateSenate: SENATE[28] }, // UES / Yorkville
  "10029": { cityCouncil: COUNCIL[8],  stateAssembly: ASSEMBLY[68], stateSenate: SENATE[29] }, // East Harlem
  "10030": { cityCouncil: COUNCIL[9],  stateAssembly: ASSEMBLY[70], stateSenate: SENATE[30] }, // Harlem
  "10031": { cityCouncil: COUNCIL[7],  stateAssembly: ASSEMBLY[71], stateSenate: SENATE[31] }, // Hamilton Heights
  "10032": { cityCouncil: COUNCIL[10], stateAssembly: ASSEMBLY[72], stateSenate: SENATE[31] }, // Washington Heights
  "10033": { cityCouncil: COUNCIL[10], stateAssembly: ASSEMBLY[72], stateSenate: SENATE[31] },
  "10034": { cityCouncil: COUNCIL[10], stateAssembly: ASSEMBLY[72], stateSenate: SENATE[31] }, // Inwood
  "10035": { cityCouncil: COUNCIL[8],  stateAssembly: ASSEMBLY[68], stateSenate: SENATE[29] }, // East Harlem / Randall's Island
  "10036": { cityCouncil: COUNCIL[3],  stateAssembly: ASSEMBLY[75], stateSenate: SENATE[47] }, // Times Square / Theater District
  "10037": { cityCouncil: COUNCIL[9],  stateAssembly: ASSEMBLY[70], stateSenate: SENATE[30] },
  "10038": { cityCouncil: COUNCIL[1],  stateAssembly: ASSEMBLY[65], stateSenate: SENATE[27] }, // Seaport / Financial District east
  "10039": { cityCouncil: COUNCIL[9],  stateAssembly: ASSEMBLY[70], stateSenate: SENATE[30] },
  "10040": { cityCouncil: COUNCIL[10], stateAssembly: ASSEMBLY[72], stateSenate: SENATE[31] }, // Washington Heights north
  "10044": { cityCouncil: COUNCIL[5],  stateAssembly: ASSEMBLY[76], stateSenate: SENATE[28] }, // Roosevelt Island
  "10065": { cityCouncil: COUNCIL[5],  stateAssembly: ASSEMBLY[73], stateSenate: SENATE[28] }, // UES
  "10069": { cityCouncil: COUNCIL[6],  stateAssembly: ASSEMBLY[67], stateSenate: SENATE[47] }, // Lincoln Square / Riverside South
  "10075": { cityCouncil: COUNCIL[5],  stateAssembly: ASSEMBLY[76], stateSenate: SENATE[28] }, // UES
  "10128": { cityCouncil: COUNCIL[5],  stateAssembly: ASSEMBLY[76], stateSenate: SENATE[28] }, // Carnegie Hill / UES
  "10280": { cityCouncil: COUNCIL[1],  stateAssembly: ASSEMBLY[65], stateSenate: SENATE[27] }, // Battery Park City
  "10282": { cityCouncil: COUNCIL[1],  stateAssembly: ASSEMBLY[65], stateSenate: SENATE[27] }, // Battery Park City north
  // --- Building-specific / commercial-only Midtown ZIPs ---
  "10112": { cityCouncil: COUNCIL[3],  stateAssembly: ASSEMBLY[75], stateSenate: SENATE[47] }, // Rockefeller Center tower
  "10118": { cityCouncil: COUNCIL[3],  stateAssembly: ASSEMBLY[75], stateSenate: SENATE[47] }, // Empire State Building
  "10119": { cityCouncil: COUNCIL[3],  stateAssembly: ASSEMBLY[75], stateSenate: SENATE[47] }, // Penn Plaza
  "10199": { cityCouncil: COUNCIL[3],  stateAssembly: ASSEMBLY[75], stateSenate: SENATE[47] }, // Penn Station area (CB 4)
};

// ZIP → primary NYPD precinct. Most ZIPs are covered by a single precinct;
// where a ZIP straddles two (common in Lower Manhattan), we pick the one
// covering the majority of the residential area and flag it in a comment.
const MANHATTAN_PRECINCTS = {
  "10001": PRECINCT[10], // Chelsea — 10th handles most; 14th covers the block south of 30th around Penn Station
  "10002": PRECINCT[7],  // LES — 7th primary; 5th covers Chinatown portion
  "10003": PRECINCT[9],  // East Village — 9th primary; 13th covers the Gramercy portion north of 14th St
  "10004": PRECINCT[1],
  "10005": PRECINCT[1],
  "10006": PRECINCT[1],
  "10007": PRECINCT[1],
  "10009": PRECINCT[9],
  "10010": PRECINCT[13],
  "10011": PRECINCT[10],
  "10012": PRECINCT[1],  // SoHo — 1st primary; 5th covers Little Italy portion east of Lafayette
  "10013": PRECINCT[1],  // Tribeca / Chinatown west — 1st primary; 5th covers eastern portion
  "10014": PRECINCT[6],
  "10016": PRECINCT[13],
  "10017": PRECINCT[17],
  "10018": PRECINCT[14],
  "10019": PRECINCT[18],
  "10020": PRECINCT[18],
  "10021": PRECINCT[19],
  "10022": PRECINCT[17],
  "10023": PRECINCT[20],
  "10024": PRECINCT[20],
  "10025": PRECINCT[24], // UWS / Morningside — 24th primary; 26th covers Morningside Heights portion
  "10026": PRECINCT[28],
  "10027": PRECINCT[26], // Morningside / Harlem — 26th primary for Morningside, 28th for Harlem portion
  "10028": PRECINCT[19],
  "10029": PRECINCT[23],
  "10030": PRECINCT[32],
  "10031": PRECINCT[30],
  "10032": PRECINCT[33],
  "10033": PRECINCT[33],
  "10034": PRECINCT[34],
  "10035": PRECINCT[25],
  "10036": PRECINCT[18],
  "10037": PRECINCT[32],
  "10038": PRECINCT[1],
  "10039": PRECINCT[32],
  "10040": PRECINCT[34],
  "10044": PRECINCT[19], // Roosevelt Island is patrolled by the 19th
  "10065": PRECINCT[19],
  "10069": PRECINCT[20],
  "10075": PRECINCT[19],
  "10128": PRECINCT[19],
  "10280": PRECINCT[1],  // Battery Park City
  "10282": PRECINCT[1],
  // --- Building-specific / commercial-only Midtown ZIPs ---
  "10112": PRECINCT[18], // Rockefeller Center — Midtown North
  "10118": PRECINCT[14], // Empire State Building — Midtown South
  "10119": PRECINCT[14], // Penn Plaza — Midtown South
  "10199": PRECINCT[14], // Penn Station area — Midtown South
};

// ZIP → Manhattan Community Board. Several ZIPs straddle two boards; we
// pick the one covering the majority of the ZIP's residential area and
// flag overlaps in an inline comment.
const MANHATTAN_COMMUNITY_BOARDS = {
  "10001": CB[5],  // Chelsea south / Midtown — mostly CB 5; Chelsea blocks west of 6th are CB 4
  "10002": CB[3],
  "10003": CB[3],  // East Village primary; Union Square blocks west of 4th Ave are CB 5
  "10004": CB[1],
  "10005": CB[1],
  "10006": CB[1],
  "10007": CB[1],
  "10009": CB[3],
  "10010": CB[6],  // Gramercy / Stuy Town
  "10011": CB[4],  // Chelsea; West Village blocks south of 14th are CB 2
  "10012": CB[2],
  "10013": CB[2],  // SoHo / Tribeca — overlaps CB 1, CB 2, CB 3; using CB 2 as majority
  "10014": CB[2],
  "10016": CB[6],  // Overlaps CB 5 & CB 6; using CB 6 (Murray Hill / Kips Bay is majority)
  "10017": CB[6],  // Overlaps CB 5 & CB 6; using CB 6 (Midtown East majority)
  "10018": CB[4],
  "10019": CB[4],  // Hell's Kitchen / Midtown West
  "10020": CB[5],  // Rockefeller Center
  "10021": CB[8],
  "10022": CB[6],  // Overlaps CB 5 & CB 6; using CB 6 (Sutton Place / Midtown East majority)
  "10023": CB[7],
  "10024": CB[7],
  "10025": CB[7],  // Overlaps CB 7 & CB 9; using CB 7 (UWS majority; Morningside Heights is CB 9)
  "10026": CB[10], // Central Harlem
  "10027": CB[10], // Overlaps CB 9 & CB 10; using CB 10 (area east of Morningside Park)
  "10028": CB[8],
  "10029": CB[11], // East Harlem
  "10030": CB[10],
  "10031": CB[9],  // Hamilton Heights / Manhattanville
  "10032": CB[12],
  "10033": CB[12],
  "10034": CB[12], // Inwood
  "10035": CB[11], // East Harlem / Randall's Island
  "10036": CB[4],  // Times Square / Theater District
  "10037": CB[10],
  "10038": CB[1],  // Seaport / Financial District east
  "10039": CB[10],
  "10040": CB[12],
  "10044": CB[8],  // Roosevelt Island
  "10065": CB[8],
  "10069": CB[7],  // Lincoln Square / Riverside South
  "10075": CB[8],
  "10118": CB[5],  // Empire State Building — commercial
  "10119": CB[5],  // Penn Plaza — commercial
  "10128": CB[8],  // Carnegie Hill
  "10280": CB[1],
  "10282": CB[1],
  // --- Building-specific / commercial-only Midtown ZIPs ---
  "10112": CB[5],  // Rockefeller Center
  "10199": CB[4],  // Penn Station area
};

// --- Building-specific commercial Midtown ZIPs: 10152–10178 ---
// These are single-building mail ZIPs along the Park Ave / Madison Ave /
// Rockefeller corridor. None have residential populations, so we assign
// the Midtown North / CB 5 / AD 75 / SD 47 / Council D3 cluster uniformly
// rather than splitting hairs over which building sits in which district.
// Penn Plaza / ESB / 10199 are handled individually above because they
// map to Midtown South (14) and, in 10199's case, CB 4.
for (let _z = 10152; _z <= 10178; _z++) {
  const _zip = String(_z);
  MANHATTAN_REPS[_zip]             = { cityCouncil: COUNCIL[3], stateAssembly: ASSEMBLY[75], stateSenate: SENATE[47] };
  MANHATTAN_PRECINCTS[_zip]        = PRECINCT[18];
  MANHATTAN_COMMUNITY_BOARDS[_zip] = CB[5];
}
