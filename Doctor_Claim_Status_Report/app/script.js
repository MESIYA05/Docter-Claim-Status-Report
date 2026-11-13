/* ===================================================
   LOADER CONTROLLER (supports nested / overlapping calls)
   =================================================== */
let LOADER_COUNT = 0;
let LOADER_PCT = 0;
let LOADER_TICK = null;
let LOADER_HIDE_TIMER = null;
let LOADER_SHOWN_AT = 0;
const LOADER_MIN_MS = 600;   // keep the loader visible long enough to be seen

function setLoaderProgress(p) {
  LOADER_PCT = Math.max(0, Math.min(100, p));
  const whole = Math.round(LOADER_PCT);
  const fill = document.getElementById("ld-fill");   // optional: progress bar was removed from the HTML
  const pct  = document.getElementById("ld-pct");
  const st   = document.getElementById("ld-status");
  if (fill) fill.style.transform = "scaleX(" + (LOADER_PCT / 100) + ")";
  if (pct)  pct.textContent = whole;
  if (st) {
    st.textContent =
      whole >= 100 ? "Ready" :
      whole >= 85  ? "Finishing touches" :
      whole >= 55  ? "Syncing data" :
      whole >= 25  ? "Loading your data" : "Starting up";
  }
}

function showLoader() {
  LOADER_COUNT++;
  clearTimeout(LOADER_HIDE_TIMER);
  if (LOADER_COUNT > 1) return;               // already showing

  const l = document.getElementById("page-loader");
  if (l) l.classList.remove("hidden", "ld-done");
  document.body.classList.add("is-loading");
  LOADER_SHOWN_AT = Date.now();
  setLoaderProgress(1);

  clearInterval(LOADER_TICK);
  // creeps toward 92% while real work runs; jumps to 100% when finished
  LOADER_TICK = setInterval(function () {
    setLoaderProgress(LOADER_PCT + (92 - LOADER_PCT) * 0.05);
  }, 100);
}

function hideLoader() {
  LOADER_COUNT = Math.max(0, LOADER_COUNT - 1);
  if (LOADER_COUNT > 0) return;               // another task still running

  const wait = Math.max(0, LOADER_MIN_MS - (Date.now() - LOADER_SHOWN_AT));
  clearTimeout(LOADER_HIDE_TIMER);
  LOADER_HIDE_TIMER = setTimeout(function () {
    clearInterval(LOADER_TICK);
    setLoaderProgress(100);
    const l = document.getElementById("page-loader");
    if (l) l.classList.add("ld-done");
    // brief pause on "100% Ready", then fade out and reveal the page
    setTimeout(function () {
      if (LOADER_COUNT > 0) return;           // a new load started meanwhile
      if (l) l.classList.add("hidden");
      document.body.classList.remove("is-loading");
    }, 350);
  }, wait);
}

/* ===================================================
   APP STATE
   =================================================== */
let ALL_CLAIMS = [];
let FILTERED_DATA = [];
let ALL_HOSPITALS = [];
let DOCTOR_HOSPITAL_MAP = {};
let PATIENT_PAYER_MAP = {};
let CURRENT_STATUS_FILTER = "";
let CURRENT_FROM_INT = 0;
let CURRENT_TO_INT   = 0;

// Date of Service filter helpers (line level)
function lineInDateRange(l) {
  if (!CURRENT_FROM_INT && !CURRENT_TO_INT) return true;
  const d = normalizeDateInt(l.Date_of_Service);
  if (d === 0) return false;
  if (CURRENT_FROM_INT && d < CURRENT_FROM_INT) return false;   // inclusive
  if (CURRENT_TO_INT   && d > CURRENT_TO_INT)   return false;   // inclusive
  return true;
}
function getFilteredLines(c, statusVal) {
  let lines = getClaimLines(c);
  if (statusVal) lines = lines.filter(l => getLineStatus(l) === statusVal);
  if (CURRENT_FROM_INT || CURRENT_TO_INT) lines = lines.filter(lineInDateRange);
  return lines;
}

/* Medi Elves logo used in the PDF header (valid PNG, embedded as base64) */
const MEDI_ELVES_LOGO_BASE64 = "data:image/jpeg;base64,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";


// Single source of truth for icon color across the whole document
const ICON_COLOR = [30, 130, 76];
let PATIENTS_LIST = [];

// PDF BRAND COLORS
const BRAND = {
  navy: [30, 45, 90],
  navyText: [45, 55, 80],
  grey: [110, 118, 130],
  lightGrey: [235, 237, 240],
  rowAlt: [246, 247, 249],
  white: [255, 255, 255]
};

// 1. ZOHO DATE PARSER (For UI Display)
function parseZohoDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;

  let str = String(dateStr).trim();

  // Format 1: Zoho's "24-Aug-2026"
  let zohoMatch = str.match(/^(\d{1,2})[\s\-\/]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\s\-\/]+(\d{2,4})/i);
  if (zohoMatch) {
    const months = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
    let y = parseInt(zohoMatch[3], 10);
    if (y < 100) y += 2000;
    return new Date(y, months[zohoMatch[2].toLowerCase()], parseInt(zohoMatch[1], 10));
  }

  // Format 2: "DD/MM/YYYY" or "DD-MM-YYYY"
  let euMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (euMatch) {
     return new Date(parseInt(euMatch[3], 10), parseInt(euMatch[2], 10) - 1, parseInt(euMatch[1], 10));
  }

  // Format 3: ISO "YYYY-MM-DD"
  let isoMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10));
  }

  // Fallback native parse
  let d = new Date(str.replace(/-/g, " "));
  if (!isNaN(d.getTime())) return d;

  d = new Date(str);
  if (!isNaN(d.getTime())) return d;

  return null;
}

// 2. BULLETPROOF INTEGER DATE CONVERTER (For Filtering)
function normalizeDateInt(dateVal) {
  if (!dateVal) return 0;
  let str = String(dateVal).trim();

  let isoMatch = str.match(/^(\d{4})[\-\/](\d{1,2})[\-\/](\d{1,2})/);
  if (isoMatch) {
    return parseInt(`${isoMatch[1]}${isoMatch[2].padStart(2,'0')}${isoMatch[3].padStart(2,'0')}`, 10);
  }

  let zohoMatch = str.match(/^(\d{1,2})[\s\-\/]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[\s\-\/]+(\d{2,4})/i);
  if (zohoMatch) {
    const months = { jan:"01", feb:"02", mar:"03", apr:"04", may:"05", jun:"06", jul:"07", aug:"08", sep:"09", oct:"10", nov:"11", dec:"12" };
    let y = zohoMatch[3];
    if (y.length === 2) y = "20" + y;
    return parseInt(`${y}${months[zohoMatch[2].toLowerCase()]}${zohoMatch[1].padStart(2,'0')}`, 10);
  }

  let euMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (euMatch) {
    return parseInt(`${euMatch[3]}${euMatch[2].padStart(2,'0')}${euMatch[1].padStart(2,'0')}`, 10);
  }

  let d = new Date(str.replace(/-/g, " "));
  if (isNaN(d.getTime())) d = new Date(str);
  if (!isNaN(d.getTime())) {
    return parseInt(`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`, 10);
  }

  return 0;
}

function formatPatientDOB(dob){
  if(!dob) return "";
  if(/^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(dob)) return dob;
  var d = parseZohoDate(dob);
  if(!d || isNaN(d.getTime())) return String(dob);
  var day = String(d.getDate()).padStart(2, "0");
  var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return day + "-" + months[d.getMonth()] + "-" + d.getFullYear();
}

function patientDisplayName(p){
  if(p.Patient_Name && typeof p.Patient_Name === "object"){
    return p.Patient_Name.zc_display_value
      || `${p.Patient_Name.first_name || ""} ${p.Patient_Name.last_name || ""}`.trim() || "-";
  }
  return p.Patient_Name || p.zc_display_value || "-";
}

function buildPatientsList(patients){
  PATIENTS_LIST = patients
    .filter(function(p){ return p.ID; })
    .map(function(p){
      var name = patientDisplayName(p);
      var dob = formatPatientDOB(p.date_of_birth || p.DOB || p.Date_Of_Birth);
      var label = dob ? (name + " - " + dob) : name;
      return { value: p.ID, label: label };
    })
    .sort(function(a, b){ return String(a.label).localeCompare(String(b.label)); });
}

const STATUS_OPTIONS = [
  { value: "Pending",         label: "Pending" },
  { value: "Partially Paid",  label: "Partially Paid" },
  { value: "Paid",            label: "Paid" }
];

let CURRENT_USER_EMAIL = "";
let CURRENT_DOCTOR_ID = null;
let CURRENT_DOCTOR_NAME = null;
let ALLOWED_HOSPITALS = [];

/* ===================================================
   INITIAL LOAD
   =================================================== */
