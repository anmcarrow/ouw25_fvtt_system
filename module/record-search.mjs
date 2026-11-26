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

export function setupGroupedRecordSorting(container, initial, onChange) {
  const tables = [...container.querySelectorAll("table[data-record-group]")];
  const state = { ...initial };
  const apply = () => {
    for (const table of tables) {
      const selected = state[table.dataset.recordGroup];
      const buttons = [...table.querySelectorAll("[data-sort-column]")];
      for (const button of buttons) {
        const heading = button.closest("th");
        if (selected && button.dataset.sortKey === selected.key) heading.setAttribute("aria-sort", selected.direction);
        else heading.removeAttribute("aria-sort");
      }
      const button = buttons.find(item => item.dataset.sortKey === selected?.key);
      if (button) sortRecordTable(table, button.closest("th").cellIndex, selected.direction, button.hasAttribute("data-sort-numeric"));
    }
  };
  for (const table of tables) {
    for (const button of table.querySelectorAll("[data-sort-column]")) {
      button.addEventListener("click", () => {
        const key = button.dataset.sortKey;
        const previous = state[table.dataset.recordGroup];
        const direction = previous?.key === key && previous.direction === "ascending" ? "descending" : "ascending";
        for (const target of tables) {
          if ([...target.querySelectorAll("[data-sort-column]")].some(item => item.dataset.sortKey === key)) {
            state[target.dataset.recordGroup] = { key, direction };
          }
        }
        onChange({ ...state });
        apply();
      });
    }
  }
  apply();
}
