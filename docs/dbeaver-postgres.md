# Как подключить EdgeFit к базе через DBeaver

Ниже самый простой путь для PostgreSQL.

## 1. Что нужно заранее

- установленный PostgreSQL
- созданная база данных, например `edgefit`
- логин и пароль пользователя базы
- проект `EdgeFit` на локальной машине

Если PostgreSQL ещё не установлен, проще всего сначала поднять локальную базу и только потом подключать приложение.

## 2. Что прописать в `.env.local`

В корне проекта создай файл `.env.local`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/edgefit
DATABASE_SSL=disable
```

Если база не локальная, подставь свои значения:

```bash
DATABASE_URL=postgresql://ИМЯ_ПОЛЬЗОВАТЕЛЯ:ПАРОЛЬ@ХОСТ:5432/НАЗВАНИЕ_БАЗЫ
DATABASE_SSL=require
```

## 3. Как создать подключение в DBeaver

1. Открой DBeaver.
2. Нажми `Новая база данных` или `New Database Connection`.
3. Выбери `PostgreSQL`.
4. Заполни поля:
   - `Host`: `localhost`
   - `Port`: `5432`
   - `Database`: `edgefit`
   - `Username`: например `postgres`
   - `Password`: твой пароль
5. Если база локальная, вкладку SSL можно не включать.
6. Нажми `Проверить соединение`.
7. Если всё хорошо, нажми `Готово`.

## 4. Как накатить схему

1. В DBeaver открой подключение к базе `edgefit`.
2. Создай новый SQL-редактор.
3. Открой файл [schema.sql](c:/EdgeFit/db/schema.sql).
4. Выполни его целиком.

После этого в базе появятся таблицы:

- `products`
- `product_sizes`
- `quiz_results`
- `email_leads`

## 5. Как проверить подключение из проекта

В терминале из корня проекта:

```bash
npm run база:проверить
```

Если всё настроено правильно, увидишь сообщение об успешном подключении.

## 6. Как загрузить каталог

После применения схемы загружай каталог одним из живых способов:

```bash
npm run база:импорт-из-csv
```

или:

```bash
npm run catalog:refresh
```

Первая команда импортирует твои данные из CSV, вторая обновляет каталог из магазинов и сразу делает аудит качества данных.

## 7. Как проверить, что данные реально появились

В DBeaver выполни запрос:

```sql
select brand, model_name, riding_style, skill_level
from products
order by brand, model_name;
```

И отдельно:

```sql
select
  p.brand,
  p.model_name,
  ps.size_cm,
  ps.size_label,
  ps.waist_width_mm,
  ps.width_type
from product_sizes ps
join products p on p.id = ps.product_id
order by p.brand, p.model_name, ps.size_cm;
```

## 8. Как понять, что сайт уже читает данные из базы

После заполнения базы запусти проект:

```bash
npm run dev
```

Дальше:

1. открой каталог
2. открой карточку любой модели
3. пройди квиз

Если `DATABASE_URL` задан, проект уже будет:

- читать модели из PostgreSQL
- сохранять результаты квиза в `quiz_results`

## 9. Как проверить, что результаты квиза пишутся в базу

После прохождения квиза выполни в DBeaver:

```sql
select
  created_at,
  session_id,
  height_cm,
  weight_kg,
  boot_size_eu,
  result_length_min,
  result_length_max,
  result_width_type,
  result_boot_drag_risk
from quiz_results
order by created_at desc;
```

Если хочешь, следующим шагом я могу сразу сделать ещё и импорт из CSV, чтобы новые модели можно было добавлять в базу без ручной правки JSON.
