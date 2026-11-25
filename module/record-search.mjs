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

export function sortRecordTable(container, column, direction, numeric = false) {
  const rows = [...container.querySelectorAll("[data-record-row]")];
  for (const [index, row] of rows.entries()) {
    if (row.dataset.sortOriginal === undefined) row.dataset.sortOriginal = String(index);
  }
  rows.sort((a, b) => {
    const original = Number(a.dataset.sortOriginal) - Number(b.dataset.sortOriginal);
    const left = a.cells[column].textContent.trim();
    const right = b.cells[column].textContent.trim();
    const comparison = numeric
      ? Number(left) - Number(right)
      : left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });
    return (direction === "descending" ? -comparison : comparison) || original;
  });
  const marker = container.querySelector("[data-search-no-matches]");
  for (const row of rows) marker.parentNode.insertBefore(row, marker);
}

export function setupRecordSorting(container, initial, onChange) {
  const buttons = [...container.querySelectorAll("[data-sort-column]")];
  let state = initial;
  const apply = () => {
    for (const button of buttons) {
      const heading = button.closest("th");
      if (state && heading.cellIndex === state.column) heading.setAttribute("aria-sort", state.direction);
      else heading.removeAttribute("aria-sort");
    }
    if (state) {
      const button = buttons.find(item => item.closest("th").cellIndex === state.column);
      if (button) sortRecordTable(container, state.column, state.direction, button.hasAttribute("data-sort-numeric"));
    }
  };
  for (const button of buttons) {
    button.addEventListener("click", () => {
      const column = button.closest("th").cellIndex;
      state = { column, direction: state?.column === column && state.direction === "ascending" ? "descending" : "ascending" };
      onChange(state);
      apply();
    });
  }
  apply();
}
