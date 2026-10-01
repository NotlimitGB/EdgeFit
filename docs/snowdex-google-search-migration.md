# SnowDex: ручной перенос в Google Search Console

Этот runbook выполняет человек после отдельно разрешённых интеграции и
deployment. Он не запускает операции Google, DNS, Vercel или БД.
Кодовая готовность не означает, что production-перенос уже завершён.

## После deployment

1. Подтвердить успешный production deployment проверенного commit и доступность
   `https://snowdex.ru`. Проверить действующие URL overrides: production metadata,
   canonical, OpenGraph, robots и sitemap должны использовать именно этот origin.
   Если override указывает на старый домен, остановиться и отдельно согласовать
   изменение конфигурации; fallback не перекрывает явный environment override.
2. Подтвердить владение новой property SnowDex и сохранить владение старой
   `https://edge-fit.vercel.app/`. Способ подтверждения выбрать из доступных для
   конкретного типа property. Наличие HTML-файла само по себе не подтверждает
   владение в Google.
3. Проверить прямой HTTP 200 и неизменное тело
   `google-site-verification: google10fccbce44c29493.html` по обоим адресам:
   - `https://edge-fit.vercel.app/google10fccbce44c29493.html`;
   - `https://snowdex.ru/google10fccbce44c29493.html`.
4. Проверить старые `/`, `/catalog`, board URL, SEO landing, `/robots.txt` и
   `/sitemap.xml`: постоянный HTTP 308 на тот же путь SnowDex. Проверить query,
   например `/catalog?style=park&brand=Jones`. API, `/go`, `/internal`, `/_next`
   и их дочерние пути намеренно исключены. Preview hosts не перенаправляются.
5. Проверить новые страницы: HTTP 200, SnowDex в metadata, self-canonical
   `https://snowdex.ru/<тот же путь>`, отсутствие redirect loops. Board alias
   policy остаётся прежней. `/result` и сохранённые результаты остаются noindex.
6. Проверить `https://snowdex.ru/robots.txt` и полный sitemap: origin SnowDex,
   прежний набор разрешённых URL, отсутствие старого host. Передать
   `https://snowdex.ru/sitemap.xml` в новую property вручную.
7. В старой property использовать Change of Address **только если** текущие UI,
   типы properties и проверки Google поддерживают этот перенос. Требуется
   владение обеими properties. Не обходить неуспешные проверки; недоступность
   инструмента зафиксировать и продолжать наблюдение redirects/canonical/indexing.
8. Сохранять старую property, verification-файл и redirects минимум 180 дней,
   а при сохраняющемся трафике старых URL — дольше. Не удалять старую property
   сразу после отправки запроса.

## Наблюдение

Снять baseline перед переносом и регулярно сравнивать обе properties:
индексацию, выбранный Google canonical, redirect errors, страницы sitemap,
релевантные поисковые impressions/clicks и реальные organic quiz starts.
Не считать `site:` запрос доказательством полного покрытия индекса.
Проверять новые и старые репрезентативные URL через URL Inspection.
Не обещать сроки переноса или сохранение позиций: данные Google могут обновляться
с задержкой. Ошибки требуют отдельной задачи, не автоматической смены URL.

## Официальные источники

- [Google: Change of Address](https://support.google.com/webmasters/answer/9370220?hl=en)
- [Google: подтверждение владения](https://support.google.com/webmasters/answer/9008080?hl=en)
- [Next.js: redirects, HTTP 308 и сохранение query](https://nextjs.org/docs/app/api-reference/config/next-config-js/redirects)

Проверено 1 октября 2026 года. Это инструкция оператору, не гарантия доступности
конкретных названий кнопок или совместимости выбранных property types.
