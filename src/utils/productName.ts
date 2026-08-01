// Название товара в данных всегда заканчивается на "(Категория)" — это
// техническая метка, добавленная при сборе данных с основного сайта.
// Некоторые категории сами содержат скобки, например
// "(КБД (cbd) / Мицелий)" — простой regex такое не берёт (вложенные
// скобки). Поэтому ищем конец строки и вручную считаем глубину скобок,
// чтобы найти именно ту "(", которая открывает последнюю группу.
export function cleanProductName(name: string | undefined | null): string {

  if (!name) return "";

  let result = name.trim();

  if (!result.endsWith(")")) {
    return result;
  }

  let depth = 0;

  for (let i = result.length - 1; i >= 0; i--) {

    const char = result[i];

    if (char === ")") {
      depth++;
    } else if (char === "(") {

      depth--;

      if (depth === 0) {
        result = result.slice(0, i).trim();
        return result;
      }

    }

  }

  // Скобки не сбалансированы — ничего не трогаем, чтобы не сломать название
  return name.trim();

}
