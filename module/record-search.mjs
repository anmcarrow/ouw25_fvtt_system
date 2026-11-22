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