document.addEventListener("DOMContentLoaded", async function () {
  showLoader();
  initSearchableSelect("f-location", "All Locations");
  initSearchableSelect("f-payer",    "All Payers");
  initSearchableSelect("f-status",   "All Status");
  initSearchableSelect("f-patient",  "All Patients");
  setSearchableOptions("f-status", STATUS_OPTIONS, "All Status");

  try {

    if (typeof ZOHO === "undefined") {
      console.error("❌ ZOHO SDK not loaded");
      return;
    }

    const initParams = await ZOHO.CREATOR.UTIL.getInitParams();
    CURRENT_USER_EMAIL = initParams.loginUser;

    const doctorResp = await ZOHO.CREATOR.DATA.getRecords({
      report_name: "Doctors1",
      field_config: "all"
    });
    const allDoctors = doctorResp.data || [];

    const myDoctor = allDoctors.find(d =>
      d.Email && d.Email.trim().toLowerCase() === CURRENT_USER_EMAIL.trim().toLowerCase()
    );

    if (myDoctor) {
      CURRENT_DOCTOR_ID = myDoctor.ID;
      CURRENT_DOCTOR_NAME = myDoctor.Name?.zc_display_value
        || `${myDoctor.Name?.prefix || ""} ${myDoctor.Name?.first_name || ""} ${myDoctor.Name?.last_name || ""}`.trim();
    } else {
      CURRENT_DOCTOR_ID = null;
      CURRENT_DOCTOR_NAME = null;
    }

    document.getElementById("f-doctor-display").textContent =
      CURRENT_DOCTOR_NAME || "Not linked to a doctor";

    const mappingResp = await ZOHO.CREATOR.DATA.getRecords({
      report_name: "Doctor_Hospital_Mappings",
      field_config: "all"
    });
    const allMappings = mappingResp.data || [];

    buildDoctorHospitalMap(allMappings);

    ALLOWED_HOSPITALS = (CURRENT_DOCTOR_ID && DOCTOR_HOSPITAL_MAP[CURRENT_DOCTOR_ID])
      ? DOCTOR_HOSPITAL_MAP[CURRENT_DOCTOR_ID]
      : [];

    ALL_HOSPITALS = ALLOWED_HOSPITALS;
    setSearchableOptions("f-location", ALL_HOSPITALS, "All Locations");

    const claimResp = await ZOHO.CREATOR.DATA.getRecords({
      report_name: "Doctors_Claim_Report",
      field_config: "all"
    });

    const allClaims = claimResp.data || [];

    const claims = allClaims.filter(c =>
      CURRENT_DOCTOR_ID &&
      c.Doctor &&
      String(c.Doctor.ID) === String(CURRENT_DOCTOR_ID)
    );

    ALL_CLAIMS   = claims;
    FILTERED_DATA = claims;

    const patientResp = await ZOHO.CREATOR.DATA.getRecords({
      report_name: "My_Patients",
      field_config: "all"
    });
    buildPatientPayerMap(patientResp.data || []);

    buildPatientsList(patientResp.data || []);
    setSearchableOptions("f-patient", PATIENTS_LIST, "All Patients");

    populatePayers(claims);
    renderTable(FILTERED_DATA, "");

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    hideLoader();   // runs on success, error, or early return
  }
});

function populateDoctors(doctors) {
  const items = doctors.map(doc => ({
    value: doc.ID,
    label: doc.Doctor_Name || doc.zc_display_value
  }));
  setSearchableOptions("f-doctor", items, "All Doctors");
}

function buildPatientPayerMap(patients) {
  PATIENT_PAYER_MAP = {};
  patients.forEach(p => {
    if (!p.ID || !p.Payer) return;
    PATIENT_PAYER_MAP[p.ID] = {
      value: p.Payer.ID,
      label: p.Payer.zc_display_value
    };
  });
}

function populatePayers(claims) {
  const seen  = new Set();
  const items = [];
  claims.forEach(c => {
    const p = getClaimPayer(c);
    if (p && p.label && !seen.has(p.value)) {
      seen.add(p.value);
      items.push({ value: p.value, label: p.label });
    }
  });
  items.sort((a, b) => a.label.localeCompare(b.label));
  setSearchableOptions("f-payer", items, "All Payers");
}

function buildDoctorHospitalMap(mappings) {
  DOCTOR_HOSPITAL_MAP = {};

  mappings.forEach(m => {
    const doctorId   = m.Doctor_Name?.ID;
    const hospital    = m.Hospital;

    if (!doctorId || !hospital) return;

    if (!DOCTOR_HOSPITAL_MAP[doctorId]) {
      DOCTOR_HOSPITAL_MAP[doctorId] = [];
    }

    const already = DOCTOR_HOSPITAL_MAP[doctorId].some(h => String(h.value) === String(hospital.ID));
    if (!already) {
      DOCTOR_HOSPITAL_MAP[doctorId].push({
        value: hospital.ID,
        label: hospital.zc_display_value
      });
    }
  });
}

function updateLocationOptionsForDoctor(doctorId) {
  const locWrapper = document.getElementById("f-location");
  if (!locWrapper) return;

  locWrapper.dataset.value = "";
  locWrapper.querySelector(".ss-value").textContent = "All Locations";

  if (!doctorId) {
    setSearchableOptions("f-location", ALL_HOSPITALS, "All Locations");
    return;
  }

  const mapped = DOCTOR_HOSPITAL_MAP[doctorId] || [];
  setSearchableOptions("f-location", mapped, "All Locations");
}

/* ===================================================
   SEARCHABLE SELECT
   =================================================== */
function initSearchableSelect(id, allLabel) {
  const wrapper = document.getElementById(id);
  if (!wrapper) return;

  wrapper.classList.add("searchable-select");
  wrapper.dataset.value = "";

  wrapper.innerHTML = `
    <div class="ss-control" tabindex="0">
      <span class="ss-value">${allLabel}</span>
      <span class="ss-arrow">&#9662;</span>
    </div>
    <div class="ss-dropdown">
      <input type="text" class="ss-search" placeholder="Search..." autocomplete="off" />
      <ul class="ss-options"></ul>
    </div>
  `;

  const control = wrapper.querySelector(".ss-control");
  const search  = wrapper.querySelector(".ss-search");

  control.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = !wrapper.classList.contains("open");
    closeAllSearchableSelects();
    if (willOpen) {
      wrapper.classList.add("open");
      search.value = "";
      filterOptions(wrapper, "");
      setTimeout(() => search.focus(), 0);
    }
  });

  search.addEventListener("click",  (e) => e.stopPropagation());
  search.addEventListener("input",  () => filterOptions(wrapper, search.value));
  search.addEventListener("keydown",(e) => {
    if (e.key === "Escape") wrapper.classList.remove("open");
  });
}

function setSearchableOptions(id, items, allLabel) {
  const wrapper = document.getElementById(id);
  if (!wrapper) return;

  const list = wrapper.querySelector(".ss-options");
  list.innerHTML = "";

  const allLi = document.createElement("li");
  allLi.textContent = allLabel;
  allLi.dataset.value = "";
  allLi.classList.add("ss-option", "ss-option-all");
  list.appendChild(allLi);

  items.forEach(item => {
    const li = document.createElement("li");
    li.textContent   = item.label;
    li.dataset.value = item.value;
    li.classList.add("ss-option");
    list.appendChild(li);
  });

  const noResultsLi = document.createElement("li");
  noResultsLi.textContent = "No matches found";
  noResultsLi.classList.add("ss-no-results");
  list.appendChild(noResultsLi);

  list.querySelectorAll(".ss-option").forEach(li => {
    li.addEventListener("click", () => {
      selectOption(wrapper, li.dataset.value, li.textContent);
    });
  });
}

function selectOption(wrapper, value, label) {
  wrapper.dataset.value = value;
  wrapper.querySelector(".ss-value").textContent = label;
  wrapper.classList.remove("open");

  if (wrapper.id === "f-doctor") {
    updateLocationOptionsForDoctor(value);
  }
}

function filterOptions(wrapper, query) {
  const q = query.trim().toLowerCase();
  let anyVisible = false;

  wrapper.querySelectorAll(".ss-option:not(.ss-option-all)").forEach(li => {
    const match = li.textContent.toLowerCase().includes(q);
    li.style.display = match ? "" : "none";
    if (match) anyVisible = true;
  });

  const noResults = wrapper.querySelector(".ss-no-results");
  if (noResults) {
    noResults.style.display = (q && !anyVisible) ? "" : "none";
  }
}

function closeAllSearchableSelects() {
  document.querySelectorAll(".searchable-select.open").forEach(el => {
    el.classList.remove("open");
  });
}

function getSearchableValue(id) {
  const wrapper = document.getElementById(id);
  return wrapper ? (wrapper.dataset.value || "") : "";
}

document.addEventListener("click", () => closeAllSearchableSelects());

/* ===================================================
   DATE FILTERING LOGIC
   =================================================== */

function getClaimLines(c) {
  const lines = c.Claim_Lines;
  return Array.isArray(lines) ? lines : [];
}

