require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const { waitUntil } = require("@vercel/functions");

const orderRouter = require("./routes/orders");

const {
  getRedisClient,
  saveReplyMapping,
  getReplyMapping,
  telegramApi
} = require("./replyMapping");

const {
  STATUS_LABELS,
  getOrdersForUser
} = require("./orderStore");

const {
  handleOrderCallback,
  tryHandleTrackingReply,
  tryHandleShippingData,
  checkOrderTimeouts
} = require("./orderFlow");

const {
  getBonusBalance,
  getMaxRedeemable
} = require("./bonusStore");

const app = express();

// За прокси Vercel req.protocol иначе всегда показывает "http" —
// доверяем заголовку X-Forwarded-Proto, чтобы получать реальную схему
app.set("trust proxy", true);

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

let products = [];
let categories = [];

const CATEGORY_SLUGS = {
  "Гроу": "Grow",
  "Бонги и Водники": "Bongi-i-Vodniki",
  "Запчасти и Тюнинг": "Zapchasti-i-Tyuning",
  "Сувенирные трубки": "Suvenirnye-trubki",
  "Гриндеры и Прессы": "Grindery-i-Pressy",
  "Для самокруток": "Dlya-samokrutok",
  "Аксессуары": "Aksessuary",
  "Напасы": "Napasy",
  "КБД (cbd) / Мицелий": "CBD-Micelij",
  "Аксессуары для Wax": "Wax-devajsy",
  "Чайная Лавка": "Chajnaya-Lavka",
  "Благовония": "Blagovoniya",
  "Дисконт": "Diskont",
  "Мерч Космо Бонг": "Merch"
};

// id подкатегории (как в cache/categories.json, "@_id") -> её URL-слаг на
// сайте. Раньше товары получали в categoryIds только id ГЛАВНОЙ категории
// (см. scrapeNewProducts ниже) — подкатегория никуда не сохранялась, из-за
// этого фильтр по подкатегориям в приложении показывал пусто, хотя в
// админке Storeland товары разложены по подкатегориям. Список сопоставлен
// вручную по названиям (сверено с боковым меню каталога на сайте).
const SUBCATEGORY_SLUGS = {

  // Бонги и Водники
  "8961655": "Steklyannye",
  "9323547": "S-perkolyatorom",
  "9323684": "Silikonovye-bongi",
  "9323710": "Vodniki",
  "9323722": "Prochie",          // в кэше "Необычные", на сайте сейчас "Нестандартные"
  "9324152": "Akrilovye",

  // Запчасти и Тюнинг
  "9324282": "Shlify",
  "9324283": "Chashi-kolpaki",
  "9324284": "Prekulery",
  "9324286": "Dopy-adaptery-perehodniki",

  // Сувенирные трубки
  "9324871": "Steklo",
  "9330102": "Metall",
  "9330144": "Silikon",
  "9330146": "Keramika",
  "9330170": "Derevo",
  "9330171": "Neobychnye",

  // Гриндеры и Прессы
  "9331486": "Grindery",
  "9331487": "Pressy",

  // Для самокруток
  "9331619": "Bumazhki",
  "9331620": "Konusy",
  "9331621": "Blanty",
  "9331622": "Filtry",
  "9331623": "Dopolnitelno",

  // Аксессуары
  "9345087": "Setki",
  "9345088": "Chistka-i-uhod",
  "9345089": "Zazhigalki",
  "9345090": "Vesy-karmannye",
  "9345091": "Hranenie-i-bezopasnost",
  "9345092": "Snuff-devajsy",
  "9345093": "Podnosy-i-miksboly",

  // КБД (cbd) / Мицелий
  "9640111": "CBD-produkciya",
  "9725205": "Micelij-Gribov",

  // Гроу
  "9338427": "Grouboksy",
  "9338428": "Ventilyaciya",
  "9338429": "Udobreniya-i-stimulyatory",
  "9338437": "Osveshhenie",
  "9338438": "Ph-i-TDS",
  "9338439": "Substraty-i-Gorshki",
  "9338440": "Aksessuary-i-inventar"

};

// ==============================
// REDIS (постоянное хранилище скидок, наличия и новых товаров)
// getRedisClient/saveReplyMapping/getReplyMapping/telegramApi теперь в
// ./replyMapping.js — общий модуль, им пользуется и orders.js
// ==============================

