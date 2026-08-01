const API_URL = "/api";


// Кэш в памяти модуля — переживает возврат назад (компонент страницы
// пересоздаётся, а модуль — нет). Позволяет отрисовать список товаров
// мгновенно из кэша, пока в фоне идёт свежий запрос.
let productsCache: any[] | null = null;
let categoriesCache: any[] | null = null;


export function getCachedProducts() {
  return productsCache;
}


export function getCachedCategories() {
  return categoriesCache;
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


  return response.json();

}