function getClaimDate(c) {
  const lines = getClaimLines(c);
  if (lines.length > 0 && lines[0].Date_of_Service) {
    let parsed = parseZohoDate(lines[0].Date_of_Service);
    if (parsed && !isNaN(parsed.getTime())) return parsed;
  }
  return parseZohoDate(c.Claim_Date || c["Claim Date"] || c.Date_of_Service || c.Lodged_Date || c.Added_Time || c.added_time || c.Claim_Approved_Time);
}
function formatDisplayDate(d) {
  return (d && !isNaN(d.getTime()))
    ? d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" })
    : "-";
}

// Claim-level date (the "Claim Date" field on the claim)
function getClaimDateOnly(c) {
  return parseZohoDate(
    c.Claim_Date || c["Claim Date"] || c.Lodged_Date ||
    c.Added_Time || c.added_time || c.Claim_Approved_Time
  );
}
function getClaimRawDate(c) {
  return c.Claim_Date || c["Claim Date"] || c.Lodged_Date ||
         c.Added_Time || c.added_time || c.Claim_Approved_Time || "";
}
// Line-level date of service
function getLineServiceDate(l) {
  return formatDisplayDate(parseZohoDate(l.Date_of_Service));
}

/* ===================================================
   UPDATE BUTTON: loader-wrapped filter run
   =================================================== */
function runReport() {
  showLoader();
  // short delay so the loader paints before the synchronous filtering runs
  setTimeout(function () {
    try {
      runReportCore();
    } catch (err) {
      console.error("❌ Report error:", err);
    } finally {
      hideLoader();
    }
  }, 60);
}

function runReportCore() {
  const hospitalId = getSearchableValue("f-location");
  const payerId    = getSearchableValue("f-payer");
  const fromDate   = document.getElementById("f-from").value;
  const toDate     = document.getElementById("f-to").value;
  const statusVal  = getSearchableValue("f-status");
  const patientId  = getSearchableValue("f-patient");
  CURRENT_STATUS_FILTER = statusVal;

  let filtered = [...ALL_CLAIMS];

  if (hospitalId) {
    filtered = filtered.filter(c => c.Hospital && String(c.Hospital.ID) === String(hospitalId));
  }

  if (patientId) {
    filtered = filtered.filter(c => c.Patient && String(c.Patient.ID) === String(patientId));
  }

  if (payerId) {
    filtered = filtered.filter(c => {
      const p = getClaimPayer(c);
      return p && String(p.value) === String(payerId);
    });
  }

  CURRENT_FROM_INT = normalizeDateInt(fromDate);
  CURRENT_TO_INT   = normalizeDateInt(toDate);

  if (statusVal || CURRENT_FROM_INT || CURRENT_TO_INT) {
    filtered = filtered.filter(c => getFilteredLines(c, statusVal).length > 0);
  }

  FILTERED_DATA = filtered;
  renderTable(filtered, statusVal);
}

function getClaimPayer(c) {
  if (c.Payer && c.Payer.ID) {
    return { value: c.Payer.ID, label: c.Payer.zc_display_value || c.Payer_Name || "-" };
  }
  if (c.Patient?.ID && PATIENT_PAYER_MAP[c.Patient.ID]) {
    return PATIENT_PAYER_MAP[c.Patient.ID];
  }
  if (c.Payer_Name) {
    return { value: c.Payer_Name, label: c.Payer_Name };
  }
  return null;
}

function renderTable(data, statusVal) {
  const tbody = document.getElementById("report-body");

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="11">No data</td></tr>`;
    renderSummary([], statusVal);
    applyTableRowLimit();
    return;
  }
  let html = "";

  data.forEach((c, groupIdx) => {
    const claimDate  = getClaimDateOnly(c);
    const doctor     = c.Doctor?.zc_display_value    || c.Doctor_Name    || "-";
    const hospital   = c.Hospital?.zc_display_value  || c.Hospital_Name  || "-";
    const patient    = [c.Patient?.first_name, c.Patient?.last_name].filter(Boolean).join(" ") || c.Patient?.zc_display_value || "-";
    const payerInfo  = getClaimPayer(c);
    const payer      = payerInfo?.label || "-";
    const amount     = c.Total_Claim_Amount || "-";

    /* ===== CHANGE 1: Claim # is now plain text (popup removed) ===== */
    const claimNo = c.Claim_ID || c.ID || "-";
    const claimLink = claimNo;   // plain text – no popup on click
    /* ===== END CHANGE 1 ===== */

    const lines = getFilteredLines(c, statusVal);

    const rowCount = Math.max(lines.length, 1);
    const groupClass = groupIdx % 2 === 0 ? "grp-a" : "grp-b";

    const claimCellsHtml = `
      <td rowspan="${rowCount}" class="claim-cell col-nowrap">${claimLink}</td>
      <td rowspan="${rowCount}" class="claim-cell col-nowrap">${formatDisplayDate(claimDate)}</td>
      <td rowspan="${rowCount}" class="claim-cell">${doctor}</td>
      <td rowspan="${rowCount}" class="claim-cell">${hospital}</td>
      <td rowspan="${rowCount}" class="claim-cell">${patient}</td>
      <td rowspan="${rowCount}" class="claim-cell">${payer}</td>
      <td rowspan="${rowCount}" class="claim-cell col-amount">${fmtAmt(amount)}</td>
    `;

    if (!lines.length) {
      html += `
        <tr class="${groupClass} group-first">
          ${claimCellsHtml}
          <td colspan="4" class="no-lines col-service">No matching line items</td>
        </tr>
      `;
      return;
    }

    lines.forEach((l, idx) => {
      const serviceDate = getLineServiceDate(l);
      const itemNo = getLineItemNumber(l);
      const amt    = getLineAmount(l);
      const status = getLineStatus(l);
      const statusClass = "status-" + String(status).toLowerCase().replace(/\s+/g, "-");

      html += `
        <tr class="${groupClass} ${idx === 0 ? "group-first" : ""}">
          ${idx === 0 ? claimCellsHtml : ""}
          <td class="col-service">${serviceDate}</td>
          <td class="col-nowrap">${itemNo}</td>
          <td class="line-amount col-amount">${fmtAmt(amt)}</td>
          <td class="col-status"><span class="status-badge ${statusClass}">${status}</span></td>
        </tr>
      `;
    });
  });

  tbody.innerHTML = html;
  renderSummary(data, statusVal);
  applyTableRowLimit();
}

/* Show only the first 5 claims; the rest scroll inside the table with a fixed header. */
const VISIBLE_CLAIM_LIMIT = 5;
function applyTableRowLimit() {
  const sc = document.querySelector(".table-scroll");
  const tb = document.getElementById("report-body");
  if (!sc || !tb) return;
  const groups = tb.querySelectorAll("tr.group-first");
  if (groups.length <= VISIBLE_CLAIM_LIMIT) {
    sc.style.maxHeight = "";
    return;
  }
  // top of the 6th claim (measured from the top of the table, header included)
  sc.style.maxHeight = groups[VISIBLE_CLAIM_LIMIT].offsetTop + "px";
}
window.addEventListener("resize", applyTableRowLimit);
window.addEventListener("load", applyTableRowLimit);

function computeSummary(claims, statusFilter) {
  let totalClaims = claims.length;
  let totalClaimAmount = 0;
  let totalLineItems = 0;
  let totalItemAmount = 0;
  const statusTotals = {
    "Pending":         { count: 0, amount: 0 },
    "Partially Paid":  { count: 0, amount: 0 },
    "Paid":            { count: 0, amount: 0 }
  };

  claims.forEach(c => {
    totalClaimAmount += Number(c.Total_Claim_Amount) || 0;

    const lines = getFilteredLines(c, statusFilter);

    lines.forEach(l => {
      const amt = Number(getLineAmount(l)) || 0;
      totalLineItems++;
      totalItemAmount += amt;

      const st = getLineStatus(l);
      if (statusTotals[st]) {
        statusTotals[st].count++;
        statusTotals[st].amount += amt;
      }
    });
  });

  return { totalClaims, totalClaimAmount, totalLineItems, totalItemAmount, statusTotals };
}

function fmtAmt(v) {
  if (v === null || v === undefined || v === "" || v === "-") return "-";
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? "-" : fmtMoney(n);
}

function fmtMoney(n) {
  return "$ " + (Number(n) || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderSummary(data, statusVal) {
  const el = document.getElementById("report-summary");
  if (!el) return;

  const s = computeSummary(data, statusVal);

  const statusRows = Object.entries(s.statusTotals)
    .map(([status, v]) => `
      <tr>
        <td>${status}</td>
        <td>${v.count}</td>
        <td class="amount">${fmtMoney(v.amount)}</td>
      </tr>
    `).join("");

  el.innerHTML = `
    <div class="summary-title">Grand Summary</div>
    <div class="summary-grid">
      <div class="summary-stat">
        <div class="label">Total Claims</div>
        <div class="value">${s.totalClaims}</div>
      </div>
      <div class="summary-stat">
        <div class="label">Total Claim Amount</div>
        <div class="value">${fmtMoney(s.totalClaimAmount)}</div>
      </div>
      <div class="summary-stat">
        <div class="label">Total Line Items</div>
        <div class="value">${s.totalLineItems}</div>
      </div>
      <div class="summary-stat">
        <div class="label">Total Item Amount</div>
        <div class="value">${fmtMoney(s.totalItemAmount)}</div>
      </div>
    </div>
    <table class="summary-status-table">
      <thead>
        <tr><th>Status</th><th>Item Count</th><th>Amount</th></tr>
      </thead>
      <tbody>${statusRows}</tbody>
    </table>
  `;
}

function getLineItemNumber(l) {
  if (l.Item && typeof l.Item === "object") {
    return l.Item.zc_display_value || l.Item.ID || "-";
  }
  return l.Item_Number || l.Item || "-";
}

function getLineAmount(l) {
  const amt = l.Amount_Charged;
  return (amt !== undefined && amt !== null && amt !== "") ? Number(amt).toFixed(2) : null;
}

function getLineStatus(l) {
  return l.Status || "-";
}

/* drillDown() / closeModal() are kept but are no longer called from the table */
function drillDown(claimId) {
  const claim = ALL_CLAIMS.find(c => String(c.ID) === String(claimId));
  if (!claim) return;

  const skip = new Set(["added_user", "added_time", "modified_time", "Claim_Lines"]);
  const rows = Object.entries(claim)
    .filter(([k, v]) => !skip.has(k) && v !== null && v !== undefined && v !== "")
    .map(([k, v]) => {
      const label = k.replace(/_/g, " ");
      let val = v;
      if (typeof v === "object") val = v.zc_display_value || JSON.stringify(v);
      return `<tr><th>${label}</th><td>${val}</td></tr>`;
    })
    .join("");

  let modal = document.getElementById("drill-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "drill-modal";
    modal.innerHTML = `
      <div class="modal-overlay" onclick="closeModal()"></div>
      <div class="modal-box">
        <div class="modal-header">
          <span class="modal-title">Claim Details</span>
          <button class="modal-close" onclick="closeModal()">&#x2715;</button>
        </div>
        <div class="modal-body"><table id="drill-table"></table></div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById("drill-table").innerHTML = rows;
  modal.classList.add("open");
}

