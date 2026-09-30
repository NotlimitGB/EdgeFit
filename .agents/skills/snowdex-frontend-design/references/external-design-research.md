# Внешние design skills: исследование для SnowDex

Дата проверки: 2026-09-30. Прочитаны публичные SKILL.md и применимые лицензии;
версии зафиксированы ниже. Это reference для пересмотра агентских инструкций,
не обязательный шаг обычной UI-задачи и не автоматически обновляемый dependency.

## Источники и выбранные идеи

- [Anthropic frontend-design](https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/frontend-design/SKILL.md),
  commit `8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4`:
  предметный контекст, намеренная типографика, смысл структурных элементов,
  сдержанная выразительность и самокритика.
  [Лицензия Apache-2.0](https://github.com/anthropics/skills/blob/8a1541c4a3ffa5a20a5a91de0dcf3f0bab1d1ef4/skills/frontend-design/LICENSE.txt).
- [PracticalSwan frontend-design](https://github.com/PracticalSwan/agent-skills/blob/ff6d12f61e8250dd1b988e101a482f6adc05c451/frontend-design/SKILL.md),
  commit `ff6d12f61e8250dd1b988e101a482f6adc05c451`, version 2.0:
  пригодность для пользователя и задачи, полные состояния, адаптивность,
  доступность как обязательный критерий, соразмерное планирование.
  [MIT](https://github.com/PracticalSwan/agent-skills/blob/ff6d12f61e8250dd1b988e101a482f6adc05c451/frontend-design/LICENSE.txt)
  и [Apache-2.0](https://github.com/PracticalSwan/agent-skills/blob/ff6d12f61e8250dd1b988e101a482f6adc05c451/frontend-design/LICENSE-APACHE-2.0.txt);
  [third-party notices](https://github.com/PracticalSwan/agent-skills/blob/ff6d12f61e8250dd1b988e101a482f6adc05c451/frontend-design/THIRD_PARTY_NOTICES.md)
  описывают смешанное происхождение. Не считать весь skill исключительно MIT.
- [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/09170eec67eefd46a7ae85de61b40c194020f997/.claude/skills/ui-ux-pro-max/SKILL.md),
  commit `09170eec67eefd46a7ae85de61b40c194020f997`:
  приоритет доступности и взаимодействия, определение реального стека,
  проверка применимости найденных рекомендаций и честный fallback.
  [Лицензия MIT](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/09170eec67eefd46a7ae85de61b40c194020f997/LICENSE).
- [KilimiaoSix frontend-design-codex](https://github.com/KilimiaoSix/frontend-design-codex-skill/blob/0593d7e449c883b64fee146e4224066646e242ba/SKILL.md),
  commit `0593d7e449c883b64fee146e4224066646e242ba`, архивированный репозиторий:
  цикл реализации, браузерной проверки, исправления и evidence сдачи.
  [Apache-2.0](https://github.com/KilimiaoSix/frontend-design-codex-skill/blob/0593d7e449c883b64fee146e4224066646e242ba/LICENSE)
  и [NOTICE](https://github.com/KilimiaoSix/frontend-design-codex-skill/blob/0593d7e449c883b64fee146e4224066646e242ba/NOTICE).
- [dachent frontend-design-codex](https://github.com/dachent/skills/blob/2e133e356a11214cd9c31f479ec021625f2df571/frontend-design-codex/SKILL.md),
  commit `2e133e356a11214cd9c31f479ec021625f2df571`:
  оценка через отрисованный интерфейс, реальные состояния и screenshots.
  [Лицензия MIT](https://github.com/dachent/skills/blob/2e133e356a11214cd9c31f479ec021625f2df571/LICENSE).
  Это независимый одноимённый skill, не версия KilimiaoSix.

## Что не переносится

- Процентная rubric PracticalSwan: создаёт ложную точность; критерии полезны
  как качественная проверка без подсчёта общего балла.
- Обязательный генератор design system, базы и style dials Pro Max: не заменяют
  исследование SnowDex и создают конкурирующий источник решений.
- Квоты anti-pattern checks, обязательный Image Gen, готовые motion presets
  KilimiaoSix: объём механики не доказывает результат, новые assets/dependencies
  не разрешаются автоматически.
- `.shared/visual-runtime` dachent: отсутствующий repo-specific инструмент не
  становится зависимостью SnowDex; выбирать доступные средства проверки.
- Предписания новой типографики, hero или определённых эффектов: существующий
  стек, Cyrillic, доступность, производительность и brief имеют приоритет.
- Абсолютный запрет шрифта, карточек, светлой/тёмной темы: форма оценивается по
  функции. Заданный пользователем стиль не отменяется эстетическим blacklist.
- Универсальные числа для motion, spacing или breakpoints: нужны решения по
  контенту; 390/768/1440 — база проверки, не границы допустимого дизайна.

## Использование и лицензии

SnowDex instructions написаны самостоятельно вокруг продуктовых решений и
инженерных границ репозитория. Заимствованы общие идеи workflow; внешние тексты,
код, таблицы, scripts, databases и структура skill-пакетов не vendored.

`EXTERNAL_TEXT_CODE_DIRECTLY_REUSED=NO`.

При будущем существенном reuse проверять лицензию именно выбранного файла.
MIT требует сохранять copyright и permission notice для копий/существенных
частей. Apache-2.0 требует предоставлять лицензию, сохранять применимые notices
и отмечать изменения; учитывать NOTICE при его наличии. Публичность исходника
сама по себе не является разрешением. Сейчас attribution-ссылки документируют
исследование, а не обозначают включение внешнего лицензированного кода.
