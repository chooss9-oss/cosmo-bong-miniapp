const API_URL = "/api";


// Кэш в памяти модуля — переживает возврат назад (компонент страницы
// пересоздаётся, а модуль — нет). Позволяет отрисовать список товаров
// мгновенно из кэша, пока в фоне идёт свежий запрос.
let productsCache: any[] | null = null;
let categoriesCache: any[] | null = null;
const productCache = new Map<string, any>();


export function getCachedProducts() {
  return productsCache;
}


export function getCachedCategories() {
  return categoriesCache;
}


// Быстрая "превью"-версия товара из уже загруженного списка каталога —
// у неё есть имя/цена/картинка, но нет описания и вариантов.
// Достаточно, чтобы карточка товара отрисовалась мгновенно, пока грузятся
// полные данные.
export function getCachedProductPreview(id: string) {
  if (productCache.has(id)) {
    return productCache.get(id);
  }
  return (
    productsCache?.find((p: any) => String(p.id) === String(id)) ?? null
  );
}


export async function getProducts() {

  const response = await fetch(
    `${API_URL}/products`
  );


  if (!response.ok) {
    throw new Error(
      "Ошибка загрузки товаров"
    );
  }


  const data = await response.json();

  productsCache = data;

  return data;

}



export async function getCategories() {

  const response = await fetch(
    `${API_URL}/categories`,
    { cache: "no-store" }
  );


  if (!response.ok) {
    throw new Error(
      "Ошибка загрузки категорий"
    );
  }


  const data = await response.json();

  categoriesCache = data;

  return data;

}



export async function getProduct(id: string) {

  const response = await fetch(
    `${API_URL}/product/${id}`
  );


  if (!response.ok) {

    throw new Error(
      "Товар не найден"
    );

  }


  const data = await response.json();

  productCache.set(id, data);

  return data;

}