async function readSalesCacheFromRedis() {
  try {
    const client = await getRedisClient();
    const stored = await client.get("salesCache");

    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error("❌ Не удалось прочитать скидки из Redis:", error.message);
  }

  return null;
}

async function writeSalesCacheToRedis(data) {
  try {
    const client = await getRedisClient();
    await client.set("salesCache", JSON.stringify(data));
  } catch (error) {
    console.error("❌ Не удалось записать скидки в Redis:", error.message);
  }
}

async function readStockCacheFromRedis() {
  try {
    const client = await getRedisClient();
    const stored = await client.get("stockCache");

    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error("❌ Не удалось прочитать наличие из Redis:", error.message);
  }

  return null;
}

async function writeStockCacheToRedis(data) {
  try {
    const client = await getRedisClient();
    await client.set("stockCache", JSON.stringify(data));
  } catch (error) {
    console.error("❌ Не удалось записать наличие в Redis:", error.message);
  }
}

async function readStockOffsetFromRedis() {
  try {
    const client = await getRedisClient();
    const stored = await client.get("stockCheckOffset");
    return stored ? parseInt(stored, 10) : 0;
  } catch (error) {
    console.error("❌ Не удалось прочитать offset наличия:", error.message);
    return 0;
  }
}

async function writeStockOffsetToRedis(offset) {
  try {
    const client = await getRedisClient();
    await client.set("stockCheckOffset", String(offset));
  } catch (error) {
    console.error("❌ Не удалось записать offset наличия:", error.message);
  }
}

// subcategoryCache: { productId: [subCategoryId, ...] } — дополнение к
// основному categoryIds товара, которое достаём отдельным сканом (см.
// scrapeSubcategories) и подмешиваем на выдаче в /api/products и
// /api/product/:id, не трогая исходный статический кэш cache/products.json.
async function readSubcategoryCacheFromRedis() {
  try {
    const client = await getRedisClient();
    const stored = await client.get("subcategoryCache");

    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error("❌ Не удалось прочитать подкатегории из Redis:", error.message);
  }

  return {};
}

async function writeSubcategoryCacheToRedis(data) {
  try {
    const client = await getRedisClient();
    await client.set("subcategoryCache", JSON.stringify(data));
  } catch (error) {
    console.error("❌ Не удалось записать подкатегории в Redis:", error.message);
  }
}

async function readNewProductsFromRedis() {
  try {
    const client = await getRedisClient();
    const stored = await client.get("newProducts");

    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error("❌ Не удалось прочитать новые товары из Redis:", error.message);
  }

  return [];
}

async function writeNewProductsToRedis(data) {
  try {
    const client = await getRedisClient();
    await client.set("newProducts", JSON.stringify(data));
  } catch (error) {
    console.error("❌ Не удалось записать новые товары в Redis:", error.message);
  }
}

// ==============================
// КЭШ РАСПРОДАЖИ (запасной вариант в памяти + фоновое обновление)
// ==============================
let salesCache = {};
let lastSalesFetch = 0;
let salesFetchInProgress = false;

function refreshSalesDataInBackground() {
  const now = Date.now();

  if (now - lastSalesFetch < 600000) return;
  if (salesFetchInProgress) return;

  salesFetchInProgress = true;

  const task = scrapeSalesData()
    .then(async result => {
      salesCache = result;
      lastSalesFetch = Date.now();
      await writeSalesCacheToRedis(result);
      console.log(`✅ Данные распродажи обновлены в фоне: найдено ${Object.keys(result).length} модификаций.`);
    })
    .catch(error => {
      console.error("❌ Фоновое обновление скидок не удалось:", error.message);
    })
    .finally(() => {
      salesFetchInProgress = false;
    });

  try {
    waitUntil(task);
  } catch (e) {
    // waitUntil доступен только в среде Vercel;
    // при локальном запуске просто игнорируем это
  }
}

