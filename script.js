"use strict";

const yearInput = document.querySelector("#year");
const stateInput = document.querySelector("#state");
const budgetInput = document.querySelector("#leave-budget");
const pairDaysInput = document.querySelector("#pair-days");
const calendar = document.querySelector("#calendar");
const status = document.querySelector("#calendar-status");
const summary = document.querySelector("#leave-summary");
const selectedDatesList = document.querySelector("#selected-dates");
const selectedRangesList = document.querySelector("#selected-ranges");
const selectionContent = document.querySelector("#selection-content");
const emptyState = document.querySelector("#empty-state");
const clearButton = document.querySelector("#clear-selection");
const themeToggle = document.querySelector("#theme-toggle");
yearInput.value = String(new Date().getFullYear() + 1);

function setTheme(theme) {
    const isDark = theme === "dark";
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    themeToggle.setAttribute("aria-pressed", String(isDark));
    themeToggle.textContent = isDark ? "Hellmodus aktivieren" : "Darkmode aktivieren";
    document.querySelector('meta[name="theme-color"]').content = isDark ? "#171d26" : "#f5f7fa";
}

let savedTheme = "light";
try {
    savedTheme = localStorage.getItem("vacation-planner-theme") === "dark" ? "dark" : "light";
} catch (error) {
    console.warn("Die gespeicherte Darstellungseinstellung ist nicht verfügbar.", error);
}
setTheme(savedTheme);

const monthNames = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember"
];
const weekdayNames = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const selectedDays = new Set();
let publicHolidays = new Map();
let schoolHolidays = new Map();
let holidaysRequestId = 0;

const dateKey = (year, month, day) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

function easterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month, day));
}

function offsetDate(date, days) {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
}

function addHoliday(holidays, year, month, day, name, states = null) {
    if (states && !states.includes(stateInput.value)) return;
    holidays.set(dateKey(year, month, day), name);
}

function getPublicHolidays(year) {
    const holidays = new Map();
    const easter = easterSunday(year);
    const addEasterOffset = (days, name) => {
        const date = offsetDate(easter, days);
        addHoliday(holidays, year, date.getUTCMonth(), date.getUTCDate(), name);
    };

    addHoliday(holidays, year, 0, 1, "Neujahr");
    addEasterOffset(-2, "Karfreitag");
    addEasterOffset(1, "Ostermontag");
    addHoliday(holidays, year, 4, 1, "Tag der Arbeit");
    addEasterOffset(39, "Christi Himmelfahrt");
    addEasterOffset(50, "Pfingstmontag");
    addHoliday(holidays, year, 9, 3, "Tag der Deutschen Einheit");
    addHoliday(holidays, year, 11, 25, "1. Weihnachtstag");
    addHoliday(holidays, year, 11, 26, "2. Weihnachtstag");

    addHoliday(holidays, year, 0, 6, "Heilige Drei Könige", ["BW", "BY", "ST"]);
    if (["BW", "BY", "HE", "NW", "RP", "SL"].includes(stateInput.value)) {
        addEasterOffset(60, "Fronleichnam");
    }
    addHoliday(holidays, year, 7, 15, "Mariä Himmelfahrt", ["BY", "SL"]);
    addHoliday(holidays, year, 9, 31, "Reformationstag", ["BB", "HB", "HH", "MV", "NI", "SN", "ST", "SH", "TH"]);
    addHoliday(holidays, year, 10, 1, "Allerheiligen", ["BW", "BY", "NW", "RP", "SL"]);

    if (stateInput.value === "SN") {
        const november23 = new Date(Date.UTC(year, 10, 23));
        const daysUntilWednesday = (november23.getUTCDay() + 4) % 7 || 7;
        const day = 23 - daysUntilWednesday;
        if (day >= 16) addHoliday(holidays, year, 10, day, "Buß- und Bettag");
    }

    if (stateInput.value === "BE") addHoliday(holidays, year, 2, 8, "Internationaler Frauentag");
    if (stateInput.value === "TH") addHoliday(holidays, year, 8, 20, "Weltkindertag");

    return holidays;
}

