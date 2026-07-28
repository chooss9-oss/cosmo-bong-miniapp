const API_URL = "/api";


export async function getProducts() {

  const response = await fetch(
    `${API_URL}/products`
  );


  if (!response.ok) {
    throw new Error(
      "Ошибка загрузки товаров"
    );
  }


  return response.json();

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


  return response.json();

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