function closeModal() {
  const modal = document.getElementById("drill-modal");
  if (modal) modal.classList.remove("open");
}

/* ===================================================
   EXPORT
   =================================================== */
function getExportGroups() {
  const groups = [];

  FILTERED_DATA.forEach(c => {
    const claimDate  = getClaimDateOnly(c);
    const doctor     = c.Doctor?.zc_display_value   || c.Doctor_Name   || "-";
    const hospital   = c.Hospital?.zc_display_value || c.Hospital_Name || "-";
    const patient    = [c.Patient?.first_name, c.Patient?.last_name].filter(Boolean).join(" ") || c.Patient?.zc_display_value || "-";
    const payer      = (getClaimPayer(c) || {}).label || "-";
    const claimAmt   = c.Total_Claim_Amount || c.Total_AUD || c.Amount || "-";
    const claimNo    = c.Claim_ID || c.ID || "-";

    const lines = getFilteredLines(c, CURRENT_STATUS_FILTER);
    const claimAmtNum = Number(String(claimAmt).replace(/[^0-9.\-]/g, ""));

    const claimFields = [
      claimNo,
      formatDisplayDate(claimDate),
      doctor,
      hospital,
      patient,
      payer,
      (claimAmt !== "-" && !isNaN(claimAmtNum)) ? claimAmtNum : "-"
    ];

    const itemRows = lines.length
  ? lines.map(l => [
      getLineServiceDate(l),
      getLineItemNumber(l),
      (getLineAmount(l) !== null && !isNaN(Number(getLineAmount(l)))) ? Number(getLineAmount(l)) : "-",
      getLineStatus(l)
    ])
  : [["-", "-", "-", "-"]];

    groups.push({ claimFields, itemRows });
  });

  return groups;
}

const XLSX_BRAND = {
  navy: "1E2D5A",
  navyText: "2D374F",
  green: "1F7A5C",
  white: "FFFFFF",
  lightGrey: "E5E7EB",
  rowAlt: "F6F7F9"
};

function safeAlert(msg) { try { alert(msg); } catch (e) { console.error(msg); } }

/* ===================================================
   FILE DELIVERY (PDF / Excel) — same method as the reference code
     - Laptop / desktop : normal download (doc.save / XLSX.writeFile)
     - Zoho Creator app : browser downloads are blocked, so the file is uploaded into
                          Export_PDF / Export_Excel of ONE fixed record per doctor, then a
                          "Download" button opens the stored file outside the widget.
     - Phone browser    : share sheet, else tap-to-download panel
   =================================================== */
function isMobileDevice() {
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
         (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);   // iPadOS
}

function triggerAnchorDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    if (a.parentNode) a.parentNode.removeChild(a);
    URL.revokeObjectURL(url);
  }, 4000);
}

function showDownloadFallback(blob, fileName, mimeType) {
  const old = document.getElementById("dl-overlay");
  if (old) old.remove();

  const url = URL.createObjectURL(blob);
  const wrap = document.createElement("div");
  wrap.id = "dl-overlay";
  wrap.className = "dl-overlay";

  const box = document.createElement("div");
  box.className = "dl-box";

  const title = document.createElement("div");
  title.className = "dl-title";
  title.textContent = "Your file is ready";

  const name = document.createElement("div");
  name.className = "dl-name";
  name.textContent = fileName;

  // Fresh tap = fresh permission, so the share sheet works here even if it did not earlier
  let shareBtn = null;
  try {
    const f = new File([blob], fileName, { type: mimeType || blob.type });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [f] })) {
      shareBtn = document.createElement("button");
      shareBtn.type = "button";
      shareBtn.className = "dl-link dl-share";
      shareBtn.textContent = "Save / Share file";
      shareBtn.addEventListener("click", async function () {
        try {
          await navigator.share({ files: [f], title: fileName });
          dismiss();
        } catch (e) {
          if (!e || e.name !== "AbortError") console.warn("Share failed:", e);
        }
      });
    }
  } catch (e) { /* share not supported */ }

  const link = document.createElement("a");
  link.className = "dl-link";
  link.href = url;
  link.download = fileName;
  const onIOS = isIOSDevice();
  if (!onIOS) {                       // iPhone/iPad: a new tab opens empty, so open the file in this tab
    link.target = "_blank";
    link.rel = "noopener";
  }
  link.textContent = onIOS ? "Download file" : "Open in browser";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "dl-close";
  close.textContent = "Close";

  function dismiss() {
    wrap.remove();
    // iPhone/iPad read the file after the tap, so keep it available for a minute
    setTimeout(function () { URL.revokeObjectURL(url); }, isIOSDevice() ? 60000 : 1000);
  }
  close.addEventListener("click", dismiss);
  link.addEventListener("click", function () { setTimeout(dismiss, 1500); });

  box.appendChild(title);
  box.appendChild(name);
  if (shareBtn) box.appendChild(shareBtn);
  box.appendChild(link);
  if (onIOS) {
    const hint = document.createElement("div");
    hint.className = "dl-name";
    hint.textContent = "iPhone: when the file opens, tap Share, then \u201cSave to Files\u201d \u2192 On My iPhone \u2192 Save.";
    box.appendChild(hint);
  }
  box.appendChild(close);
  wrap.appendChild(box);
  document.body.appendChild(wrap);
}

/* ---------------------------------------------------------------
   FILE STORE (same method as the reference code)
   In the Zoho Creator mobile app, browser downloads are blocked, so the file is
   uploaded into the Export_PDF / Export_Excel file field of ONE fixed record per
   doctor (the doctor's oldest claim). Only that file field is written; no new
   records are created. The doctor then taps a button that opens the stored file
   outside the widget, and the phone downloads it.
   --------------------------------------------------------------- */
const FILE_STORE = {
  /* Reports tried in this order for the upload. Both must show the Add_Claim form's records.
     If the first one returns a permission error (code 3830), the next one is tried. */
  UPLOAD_REPORTS: ["Doctors_Claim_Report"],
  UPLOAD_REPORT: "Doctors_Claim_Report",            // set to the report that worked (used for read-back / open report)
  PDF_FIELD:     "Export_PDF_1",
  EXCEL_FIELD:   "Export_Excel1",
  BASE_URL:      "https://creatorapp.zoho.com.au"   // used only if the Creator origin cannot be detected
};

function withTimeout(p, ms, msg) {
  return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error(msg)); }, ms); })]);
}

/* true on iPhone / iPad (iPadOS reports a Mac with a touch screen) */
function isIOSDevice() {
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
}

/* true when running inside the Zoho Creator mobile app (Android WebView / iOS in-app view) */
function isCreatorApp() {
  const ua = navigator.userAgent || "";
  if (/; wv\)/.test(ua)) return true;                                   // Android WebView
  if (/ZohoCreator|ZCreator/i.test(ua)) return true;
  if (/iPhone|iPad|iPod/i.test(ua) && !/Safari/i.test(ua)) return true; // iOS in-app view
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1 && !/Safari/i.test(ua)) return true; // iPadOS app
  return false;
}

