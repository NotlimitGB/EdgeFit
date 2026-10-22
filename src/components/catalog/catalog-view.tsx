"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { PublicCatalogItem } from "@/lib/public-catalog-dto";
import { boardShapeLabels, camberProfileLabels, ridingStyleLabels, skillLevelLabels, widthTypeLabels } from "@/lib/content";
import { CatalogUrlSync } from "./catalog-url-sync";
import { CatalogPrefetchProvider } from "./catalog-prefetch";
import { CanonicalBoardCard } from "./canonical-board-card";
import { catalogFacets, catalogModelCount, selectCatalog } from "./catalog-selection";
import { buildCatalogSearchParams, CATALOG_BOARD_LINES, CATALOG_BOARD_SHAPES, CATALOG_DEFAULT_STATE,
  CATALOG_RIDING_STYLES, CATALOG_SKILL_LEVELS, CATALOG_WIDTH_TYPES, getCatalogStateKey, parseCatalogState,
  type CatalogUrlState } from "./catalog-state";
import styles from "./catalog.module.css";

const PAGE_SIZE = 24;
const STORAGE_KEY = "edgefit:catalog-visible-count:v2";
const lines = { men: "Мужская", women: "Женская", unisex: "Унисекс" };
type FacetKey = Exclude<keyof CatalogUrlState, "q" | "sort">;
type Group = { key: FacetKey; label: string; options: { value: string; label: string }[] };
interface Props { boards: PublicCatalogItem[]; initialSearch?: string }

