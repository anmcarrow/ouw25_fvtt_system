export function matchesRecord(query, text) {
  const normalized = value => String(value ?? "").toLocaleLowerCase().trim();
  return normalized(text).includes(normalized(query));
}

export function filterRecordTable(container, query) {
  const rows = [...container.querySelectorAll("[data-record-row]")];
  let visible = 0;
  for (const row of rows) {
    const matches = matchesRecord(query, row.dataset.searchText);
    row.hidden = !matches;
    if (matches) visible++;
  }
  const noMatches = container.querySelector("[data-search-no-matches]");
  if (noMatches) noMatches.hidden = !query.trim() || !rows.length || visible > 0;
}

export function sortRecordTable(container, order) {
  const rows = [...container.querySelectorAll("[data-record-row]")];
  for (const [index, row] of rows.entries()) {
    if (row.dataset.sortOriginal === undefined) row.dataset.sortOriginal = String(index);
  }
  rows.sort((a, b) => {
    const original = Number(a.dataset.sortOriginal) - Number(b.dataset.sortOriginal);
    if (order === "name") return a.dataset.sortName.localeCompare(b.dataset.sortName, undefined, { sensitivity: "base", numeric: true }) || original;
    if (order === "number") return Number(b.dataset.sortNumber) - Number(a.dataset.sortNumber) || original;
    return original;
  });
  const marker = container.querySelector("[data-search-no-matches]");
  for (const row of rows) marker.parentNode.insertBefore(row, marker);
}