/* One fixed record per doctor holds the files: the doctor's claim with the smallest ID.
   Always the same record, so nothing new is created. */
function getFileRecord() {
  const recs = (ALL_CLAIMS || []).filter(function (c) { return c.ID && /^\d+$/.test(String(c.ID)); });
  if (!recs.length) return null;
  recs.sort(function (a, b) {
    const x = String(a.ID), y = String(b.ID);
    return x.length - y.length || (x < y ? -1 : x > y ? 1 : 0);
  });
  return recs[0];
}

/* Turns whatever the SDK rejects with (object, JSON text, Error, nested object) into { code, message } */
function normalizeZohoError(e) {
  if (!e) return { message: "Unknown error" };
  if (e instanceof Error) return { message: e.message };
  if (typeof e === "string") {
    try { return normalizeZohoError(JSON.parse(e)); } catch (x) { return { message: e }; }
  }
  if (typeof e === "object") {
    if (e.responseText) {
      try { return normalizeZohoError(JSON.parse(e.responseText)); } catch (x) { return { message: String(e.responseText) }; }
    }
    if (e.code !== undefined) return e;
    if (e.error) return normalizeZohoError(e.error);
    if (e.data && typeof e.data === "object") return normalizeZohoError(e.data);
    let txt = "";
    try { txt = JSON.stringify(e); } catch (x) { txt = String(e); }
    return { message: txt };
  }
  return { message: String(e) };
}

/* Readable explanation of an upload error */
function describeZohoError(r, fieldName, report) {
  r = r || {};
  const code = r.code;
  const msg  = String(r.message || r.description || "").replace("%s", fieldName);
  if (code === 3830) {
    return "No permission to upload into '" + fieldName + "' through this report (code 3830). " +
           "Add '" + fieldName + "' to the report '" + report + "' (column list + Detail View) and make it " +
           "editable for the doctor's permission set.";
  }
  if (code === 2945 || code === 2933 || /not found|does not exist|no such/i.test(msg)) {
    return "Report not found or not accessible for this user (" + (code || "") + "). " + msg;
  }
  if (code === 2930 || /permission|not authori[sz]ed|access/i.test(msg)) {
    return "No permission for this report (" + (code || "") + "). " + msg;
  }
  return (code ? "Code " + code + ": " : "") + (msg || "Upload failed");
}

/* Upload the file into Export_PDF / Export_Excel of the fixed record */
async function uploadToCreator(blob, fileName, mimeType) {
  if (typeof ZOHO === "undefined" || !ZOHO.CREATOR || !ZOHO.CREATOR.FILE || !ZOHO.CREATOR.FILE.uploadFile) {
    throw new Error("File upload API is not available in this widget SDK.");
  }
  const rec = getFileRecord();
  if (!rec) throw new Error("No claim record found to store the file. At least one claim is needed.");

  let appName = "";
  try {
    const p = await withTimeout(ZOHO.CREATOR.UTIL.getInitParams(), 4000, "init params timeout");
    appName = (p && p.appLinkName) || "";
  } catch (e) { /* use current app */ }

  const fieldName = /pdf/i.test(mimeType) ? FILE_STORE.PDF_FIELD : FILE_STORE.EXCEL_FIELD;
  const reports = (FILE_STORE.UPLOAD_REPORTS && FILE_STORE.UPLOAD_REPORTS.length)
    ? FILE_STORE.UPLOAD_REPORTS : [FILE_STORE.UPLOAD_REPORT];

  const errors = [];
  for (let i = 0; i < reports.length; i++) {
    const cfg = {
      report_name: reports[i],
      id:          String(rec.ID),
      field_name:  fieldName,
      file:        new File([blob], fileName, { type: mimeType })
    };
    if (appName) cfg.app_name = appName;

    let resp;
    try {
      resp = await withTimeout(ZOHO.CREATOR.FILE.uploadFile(cfg), 60000, "File upload timed out.");
    } catch (e) {
      resp = normalizeZohoError(e);
    }

    if (resp && resp.code === 3000) {
      FILE_STORE.UPLOAD_REPORT = reports[i];          // remember the report that accepted the file
      return { recId: String(rec.ID), recNo: rec.Claim_ID || "", fieldName: fieldName, appName: appName };
    }

    console.warn("Upload via " + reports[i] + " failed:", resp);
    let why = describeZohoError(resp, fieldName, reports[i]);
    // Records were loaded from this report with field_config "all": if the file field is not
    // among their keys, the field has not been added to the report itself.
    if (resp && resp.code === 3830 && !Object.prototype.hasOwnProperty.call(rec, fieldName)) {
      why = "Creator blocked the upload (code 3830) and did not return the field '" + fieldName +
            "' for this user. Check: (1) '" + fieldName + "' is in the report '" + reports[i] + "' and the report is saved; " +
            "(2) in the doctor's permission set, Add Claim > More > Field Access, '" + fieldName + "' is visible and editable. " +
            "(Fields returned: " + Object.keys(rec).join(", ") + ")";
    }
    errors.push(reports[i] + ": " + why);
  }

  throw new Error(errors.join("\n\n"));
}