async function scrapeSalesData() {
  console.log("🔄 Обновление данных распродажи с cosmo-bong.ru...");

  const { data: listPage } = await axios.get("https://cosmo-bong.ru/discount/Rasprodazha", {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    timeout: 8000
  });

  const $list = cheerio.load(listPage);
  const productUrls = new Set();

  $list('.product-name a').each((i, el) => {
    const href = $list(el).attr('href');
    if (href) {
      productUrls.add(href.split('?')[0]);
    }
  });

  const newSalesCache = {};

  await Promise.allSettled(

    Array.from(productUrls).map(async (url) => {

      try {
        const { data: productPage } = await axios.get(url, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
          timeout: 12000
        });

        const $product = cheerio.load(productPage);

        $product('.goodsDataMainModificationsList').each((i, el) => {
          const modId = $product(el).find('input[name="id"]').attr('value');
          const priceNow = parseInt($product(el).find('input[name="price_now"]').attr('value'), 10);
          const priceOld = parseInt($product(el).find('input[name="price_old"]').attr('value'), 10);

          if (modId && priceOld && priceNow && priceOld > priceNow) {
            newSalesCache[modId] = {
              oldPrice: priceOld,
              discount: Math.round(((priceOld - priceNow) / priceOld) * 100)
            };
          }
        });

      } catch (innerError) {
        console.error(`⚠️ Не удалось загрузить товар ${url}:`, innerError.message);
      }

    })

  );

  return newSalesCache;
}

// ==============================
// ПРОВЕРКА НАЛИЧИЯ — ПОРЦИОННО (одна порция за один запуск)
// ==============================
async function scrapeStockChunk(productUrls, offset, chunkSize, urlToIds = {}) {

  const chunk = productUrls.slice(offset, offset + chunkSize);
  const newStockCache = {};
  const BATCH_SIZE = 50;

  for (let i = 0; i < chunk.length; i += BATCH_SIZE) {

    const batch = chunk.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(

      batch.map(async (url) => {

        try {
          const { data: productPage } = await axios.get(url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
            timeout: 6000
          });

          const $product = cheerio.load(productPage);

          $product('.goodsDataMainModificationsList').each((i, el) => {
            const modId = $product(el).find('input[name="id"]').attr('value');
            const restValueAttr = $product(el).find('input[name="rest_value"]').attr('value');
            const restValue = parseInt(restValueAttr, 10);

            if (modId) {
              newStockCache[modId] = isNaN(restValue) ? 0 : restValue;
            }
          });

          const wishlistModId = $product('.add-wishlist').attr('data-mod-id');

          if (wishlistModId && newStockCache[wishlistModId] === undefined) {
            const availableFalseDiv = $product('.available-false').first();
            const style = availableFalseDiv.attr('style') || '';
            const isHidden = style.includes('display:none') || style.includes('display: none');
            const isOutOfStock = availableFalseDiv.length > 0 && !isHidden;
            newStockCache[wishlistModId] = isOutOfStock ? 0 : 1;
          }

        } catch (innerError) {

          console.error(`⚠️ Не удалось проверить наличие ${url}:`, innerError.message);

          // Если страница товара реально удалена в Storeland (404) — это
          // надёжный сигнал, что товар снят с продажи. Помечаем как
          // "нет в наличии", а не оставляем старое значение навсегда
          // (иначе удалённые товары так и висят в наличии бесконечно).
          if (innerError.response && innerError.response.status === 404) {
            const ids = urlToIds[url] || [];
            ids.forEach(id => {
              newStockCache[id] = 0;
            });
          }

        }

      })

    );

  }

  const nextOffset = (offset + chunkSize >= productUrls.length) ? 0 : offset + chunkSize;

  return { newStockCache, nextOffset };
}

