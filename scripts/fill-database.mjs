console.error(
  [
    "Стартовый seed-набор удалён из проекта.",
    'Используйте один из живых способов наполнения каталога:',
    '- npm run база:импорт-из-csv',
    '- npm run import:stores',
    '- npm run catalog:refresh',
  ].join("\n"),
);

process.exit(1);
