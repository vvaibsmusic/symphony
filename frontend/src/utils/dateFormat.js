/**
 * Format a date string as "11 Feb'26"
 * @param {string} dateStr - Date string (e.g. "2026-02-11", "2026-02-11T04:20:00")
 * @returns {string} Formatted date
 */
export function formatDate(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(dateStr.includes("T") || dateStr.includes(" ") ? dateStr : dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return dateStr; // fallback to raw string
    const day = d.getDate();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[d.getMonth()];
    const year = String(d.getFullYear()).slice(-2);
    return `${day} ${month}'${year}`;
}

/**
 * Format a datetime string as "11 Feb'26, 4:20 pm"
 * @param {string} dateStr - ISO datetime string (e.g. "2026-02-11T16:20:00")
 * @returns {string} Formatted datetime
 */
export function formatDateTime(dateStr) {
    if (!dateStr) return "—";
    // Handle SQLite format: "2026-02-22 06:37:42"
    let d;
    if (dateStr.endsWith("Z")) {
        d = new Date(dateStr);
    } else if (dateStr.includes("T")) {
        d = new Date(dateStr);
    } else {
        d = new Date(dateStr + "Z"); // assume UTC if no timezone
    }
    if (isNaN(d.getTime())) return dateStr;

    const day = d.getDate();
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[d.getMonth()];
    const year = String(d.getFullYear()).slice(-2);

    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12 || 12;

    return `${day} ${month}'${year}, ${hours}:${minutes} ${ampm}`;
}
