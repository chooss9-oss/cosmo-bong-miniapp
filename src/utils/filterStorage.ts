// Сохраняем выбранные фильтры (сортировка, "со скидкой") в sessionStorage,
// чтобы при возврате назад со страницы товара они не сбрасывались —
// компонент страницы каталога/категории/акций пересоздаётся заново при
// каждом переходе, поэтому обычный useState теряет значение.

export function readStoredFilter<T>(key: string, fallback: T): T {

  try {

    const raw = sessionStorage.getItem(key);

    if (raw === null) return fallback;

    return JSON.parse(raw) as T;

  } catch {

    return fallback;

  }

}


export function writeStoredFilter<T>(key: string, value: T) {

  try {

    sessionStorage.setItem(key, JSON.stringify(value));

  } catch {
    // sessionStorage недоступен — тихо игнорируем
  }

}
