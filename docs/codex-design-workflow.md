# EdgeFit Codex Design Workflow

## 1. Когда использовать

Использовать этот workflow для задач, меняющих:

- позиционирование, tone of voice или пользовательский copy;
- визуальное направление, layout, палитру или типографику;
- tokens, component roles, variants или states;
- React/Tailwind/CSS представление пользовательского интерфейса;
- UX-иерархию, CTA, responsive или accessibility.

Локальные skills задают процесс и ограничения. Они не разрешают менять код,
если пользователь просил только направление, аудит или документацию.

## 2. Перед любой дизайн-задачей

Прочитать полностью:

```text
AGENTS.md
docs/brand-guidelines.md
docs/design-direction.md
docs/ui-system.md
```

Затем изучить:

- страницу и связанные компоненты;
- `src/app/globals.css` и существующие tokens;
- доменные типы и labels, которые отображает UI;
- analytics wrappers и store redirect для коммерческих действий;
- фактическое mobile/desktop состояние, если задача предполагает implementation.

Зафиксировать scope и список того, что нельзя менять. Не считать visual task
разрешением на изменение recommendation algorithm, API, DB или analytics.

## 3. Выбор локального skill

Выбрать минимальный набор:

| Задача | Skill |
| --- | --- |
| Позиционирование, tone of voice, сообщения, CTA copy | `edgefit-brand` |
| Art direction, UX, hierarchy, palette, typography | `edgefit-ui-ux` |
| Tokens, components, variants, states | `edgefit-design-system` |
| React/Tailwind/CSS implementation | `edgefit-ui-styling` |

Для комплексной задачи идти по цепочке:

```text
brand → ui-ux → design-system → ui-styling → implementation
```

Не запускать все skills автоматически, если запрос касается только одного
уровня. Выполнять handoff, когда тип решения действительно изменился.

## 4. Планирование

Перед значимой дизайн-задачей составить короткий plan:

1. Проблема пользователя и коммерческий outcome.
2. Затронутые страницы и состояния.
3. Утверждённое визуальное направление.
4. Иерархия информации и CTA.
5. Переиспользуемые и новые component roles.
6. Mobile и accessibility constraints.
7. Запрещённые изменения.
8. Проверки и acceptance criteria.

Если запрос только про направление, остановиться на decision-complete
спецификации. Не переходить к коду без scope на implementation.

## 5. Реализация

Когда реализация разрешена:

- сначала переиспользовать текущие components и domain types;
- отделять presentation от recommendation logic;
- изолировать dark/alpine styles от страниц вне scope;
- использовать CSS-only visual layers вместо внешних assets, если это
  соответствует задаче;
- сохранять русские пользовательские тексты;
- сохранять routes, analytics event names и `/go/[slug]`;
- добавлять компонент только при самостоятельной роли или повторении;
- работать mobile-first и проверять промежуточный результат в браузере.

Не делать «заодно» редизайн каталога, квиза, auth или internal pages.

## 6. Self-review

Проверить:

- чувствуется ли `premium snowboard gear advisor`;
- соответствует ли экран `dark alpine / icy technical`;
- понятна ли польза до декоративных деталей;
- виден ли один главный CTA;
- помогает ли дизайн начать квиз или понять результат;
- видны ли длина, ширина, талия, риск и причины;
- отличаются ли recommendation cards от catalog cards;
- не мешает ли визуал клику в магазин и email capture;
- не появился ли generic SaaS, CRM или AI-startup стиль;
- нет ли лишней анимации, glow и равнозначных карточек;
- не затронуты ли страницы вне scope;
- работает ли keyboard, focus-visible и reduced motion.

## 7. Проверки

Если менялся код:

```bash
git diff --check
npm run lint
npm run test
npm run build
```

Для UI дополнительно проверить:

```text
/
/quiz
/result
/catalog
/about
390 / 768 / 1440 px
```

Проверить empty, loading, error и risk states, если они затронуты.

Если задача только документационная:

```bash
git diff --check
git status --short
```

Не скрывать существующие или новые ошибки. Указывать команду, результат и
причину, если проверка не выполнена.

## 8. Что запрещено

- generic SaaS UI и случайные AI gradients;
- детский snow-theme;
- изменение recommendation algorithm без отдельного scope;
- изменение API, DB, import или auth без отдельного scope;
- удаление или переименование analytics events;
- обход store redirect/tracking;
- новые dependencies, fonts или external assets без необходимости;
- глобальное изменение catalog cards в локальной result-задаче;
- перевод пользовательского интерфейса на английский;
- декоративность, снижающая контраст или коммерческую ясность;
- завершение задачи без проверок и честного отчёта.

## 9. Формат отчёта

```text
Что сделано
Какие файлы изменены
Менялся ли production code
Какие проверки запускались
Что не удалось проверить
Риски/замечания
Следующий логичный шаг
```

Для UI-задачи дополнительно назвать проверенные viewport и состояния.
