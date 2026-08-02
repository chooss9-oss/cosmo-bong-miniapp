// Позиции горизонтального скролла строк категорий/подкатегорий.
// Хранится вне React-компонентов (в переменных модуля), потому что
// AnimatedRoutes оборачивает страницы в <div key={location.key}> и
// пересоздаёт компонент заново при каждом переходе (в каталог, в категорию,
// в товар и обратно) — обычный useRef/useState внутри компонента каждый
// раз обнуляется вместе с DOM. Модуль же не пересоздаётся, пока не
// перезагрузится вся страница приложения.

// Общая позиция для строки категорий — она одна и та же что в Каталоге,
// что на странице категории (визуально это одна и та же прокручиваемая
// лента).
let categoryScrollX = 0;

export function getCategoryScrollX(): number {
  return categoryScrollX;
}

export function setCategoryScrollX(x: number) {
  categoryScrollX = x;
}

// Позиция строки подкатегорий — своя для каждой категории (разный список).
const subcategoryScrollX = new Map<string, number>();

export function getSubcategoryScrollX(categoryId: string | undefined): number {
  if (!categoryId) return 0;
  return subcategoryScrollX.get(categoryId) ?? 0;
}

export function setSubcategoryScrollX(categoryId: string | undefined, x: number) {
  if (!categoryId) return;
  subcategoryScrollX.set(categoryId, x);
}
