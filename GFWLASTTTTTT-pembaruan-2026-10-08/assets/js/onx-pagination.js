// Penomoran halaman tabel, dipakai Anomaly Alert Center dan Data & Reports:
// "Showing 1 to 10 of 365 entries" di kiri, tombol nomor halaman di kanan.
export const PAGE_SIZE = 10;
const clickHandlers = new WeakMap();
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

// Nomor yang ditampilkan: halaman pertama, terakhir, dan sekitar halaman yang dibuka; sisanya diringkas "…".
function pageList(page, maxPage) {
  if (maxPage <= 7) return Array.from({ length: maxPage }, (_, index) => index + 1);
  let near;
  if (page <= 4) {
    near = [1, 2, 3, 4, 5];
  } else if (page >= maxPage - 3) {
    near = [maxPage - 4, maxPage - 3, maxPage - 2, maxPage - 1, maxPage];
  } else {
    near = [page - 1, page, page + 1];
  }      
  const pages = [...new Set([1, ...near, maxPage])].sort((a, b) => a - b);
  const list = [];
  pages.forEach((value, index) => {
    if (index && value - pages[index - 1] > 1) list.push(null);
    list.push(value);
  });
  return list;
}

export function renderPagination(container, { page, total, perPage = PAGE_SIZE, onPage }) {
  const maxPage = Math.max(1, Math.ceil(total / perPage));
  page = Math.min(Math.max(1, Math.trunc(Number(page)) || 1), maxPage);
  const first = total ? (page - 1) * perPage + 1 : 0;
  const last = Math.min(total, page * perPage);
  const button = (label, target, { active = false, disabled = false, title = "" } = {}) =>
    `<button type="button" class="onx-page-btn${active ? " is-active" : ""}" data-page="${esc(target)}"${active ? ' aria-current="page"' : ""}${disabled ? " disabled" : ""}${title ? ` aria-label="${esc(title)}" title="${esc(title)}"` : ""}>${esc(label)}</button>`;
  const arrows = maxPage > 7;

  container.innerHTML = `
    <span class="onx-page-info">${total ? `Showing ${first} to ${last} of ${total} entries` : "Showing 0 entries"}</span>
    <div class="onx-page-buttons" role="navigation" aria-label="Table pages">
      ${arrows ? button("‹", page - 1, { disabled: page <= 1, title: "Previous page" }) : ""}      
      ${(total ? pageList(page, maxPage) : []).map((value) => (value === null ? '<span class="onx-page-gap">&hellip;</span>' : button(value, value, { active: value === page }))).join("")}
      ${arrows ? button("›", page + 1, { disabled: page >= maxPage, title: "Next page" }) : ""}      
    </div>`;

  const previous = clickHandlers.get(container);
  if (previous) container.removeEventListener("click", previous);
  const handler = (event) => {
    const target = event.target.closest("button[data-page]");
    if (!target || target.disabled) return;
    const next = Number(target.dataset.page);
    if (next >= 1 && next <= maxPage && next !== page) onPage(next);
  };
  clickHandlers.set(container, handler);
  container.addEventListener("click", handler);
}
