// Фиксированный порядок отображения основных категорий — используется
// и в верхней ленте (Каталог/страница категории), и в сетке на Главной,
// чтобы везде порядок был одинаковый и заданный вручную, а не тот, что
// прислал Storeland.
export const MAIN_CATEGORY_ORDER: string[] = [
  "Гроу",
  "Бонги и Водники",
  "Запчасти и Тюнинг",
  "Сувенирные трубки",
  "Гриндеры и Прессы",
  "Для самокруток",
  "Аксессуары",
  "Напасы",
  "КБД (cbd) / Мицелий",
  "Аксессуары для Wax",
  "Чайная Лавка",
  "Благовония",
  "Дисконт",
  "Мерч Космо Бонг"
];

// Сортирует любой массив объектов с полем "#text" (название категории)
// согласно MAIN_CATEGORY_ORDER. Категории, которых нет в списке, уходят
// в конец в исходном порядке (на случай появления новой категории на
// сайте до того, как её добавят в список вручную).
export function sortByMainCategoryOrder<T extends { "#text": string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const indexA = MAIN_CATEGORY_ORDER.indexOf(a["#text"]);
    const indexB = MAIN_CATEGORY_ORDER.indexOf(b["#text"]);
    const safeA = indexA === -1 ? MAIN_CATEGORY_ORDER.length : indexA;
    const safeB = indexB === -1 ? MAIN_CATEGORY_ORDER.length : indexB;
    return safeA - safeB;
  });
}
