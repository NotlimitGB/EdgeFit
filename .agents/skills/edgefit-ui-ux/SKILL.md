---
name: edgefit-ui-ux
description: EdgeFit UI/UX direction skill for choosing visual direction, layout hierarchy, palette, typography, CTA strategy, accessibility, and conversion-oriented UX before implementation.
---

# EdgeFit UI/UX Direction Skill

## When to use

Использовать, когда нужно выбрать или проверить визуальное направление,
иерархию страницы, layout, палитру, типографику, CTA, мобильный UX или
доступность до начала frontend implementation.

## Required context

Прочитать полностью:

- `docs/brand-guidelines.md`;
- `docs/design-direction.md`;
- `docs/ui-system.md`.

Изучить текущий экран в коде и, если задача предполагает реализацию, проверить
его фактическое desktop/mobile состояние. Не проектировать по абстрактному
описанию, когда экран уже существует.

## Core UI direction

```text
Premium snowboard gear advisor.
Dark alpine atmosphere.
Icy technical UI.
Confident, sharp, modern, not childish.
```

Использовать ассоциации вечернего склона, холодного воздуха, точного
outdoor-снаряжения и топографической карты. Визуал должен объяснять fit, а не
просто создавать атмосферу.

## Product UX priorities

Расставлять решения в порядке:

1. быстрое понимание пользы;
2. старт квиза;
3. доверие к результату;
4. понимание причин рекомендации;
5. клик в магазин;
6. email capture без давления.

## Page hierarchy rules

Главная `/`:

```text
hero → value proposition → CTA → preview результата → что учитываем
→ почему не таблица размеров → SEO/internal links
```

Результат `/result`:

```text
summary metrics → explanation → recommended models → alternative/avoid models
→ email capture → recalculation
```

Сохранять один доминирующий ответ на каждом уровне. Не ставить критическую
fit-информацию и второстепенные справочные блоки в одинаковые карточки.

## Conversion rules

- Делать основной CTA заметным без агрессивного давления.
- Показывать preview результата рядом с обещанием квиза.
- До карточек моделей объяснять длину, ширину, талию и риск boot drag.
- В recommendation card сначала отвечать «почему эта доска», затем показывать
  цену и переход в магазин.
- Не конкурировать email capture с первым коммерческим CTA.
- Сохранять существующий tracked store redirect.

## Accessibility rules

- Обеспечить WCAG AA-контраст текста и состояний.
- Не кодировать fit или risk только цветом.
- Сохранять логичный heading order и семантические ссылки/кнопки.
- Делать `focus-visible` не менее заметным, чем hover.
- Поддерживать клавиатуру, touch targets около 44 px и reduced motion.
- Проверять длинные русские подписи и увеличение текста.

## Anti-patterns

- generic SaaS landing;
- случайные purple/blue gradients и rainbow AI glow;
- детские снежинки и буквальный зимний декор;
- интерфейс CRM или dashboard ради ощущения «технологичности»;
- перегруз анимацией и декоративностью;
- слишком много равнозначных карточек;
- CTA, которые визуально спорят друг с другом;
- композиция, скрывающая fit-метрики или причины рекомендации.

## Handoff rules

- После утверждения направления использовать `edgefit-design-system`.
- Если системные правила уже утверждены и нужно кодить, использовать
  `edgefit-ui-styling`.
- Если не определены голос и обещание, сначала вернуться к `edgefit-brand`.

## Final output expectations

До кода выдать: выбранное направление, информационную и CTA-иерархию,
поверхности, типографический принцип, цветовые роли, mobile-поведение,
accessibility constraints и анти-паттерны. Явно отделить утверждённые решения
от вариантов и назвать следующий handoff.