function getDateParts(dateString) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString);
    if (!match) return null;
    return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

function buildSchoolHolidayMap(payload, year) {
    if (!Array.isArray(payload)) throw new Error("Die Antwort für die Schulferien hat ein unerwartetes Format.");

    const holidayMap = new Map();
    for (const holiday of payload) {
        const start = getDateParts(holiday.startDate || holiday.start);
        const end = getDateParts(holiday.endDate || holiday.end);
        if (!start || !end) continue;
        const name = Array.isArray(holiday.name)
            ? holiday.name.find((entry) => entry.language === "DE")?.text || holiday.name[0]?.text
            : holiday.name;
        const startDate = new Date(Date.UTC(start.year, start.month, start.day));
        const endDate = new Date(Date.UTC(end.year, end.month, end.day));
        for (const date = startDate; date <= endDate; date.setUTCDate(date.getUTCDate() + 1)) {
            if (date.getUTCFullYear() !== year) continue;
            holidayMap.set(dateKey(year, date.getUTCMonth(), date.getUTCDate()), name || "Schulferien");
        }
    }
    return holidayMap;
}

async function loadSchoolHolidays(year, state) {
    const requestId = ++holidaysRequestId;
    const cacheKey = `school-holidays:${state}:${year}`;
    const cacheDuration = 7 * 24 * 60 * 60 * 1000;
    status.textContent = "Schulferien werden geladen …";
    try {
        let cached = null;
        try {
            cached = localStorage.getItem(cacheKey);
        } catch (error) {
            console.warn("Der lokale Ferien-Zwischenspeicher ist nicht verfügbar.", error);
        }
        if (cached) {
            try {
                const { savedAt, data } = JSON.parse(cached);
                if (Date.now() - savedAt < cacheDuration) {
                    schoolHolidays = buildSchoolHolidayMap(data, year);
                    status.textContent = "Schulferien aus dem lokalen Zwischenspeicher geladen.";
                    renderCalendar();
                    return;
                }
            } catch (error) {
                console.warn("Der gespeicherte Ferien-Zwischenspeicher ist ungültig und wird neu geladen.", error);
            }
        }

        const params = new URLSearchParams({
            countryIsoCode: "DE",
            subdivisionCode: `DE-${state}`,
            languageIsoCode: "DE",
            validFrom: `${year}-01-01`,
            validTo: `${year}-12-31`
        });
        const response = await fetch(`https://openholidaysapi.org/SchoolHolidays?${params}`);
        if (!response.ok) throw new Error(`Die Schulferien konnten nicht geladen werden (HTTP ${response.status}).`);
        const payload = await response.json();
        const result = buildSchoolHolidayMap(payload, year);
        if (requestId !== holidaysRequestId) return;
        schoolHolidays = result;
        try {
            localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), data: payload }));
        } catch (error) {
            console.warn("Die Schulferien konnten nicht lokal zwischengespeichert werden.", error);
        }
        status.textContent = "Schulferien geladen.";
        renderCalendar();
    } catch (error) {
        if (requestId !== holidaysRequestId) return;
        schoolHolidays = new Map();
        status.textContent = `${error.message} Prüfe die Internetverbindung; die übrigen Kalenderdaten bleiben verfügbar.`;
        renderCalendar();
    }
}

function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function weekdayIndex(year, month, day) {
    return (new Date(Date.UTC(year, month, day)).getUTCDay() + 6) % 7;
}