// ==============================
// ПОИСК НОВЫХ ТОВАРОВ
// ==============================
async function scrapeNewProducts() {
  console.log("🔄 Поиск новых товаров...");

  const existingUrls = new Set(
    products
      .map(p => p.url ? p.url.split('?')[0] : null)
      .filter(Boolean)
  );
  const newProductsFound = [];

  const categoryEntries = Object.entries(CATEGORY_SLUGS);

  const categoryResults = await Promise.allSettled(

    categoryEntries.map(async ([categoryName, slug]) => {

      const categoryObj = categories.find(c => c["#text"] === categoryName);
      const categoryId = categoryObj ? String(categoryObj["@_id"]) : null;

      const { data: html } = await axios.get(`https://cosmo-bong.ru/catalog/${slug}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        timeout: 15000
      });

      const urlMatches = [...html.matchAll(/https:\/\/cosmo-bong\.ru\/goods\/[^"'\s?]+/g)];
      const foundUrls = [...new Set(urlMatches.map(m => m[0]))];

      const newUrls = foundUrls
        .filter(url => !existingUrls.has(url))
        .map(url => ({ url, categoryId }));

      return newUrls;

    })

  );

  const allNewUrlEntries = [];
  const seenUrls = new Set();

  categoryResults.forEach(result => {

    if (result.status === "fulfilled") {

      result.value.forEach(entry => {

        if (!seenUrls.has(entry.url)) {
          seenUrls.add(entry.url);
          allNewUrlEntries.push(entry);
        }

      });

    } else {
      console.error("⚠️ Не удалось загрузить категорию:", result.reason?.message);
    }

  });

  console.log(`🔎 Новых ссылок на товары найдено: ${allNewUrlEntries.length}`);

  const BATCH_SIZE = 50;

  for (let i = 0; i < allNewUrlEntries.length; i += BATCH_SIZE) {

    const batch = allNewUrlEntries.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(

      batch.map(async ({ url, categoryId }) => {

        try {
          const { data: productPage } = await axios.get(url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
            timeout: 12000
          });

          const $product = cheerio.load(productPage);

          const name = $product('.product-name h1').first().text().trim();

          const description = $product('.htmlDataBlock').first().html() || "";

          const images = [];

          $product('.thumblist img').each((i, el) => {
            const src = $product(el).attr('src');
            if (src) {
              images.push(src.replace('/baec64/', '/075a3e/'));
            }
          });

          let addedAny = false;

          $product('.goodsDataMainModificationsList').each((i, el) => {

            const modId = $product(el).find('input[name="id"]').attr('value');
            const priceAttr = $product(el).find('input[name="price_now"]').attr('value');
            const price = parseFloat(priceAttr);

            if (modId && name) {
              newProductsFound.push({
                id: modId,
                name,
                price: isNaN(price) ? 0 : price,
                description,
                images,
                categoryIds: categoryId ? [categoryId] : [],
                url
              });
              addedAny = true;
            }

          });

          if (!addedAny) {

            const modId = $product('.add-wishlist').attr('data-mod-id');
            const priceAttr = $product('.main-price').first().attr('content');
            const price = parseFloat(priceAttr);

            if (modId && name) {
              newProductsFound.push({
                id: modId,
                name,
                price: isNaN(price) ? 0 : price,
                description,
                images,
                categoryIds: categoryId ? [categoryId] : [],
                url
              });
            }

          }

        } catch (productError) {
          console.error(`⚠️ Не удалось загрузить товар ${url}:`, productError.message);
        }

      })

    );

  }

  console.log(`✅ Найдено новых товаров: ${newProductsFound.length}`);

  return newProductsFound;
}

// ==============================
// СКАН ПОДКАТЕГОРИЙ — дополняет уже известные товары id-шниками
// подкатегорий, заходя на страницу каждой подкатегории на сайте и сверяя
// список товаров там со уже известными по url (без похода на страницу
// каждого товара отдельно — экономит запросы).
// ==============================
async function scrapeSubcategories() {
  console.log("🔄 Скан подкатегорий...");

  const newProducts = await readNewProductsFromRedis();
  const allKnownProducts = products.concat(newProducts);

  const urlToIds = new Map();

  for (const p of allKnownProducts) {
    if (!p.url) continue;
    const key = p.url.split("?")[0];
    if (!urlToIds.has(key)) urlToIds.set(key, []);
    urlToIds.get(key).push(String(p.id));
  }

  const result = {};
  let totalLinks = 0;

  const entries = Object.entries(SUBCATEGORY_SLUGS);

  const BATCH_SIZE = 8;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {

    const batch = entries.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(

      batch.map(async ([subId, slug]) => {

        try {

          const { data: html } = await axios.get(`https://cosmo-bong.ru/catalog/${slug}`, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
            timeout: 15000
          });

          const urlMatches = [...html.matchAll(/https:\/\/cosmo-bong\.ru\/goods\/[^"'\s?]+/g)];
          const foundUrls = [...new Set(urlMatches.map(m => m[0]))];

          for (const url of foundUrls) {

            const ids = urlToIds.get(url);
            if (!ids) continue;

            for (const id of ids) {
              if (!result[id]) result[id] = [];
              if (!result[id].includes(subId)) result[id].push(subId);
            }

          }

          totalLinks += foundUrls.length;

        } catch (error) {
          console.log(`⚠️ Не удалось загрузить подкатегорию ${slug}:`, error.message);
        }

      })

    );

  }

  console.log(`✅ Скан подкатегорий завершён: обработано ссылок — ${totalLinks}, товаров с найденной подкатегорией — ${Object.keys(result).length}.`);

  return result;
}

