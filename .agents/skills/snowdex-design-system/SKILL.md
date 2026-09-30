---
name: snowdex-design-system
description: Develop or review reusable SnowDex presentation rules for tokens, component roles, variants, accessible states and responsive consistency. Use when recurring UI decisions need a shared system.
---

# SnowDex Design System

Прочитать [брендовые правила](../../../docs/brand-guidelines.md) и применимые
границы [workflow](../../../docs/codex-design-workflow.md). Изучить существующие
tokens, components и выбранное направление. Этот skill не фиксирует новую
art direction вместо пользовательского brief.

## Минимальная система

Определить повторяющиеся роли: surface/text/accent/border/focus/status,
typography, spacing, media и controls. Semantic tokens предпочтительны для
общих решений; primitive/component layers добавлять только при реальной
пользе. Не требовать трёх уровней для небольшой задачи.

Компонент выделять по роли, повторению или состояниям, а не по готовому списку.
Catalog item, персональная recommendation и result summary решают разные
задачи; общий визуальный язык не должен стирать смысловые различия.

Текущий presentation-слой находится в
`src/components/public/public-ui.module.css`; изучать его и реальные callers.
Это описание реализации, не запрет замены primitives в разрешённом редизайне.
Не переносить tokens в global scope с побочными изменениями других страниц.

## Контракты представления

- Значения, единицы, размерные labels, confidence и причины брать из доменных
  данных; не вычислять второй вариант recommendation в компоненте.
- Навигация использует ссылки, действия — кнопки. Store action сохраняет
  `/go/[slug]`, tracking wrapper и payload.
- Risk/selected/error выражаются текстом и семантикой, не одним цветом.
  Палитра зависит от направления и контраста.
- Определять нужные hover/focus/active/disabled/loading/empty/error состояния;
  сохранять доступные имена, label/hint/error и естественный DOM order.
- Responsive сохраняет информацию и действия; не превращать любой desktop
  layout автоматически в стопку одинаковых карточек.

Проверять повторяемость и drift на затронутых страницах, доступность и длинные
русские подписи. Сдать минимальный набор решений, исключения и evidence.
Система представления не даёт scope на DB, API, analytics, recommendation
или routing.
