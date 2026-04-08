# Импорт моделей из CSV

Если не хочется править `JSON`, каталог можно загружать в базу из двух `CSV`-файлов.

## Какие файлы нужны

Шаблоны уже лежат в проекте:

- [models.csv](c:/EdgeFit/src/data/csv-template/models.csv)
- [sizes.csv](c:/EdgeFit/src/data/csv-template/sizes.csv)

Скопируй их в отдельную папку, например:

- `src/data/csv-import/models.csv`
- `src/data/csv-import/sizes.csv`

И уже там заполняй своими данными.

## Что хранится в `models.csv`

Одна строка = одна модель доски.

Поля:

- `slug`
- `brand`
- `model_name`
- `description_short`
- `description_full`
- `riding_style`
- `skill_level`
- `flex`
- `price_from`
- `image_url`
- `affiliate_url`
- `is_active`
- `board_line`
- `shape_type`
- `data_status`
- `source_name`
- `source_url`
- `source_checked_at`
- `scenarios`
- `not_ideal_for`

### Допустимые значения

- `riding_style`: `all-mountain`, `park`, `freeride`
- `skill_level`: `beginner`, `intermediate`, `advanced`
- `board_line`: `men`, `women`, `unisex`
- `shape_type`: `twin`, `asym-twin`, `directional-twin`, `directional`, `tapered-directional`
- `data_status`: `draft`, `verified`
- `is_active`: `true` или `false`

`shape_type` можно оставить пустым, если форму доски ещё не сверяли вручную.

### Поля для реального каталога

- `data_status`
  - `draft` — карточка ещё не проверена и может быть черновой
  - `verified` — размеры и ширина сверены с источником
- `source_name`
  - человекочитаемое название источника, например `официальная размерная таблица Jones`
- `source_url`
  - прямая ссылка на страницу или документ, где проверялись характеристики
- `source_checked_at`
  - дата проверки в формате `ГГГГ-ММ-ДД`

Если у модели стоит `data_status=verified`, поля `source_name` и `source_url` должны быть заполнены.

### Поля со списками

Для `scenarios` и `not_ideal_for` несколько значений разделяются вертикальной чертой:

```text
Подходит для трассы|Подходит для первого комплекта|Подходит для среднего уровня
```

## Что хранится в `sizes.csv`

Одна строка = один размер модели.

Поля:

- `product_slug`
- `size_cm`
- `size_label`
- `waist_width_mm`
- `recommended_weight_min`
- `recommended_weight_max`
- `width_type`

### Допустимые значения

- `width_type`: `regular`, `mid-wide`, `wide`

`product_slug` должен совпадать со `slug` в `models.csv`.

`size_label` не обязателен, но полезен для размеров вроде `160W` или `159W`.
Если поле пустое, сервис покажет обычное числовое значение из `size_cm`.

`recommended_weight_max` тоже можно оставить пустым, если бренд указывает только
нижнюю границу веса, например `40+ кг`.

## Как загрузить CSV в базу

По умолчанию команда ждёт файлы здесь:

- `src/data/csv-import/models.csv`
- `src/data/csv-import/sizes.csv`

После заполнения запусти:

```bash
npm run база:импорт-из-csv
```

## Если файлы лежат в другом месте

Можно указать свои пути через переменные окружения:

```bash
CSV_ФАЙЛ_МОДЕЛЕЙ=полный_путь_к_models.csv
CSV_ФАЙЛ_РАЗМЕРОВ=полный_путь_к_sizes.csv
```

И затем выполнить ту же команду:

```bash
npm run база:импорт-из-csv
```

## Что делает импорт

- добавляет новые модели
- обновляет существующие модели по `slug`
- полностью пересобирает размеры модели из `sizes.csv`

Это удобно, потому что можно несколько раз перезаливать каталог без ручной чистки таблиц.

## Как проверить результат в DBeaver

Модели:

```sql
select brand, model_name, slug
from products
order by brand, model_name;
```

Размеры:

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

## Загрузка через браузер

Если не хочется работать через терминал, в проекте есть внутренняя страница:

- `/internal/import`
- `/internal/catalog` для ручного редактирования уже загруженных моделей

Что она делает:

- принимает `models.csv` и `sizes.csv`
- проверяет обязательные поля
- загружает каталог в базу через тот же механизм, что и консольный импорт
- показывает, сколько моделей и размеров реально записано

Важно:

- страница не добавлена в публичную навигацию
- для работы нужен настроенный `DATABASE_URL`
- для доступа нужен вход через `/internal/login`
- если в одном из файлов есть ошибка, импорт не сохранится частично
- ручное редактирование моделей доступно на `/internal/catalog`
