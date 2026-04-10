# EdgeFit

Русскоязычный MVP-сервис для подбора сноуборда по росту, весу, размеру ботинка и стилю катания.

## Что уже заложено

- `Next.js 16` c App Router и Tailwind CSS v4
- главная страница, квиз, экран результата, каталог и карточка модели
- чистый доменный модуль расчёта в `src/lib/recommendation/engine.ts`
- стартовый seed-набор моделей в `src/data/seed/boards.seed.json`
- SQL-схема для PostgreSQL в `db/schema.sql`
- подключение к PostgreSQL по `DATABASE_URL`
- сохранение результатов квиза в таблицу `quiz_results`
- sitemap и robots для SEO-каркаса
- тесты алгоритма на `Vitest`

## Команды

```bash
npm install
npm run dev
npm run lint
npm run test
npm run build
```

## Переменные окружения

Создай файл `.env.local` по примеру `.env.example`.

Минимум нужен такой набор:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/edgefit
DATABASE_SSL=disable
INTERNAL_ACCESS_PASSWORD=ваш_внутренний_пароль
INTERNAL_ACCESS_SECRET=дополнительный_секрет_для_cookie
NEXT_PUBLIC_YANDEX_METRIKA_ID=номер_счётчика_метрики
```

## Работа с базой

1. Накати схему из файла `db/schema.sql`.
2. Проверь подключение:

```bash
npm run база:проверить
```

3. Загрузи стартовые модели:

```bash
npm run база:заполнить
```

4. Или импортируй свои данные из CSV:

```bash
npm run база:импорт-из-csv
```

5. Или обнови живой каталог из магазинов и сразу проверь качество данных:

```bash
npm run catalog:refresh
```

Эта команда сначала запускает импорт из Траектории и Триал-Спорта, а потом делает аудит:
проверяет битые размеры вроде `58`/`88`, пустые цены, отсутствие картинок, наличие доступных размеров и ссылки на магазины.

Если нужно только проверить уже загруженную базу без нового парса магазинов:

```bash
npm run audit:catalog
```

Если нужно импортировать только один источник, можно временно задать `STORE_IMPORT_SOURCE`.

Git Bash:

```bash
STORE_IMPORT_SOURCE=trial npm run import:stores
STORE_IMPORT_SOURCE=traektoria npm run import:stores
```

PowerShell:

```powershell
$env:STORE_IMPORT_SOURCE="trial"; npm run import:stores; Remove-Item Env:STORE_IMPORT_SOURCE
$env:STORE_IMPORT_SOURCE="traektoria"; npm run import:stores; Remove-Item Env:STORE_IMPORT_SOURCE
```

6. Или загружай каталог через браузер на внутренней странице:

```text
/internal/import
```

7. Или редактируй модели прямо из базы на внутренней странице:

```text
/internal/catalog
```

8. Внутренние страницы теперь защищены паролем. Сначала открой:

```text
/internal/login
```

После входа будут доступны:

- `/internal/catalog`
- `/internal/import`

Подробная инструкция по DBeaver лежит в `docs/dbeaver-postgres.md`.
Инструкция по CSV-импорту лежит в `docs/import-csv.md`.

Если база уже была создана раньше, чем появились `email_leads` или
`analytics_events`, просто заново выполни `db/schema.sql`: файл безопасен для
повторного запуска.

## Структура

```text
src/app                     маршруты и страницы
src/components              UI-слой
src/lib                     бизнес-логика, данные и схемы
src/data/seed               демо-набор моделей
src/types                   доменные типы
docs                        архитектура, алгоритм, аналитика
db                          схема PostgreSQL
scripts                     проверка подключения и заполнение базы
```

## Ближайшие шаги

1. Подменить демонстрационный набор на реальный датасет 30-50 моделей.
2. Добавить сохранение email-заявок и связку с результатами квиза.
3. Подключить аналитику кликов и завершения квиза.
4. Развернуть контентный слой для русскоязычного SEO.

## Аналитика и переходы в магазины

- Внутренние события по-прежнему пишутся в таблицу `analytics_events`.
- Если указан `NEXT_PUBLIC_YANDEX_METRIKA_ID`, на сайт автоматически подключается `Яндекс Метрика`.
- Для Метрики используются JavaScript-цели:
  - `edgefit_quiz_started`
  - `edgefit_quiz_step_completed`
  - `edgefit_quiz_completed`
  - `edgefit_result_viewed`
  - `edgefit_product_clicked`
  - `edgefit_email_submitted`
  - `edgefit_recalculation_started`
- Все кнопки `В магазин` теперь идут не напрямую на внешний сайт, а через внутренний редирект `/go/[slug]`.
- Это даёт нам три вещи:
  - считаем реальные outbound-клики в своей базе;
  - отправляем цели в `Яндекс Метрику`;
  - позже без переделки интерфейса подменяем обычные ссылки на партнёрские.