/* Read the record back and build the download URL of the uploaded file */
async function getStoredFileUrl(recId, fieldName, appName) {
  let resp;
  try {
    const cfg = { report_name: FILE_STORE.UPLOAD_REPORT, id: String(recId) };
    if (appName) cfg.app_name = appName;
    resp = await withTimeout(ZOHO.CREATOR.DATA.getRecordById(cfg), 20000, "timeout");
  } catch (e) { console.warn("getRecordById failed", e); return ""; }

  const rec = resp && resp.data;
  if (!rec) return "";
  let v = rec[fieldName];
  if (v && typeof v === "object") v = v.url || v.value || v.display_value || v.download_url || "";
  v = String(v || "").trim();
  if (!v) return "";
  v = toWebFileUrl(v);
  if (/^https?:\/\//i.test(v)) return v;

  let origin = "";
  try { origin = document.referrer ? new URL(document.referrer).origin : ""; } catch (e) {}
  if (!origin) origin = FILE_STORE.BASE_URL;
  return origin + (v.charAt(0) === "/" ? "" : "/") + v;
}

/* The record API returns the file as an API link
     /api/v2/<owner>/<app>/report/<report>/<id>/<field>/download?filepath=<name>
   Opened from the Zoho app on iPhone, that link has no sign-in and no file name, so iOS saves a
   blank file named with a random ID (black screen). Creator's normal file link uses the app's own
   sign-in and keeps the real name (.pdf / .xlsx):
     /file/<owner>/<app>/<report>/<id>/<field>/download?filepath=/<name> */
function toWebFileUrl(v) {
  const m = /^(https?:\/\/[^\/]+)?\/(?:api|creator)\/v2(?:\.1)?\/([^\/]+)\/([^\/]+)\/report\/([^\/]+)\/([^\/]+)\/([^\/]+)\/download\?(.*)$/i.exec(v);
  if (!m) return v;
  const q = m[7].replace(/(^|&)filepath=(?!%2F|\/)/i, "$1filepath=/");
  const host = (m[1] && !/zohoapis/i.test(m[1])) ? m[1] : "";   // API host -> use the Creator site instead
  return host + "/file/" + m[2] + "/" + m[3] + "/" + m[4] + "/" + m[5] + "/" + m[6] + "/download?" + q;
}

/* Open the stored file outside the widget -> phone download manager saves it */
function openFileUrl(url) {
  try {
    ZOHO.CREATOR.UTIL.navigateParentURL({ action: "open", url: url, window: "new" });
  } catch (e) { safeAlert("Could not open the file: " + (e && e.message ? e.message : e)); }
}

/* Fallback: open the report that holds the file */
function openFileReport() {
  try {
    ZOHO.CREATOR.UTIL.navigateParentURL({ action: "open", url: "#Report:" + FILE_STORE.UPLOAD_REPORT, window: "same" });
  } catch (e) { safeAlert("Could not open the report: " + (e && e.message ? e.message : e)); }
}

/* Status panel: progress, error and success states */
function openReadyPanel() {
  const old = document.getElementById("dl-overlay");
  if (old) old.remove();

  const wrap = document.createElement("div");
  wrap.id = "dl-overlay";
  wrap.className = "dl-overlay";
  const box = document.createElement("div");
  box.className = "dl-box";
  wrap.appendChild(box);
  document.body.appendChild(wrap);

  function mkText(cls, text) {
    const d = document.createElement("div");
    d.className = cls;
    d.textContent = text;
    return d;
  }
  function mkClose(label) {
    const c = document.createElement("button");
    c.type = "button";
    c.className = "dl-close";
    c.textContent = label || "Close";
    c.addEventListener("click", function () { wrap.remove(); });
    return c;
  }

  return {
    wrap: wrap,
    box: box,
    close: function () { wrap.remove(); },

    setBusy: function (msg) {
      box.innerHTML = "";
      box.appendChild(mkText("dl-title", msg));
      box.appendChild(mkText("dl-name", "Please wait, do not close this page."));
    },

    setError: function (msg) {
      box.innerHTML = "";
      box.appendChild(mkText("dl-title", "Could not prepare the file"));
      const em = mkText("dl-name", msg || "Please try again."); em.style.whiteSpace = "pre-line"; em.style.wordBreak = "break-word"; box.appendChild(em);
      box.appendChild(mkClose("Close"));
    },

    /* Creator mobile app: the panel shows the Download button and a Cancel button */
    setCreatorFile: function (fileName, fileUrl, recNo, fieldName) {
      box.innerHTML = "";

      // Tap on the dark area outside the box closes the panel (replaces the old Close button)
      wrap.addEventListener("click", function (e) {
        if (e.target === wrap) wrap.remove();
      });

      if (fileUrl) {
        const dl = document.createElement("button");
        dl.type = "button";
        dl.className = "dl-link dl-share";
        dl.textContent = /pdf/i.test(fileName) ? "Download PDF file" : "Download Excel file";
        dl.addEventListener("click", function () {
          openFileUrl(fileUrl);
          setTimeout(function () { wrap.remove(); }, 800);   // close the panel after the download opens
        });
        box.appendChild(dl);
        box.appendChild(mkClose("Cancel"));   // Cancel button closes the panel
        return;
      }

      /* Safety fallback: only if the file link could not be built, show the help text
         so the doctor is never left with an empty panel. */
      box.appendChild(mkText("dl-title", "Your file is ready"));
      box.appendChild(mkText("dl-name", fileName));
      const fieldLabel = String(fieldName || "").replace(/_/g, " ");
      const which = recNo ? "claim " + recNo : "your oldest claim";
      const help = document.createElement("div");
      help.className = "dl-name";
      help.appendChild(document.createTextNode("Open the report, open " + which + " and tap the " + fieldLabel + " file. "));
      const rep = document.createElement("a");
      rep.href = "#";
      rep.textContent = "Open the report";
      rep.style.fontWeight = "700";
      rep.addEventListener("click", function (e) { e.preventDefault(); openFileReport(); });
      help.appendChild(rep);
      box.appendChild(help);
      box.appendChild(mkClose("Close"));
    }
  };
}

/* Same flow as the reference saveFile():
   - Laptop / desktop: normal download (saveFn = doc.save / XLSX.writeFile)
   - Zoho Creator mobile app: upload to the fixed record -> "Download" button opens the stored file
   - Phone browser: share sheet, else tap-to-download panel */
function deliverFile(blob, fileName, mimeType, saveFn) {

  // 1) Desktop: normal browser download
  if (!isMobileDevice()) {
    try { saveFn(); }
    catch (e) {
      console.error("Direct save failed:", e);
      try { triggerAnchorDownload(blob, fileName); } catch (e2) { console.error(e2); }
    }
    return;
  }

  // 2) Zoho Creator mobile app: downloads are blocked, so store the file in Creator
  if (isCreatorApp()) {
    const panel = openReadyPanel();
    panel.setBusy("Preparing your file...");
    showLoader();
    uploadToCreator(blob, fileName, mimeType)
      .then(function (info) {
        return getStoredFileUrl(info.recId, info.fieldName, info.appName).then(function (url) {
          console.log("Stored file URL:", url);
          panel.setCreatorFile(fileName, url, info.recNo, info.fieldName);
        });
      })
      .catch(function (e) {
        console.error("Upload failed:", e);
        panel.setError((e && e.message) ? e.message : String(e));
      })
      .finally(function () { hideLoader(); });
    return;
  }

  // 3) Phone browser (Chrome / Safari): share sheet, else tap-to-download panel
  try {
    const f = new File([blob], fileName, { type: mimeType || blob.type });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [f] })) {
      navigator.share({ files: [f], title: fileName }).catch(function (e) {
        if (e && e.name === "AbortError") return;
        showDownloadFallback(blob, fileName, mimeType);
      });
      return;
    }
  } catch (e) { /* share not supported */ }
  showDownloadFallback(blob, fileName, mimeType);
}

function saveWorkbook(workbook, fileName) {
  try {
    const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const out  = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], { type: mime });
    deliverFile(blob, fileName, mime, function () { XLSX.writeFile(workbook, fileName); });
  } catch (e) {
    console.error("Excel save failed:", e);
    safeAlert("Excel export failed: " + (e && e.message ? e.message : e));
  }
}

function savePdf(doc, fileName) {
  try {
    const blob = doc.output("blob");
    deliverFile(blob, fileName, "application/pdf", function () { doc.save(fileName); });
  } catch (e) {
    console.error("PDF save failed:", e);
    safeAlert("PDF export failed: " + (e && e.message ? e.message : e));
  }
}

function exportExcel() {
  try {
    if (typeof XLSX === "undefined" || !XLSX.utils) {
      safeAlert("Excel library failed to load. Please refresh the page and try again.");
      return;
    }
    exportExcelCore();
  } catch (err) {
    console.error("❌ Excel export error:", err);
    safeAlert("Excel export failed: " + (err && err.message ? err.message : err));
  }
}

