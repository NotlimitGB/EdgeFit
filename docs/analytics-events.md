# События аналитики для MVP

## Внутренние события проекта

Эти события пишутся в таблицу `analytics_events` и нужны нам для своей воронки, сверки кликов и последующей монетизации.

- `home_viewed`
- `quiz_started`
- `quiz_step_viewed`
- `quiz_step_completed`
- `quiz_completed`
- `result_viewed`
- `product_clicked`
- `email_submitted`
- `recalculation_started`
- `result_exited`

## Цели для Яндекс Метрики

В `Яндекс Метрику` нет смысла отправлять всё подряд. Для MVP мы отправляем только ключевые события воронки:

- `edgefit_quiz_started`
- `edgefit_quiz_step_completed`
- `edgefit_quiz_completed`
- `edgefit_result_viewed`
- `edgefit_product_clicked`
- `edgefit_email_submitted`
- `edgefit_recalculation_started`

Просмотры страниц Метрика и так видит через `hit`, поэтому отдельную цель на `home_viewed` мы не заводим.

## Какую воронку считаем

- просмотр главной
- старт квиза
- завершение квиза
- просмотр результата
- клик в магазин
- отправка почты
- повторный расчёт

## Что уже подключено

- клиентские события пишутся в `analytics_events`
- все кнопки `В магазин` идут через `/go/[slug]`
- редирект в магазин тоже пишет `product_clicked`
- при наличии `NEXT_PUBLIC_YANDEX_METRIKA_ID` цели автоматически отправляются в `Яндекс Метрику`

## Минимальные свойства событий

- `session_id`
- `page_path`
- `step_name`
- `board_slug`
- `placement`
- `size_cm`
- `size_label`
- `width_type`
- `result_width_type`
- `result_boot_drag_risk`
- `riding_style`
- `skill_level`
- `board_line_preference`

## Что завести в интерфейсе Метрики

В счётчике создай JavaScript-цели с такими именами:

- `edgefit_quiz_started`
- `edgefit_quiz_step_completed`
- `edgefit_quiz_completed`
- `edgefit_result_viewed`
- `edgefit_product_clicked`
- `edgefit_email_submitted`
- `edgefit_recalculation_started`

## KPI для первого запуска

- конверсия в старт квиза
- completion rate квиза
- конверсия из результата в клик по магазину
- доля пользователей, оставивших почту
- доля пользователей, запустивших повторный расчёт
