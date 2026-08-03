// "С этим товаром покупают" — простая система кросс-продаж на основе
// категорий, без сбора статистики продаж (её пока недостаточно). Для
// каждой главной категории вручную подобраны логичные дополняющие
// категории — то, что реально имеет смысл предложить вместе с товаром
// (бонг → шлифы/колпаки/адаптеры и аксессуары для чистки, гриндер →
// бумажки для самокруток и т.д.), а не просто "похожие" товары.

// id главных категорий — см. server/cache/categories.json
const MAIN_CATEGORY_IDS = {
  BONGS: "8961654",           // Бонги и Водники
  PARTS: "8975369",           // Запчасти и Тюнинг
  PIPES: "8975370",           // Сувенирные трубки
  GRINDERS: "8975371",        // Гриндеры и Прессы
  ROLLING: "8975372",         // Для самокруток
  WAX: "8975374",             // Аксессуары для Wax
  GROW: "9333541",            // Гроу
  ACCESSORIES: "9333542",     // Аксессуары
  CBD: "9333544",             // КБД (cbd) / Мицелий
  TEA: "9333545",             // Чайная Лавка
  INCENSE: "9333547",         // Благовония
  MERCH: "9333549",           // Мерч Космо Бонг
  NAPASY: "9372471"           // Напасы
} as const;

const ALL_MAIN_IDS: string[] = Object.values(MAIN_CATEGORY_IDS);

// Главная категория товара -> список категорий, которые логично предложить
// вместе с ним. Порядок не важен, дубликаты не страшны.
const COMPLEMENTARY_CATEGORIES: Record<string, string[]> = {
  [MAIN_CATEGORY_IDS.BONGS]: [MAIN_CATEGORY_IDS.PARTS, MAIN_CATEGORY_IDS.ACCESSORIES, MAIN_CATEGORY_IDS.NAPASY],
  [MAIN_CATEGORY_IDS.PARTS]: [MAIN_CATEGORY_IDS.BONGS, MAIN_CATEGORY_IDS.ACCESSORIES],
  [MAIN_CATEGORY_IDS.PIPES]: [MAIN_CATEGORY_IDS.ACCESSORIES, MAIN_CATEGORY_IDS.ROLLING],
  [MAIN_CATEGORY_IDS.GRINDERS]: [MAIN_CATEGORY_IDS.ROLLING, MAIN_CATEGORY_IDS.ACCESSORIES],
  [MAIN_CATEGORY_IDS.ROLLING]: [MAIN_CATEGORY_IDS.GRINDERS, MAIN_CATEGORY_IDS.ACCESSORIES],
  [MAIN_CATEGORY_IDS.WAX]: [MAIN_CATEGORY_IDS.ACCESSORIES],
  [MAIN_CATEGORY_IDS.ACCESSORIES]: [MAIN_CATEGORY_IDS.BONGS, MAIN_CATEGORY_IDS.PIPES],
  [MAIN_CATEGORY_IDS.CBD]: [MAIN_CATEGORY_IDS.TEA, MAIN_CATEGORY_IDS.INCENSE],
  [MAIN_CATEGORY_IDS.TEA]: [MAIN_CATEGORY_IDS.INCENSE, MAIN_CATEGORY_IDS.CBD],
  [MAIN_CATEGORY_IDS.INCENSE]: [MAIN_CATEGORY_IDS.TEA],
  [MAIN_CATEGORY_IDS.MERCH]: [MAIN_CATEGORY_IDS.BONGS],
  [MAIN_CATEGORY_IDS.NAPASY]: [MAIN_CATEGORY_IDS.BONGS]
  // Гроу намеренно не задан — для него нет отдельной дополняющей
  // категории, рекомендации берутся из той же категории (см. ниже)
};

// Из полного списка categoryIds товара находит id его главной категории
export function resolveMainCategoryId(categoryIds: string[] | undefined): string | null {
  if (!categoryIds) return null;
  return categoryIds.find(id => ALL_MAIN_IDS.includes(String(id))) ?? null;
}

// Список id категорий, среди которых стоит искать товары для блока
// "С этим товаром покупают" — дополняющие, либо (если для категории
// дополнение не задано) та же самая категория
export function getCrossSellCategoryIds(mainCategoryId: string | null): string[] {
  if (!mainCategoryId) return [];
  return COMPLEMENTARY_CATEGORIES[mainCategoryId] ?? [mainCategoryId];
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

type CrossSellProduct = {
  id: string;
  categoryIds?: string[];
  inStock?: boolean;
};

// Подбирает до `limit` товаров для блока "С этим товаром покупают"
export function pickCrossSellProducts<T extends CrossSellProduct>(
  allProducts: T[],
  currentProductId: string,
  currentCategoryIds: string[] | undefined,
  limit = 8
): T[] {

  const mainCategoryId = resolveMainCategoryId(currentCategoryIds);
  const targetIds = getCrossSellCategoryIds(mainCategoryId);

  if (targetIds.length === 0) return [];

  const matches = allProducts.filter(p =>
    String(p.id) !== String(currentProductId) &&
    p.inStock !== false &&
    p.categoryIds?.some(id => targetIds.includes(String(id)))
  );

  return shuffle(matches).slice(0, limit);

}