function exportExcelCore() {
  const groups = getExportGroups();
  if (!groups.length) { safeAlert("No data to export."); return; }

  const info = getActiveFilterInfo();
  const aoa = [];

  aoa.push(["Claims Status Report"]);
  aoa.push([`Doctor: ${info.doctor || "All"}`]);
  aoa.push([`Hospital: ${info.hospital || "All"}`]);
  aoa.push([`Date Range: ${formatDateRange(info.dateFrom, info.dateTo)}`]);
  aoa.push([`Generated On: ${new Date().toLocaleString("en-AU", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true
  })}`]);
  aoa.push([]);

  const HEADER_ROW = aoa.length;
  aoa.push(["Claim #", "Claim Date", "Doctor", "Hospital", "Patient", "Payer",
            "Total Claim Amount", "Date of Service", "Item Number", "Item Amount", "Status"]);

  const DATA_START_ROW = aoa.length;

  const CLAIM_COL_COUNT = 7;
  const mergeRanges = [];
  groups.forEach(g => {
    const groupStartRow = aoa.length;
    g.itemRows.forEach((itemRow, idx) => {
      const row = idx === 0 ? g.claimFields.slice() : new Array(CLAIM_COL_COUNT).fill("");
      aoa.push(row.concat(itemRow));
    });
    const groupEndRow = aoa.length - 1;
    if (g.itemRows.length > 1) mergeRanges.push({ start: groupStartRow, end: groupEndRow });
  });
  const DATA_END_ROW = aoa.length - 1;

  const s = computeSummary(FILTERED_DATA, CURRENT_STATUS_FILTER);
  const summaryStartRow = aoa.length + 1;

  aoa.push([]);
  aoa.push(["GRAND SUMMARY"]);
  aoa.push(["Total Claims", s.totalClaims]);
  aoa.push(["Total Claim Amount", s.totalClaimAmount]);
  aoa.push(["Total Line Items", s.totalLineItems]);
  aoa.push(["Total Item Amount", s.totalItemAmount]);
  aoa.push([]);
  aoa.push(["Status", "Item Count", "Amount"]);
  Object.entries(s.statusTotals).forEach(([status, v]) => {
    aoa.push([status, v.count, v.amount]);
  });

  var worksheet = XLSX.utils.aoa_to_sheet(aoa);

  worksheet["!merges"] = worksheet["!merges"] || [];
  worksheet["!merges"].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } });

  mergeRanges.forEach(range => {
    for (let c = 0; c < CLAIM_COL_COUNT; c++) {
      worksheet["!merges"].push({ s: { r: range.start, c }, e: { r: range.end, c } });
    }
  });

  worksheet["!cols"] = [
    { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 16 },
    { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }
  ];

  function setStyle(row, col, style) {
    const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
    if (!worksheet[cellRef]) worksheet[cellRef] = { v: "" };
    worksheet[cellRef].s = style;
  }

  const headerStyle = {
    font: { bold: true, sz: 10, color: { rgb: XLSX_BRAND.white } },
    fill: { fgColor: { rgb: XLSX_BRAND.green } },
    alignment: { horizontal: "center", vertical: "center" },
    border: {
      top: { style: "thin", color: { rgb: XLSX_BRAND.lightGrey } },
      bottom: { style: "thin", color: { rgb: XLSX_BRAND.lightGrey } },
      left: { style: "thin", color: { rgb: XLSX_BRAND.lightGrey } },
      right: { style: "thin", color: { rgb: XLSX_BRAND.lightGrey } }
    }
  };

  const dataCellStyle = {
    font: { sz: 9, color: { rgb: XLSX_BRAND.navyText } },
    border: {
      top: { style: "thin", color: { rgb: XLSX_BRAND.lightGrey } },
      bottom: { style: "thin", color: { rgb: XLSX_BRAND.lightGrey } },
      left: { style: "thin", color: { rgb: XLSX_BRAND.lightGrey } },
      right: { style: "thin", color: { rgb: XLSX_BRAND.lightGrey } }
    }
  };

  const amountCellStyle = {
    ...dataCellStyle,
    alignment: { horizontal: "right" },
    numFmt: "$ #,##0.00"
  };

  const countCellStyle = {
    ...dataCellStyle,
    alignment: { horizontal: "right" },
    numFmt: "#,##0"
  };

  setStyle(0, 0, {
    font: { bold: true, sz: 14, color: { rgb: XLSX_BRAND.navy } },
    alignment: { horizontal: "center" }
  });

  for (let r = 1; r <= 4; r++) {
    setStyle(r, 0, { font: { sz: 9, italic: true, color: { rgb: XLSX_BRAND.navyText } } });
  }

  for (let c = 0; c <= 10; c++) {
    setStyle(HEADER_ROW, c, headerStyle);
  }

  for (let r = DATA_START_ROW; r <= DATA_END_ROW; r++) {
    for (let c = 0; c <= 10; c++) {
      setStyle(r, c, (c === 6 || c === 9) ? amountCellStyle : dataCellStyle);
    }
  }

  setStyle(summaryStartRow, 0, { font: { bold: true, sz: 12, color: { rgb: XLSX_BRAND.navy } } });

  for (let r = summaryStartRow + 1; r <= summaryStartRow + 4; r++) {
    setStyle(r, 0, { font: { bold: true, sz: 10, color: { rgb: XLSX_BRAND.navyText } } });
    setStyle(r, 1, {
      font: { sz: 10, color: { rgb: XLSX_BRAND.navyText } },
      alignment: { horizontal: "right" },
      numFmt: (r === summaryStartRow + 2 || r === summaryStartRow + 4) ? "$ #,##0.00" : "#,##0"
    });
  }

  const statusHeaderRow = summaryStartRow + 6;
  for (let c = 0; c < 3; c++) {
    setStyle(statusHeaderRow, c, headerStyle);
  }
  Object.keys(s.statusTotals).forEach((status, i) => {
    const r = statusHeaderRow + 1 + i;
    setStyle(r, 0, dataCellStyle);
    setStyle(r, 1, countCellStyle);
    setStyle(r, 2, amountCellStyle);
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Claims Report");

  const fileName = `Billing_Status_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;
  saveWorkbook(workbook, fileName);
}

function getFilterDisplayLabel(id, fallback) {
  const wrapper = document.getElementById(id);
  if (!wrapper) return fallback;
  const valueSpan = wrapper.querySelector(".ss-value");
  const text = valueSpan ? valueSpan.textContent.trim() : "";
  return (text && text !== fallback) ? text : fallback;
}

function getActiveFilterInfo() {
  return {
    doctor:   CURRENT_DOCTOR_NAME || "-",
    hospital: getFilterDisplayLabel("f-location", "All Locations"),
    payer:    getFilterDisplayLabel("f-payer",    "All Payers"),
    status:   getFilterDisplayLabel("f-status",   "All Status"),
    patient:  getFilterDisplayLabel("f-patient",  "All Patients"),
    dateFrom: (document.getElementById("f-from") || {}).value || "",
    dateTo:   (document.getElementById("f-to")   || {}).value || ""
  };
}

function formatDateRange(from, to) {
  const pretty = (iso) => {
    const d = new Date(iso + "T00:00:00");
    return isNaN(d) ? iso : d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
  };
  if (from && to) return `${pretty(from)} – ${pretty(to)}`;
  if (from) return `From ${pretty(from)}`;
  if (to) return `Up to ${pretty(to)}`;
  return "All Dates";
}

function exportPDF() {
  try {
    if (typeof jspdf === "undefined" || !jspdf.jsPDF) {
      safeAlert("PDF library failed to load. Please refresh the page and try again.");
      return;
    }
    exportPDFCore();
  } catch (err) {
    console.error("❌ PDF export error:", err);
    safeAlert("PDF export failed: " + (err && err.message ? err.message : err));
  }
}

function exportPDFCore() {
  const groups = getExportGroups();
  if (!groups.length) { safeAlert("No data to export."); return; }

  const info = getActiveFilterInfo();
  const doc = new jspdf.jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const HEADER_HEIGHT = 168;
  const FOOTER_RESERVE = 110;

  const headerInfo = {
    hospital: info.hospital,
    doctor: info.doctor,
    patient: info.patient,
    date: formatDateRange(info.dateFrom, info.dateTo),
    generatedOn: new Date().toLocaleString("en-AU", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "numeric", minute: "2-digit", hour12: true
    })
  };

  // Draw the header only once per page
  const headerDone = new Set();
  const ensureHeader = () => {
    const p = doc.internal.getCurrentPageInfo().pageNumber;
    if (!headerDone.has(p)) {
      drawHeader(doc, pageW, margin, headerInfo);
      headerDone.add(p);
    }
  };

  // ---- Main claims table ----
  const clean = v => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v);
  const body = [];
  const rowGroup = [];   // group index per body row (for alternate shading)

  /* ===== CHANGE 2: no rowSpan in the PDF table =====
     rowSpan groups cannot be split across pages by jspdf-autotable, so a claim with several
     line items was pushed whole to the next page, leaving big blank areas.
     Now every line item is its own normal row, so rows flow page to page with no gaps.
     The claim cells are filled only on the first row of each claim, and their inner borders
     are hidden so the claim columns still look merged. */
  groups.forEach((g, gi) => {
    const count = g.itemRows.length;
    g.itemRows.forEach((itemRow, idx) => {
      const row = [];
      const isFirst = idx === 0;
      const isLast  = idx === count - 1;
      const claimBorder = { top: isFirst ? 0.5 : 0, bottom: isLast ? 0.5 : 0, left: 0.5, right: 0.5 };
      g.claimFields.forEach((val, i) => {
        row.push({
          content: isFirst ? (i === 6 ? fmtAmt(val) : clean(val)) : "",
          styles: { valign: "middle", halign: i === 6 ? "right" : "left", lineWidth: claimBorder }
        });
      });
      itemRow.forEach((v, i) => {
        row.push({
          content: i === 2 ? fmtAmt(v) : clean(v),
          styles: { valign: "middle", halign: i === 2 ? "right" : "left" }
        });
      });
      body.push(row);
      rowGroup.push(gi);
    });
  });
  /* ===== END CHANGE 2 ===== */

  doc.autoTable({
    startY: HEADER_HEIGHT,
    theme: "grid",
    margin: { top: HEADER_HEIGHT, left: margin, right: margin, bottom: FOOTER_RESERVE },
    head: [["Claim #", "Claim Date", "Doctor", "Hospital", "Patient", "Payer",
        "Total Claim Amount", "Date of Service", "Item Number", "Item Amount", "Status"]],
    body,
    styles: {
      fontSize: 7.5, textColor: BRAND.navyText, lineColor: BRAND.lightGrey,
      lineWidth: 0.5, cellPadding: { top: 5, right: 6, bottom: 5, left: 6 },
      overflow: "linebreak", valign: "middle", halign: "left"
    },
    headStyles: {
      fillColor: BRAND.navy, textColor: BRAND.white, fontStyle: "bold", fontSize: 7.5,
      cellPadding: { top: 6, right: 6, bottom: 6, left: 6 }, valign: "middle"
    },
    columnStyles: {
      0: { cellWidth: 55 },  1: { cellWidth: 62 },  2: { cellWidth: 80 },
      3: { cellWidth: 95 },  4: { cellWidth: 80 },  5: { cellWidth: 70 },
      6: { cellWidth: 72, halign: "right" },
      7: { cellWidth: 62 },  8: { cellWidth: 58 },
      9: { cellWidth: 62, halign: "right" },
      10: { cellWidth: 66 }
    },
    didParseCell: function (data) {
      // Header: amount columns right-aligned to match their values
      if (data.section === "head") {
        data.cell.styles.halign = (data.column.index === 6 || data.column.index === 9) ? "right" : "left";
      }
      // Body: subtle alternate shading per claim group
      if (data.section === "body" && rowGroup[data.row.index] % 2 === 1) {
        data.cell.styles.fillColor = BRAND.rowAlt;
      }
    },
    didDrawPage: ensureHeader
  });

  // ---- Summary section (side by side) ----
  const s = computeSummary(FILTERED_DATA, CURRENT_STATUS_FILTER);
  const statusRows = Object.entries(s.statusTotals).map(([status, v]) => [
    status, String(v.count), "$ " + v.amount.toFixed(2)
  ]);

  let y = doc.lastAutoTable.finalY + 24;
  if (y + 130 > pageH - FOOTER_RESERVE) {
    doc.addPage();
    ensureHeader();
    y = HEADER_HEIGHT;
  }

  const colGap = 30;
  const colW = (pageW - margin * 2 - colGap) / 2;
  const rightX = margin + colW + colGap;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.navy);
  doc.text("Grand Summary", margin, y);
  doc.text("Status Breakdown", rightX, y);

  // Grand Summary: green background
  doc.autoTable({
    startY: y + 8,
    margin: { top: HEADER_HEIGHT, left: margin, right: pageW - margin - colW, bottom: FOOTER_RESERVE },
    tableWidth: colW,
    body: [
      ["Total Claims", String(s.totalClaims)],
      ["Total Claim Amount", "$ " + s.totalClaimAmount.toFixed(2)],
      ["Total Line Items", String(s.totalLineItems)],
      ["Total Item Amount", "$ " + s.totalItemAmount.toFixed(2)]
    ],
    theme: "plain",
    styles: {
      fontSize: 9, cellPadding: 6,
      fillColor: ICON_COLOR,
      textColor: BRAND.white,
      lineColor: [255, 255, 255], lineWidth: 0.5
    },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 170 }, 1: { halign: "right", fontStyle: "bold" } },
    didDrawPage: ensureHeader
  });
  const leftEndY = doc.lastAutoTable.finalY;

  // Status Breakdown
  doc.autoTable({
    startY: y + 8,
    margin: { top: HEADER_HEIGHT, left: rightX, right: margin, bottom: FOOTER_RESERVE },
    tableWidth: colW,
    head: [["Status", "Item Count", "Amount"]],
    body: statusRows,
    styles: { fontSize: 8.5, textColor: BRAND.navyText, lineColor: BRAND.lightGrey, lineWidth: 0.5, cellPadding: 5 },
    headStyles: { fillColor: BRAND.navy, textColor: BRAND.white, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 120 }, 1: { halign: "right" }, 2: { halign: "right" } },
    didDrawPage: ensureHeader
  });

  // ---- Footers last, so page numbers are correct ----
  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    drawFooter(doc, pageW, margin, p, pageCount);
  }

  savePdf(doc, `Billing_Status_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
}

function drawHeader(doc, pageW, margin, info) {
  const logoW = 150, logoH = 55.5;
  // Only draw the logo if a real base64 image is present (a placeholder would crash jsPDF)
  if (typeof MEDI_ELVES_LOGO_BASE64 === "string" && /^data:image\/(png|jpe?g);base64,/i.test(MEDI_ELVES_LOGO_BASE64)) {
    try {
      const fmt = /png/i.test(MEDI_ELVES_LOGO_BASE64.slice(0, 20)) ? "PNG" : "JPEG";
      let drawW = logoW, drawH = logoH;
      try {
        const p = doc.getImageProperties(MEDI_ELVES_LOGO_BASE64);
        if (p && p.width && p.height) {
          drawH = 62;                       // fixed height, width follows the real ratio
          drawW = drawH * (p.width / p.height);
          if (drawW > 190) { drawW = 190; drawH = drawW * (p.height / p.width); }
        }
      } catch (e2) { /* keep default size */ }
      doc.addImage(MEDI_ELVES_LOGO_BASE64, fmt, margin, 24 + (62 - drawH) / 2, drawW, drawH);
    } catch (e) {
      console.warn("Logo could not be added to PDF:", e);
      drawLogoTextFallback(doc, margin);
    }
  } else {
    drawLogoTextFallback(doc, margin);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...BRAND.navy);
  doc.text("Claims Status Report", pageW - margin, 52, { align: "right" });

  const sepY = 96;
  doc.setFillColor(...ICON_COLOR);
  doc.circle(margin + 3, sepY, 2.2, "F");
  doc.setDrawColor(...BRAND.lightGrey);
  doc.setLineWidth(1);
  doc.line(margin + 12, sepY, pageW - margin, sepY);

  const items = [
    { icon: "person",   label: "DOCTOR",        value: info.doctor },
    { icon: "hospital", label: "HOSPITAL",      value: info.hospital },
    { icon: "person",   label: "PATIENT",       value: info.patient || "All Patients" },
    { icon: "calendar", label: "REPORT PERIOD", value: info.date },
    { icon: "clock",    label: "GENERATED ON",  value: info.generatedOn }
  ];

  const labelY   = sepY + 30;
  const iconSize = 15;
  const textGap  = 8;
  const colGap   = 14;
  const colW     = (pageW - margin * 2) / items.length;
  const valueLineHeight = 11;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const wrapped = items.map((item, i) => {
    const textX = margin + colW * i + iconSize + textGap;
    const availableWidth = colW - iconSize - textGap - colGap;
    const lines = doc.splitTextToSize(String(item.value), Math.max(availableWidth, 40)).slice(0, 2);
    return { ...item, textX, lines };
  });

  wrapped.forEach((item) => {
    const valueBlockHeight = item.lines.length * valueLineHeight;
    const iconCenterY = labelY + 4 + (item.lines.length - 1) * valueLineHeight / 2;
    const iconX = item.textX - textGap - iconSize / 2;

    drawIcon(doc, item.icon, iconX, iconCenterY, ICON_COLOR);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.grey);
    doc.text(item.label, item.textX, labelY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.navyText);
    item.lines.forEach((line, li) => {
      doc.text(line, item.textX, labelY + 14 + li * valueLineHeight);
    });
  });
}

