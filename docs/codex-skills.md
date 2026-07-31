# EdgeFit Local Codex Skills

## 1. Зачем это нужно

Repo-local skills удерживают будущие дизайн-задачи в продуктовой логике
EdgeFit. Они не дают запросу «сделай красиво» превратиться в generic SaaS
редизайн и задают общий порядок принятия решений:

```text
brand → ui-ux → design-system → ui-styling → implementation
```

Источники находятся в `.agents/skills/` и версионируются вместе с проектом.
Перед соответствующей задачей Codex должен читать выбранный `SKILL.md`, а
также документы, на которые он ссылается.

## 2. Список skills

### `edgefit-brand`

Путь: `.agents/skills/edgefit-brand/SKILL.md`.

Фиксирует позиционирование, tone of voice, сообщения, визуальную личность и
коммерческое обещание EdgeFit.

### `edgefit-ui-ux`

Путь: `.agents/skills/edgefit-ui-ux/SKILL.md`.

Помогает выбрать visual direction, hierarchy, palette, typography, CTA,
mobile UX и accessibility до реализации.

### `edgefit-design-system`

Путь: `.agents/skills/edgefit-design-system/SKILL.md`.

Переводит утверждённое направление в tokens, component roles, variants,
states и reusable patterns.

### `edgefit-ui-styling`

Путь: `.agents/skills/edgefit-ui-styling/SKILL.md`.

Задаёт правила реализации в текущем Next.js/React/Tailwind stack и защищает
business logic, analytics и store redirect от случайных изменений.

## 3. Когда какой skill использовать

| Пример запроса | Начать с |
| --- | --- |
| «Перепиши hero и CTA в голосе EdgeFit» | `edgefit-brand` |
| «Выбери визуальное направление для результата» | `edgefit-ui-ux` |
| «Опиши tokens и states для fit-карточек» | `edgefit-design-system` |
| «Реализуй утверждённый result screen» | `edgefit-ui-styling` |
| «Сделай комплексный redesign `/` и `/result`» | все четыре по порядку |

Если задача меняет тип по ходу работы, выполнить handoff по правилам текущего
skill. Не использовать styling, пока направление не определено.

## 4. Рекомендуемый порядок для design-задач

1. Прочитать `AGENTS.md`.
2. Прочитать `brand-guidelines.md`, `design-direction.md` и `ui-system.md`.
3. Выбрать минимальный набор skills.
4. Зафиксировать brand promise и product outcome.
5. Выбрать UI/UX direction и page hierarchy.
6. Определить tokens, components и states.
7. Составить implementation plan.
8. Менять код только при явном implementation scope.
9. Выполнить self-review и проверки.
10. Сдать отчёт по формату из `AGENTS.md`.

## 5. Что не является задачей skills

Локальные skills не делают редизайн сами по себе. Они задают правила и процесс.
Реальный редизайн выполняется отдельной implementation-задачей.

Skills также не разрешают автоматически:

- менять алгоритм рекомендаций;
- менять API или БД;
- менять analytics;
- обходить `/go/[slug]`;
- добавлять dependencies или external assets;
- расширять scope на каталог, internal pages или auth.

## 6. Пример правильного design workflow

Запрос: «Обновить главную и результат в premium alpine стиле».

```text
edgefit-brand
→ подтвердить обещание: помочь не ошибиться с fit

edgefit-ui-ux
→ зафиксировать dark alpine / icy technical и иерархию двух страниц

edgefit-design-system
→ описать surfaces, CTA, MetricCard, RiskBadge, ResultSummary
  и ProductRecommendationCard

edgefit-ui-styling
→ реализовать только утверждённый scope в React/Tailwind,
  сохранив domain logic, analytics и store redirect

verification
→ lint, test, build и visual check 390 / 768 / 1440
```