function restoredCount(key: string, total: number) {
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null");
    if (stored?.stateKey === key && Number.isInteger(stored.visibleCount) && stored.visibleCount >= PAGE_SIZE)
      return Math.min(Math.floor(stored.visibleCount / PAGE_SIZE) * PAGE_SIZE, Math.max(PAGE_SIZE, total));
  } catch { /* Storage is optional. */ }
  return PAGE_SIZE;
}
function storeCount(stateKey: string, visibleCount: number) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ stateKey, visibleCount })); } catch { /* fail open */ }
}
function reset(current: CatalogUrlState) { return { ...CATALOG_DEFAULT_STATE, sort: current.sort }; }
function FacetPanels({ groups, current, onChange }: { groups: Group[]; current: CatalogUrlState; onChange: (next: CatalogUrlState) => void }) {
  return <>
    {groups.map((group, index) => <details key={group.key} className={styles.facet} open={index < 3 || Boolean(current[group.key]?.length)}>
      <summary>{group.label}<span aria-hidden="true">+</span></summary>
      <fieldset><legend className={styles.srOnly}>{group.label}</legend>
        {group.options.map((option) => <label key={option.value} className={styles.checkboxRow}>
          <input type="checkbox" checked={current[group.key]?.some((v) => v === option.value) ?? false} onChange={() => {
            const selected = new Set<string>(current[group.key]);
            if (selected.has(option.value)) selected.delete(option.value); else selected.add(option.value);
            onChange({ ...current, [group.key]: group.options.map((o) => o.value).filter((v) => selected.has(v)) });
          }} /><span>{option.label}</span>
        </label>)}
        {!group.options.length && <p className={styles.hint}>Нет записанных значений</p>}
      </fieldset>
      {!!current[group.key]?.length && <button type="button" className={styles.textButton} onClick={() => onChange({ ...current, [group.key]: [] })}>Снять выбор: {group.label.toLocaleLowerCase("ru")}</button>}
    </details>)}
    <button type="button" className={styles.textButton} onClick={() => onChange(reset(current))}>Сбросить фильтры</button>
  </>;
}
export function CatalogView(props: Props) {
  return <CatalogPrefetchProvider><CatalogContents {...props} /></CatalogPrefetchProvider>;
}
function CatalogContents({ boards, initialSearch = "" }: Props) {
  const facets = useMemo(() => catalogFacets(boards), [boards]);
  const normalize = (search: string) => parseCatalogState(new URLSearchParams(search), facets.brands, facets);
  const [state, setState] = useState(() => normalize(initialSearch));
  const stateRef = useRef(state);
  const lastSearch = useRef(initialSearch);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [page, setPage] = useState({ key: getCatalogStateKey(state), count: PAGE_SIZE });
  const [draft, setDraft] = useState<CatalogUrlState | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const filtered = useMemo(() => selectCatalog(boards, state), [boards, state]);
  const key = getCatalogStateKey(state);
  const count = page.key === key ? page.count : PAGE_SIZE;
  const groups = useMemo<Group[]>(() => {
    const options = (values: readonly string[], labels?: Record<string, string>) => values.map((value) => ({ value, label: labels?.[value] ?? value }));
    return [
      { key: "brands", label: "Бренд", options: options(facets.brands) },
      { key: "styles", label: "Стиль", options: options(CATALOG_RIDING_STYLES.filter((v) => boards.some((b) => b.canonicalSpecs.ridingStyle === v)), ridingStyleLabels) },
      { key: "lines", label: "Линейка", options: options(CATALOG_BOARD_LINES.filter((v) => boards.some((b) => b.canonicalSpecs.boardLine === v)), lines) },
      { key: "skills", label: "Уровень", options: options(CATALOG_SKILL_LEVELS.filter((v) => boards.some((b) => b.canonicalSpecs.skillLevel === v)), skillLevelLabels) },
      { key: "shapes", label: "Форма", options: options(CATALOG_BOARD_SHAPES.filter((v) => boards.some((b) => b.canonicalSpecs.shapeType === v)), boardShapeLabels) },
      { key: "cambers", label: "Прогиб", options: options(facets.cambers, camberProfileLabels) },
      { key: "seasons", label: "Сезон", options: options(facets.seasons) },
      { key: "sizes", label: "Записанная ростовка", options: options(facets.sizes).map((o) => ({ ...o, label: `${o.value} см` })) },
      { key: "widths", label: "Ширина", options: options(CATALOG_WIDTH_TYPES.filter((v) => boards.some((b) => b.widthTypes.includes(v))), widthTypeLabels) },
    ];
  }, [boards, facets]);
  function cancelTimer() { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; }
  function flushUrl(next: CatalogUrlState) {
    cancelTimer();
    const search = buildCatalogSearchParams(new URLSearchParams(window.location.search), next).toString();
    lastSearch.current = search;
    // Next integrates native history updates without requesting another RSC tree.
    if (window.location.search.slice(1) !== search) window.history.replaceState(null, "", `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`);
  }
  function apply(next: CatalogUrlState, debounce = false) {
    cancelTimer(); stateRef.current = next; setState(next);
    const nextKey = getCatalogStateKey(next);
    setPage({ key: nextKey, count: PAGE_SIZE }); storeCount(nextKey, PAGE_SIZE);
    if (debounce) timer.current = setTimeout(() => flushUrl(stateRef.current), 200);
    else flushUrl(next);
  }
  function closeDraft() { dialog.current?.close(); setDraft(null); trigger.current?.focus(); }
  function receiveUrl(search: string) {
    if (search === lastSearch.current) return;
    cancelTimer(); lastSearch.current = search;
    const next = normalize(search); stateRef.current = next; setState(next);
    const nextKey = getCatalogStateKey(next);
    setPage({ key: nextKey, count: restoredCount(nextKey, selectCatalog(boards, next).length) });
    if (dialog.current?.open) closeDraft();
  }
  useEffect(() => {
    const id = setTimeout(() => setPage({ key, count: restoredCount(key, filtered.length) }), 0);
    return () => clearTimeout(id);
  }, [key, filtered.length]);
  useEffect(() => {
    const onPop = () => receiveUrl(window.location.search.slice(1));
    const onLeave = () => flushUrl(stateRef.current);
    window.addEventListener("popstate", onPop); window.addEventListener("pagehide", onLeave);
    return () => { window.removeEventListener("popstate", onPop); window.removeEventListener("pagehide", onLeave); };
  });
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (!draft) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const media = window.matchMedia("(min-width: 1180px)");
    const onResize = () => { if (media.matches) closeDraft(); };
    media.addEventListener("change", onResize);
    return () => { document.body.style.overflow = old; media.removeEventListener("change", onResize); };
  }, [draft]);
  const chips = groups.flatMap((group) => (state[group.key] ?? []).map((value) => ({ group, value, label: group.options.find((o) => o.value === value)?.label ?? value })));
  return <div className={styles.catalogView} onClickCapture={(event) => {
    if (event.target instanceof Element && event.target.closest("a[href]")) flushUrl(stateRef.current);
  }}>
    <Suspense fallback={null}><CatalogUrlSync onChange={receiveUrl} /></Suspense>
    <aside className={styles.sidebar} aria-label="Фильтры моделей"><h2>Фильтры</h2><FacetPanels groups={groups} current={state} onChange={(next) => apply(next)} /></aside>
    <section className={styles.results} aria-labelledby="catalog-results-title">
      <div className={styles.toolbar}>
        <label className={styles.searchField}><span>Поиск по каталогу</span><input type="search" value={state.q} placeholder="Бренд или модель" onChange={(e) => apply({ ...stateRef.current, q: e.target.value }, true)} /></label>
        <label className={styles.sortField}><span>Сортировка</span><select value={state.sort} onChange={(e) => apply({ ...stateRef.current, sort: e.target.value as CatalogUrlState["sort"] })}>
          <option value="default">По алфавиту</option><option value="season-desc">Сначала новые сезоны</option>
          <option value="price-asc">Сохранённая цена: по возрастанию</option><option value="price-desc">Сохранённая цена: по убыванию</option>
        </select></label>
        <button ref={trigger} type="button" className={styles.filterTrigger} onClick={() => { setDraft(state); dialog.current?.showModal(); }}>Фильтры{chips.length ? ` · ${chips.length}` : ""}</button>
      </div>
      <div className={styles.resultsHeader}><h2 id="catalog-results-title"><span aria-live="polite" aria-atomic="true">{catalogModelCount(filtered.length)}</span></h2><span>Характеристики, не остатки магазинов</span></div>
      {(chips.length > 0 || state.q) && <div className={styles.chips} aria-label="Применённые фильтры">
        {state.q && <button type="button" onClick={() => apply({ ...state, q: "" })}>Поиск: {state.q} <span aria-hidden="true">×</span></button>}
        {chips.map(({ group, value, label }) => <button key={`${group.key}-${value}`} type="button" aria-label={`Убрать ${group.label.toLowerCase()}: ${label}`} onClick={() => apply({ ...state, [group.key]: state[group.key]?.filter((v) => v !== value) })}>{label} <span aria-hidden="true">×</span></button>)}
        <button type="button" className={styles.textButton} onClick={() => apply(reset(state))}>Сбросить фильтры</button>
      </div>}
      {state.sort !== "default" && <button type="button" className={styles.textButton} onClick={() => apply({ ...CATALOG_DEFAULT_STATE })}>Восстановить исходный вид</button>}
      {!filtered.length ? <div className={styles.emptyState}><h3>{boards.length ? "По этим условиям моделей не найдено" : "В каталоге пока нет моделей"}</h3><p>{boards.length ? "Убери часть ограничений или попробуй другое название." : "Попробуй открыть каталог позже."}</p>{boards.length > 0 && <button type="button" className={styles.primaryAction} onClick={() => apply(reset(state))}>Сбросить фильтры</button>}</div>
        : <><div className={styles.boardGrid}>{filtered.slice(0, count).map((board) => <CanonicalBoardCard key={board.slug} board={board} />)}</div>
          <div className={styles.loadMore}><p>Показано {Math.min(count, filtered.length)} из {filtered.length}</p>{count < filtered.length && <button type="button" className={styles.secondaryAction} onClick={() => {
            const next = Math.min(count + PAGE_SIZE, filtered.length); setPage({ key, count: next }); storeCount(key, next);
          }}>Показать ещё {Math.min(PAGE_SIZE, filtered.length - count)}</button>}</div></>}
    </section>
    <dialog ref={dialog} className={styles.drawer} aria-labelledby="catalog-drawer-title" onCancel={(e) => { e.preventDefault(); closeDraft(); }} onClose={() => setDraft(null)} onClick={(e) => { if (e.target === e.currentTarget) closeDraft(); }}>
      {draft && <div className={styles.drawerBody}><header><h2 id="catalog-drawer-title">Фильтры моделей</h2><button type="button" className={styles.closeButton} aria-label="Закрыть фильтры без применения" onClick={closeDraft}>×</button></header>
        <div className={styles.drawerFields}><FacetPanels groups={groups} current={draft} onChange={setDraft} /></div>
        <footer><button type="button" className={styles.primaryAction} onClick={() => { apply(draft); closeDraft(); }}>Показать {catalogModelCount(selectCatalog(boards, draft).length)}</button></footer>
      </div>}
    </dialog>
  </div>;
}
