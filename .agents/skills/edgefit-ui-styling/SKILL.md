---
name: edgefit-ui-styling
description: EdgeFit frontend UI implementation skill for Tailwind/React styling, responsive layout, accessibility, and applying approved brand/design-system rules in code.
---

# EdgeFit UI Styling Skill

## When to use

Использовать только когда визуальное направление уже определено и задача
явно разрешает менять frontend-код. Применять для React/Tailwind-компонентов,
адаптивной вёрстки, состояний, CSS-only visual layers и UI self-review.

## Required context

Прочитать полностью:

- `docs/brand-guidelines.md`;
- `docs/design-direction.md`;
- `docs/ui-system.md`;
- `docs/codex-design-workflow.md`.

Затем изучить `AGENTS.md`, затронутые страницы, существующие компоненты,
`src/app/globals.css`, доменные типы и analytics/store-link wrappers.

## Implementation rules

- Использовать текущий Next.js, React и Tailwind CSS stack.
- Сохранять server/client boundaries и существующие маршруты.
- Не добавлять зависимость или external asset без необходимости и отдельного
  согласования.
- Не менять бизнес-логику, recommendation algorithm, API или DB.
- Не переименовывать analytics event names.
- Не обходить `/go/[slug]` и существующий redirect/tracking path.
- Не заменять каталоговые карточки глобально без отдельной задачи.
- Переиспользовать доменные labels и types вместо конфликтующего хардкода.

## Tailwind rules

- Избегать хаоса из одноразовых arbitrary colors.
- Выносить повторяемые роли в токены, CSS utilities или небольшой компонент.
- Изолировать alpine/dark styles в явном wrapper или семантических классах.
- Не перекрашивать через глобальный selector страницы вне scope.
- Сохранять mobile-first breakpoint order.
- Делать hover, focus-visible, active, disabled и loading states согласованными.
- Не создавать большую дизайн-систему ради одного повторения.

## CSS-only visual rules

Разрешено:

- CSS gradients;
- topographic lines через CSS;
- technical grid через CSS;
- subtle hover transitions;
- `prefers-reduced-motion`.

Запрещено без отдельного approval:

- внешние картинки и CDN;
- новые fonts;
- heavy animation;
- canvas, WebGL и parallax;
- декоративный эффект, ухудшающий читаемость или performance.

## Component rules

- Использовать существующий компонент, если совпадают его смысл и состояния.
- Создавать новый компонент при повторении или самостоятельной продуктовой
  роли, а не ради сокращения нескольких классов.
- Разделять catalog card и recommendation card.
- Передавать данные через существующие domain types; не дублировать расчёты в UI.
- Сохранять tracked link wrapper и analytics payload.

## Responsive rules

- Начинать с 390 px, затем проверять 768 и 1440 px.
- Не допускать horizontal overflow и обрезанных русских строк.
- На мобильном ставить summary и primary CTA раньше вторичных деталей.
- Переводить grids в одну колонку и сохранять естественный DOM order.
- Проверять sticky, длинные badges, формы и recommendation cards.

## Accessibility rules

- Использовать семантические ссылки, кнопки, headings, lists и form labels.
- Сохранять видимый `focus-visible` и достаточный color contrast.
- Не передавать risk, selected или disabled state только цветом.
- Обеспечивать touch targets около 44 px.
- Уважать reduced motion и проверять keyboard flow.

## Forbidden changes

- recommendation formula и domain scoring;
- API routes, DB schema, catalog import и auth;
- analytics event names и store redirect;
- пользовательский язык с русского на английский;
- production surfaces вне заявленного scope;
- скрытие lint, test или build errors.

## Verification

Если меняется UI-код, выполнить:

```bash
git diff --check
npm run lint
npm run test
npm run build
```

Вручную проверить:

```text
/
/quiz
/result
/catalog
/about
mobile 390 / 768 / 1440
```

Проверить также empty, loading, error, low/medium/high risk и различное
количество recommendation cards, если эти состояния затронуты.

## Final output expectations

Сообщить, что визуально изменено, какие компоненты и файлы затронуты, какие
проверки выполнены, что не проверено и какие ограничения остались. Отдельно
подтвердить сохранность business logic, routes, analytics и store redirect.