function makeDayButton(year, month, day) {
    const key = dateKey(year, month, day);
    const holidayName = publicHolidays.get(key);
    const schoolHolidayName = schoolHolidays.get(key);
    const weekend = weekdayIndex(year, month, day) >= 5;
    const selected = selectedDays.has(key);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day";
    button.textContent = String(day);
    button.dataset.date = key;
    button.setAttribute("aria-label", `${day}. ${monthNames[month]} ${year}${holidayName ? `, Feiertag: ${holidayName}` : ""}${schoolHolidayName ? `, ${schoolHolidayName}` : ""}${selected ? ", als Urlaub ausgewählt" : ""}`);

    if (weekend) button.classList.add("day--weekend");
    if (holidayName) button.classList.add("day--holiday");
    if (schoolHolidayName) button.classList.add("day--school");
    if (selected) button.classList.add("day--selected");
    if (holidayName || weekend) {
        button.disabled = true;
        button.title = holidayName ? `Feiertag: ${holidayName}` : "Wochenende";
    } else if (schoolHolidayName) {
        button.title = schoolHolidayName;
    }
    return button;
}

function renderCalendar() {
    const year = Number(yearInput.value);
    calendar.replaceChildren();
    for (let month = 0; month < 12; month += 1) {
        const card = document.createElement("article");
        card.className = "month-card";
        const heading = document.createElement("h2");
        heading.className = "month-title";
        heading.textContent = monthNames[month];
        card.append(heading);

        const grid = document.createElement("div");
        grid.className = "month-grid";
        grid.setAttribute("role", "grid");
        for (const weekday of weekdayNames) {
            const label = document.createElement("span");
            label.className = "weekday";
            label.setAttribute("role", "columnheader");
            label.textContent = weekday;
            grid.append(label);
        }
        const offset = weekdayIndex(year, month, 1);
        for (let blank = 0; blank < offset; blank += 1) {
            const spacer = document.createElement("span");
            spacer.className = "day-spacer";
            spacer.setAttribute("aria-hidden", "true");
            grid.append(spacer);
        }
        for (let day = 1; day <= daysInMonth(year, month); day += 1) {
            grid.append(makeDayButton(year, month, day));
        }
        card.append(grid);
        calendar.append(card);
    }
}

function readBudget() {
    const value = Number(budgetInput.value);
    return Number.isFinite(value) && value >= 0 ? value : 0;
}

function dayCost(key) {
    if (pairDaysInput.checked && (key.endsWith("-12-24") || key.endsWith("-12-31"))) return 0.5;
    return 1;
}

function usedLeave() {
    return [...selectedDays].reduce((total, key) => total + dayCost(key), 0);
}

function formatDate(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })
        .format(new Date(Date.UTC(year, month - 1, day)));
}

function formatLeaveCount(amount) {
    if (amount === 0.5) return "(½ Urlaubstag)";
    const formattedAmount = amount.toLocaleString("de-DE");
    return `(${formattedAmount} ${amount === 1 ? "Urlaubstag" : "Urlaubstage"})`;
}

function renderSelections() {
    const sortedDays = [...selectedDays].sort();
    selectedDatesList.replaceChildren();
    selectedRangesList.replaceChildren();
    emptyState.hidden = sortedDays.length > 0;
    selectionContent.hidden = sortedDays.length === 0;

    for (const key of sortedDays) {
        const item = document.createElement("li");
        item.textContent = `${formatDate(key)} ${formatLeaveCount(dayCost(key))}`;
        selectedDatesList.append(item);
    }

    const ranges = [];
    for (const key of sortedDays) {
        const [year, month, day] = key.split("-").map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        const previous = ranges[ranges.length - 1];
        const previousDate = previous ? new Date(`${previous.end}T00:00:00Z`) : null;
        let onlyNonWorkingDaysBetween = Boolean(previousDate);
        if (previousDate) {
            const between = new Date(previousDate);
            between.setUTCDate(between.getUTCDate() + 1);
            while (between < date) {
                const betweenKey = dateKey(between.getUTCFullYear(), between.getUTCMonth(), between.getUTCDate());
                const isWeekend = between.getUTCDay() === 0 || between.getUTCDay() === 6;
                if (!isWeekend && !publicHolidays.has(betweenKey)) onlyNonWorkingDaysBetween = false;
                between.setUTCDate(between.getUTCDate() + 1);
            }
        }
        if (onlyNonWorkingDaysBetween) {
            previous.end = key;
            previous.leaveDays += dayCost(key);
        } else {
            ranges.push({ start: key, end: key, leaveDays: dayCost(key) });
        }
    }

    for (const range of ranges) {
        const item = document.createElement("li");
        item.textContent = range.start === range.end
            ? `${formatDate(range.start)} ${formatLeaveCount(range.leaveDays)}`
            : `${formatDate(range.start)} – ${formatDate(range.end)} ${formatLeaveCount(range.leaveDays)}`;
        selectedRangesList.append(item);
    }

    const used = usedLeave();
    summary.textContent = `${used.toLocaleString("de-DE")} von ${readBudget().toLocaleString("de-DE")} Urlaubstagen verplant`;
}

