'use client';

import { createContext, useCallback, useContext, useMemo, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import { useI18n } from '@/app/language-provider';
import type { CardLayoutItem, CardLayoutPage, CardLayoutPreferences } from '@/lib/card-layout';

type Defaults = Pick<CardLayoutItem, 'columns' | 'height'>;
type LayoutContextValue = {
  active: boolean;
  editing: boolean;
  entries: Record<string, CardLayoutItem>;
  register: (id: string, defaults: Defaults) => void;
  change: (id: string, defaults: Defaults, patch: Partial<CardLayoutItem>) => void;
  move: (id: string, targetId: string, after: boolean) => void;
  moveAdjacent: (id: string, direction: -1 | 1) => void;
  startDrag: (id: string) => void;
  endDrag: () => void;
  drop: (targetId: string, after: boolean) => void;
};

const LayoutContext = createContext<LayoutContextValue | null>(null);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function CardLayoutGrid({ page, preferences, editing = false, draftItems = {}, onDraftChange, children }: {
  page: CardLayoutPage;
  preferences: CardLayoutPreferences;
  editing?: boolean;
  draftItems?: Record<string, CardLayoutItem>;
  onDraftChange?: (items: Record<string, CardLayoutItem>) => void;
  children: ReactNode;
}) {
  const registered = useRef(new Map<string, Defaults>());
  const dragged = useRef('');
  const saved = preferences[page];
  const active = editing || !!saved?.enabled;
  const entries = useMemo(() => editing ? draftItems : saved?.items ?? {}, [editing, draftItems, saved?.items]);

  const register = useCallback((id: string, defaults: Defaults) => {
    if (!registered.current.has(id)) registered.current.set(id, defaults);
  }, []);

  const materialize = useCallback(() => {
    const ids = [...new Set([...Object.keys(entries), ...registered.current.keys()])];
    const registrationOrder = new Map([...registered.current.keys()].map((id, index) => [id, index]));
    ids.sort((a, b) => (entries[a]?.order ?? 1000 + (registrationOrder.get(a) ?? 0)) - (entries[b]?.order ?? 1000 + (registrationOrder.get(b) ?? 0)));
    return Object.fromEntries(ids.map((id, order) => {
      const defaults = registered.current.get(id) ?? { columns: 3, height: 260 };
      const current = entries[id];
      return [id, { order, columns: current?.columns ?? defaults.columns, height: current?.height ?? defaults.height }];
    }));
  }, [entries]);

  const change = useCallback((id: string, defaults: Defaults, patch: Partial<CardLayoutItem>) => {
    if (!editing || !onDraftChange) return;
    const next = materialize();
    const current = next[id] ?? { order: Object.keys(next).length, ...defaults };
    next[id] = {
      order: current.order,
      columns: clamp(patch.columns ?? current.columns, 1, 12),
      height: clamp(patch.height ?? current.height, 120, 1600),
    };
    onDraftChange(next);
  }, [editing, materialize, onDraftChange]);

  const move = useCallback((id: string, targetId: string, after: boolean) => {
    if (!editing || !onDraftChange || id === targetId) return;
    const next = materialize();
    const ordered = Object.keys(next).sort((a, b) => next[a].order - next[b].order);
    const from = ordered.indexOf(id), to = ordered.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ordered.splice(from, 1);
    const insertion = ordered.indexOf(targetId) + (after ? 1 : 0);
    ordered.splice(Math.max(0, insertion), 0, id);
    ordered.forEach((key, order) => { next[key] = { ...next[key], order }; });
    onDraftChange(next);
  }, [editing, materialize, onDraftChange]);

  const moveAdjacent = useCallback((id: string, direction: -1 | 1) => {
    const current = materialize();
    const ordered = Object.keys(current).sort((a, b) => current[a].order - current[b].order);
    const index = ordered.indexOf(id), target = ordered[index + direction];
    if (target) move(id, target, direction > 0);
  }, [materialize, move]);

  const startDrag = useCallback((id: string) => { dragged.current = id; }, []);
  const endDrag = useCallback(() => { dragged.current = ''; }, []);
  const drop = useCallback((targetId: string, after: boolean) => {
    if (dragged.current) move(dragged.current, targetId, after);
    dragged.current = '';
  }, [move]);

  const value = useMemo<LayoutContextValue>(() => ({ active, editing, entries, register, change, move, moveAdjacent, startDrag, endDrag, drop }), [active, editing, entries, register, change, move, moveAdjacent, startDrag, endDrag, drop]);
  return <LayoutContext.Provider value={value}>{active ? <div className={`card-layout-grid${editing ? ' is-editing' : ''}`} data-layout-page={page}>{children}</div> : children}</LayoutContext.Provider>;
}

export function useCardLayoutActive() {
  return useContext(LayoutContext)?.active ?? false;
}

export function CardLayoutSurface({ className = '', children }: { className?: string; children: ReactNode }) {
  const layout = useContext(LayoutContext);
  return <div className={`${layout?.active ? 'card-layout-surface ' : ''}${className}`.trim()}>{children}</div>;
}

type ResizeMode = 'width' | 'height' | 'proportional';
type ResizeState = { mode: ResizeMode; pointerId: number; startX: number; startY: number; startColumns: number; startHeight: number; width: number; height: number; cellWidth: number };

export function CardLayoutItem({ id, columns = 3, height = 240, hidden = false, children }: { id: string; columns?: number; height?: number; hidden?: boolean; children: ReactNode }) {
  const layout = useContext(LayoutContext);
  const { t } = useI18n();
  const resize = useRef<ResizeState | null>(null);
  const defaults = { columns, height };
  if (hidden) return null;
  if (!layout?.active) return <>{children}</>;
  const activeLayout = layout;
  activeLayout.register(id, defaults);
  const entry = activeLayout.entries[id];
  const currentColumns = entry?.columns ?? columns;
  const currentHeight = entry?.height ?? height;

  function beginResize(mode: ResizeMode, event: ReactPointerEvent<HTMLButtonElement>) {
    if (!activeLayout.editing) return;
    event.preventDefault();
    event.stopPropagation();
    const item = event.currentTarget.parentElement;
    const grid = item?.parentElement;
    if (!item || !grid) return;
    const rect = item.getBoundingClientRect();
    const gap = Number.parseFloat(getComputedStyle(grid).columnGap) || 16;
    const cellWidth = (grid.getBoundingClientRect().width - gap * 11) / 12;
    resize.current = { mode, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startColumns: currentColumns, startHeight: currentHeight, width: rect.width, height: rect.height, cellWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function continueResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const state = resize.current;
    if (!state || state.pointerId !== event.pointerId) return;
    event.preventDefault();
    const dx = event.clientX - state.startX, dy = event.clientY - state.startY;
    if (state.mode === 'width') {
      activeLayout.change(id, defaults, { columns: Math.round(state.startColumns + dx / state.cellWidth) });
    } else if (state.mode === 'height') {
      activeLayout.change(id, defaults, { height: Math.round((state.startHeight + dy) / 20) * 20 });
    } else {
      const scaleX = (state.width + dx) / Math.max(state.width, 1);
      const scaleY = (state.height + dy) / Math.max(state.height, 1);
      const scale = clamp((scaleX + scaleY) / 2, .5, 2.5);
      activeLayout.change(id, defaults, { columns: Math.round(state.startColumns * scale), height: Math.round(state.startHeight * scale / 20) * 20 });
    }
  }

  function stopResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (resize.current?.pointerId === event.pointerId) resize.current = null;
  }

  const style: CSSProperties = { order: entry?.order, gridColumn: `span ${currentColumns}`, height: `${currentHeight}px` };
  return <div className={`card-layout-item${activeLayout.editing ? ' is-editing' : ''}`} data-layout-id={id} data-columns={currentColumns} style={style}
    onDragOver={event => { if (activeLayout.editing) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }}
    onDrop={event => { if (!activeLayout.editing) return; event.preventDefault(); event.stopPropagation(); const rect = event.currentTarget.getBoundingClientRect(); activeLayout.drop(id, event.clientY > rect.top + rect.height / 2); }}>
    {children}
    {activeLayout.editing && <>
      <div className="card-layout-tools" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
        <button type="button" className="card-layout-drag" draggable aria-label={t('拖曳以移動卡片')} title={t('拖曳以移動卡片')} onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id); activeLayout.startDrag(id); }} onDragEnd={activeLayout.endDrag}><GripVertical size={16}/></button>
        <button type="button" aria-label={t('卡片上移')} title={t('卡片上移')} onClick={() => activeLayout.moveAdjacent(id, -1)}><ArrowUp size={14}/></button>
        <button type="button" aria-label={t('卡片下移')} title={t('卡片下移')} onClick={() => activeLayout.moveAdjacent(id, 1)}><ArrowDown size={14}/></button>
      </div>
      <button type="button" className="card-layout-resize card-layout-resize-width" aria-label={t('拖曳調整卡片寬度')} title={t('拖曳調整卡片寬度')} onPointerDown={event => beginResize('width', event)} onPointerMove={continueResize} onPointerUp={stopResize} onPointerCancel={stopResize}/>
      <button type="button" className="card-layout-resize card-layout-resize-height" aria-label={t('拖曳調整卡片高度')} title={t('拖曳調整卡片高度')} onPointerDown={event => beginResize('height', event)} onPointerMove={continueResize} onPointerUp={stopResize} onPointerCancel={stopResize}/>
      <button type="button" className="card-layout-resize card-layout-resize-proportional" aria-label={t('等比例拖曳調整卡片大小')} title={t('等比例拖曳調整卡片大小')} onPointerDown={event => beginResize('proportional', event)} onPointerMove={continueResize} onPointerUp={stopResize} onPointerCancel={stopResize}/>
    </>}
  </div>;
}