/* Text version of the logo, used only if the image could not be drawn */
function drawLogoTextFallback(doc, margin) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...ICON_COLOR);
  doc.text("Medi Elves", margin, 54);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.grey);
  doc.text("Keep it simple", margin, 68);
}

function drawFooter(doc, pageW, margin) {
  const pageH = doc.internal.pageSize.getHeight();
  const lineY = pageH - 100;

  doc.setDrawColor(...BRAND.lightGrey);
  doc.setLineWidth(1);
  doc.line(margin, lineY, pageW - margin, lineY);

  const textX  = margin + 18;
  const titleY = lineY + 16;

  drawIcon(doc, "lock", margin + 6, titleY - 4, ICON_COLOR);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.navyText);
  doc.text("CONFIDENTIAL – CONTAINS SENSITIVE HEALTH INFORMATION", textX, titleY);

  const pageCount = doc.internal.getNumberOfPages();
  const current    = doc.internal.getCurrentPageInfo().pageNumber;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.grey);
  doc.text(`Page ${current} of ${pageCount}`, pageW - margin, titleY, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...BRAND.grey);
  const notice =
    "This document contains confidential patient and claims information and is intended only for the named recipient and authorised " +
    "personnel. Unauthorised access, use, copying, forwarding or disclosure is prohibited. If you received this document in error, please " +
    "notify Medi Elves immediately, delete all electronic copies and securely destroy any printed copies.";
  const noticeLines = doc.splitTextToSize(notice, pageW - margin - textX);
  doc.text(noticeLines, textX, titleY + 12);

  const contactY    = titleY + 12 + noticeLines.length * 9 + 14;
  const contactColW = (pageW - margin * 2) / 3;

  drawIcon(doc, "phone", margin + 6, contactY, ICON_COLOR);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.navyText);
  doc.text("1800 956 692", margin + 18, contactY + 3);

  const emailX = margin + contactColW;
  drawIcon(doc, "mail", emailX + 6, contactY, ICON_COLOR);
  doc.text("admin@medielves.com.au", emailX + 18, contactY + 3);

  const webX = margin + contactColW * 2;
  drawIcon(doc, "globe", webX + 6, contactY, ICON_COLOR);
  doc.text("www.medielves.com.au", webX + 18, contactY + 3);
}

function drawIcon(doc, type, cx, cy, color) {
  doc.setDrawColor(...color);
  doc.setFillColor(...color);
  doc.setLineWidth(1);

  switch (type) {
    case "person":
      doc.circle(cx, cy - 4, 3, "S");
      doc.ellipse(cx, cy + 3, 5, 4, "S");
      break;
    case "hospital":
      doc.rect(cx - 5, cy - 5, 10, 10, "S");
      doc.line(cx, cy - 3, cx, cy + 3);
      doc.line(cx - 3, cy, cx + 3, cy);
      break;
    case "calendar":
      doc.roundedRect(cx - 6, cy - 5, 12, 10, 1.5, 1.5, "S");
      doc.line(cx - 6, cy - 2, cx + 6, cy - 2);
      doc.line(cx - 3, cy - 6.5, cx - 3, cy - 4);
      doc.line(cx + 3, cy - 6.5, cx + 3, cy - 4);
      break;
    case "clock":
      doc.circle(cx, cy, 6, "S");
      doc.line(cx, cy, cx, cy - 3.5);
      doc.line(cx, cy, cx + 3, cy);
      break;
    case "lock":
      doc.roundedRect(cx - 5, cy - 2, 10, 8, 1.5, 1.5, "S");
      doc.circle(cx, cy - 4, 3.5, "S");
      break;
    case "phone":
      doc.roundedRect(cx - 3, cy - 6, 6, 12, 1.5, 1.5, "S");
      break;
    case "mail":
      doc.rect(cx - 6, cy - 4, 12, 8, "S");
      doc.line(cx - 6, cy - 4, cx, cy);
      doc.line(cx + 6, cy - 4, cx, cy);
      break;
    case "globe":
      doc.circle(cx, cy, 6, "S");
      doc.ellipse(cx, cy, 3, 6, "S");
      doc.line(cx - 6, cy, cx + 6, cy);
      break;
    default:
      doc.circle(cx, cy, 4, "S");
  }
}