function selectOrDeselect(key) {
    if (selectedDays.has(key)) {
        selectedDays.delete(key);
        if (pairDaysInput.checked && (key.endsWith("-12-24") || key.endsWith("-12-31"))) {
            const otherKey = key.endsWith("-12-24") ? `${key.slice(0, 4)}-12-31` : `${key.slice(0, 4)}-12-24`;
            selectedDays.delete(otherKey);
        }
        return;
    }

    const keysToAdd = [key];
    if (pairDaysInput.checked && (key.endsWith("-12-24") || key.endsWith("-12-31"))) {
        const otherKey = key.endsWith("-12-24") ? `${key.slice(0, 4)}-12-31` : `${key.slice(0, 4)}-12-24`;
        keysToAdd.push(otherKey);
    }
    const additionalCost = keysToAdd.reduce((total, candidate) =>
        total + (selectedDays.has(candidate) ? 0 : dayCost(candidate)), 0);
    if (usedLeave() + additionalCost > readBudget()) {
        status.textContent = "Dafür reicht dein verbleibendes Urlaubstage-Guthaben nicht aus.";
        return;
    }
    for (const candidate of keysToAdd) selectedDays.add(candidate);
}

function refreshCalendar() {
    const year = Number(yearInput.value);
    if (!Number.isInteger(year) || year < 1900 || year > 2100) {
        status.textContent = "Bitte gib ein Jahr zwischen 1900 und 2100 ein.";
        calendar.replaceChildren();
        return;
    }
    publicHolidays = getPublicHolidays(year);
    schoolHolidays = new Map();
    renderCalendar();
    renderSelections();
    loadSchoolHolidays(year, stateInput.value);
}

calendar.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-date]");
    if (!button || button.disabled) return;
    selectOrDeselect(button.dataset.date);
    renderCalendar();
    renderSelections();
});

yearInput.addEventListener("change", () => {
    selectedDays.clear();
    refreshCalendar();
});
stateInput.addEventListener("change", refreshCalendar);
budgetInput.addEventListener("input", () => {
    renderSelections();
});
pairDaysInput.addEventListener("change", () => {
    if (pairDaysInput.checked) {
        const keysToAdd = new Set();
        for (const key of selectedDays) {
            if (key.endsWith("-12-24")) keysToAdd.add(`${key.slice(0, 4)}-12-31`);
            if (key.endsWith("-12-31")) keysToAdd.add(`${key.slice(0, 4)}-12-24`);
        }
        for (const key of keysToAdd) selectedDays.add(key);
    }
    renderSelections();
    renderCalendar();
});
clearButton.addEventListener("click", () => {
    selectedDays.clear();
    renderCalendar();
    renderSelections();
});
themeToggle.addEventListener("click", () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(theme);
    try {
        localStorage.setItem("vacation-planner-theme", theme);
    } catch (error) {
        console.warn("Die Darstellungseinstellung konnte nicht gespeichert werden.", error);
    }
});

refreshCalendar();