// ==============================
// LOAD CACHE
// ==============================
function loadCache() {
  try {
    products = JSON.parse(
      fs.readFileSync(path.join(__dirname, "cache/products.json"), "utf8")
    );
    categories = JSON.parse(
      fs.readFileSync(path.join(__dirname, "cache/categories.json"), "utf8")
    );
    console.log(`✅ Товары: ${products.length}`);
    console.log(`✅ Категории: ${categories.length}`);
  } catch (error) {
    console.log("❌ CACHE ERROR:", error.message);
  }
}

// ==============================
// ORDERS
// ==============================
app.use("/api/order", orderRouter);

// ==============================
// REFRESH SALES
// ==============================
app.get("/api/refresh-sales", async (req, res) => {
  if (req.query.secret !== process.env.REFRESH_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const result = await scrapeSalesData();

    salesCache = result;
    lastSalesFetch = Date.now();

    await writeSalesCacheToRedis(result);

    console.log(`✅ Данные распродажи обновлены по запросу планировщика: найдено ${Object.keys(result).length} модификаций.`);

    res.json({ success: true, count: Object.keys(result).length });
  } catch (error) {
    console.error("❌ Ошибка обновления скидок:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==============================
// REFRESH STOCK — обрабатывает ОДНУ порцию за запуск
// ==============================
app.get("/api/refresh-stock", async (req, res) => {
  if (req.query.secret !== process.env.REFRESH_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  res.json({ success: true, status: "started" });

  const task = (async () => {

    try {

      const newProducts = await readNewProductsFromRedis();

      const urlToIds = {};

      products.concat(newProducts).filter(p => p.url).forEach(p => {
        const url = p.url.split('?')[0];
        if (!urlToIds[url]) urlToIds[url] = [];
        urlToIds[url].push(p.id);
      });

      const productUrls = Object.keys(urlToIds);

      const CHUNK_SIZE = 150;

      const offset = await readStockOffsetFromRedis();

      const { newStockCache, nextOffset } = await scrapeStockChunk(productUrls, offset, CHUNK_SIZE, urlToIds);

      const existingStock = (await readStockCacheFromRedis()) || {};
      const mergedStock = { ...existingStock, ...newStockCache };

      await writeStockCacheToRedis(mergedStock);
      await writeStockOffsetToRedis(nextOffset);

      const end = Math.min(offset + CHUNK_SIZE, productUrls.length);

      console.log(`✅ Наличие обновлено в фоне (порция ${offset}-${end} из ${productUrls.length}): проверено ${Object.keys(newStockCache).length} модификаций, далее с ${nextOffset}.`);

    } catch (error) {
      console.error("❌ Ошибка обновления наличия:", error.message);
    }

  })();

  try {
    waitUntil(task);
  } catch (e) {
    // waitUntil доступен только в среде Vercel
  }
});

// ==============================
// REFRESH CATALOG (поиск новых товаров)
// ==============================
app.get("/api/refresh-catalog", async (req, res) => {
  if (req.query.secret !== process.env.REFRESH_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  res.json({ success: true, status: "started" });

  const task = scrapeNewProducts()
    .then(async result => {

      await writeNewProductsToRedis(result);

      console.log(`✅ Каталог обновлён в фоне: всего новых товаров в Redis — ${result.length}.`);
    })
    .catch(error => {
      console.error("❌ Ошибка поиска новых товаров:", error.message);
    });

  try {
    waitUntil(task);
  } catch (e) {
    // waitUntil доступен только в среде Vercel
  }
});

// ==============================
// REFRESH SUBCATEGORIES
// ==============================
app.get("/api/refresh-subcategories", async (req, res) => {
  if (req.query.secret !== process.env.REFRESH_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  res.json({ success: true, status: "started" });

  const task = scrapeSubcategories()
    .then(async result => {

      await writeSubcategoryCacheToRedis(result);

      console.log(`✅ Подкатегории обновлены в фоне: товаров с подкатегорией — ${Object.keys(result).length}.`);
    })
    .catch(error => {
      console.error("❌ Ошибка скана подкатегорий:", error.message);
    });

  try {
    waitUntil(task);
  } catch (e) {
    // waitUntil доступен только в среде Vercel
  }
});

// ==============================
// CHECK ORDER TIMEOUTS (напоминания и автоотмена заказов без подтверждения/оплаты)
// ==============================
app.get("/api/check-order-timeouts", async (req, res) => {
  if (req.query.secret !== process.env.REFRESH_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  res.json({ success: true, status: "started" });

  const task = checkOrderTimeouts().catch(error => {
    console.error("❌ Ошибка проверки таймаутов заказов:", error.message);
  });

  try {
    waitUntil(task);
  } catch (e) {
    // waitUntil доступен только в среде Vercel
  }
});

// ==============================
// ALL PRODUCTS
// ==============================
// Превращает HTML-описание в короткий текст без тегов — этого достаточно,
// чтобы поиск в каталоге находил товары по словам из описания ("для льда",
// "медуза" и т.д.), но не раздувает основной список товаров полным HTML.
function descriptionToSearchText(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 600);
}

app.get("/api/products", async (req, res) => {
  try {
    const redisSalesData = await readSalesCacheFromRedis();
    const salesData = redisSalesData || salesCache;
    const stockData = await readStockCacheFromRedis();
    const newProducts = await readNewProductsFromRedis();
    const subcategoryData = await readSubcategoryCacheFromRedis();

    if (!redisSalesData) {
      refreshSalesDataInBackground();
    }

    const allProducts = products.concat(newProducts);

    const productsWithSales = allProducts.map(product => {
      const saleInfo = salesData[product.id];
      const stockValue = stockData ? stockData[product.id] : undefined;
      const inStock = stockValue === undefined ? true : stockValue > 0;

      const extraSubIds = subcategoryData[product.id] || [];
      const categoryIds = extraSubIds.length
        ? [...new Set([...(product.categoryIds || []), ...extraSubIds])]
        : product.categoryIds;

      const lightProduct = {
        id: product.id,
        name: product.name,
        price: product.price,
        images: product.images,
        categoryIds,
        inStock,
        descriptionText: descriptionToSearchText(product.description)
      };

      if (saleInfo) {
        return {
          ...lightProduct,
          oldPrice: saleInfo.oldPrice,
          discount: saleInfo.discount
        };
      }

      return lightProduct;
    });

    res.json(productsWithSales);
  } catch (error) {
    console.error("Ошибка в /api/products:", error.message);
    res.json(products);
  }
});

// ==============================
// ONE PRODUCT
// ==============================
app.get("/api/product/:id", async (req, res) => {
  const id = String(req.params.id);

  const newProducts = await readNewProductsFromRedis();
  const allProducts = products.concat(newProducts);

  const product = allProducts.find(item => String(item.id) === id);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  const redisSalesData = await readSalesCacheFromRedis();
  const salesData = redisSalesData || salesCache;
  const stockData = await readStockCacheFromRedis();

  if (!redisSalesData) {
    refreshSalesDataInBackground();
  }

  const saleInfo = salesData[id];
  const stockValue = stockData ? stockData[id] : undefined;
  const inStock = stockValue === undefined ? true : stockValue > 0;

  const subcategoryData = await readSubcategoryCacheFromRedis();
  const extraSubIds = subcategoryData[id] || [];
  const categoryIds = extraSubIds.length
    ? [...new Set([...(product.categoryIds || []), ...extraSubIds])]
    : (product.categoryIds || []);

  res.json({
    id: product.id,
    name: product.name,
    price: Number(product.price),
    oldPrice: saleInfo ? saleInfo.oldPrice : undefined,
    discount: saleInfo ? saleInfo.discount : undefined,
    inStock,
    description: product.description || "",
    images: product.images ? product.images : (product.image ? [product.image] : []),
    categoryIds
  });
});

// ==============================
// CATEGORIES
// ==============================
app.get("/api/categories", (req, res) => {
  res.json(categories);
});

// ==============================
// MY ORDERS (история заказов в профиле)
// ==============================
app.get("/api/my-orders", async (req, res) => {

  const telegramUserId = req.query.telegramUserId;

  if (!telegramUserId) {
    return res.json([]);
  }

  const orders = await getOrdersForUser(String(telegramUserId));

  const withLabels = orders.map(order => ({
    ...order,
    statusLabel: (STATUS_LABELS[order.status] || STATUS_LABELS.accepted).label,
    statusEmoji: (STATUS_LABELS[order.status] || STATUS_LABELS.accepted).emoji
  }));

  res.json(withLabels);

});

// ==============================
// PROMO CODE — 10% скидка, действует только на первый заказ клиента
// ==============================
const FIRST_ORDER_PROMO_CODE = "cosmo420tg";
const FIRST_ORDER_PROMO_RATE = 0.10;

app.get("/api/promo-check", async (req, res) => {

  const code = String(req.query.code || "").trim().toLowerCase();
  const telegramUserId = req.query.telegramUserId;

  if (code !== FIRST_ORDER_PROMO_CODE) {
    return res.json({ valid: false, reason: "not_found" });
  }

  const existingOrders = telegramUserId
    ? await getOrdersForUser(String(telegramUserId))
    : [];

  // Промокод действует, пока клиент ни разу реально не оплатил заказ —
  // неподтверждённые/неоплаченные и автоматически отменённые заказы
  // не лишают права на скидку
  const hasPaidOrder = existingOrders.some(o =>
    ["paid", "shipped", "ready"].includes(o.status)
  );

  if (hasPaidOrder) {
    return res.json({ valid: false, reason: "not_first_order" });
  }

  res.json({ valid: true, discountRate: FIRST_ORDER_PROMO_RATE });

});

// ==============================
// BONUS BALANCE (баллы кэшбэка)
// ==============================
app.get("/api/bonus-balance", async (req, res) => {

  const telegramUserId = req.query.telegramUserId;

  if (!telegramUserId) {
    return res.json({ balance: 0 });
  }

  const balance = await getBonusBalance(String(telegramUserId));

  const total = req.query.total ? Number(req.query.total) : null;

  res.json({
    balance,
    maxRedeemable: total !== null ? getMaxRedeemable(total, balance) : null
  });

});

// ==============================
// TELEGRAM WEBHOOK — пересылка сообщений от клиентов админу и ответы обратно
// ==============================

// Разово регистрирует адрес вебхука в Telegram — открыть один раз в браузере
// после деплоя (и заново, если поменяется домен).
app.get("/api/setup-webhook", async (req, res) => {
  try {
    const host = req.get("host");
    const protocol = host.includes("localhost") ? req.protocol : "https";
    const webhookUrl = `${protocol}://${host}/api/telegram-webhook`;
    const result = await telegramApi("setWebhook", { url: webhookUrl });
    res.json({ webhookUrl, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Telegram шлёт сюда все входящие сообщения боту
app.post("/api/telegram-webhook", async (req, res) => {

  // Делаем всё СИНХРОННО до ответа — в serverless-окружении фоновая работа
  // после res.sendStatus(200) может быть прервана до завершения, из-за
  // этого ответы могли не доходить. Telegram спокойно ждёт несколько секунд.
  try {

    const update = req.body;

    // Нажатие на любую из кнопок сценария заказа (принять/подтверждаю/
    // доставка и оплата/способ доставки/посчитать/оплачен/отправлен)
    if (update.callback_query) {
      await handleOrderCallback(update.callback_query);
      res.sendStatus(200);
      return;
    }

    const message = update.message;

    if (!message) {
      res.sendStatus(200);
      return;
    }

    // Оба значения — числовые id, поэтому для сравнения оставляем только
    // цифры. Это защищает от любых скрытых символов, кавычек или пробелов
    // в переменной окружения ADMIN_ID, даже если они не видны в логах.
    const adminId = String(process.env.ADMIN_ID || "").replace(/\D/g, "");
    const chatId = String(message.chat.id).replace(/\D/g, "");

    console.log(
      "TELEGRAM WEBHOOK: incoming message from chat",
      chatId,
      "adminId =",
      adminId,
      "equal =",
      chatId === adminId
    );

    // Клиент просто запустил бота (/start) — это не сообщение для админа,
    // ничего не пересылаем и не уведомляем.
    if (chatId !== adminId && message.text && message.text.trim().startsWith("/start")) {
      res.sendStatus(200);
      return;
    }

    if (chatId === adminId) {

      // Админ отвечает на запрос трек-номера — это отдельный поток,
      // проверяем его раньше обычной пересылки ответа клиенту
      const handledTracking = await tryHandleTrackingReply(message);

      if (handledTracking) {
        res.sendStatus(200);
        return;
      }

      // Админ отвечает на пересланное сообщение клиента
      if (message.reply_to_message && message.text) {

        const t0 = Date.now();

        console.log(
          "TELEGRAM WEBHOOK: admin reply to message_id",
          message.reply_to_message.message_id
        );

        const customerChatId = await getReplyMapping(
          message.reply_to_message.message_id
        );

        console.log(
          "TELEGRAM WEBHOOK: resolved customerChatId =",
          customerChatId,
          `(redis lookup took ${Date.now() - t0}ms)`
        );

        if (customerChatId) {

          const t1 = Date.now();

          const sendResult = await telegramApi("sendMessage", {
            chat_id: customerChatId,
            text: message.text
          });

          console.log(`TELEGRAM WEBHOOK: sendMessage to customer took ${Date.now() - t1}ms`);

          if (!sendResult.ok) {

            console.log("TELEGRAM WEBHOOK: reply to customer FAILED:", JSON.stringify(sendResult));

            // Даём знать админу прямо в чат — иначе он решит, что ответ ушёл
            await telegramApi("sendMessage", {
              chat_id: adminId,
              text: "⚠️ Не удалось отправить ваш ответ клиенту через бота (скорее всего, он не разрешил боту писать). Свяжитесь по телефону, указанному в заказе."
            });

          } else {
            console.log("TELEGRAM WEBHOOK: reply delivered to customer", customerChatId, `(total ${Date.now() - t0}ms)`);
          }

        } else {

          console.log(
            "TELEGRAM WEBHOOK: no mapping found for message_id",
            message.reply_to_message.message_id,
            "— ответьте именно на пересланное сообщение клиента, не на старое"
          );

          // Админ ответил не на то сообщение — ответ никуда не уйдёт,
          // явно предупреждаем, чтобы не думал, что клиент его получил
          await telegramApi("sendMessage", {
            chat_id: adminId,
            text:
              "⚠️ Вы ответили не на то сообщение — этот ответ клиенту не ушёл.\n\n" +
              "Отвечать (Reply) можно только на сообщения с пометкой «✍️ *Можно ответить (Reply)*» — на остальные (например, копии сообщений клиенту или общие уведомления) отвечать нельзя, они не привязаны ни к какому клиенту.",
            parse_mode: "Markdown"
          });

        }

      }

      res.sendStatus(200);
      return;

    }

    // Если клиент ранее выбрал СДЭК/Почту — это сообщение, скорее всего,
    // данные получателя, а не обычный вопрос. Обрабатываем отдельно.
    const handledShippingData = await tryHandleShippingData(message);

    if (handledShippingData) {
      res.sendStatus(200);
      return;
    }

    // Сообщение от клиента — пересылаем админу с пояснением, кто это.
    // forwardMessage и sendMessage не зависят друг от друга — шлём их
    // параллельно, а не по очереди, чтобы не ждать вдвое дольше.
    const user = message.from || {};

    const label =
      user.username
      ? `@${user.username}`
      : [user.first_name, user.last_name].filter(Boolean).join(" ") || "клиент";

    const [forwarded, info] = await Promise.all([
      telegramApi("forwardMessage", {
        chat_id: adminId,
        from_chat_id: chatId,
        message_id: message.message_id
      }),
      telegramApi("sendMessage", {
        chat_id: adminId,
        text: `☝️ Сообщение от ${label}.\nОтветьте на него (Reply), чтобы ответ ушёл клиенту.`
      })
    ]);

    if (!forwarded.ok) {
      console.log("TELEGRAM WEBHOOK: forwardMessage FAILED:", JSON.stringify(forwarded));
    }

    if (!info.ok) {
      console.log("TELEGRAM WEBHOOK: info sendMessage FAILED:", JSON.stringify(info));
    }

    // Сохраняем обе привязки тоже параллельно
    await Promise.all([
      forwarded.ok ? saveReplyMapping(forwarded.result.message_id, chatId) : null,
      info.ok ? saveReplyMapping(info.result.message_id, chatId) : null
    ]);

    console.log("TELEGRAM WEBHOOK: mappings saved for chat", chatId);

    res.sendStatus(200);

  } catch (error) {
    console.error("❌ TELEGRAM WEBHOOK ERROR:", error.message);
    res.sendStatus(200);
  }

});

// ==============================
// START
// ==============================
loadCache();

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server started http://localhost:${PORT}`);
  });
}