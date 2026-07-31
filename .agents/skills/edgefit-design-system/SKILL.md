---
name: edgefit-design-system
description: EdgeFit design-system skill for turning approved brand and UI direction into tokens, component rules, states, variants, and reusable UI patterns.
---

# EdgeFit Design System Skill

## When to use

Использовать после выбора визуального направления, когда нужно определить
токены, повторяемые компоненты, варианты, состояния, responsive-поведение или
правила переиспользования. Не использовать как замену art direction.

## Required context

Прочитать полностью:

- `docs/brand-guidelines.md`;
- `docs/design-direction.md`;
- `docs/ui-system.md`.

Перед предложением нового компонента найти существующие компоненты и токены.

## Token model

Использовать трёхуровневую модель:

```text
primitive tokens → semantic tokens → component tokens
```

- Primitive: сырые color, spacing, radius, typography и shadow values.
- Semantic: `surface`, `text`, `accent`, `border`, `success`, `warning`,
  `danger`, `focus`.
- Component: локальные значения и варианты только там, где semantic-слоя
  недостаточно.

Не генерировать код токенов автоматически, если задача требует только
спецификацию. Не менять существующие глобальные токены без анализа влияния.

## Component model

Рассматривать следующие роли:

- `SectionShell`;
- `MetricCard`;
- `FitBadge`;
- `RiskBadge`;
- `ProductRecommendationCard`;
- `ResultSummary`;
- `PrimaryCta`;
- `SecondaryCta`.

Не создавать весь список заранее. Добавлять компонент только при реальном
повторении, самостоятельной семантической роли или нескольких состояниях.

## Result components

`ResultSummary` должен сразу показывать:

- диапазон длины;
- recommended width type;
- target waist width;
- boot drag risk;
- shape/flex/style reasoning;
- recommended models;
- понятный CTA в магазин.

`ProductRecommendationCard` должен отличаться от обычной каталоговой карточки:
показывать роль рекомендации, размер, причины совпадения, возможный компромисс,
confidence при наличии, цену и tracked store CTA.

## Catalog components

Сохранять каталоговые карточки инструментом просмотра ассортимента. Не
заменять их глобально recommendation-компонентом и не обещать персональный fit
там, где нет результата квиза.

## CTA rules

- Primary: одно главное действие секции или экрана.
- Secondary: безопасная альтернатива без визуальной конкуренции с primary.
- Store: текст «В магазин», существующий redirect и analytics payload.
- Disabled/loading: сохранять читаемую подпись и семантический control.
- Не использовать кнопку для навигации или ссылку для form action.

## Risk states

```text
low = холодный нейтральный / спокойный
medium = amber / осторожность
high = amber stronger / warning, но без кислотного красного
```

Всегда добавлять текстовую подпись и объяснение; цвет не должен быть
единственным носителем риска.

## Mobile rules

- Проектировать сначала для 390 px.
- Показывать summary metrics до длинного объяснения.
- Строить карточки в одну колонку без горизонтального scroll.
- Сохранять CTA рядом с соответствующим решением.
- Избегать sticky-блоков, перекрывающих контент.
- Проверять 390, 768 и 1440 px.

## Accessibility rules

- Поддерживать контраст не ниже WCAG AA.
- Сохранять `focus-visible`, keyboard order и touch targets.
- Связывать label, control, error и hint.
- Не полагаться только на цвет, hover или motion.
- Поддерживать `prefers-reduced-motion`.

## Handoff rules

- Если направление ещё спорное, вернуться к `edgefit-ui-ux`.
- Когда правила готовы и требуется код, использовать `edgefit-ui-styling`.
- Если token decision противоречит бренду, свериться с `edgefit-brand`.

## Final output expectations

Выдать минимальный набор нужных токенов, component roles, variants, states,
responsive и accessibility rules. Отметить, что переиспользуется, что нужно
добавить и какие страницы не должны измениться.
