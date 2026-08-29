require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const { waitUntil } = require("@vercel/functions");

const orderRouter = require("./routes/orders");
const chatRouter = require("./routes/chat");

const {
  getRedisClient,
  saveReplyMapping,
  getReplyMapping,
  telegramApi,
  buildTelegramFileProxyUrl
} = require("./replyMapping");

const {
  STATUS_LABELS,
  getOrdersForUser,
  getRecentOrders,
  getPaymentRequisites,
  savePaymentRequisites
} = require("./orderStore");

const {
  handleOrderCallback,
  tryHandleTrackingReply,
  tryHandlePaymentDetailsReply,
  tryHandleOrderEditReply,
  tryHandleShippingData,
  checkOrderTimeouts,
  buildOrderCardText,
  buildOrderActionButtons
} = require("./orderFlow");

const {
  getBonusBalance,
  getMaxRedeemable
} = require("./bonusStore");

const {
  isAndroidCustomerId,
  appendChatMessage,
  markCustomerMessagesRead,
  addPendingReaction,
  popPendingReactions
} = require("./chatStore");
const { getPushToken, sendExpoPush, sendWebPush } = require("./pushStore");

const app = express();

// За прокси Vercel req.protocol иначе всегда показывает "http" —
// доверяем заголовку X-Forwarded-Proto, чтобы получать реальную схему
app.set("trust proxy", true);

app.use(cors());
// Увеличенный лимит — голосовые сообщения из приложения приходят как base64
// в JSON-теле (см. /api/chat/send-voice), обычный лимит express (100kb)
// слишком мал даже для короткой записи.
app.use(express.json({ limit: "20mb" }));

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

async function readNewProductQueueFromRedis() {
  try {
    const client = await getRedisClient();
    const stored = await client.get("newProductQueue");
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error("❌ Не удалось прочитать очередь новых товаров:", error.message);
    return null;
  }
}

async function writeNewProductQueueToRedis(data) {
  try {
    const client = await getRedisClient();
    await client.set("newProductQueue", JSON.stringify(data));
  } catch (error) {
    console.error("❌ Не удалось записать очередь новых товаров:", error.message);
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

          // Текстовый поиск "Нет в наличии" — надёжен ТОЛЬКО для товаров
          // без модификаций (один товар = одна страница = один id). У
          // товаров с несколькими модификациями на одной странице (цвет,
          // вкус и т.п., например КБД-мармелад с 3 вкусами) HTML содержит
          // СРАЗУ несколько блоков статуса — по одному на каждую
          // модификацию, скрытые/показанные через CSS/JS — и текстовый
          // поиск не может понять, какой из них относится к нужному id,
          // поэтому раньше это привело к массовым ложным "нет в наличии"
          // (задета не та модификация). Поэтому применяем фолбэк только
          // когда urlToIds[url] содержит ровно один id.
          const idsForThisUrl = urlToIds[url] || [];

          if (idsForThisUrl.length === 1) {
            const pageText = $product('body').text();
            const isOutOfStockOnPage = /нет в наличии/i.test(pageText);
            const id = idsForThisUrl[0];
            if (newStockCache[id] === undefined) {
              newStockCache[id] = isOutOfStockOnPage ? 0 : 1;
            }
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
// ПОИСК НОВЫХ ТОВАРОВ — построение очереди (быстрый шаг: только ссылки,
// без захода на страницы товаров)
// ==============================
async function discoverNewProductUrls() {
  console.log("🔄 Поиск новых ссылок на товары...");

  const existingNewProducts = await readNewProductsFromRedis();

  const existingUrls = new Set(
    products
      .concat(existingNewProducts)
      .map(p => p.url ? p.url.split('?')[0] : null)
      .filter(Boolean)
  );

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

  return allNewUrlEntries;
}

// Заходит на страницу одного товара и парсит его данные — вынесено
// отдельно, используется порционной обработкой ниже.
async function scrapeOneProduct(url, categoryId) {

  let productPage;

  // Retry при 503 — сайт периодически отдаёт эту ошибку под нагрузкой на
  // конкретные товары (не всегда одни и те же), повторная попытка через
  // паузу обычно проходит успешно
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await axios.get(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        timeout: 12000
      });
      productPage = response.data;
      break;
    } catch (retryError) {
      const status = retryError.response?.status;
      if (status === 503 && attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
        continue;
      }
      throw retryError;
    }
  }

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

  const found = [];

  $product('.goodsDataMainModificationsList').each((i, el) => {

    const modId = $product(el).find('input[name="id"]').attr('value');
    const priceAttr = $product(el).find('input[name="price_now"]').attr('value');
    const price = parseFloat(priceAttr);

    if (modId && name) {
      found.push({
        id: modId,
        name,
        price: isNaN(price) ? 0 : price,
        description,
        images,
        categoryIds: categoryId ? [categoryId] : [],
        url
      });
    }

  });

  if (found.length === 0) {

    const modId = $product('.add-wishlist').attr('data-mod-id');
    const priceAttr = $product('.main-price').first().attr('content');
    const price = parseFloat(priceAttr);

    if (modId && name) {
      found.push({
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

  return found;
}

// ==============================
// ПОИСК НОВЫХ ТОВАРОВ — обработка ПОРЦИЯМИ (одна порция за один запуск,
// как и scrapeStockChunk). Очередь ссылок хранится в Redis между вызовами,
// чтобы не упираться в лимит времени serverless-функции (60 сек на Hobby):
// один вызов /api/refresh-catalog обрабатывает часть, следующий вызов —
// следующую часть, и так пока очередь не опустеет.
// ==============================
async function scrapeNewProductsChunk() {

  let queue = await readNewProductQueueFromRedis();

  // Очередь пуста или ещё не создана — заново сканируем категории в
  // поисках новых ссылок (быстрый шаг, занимает пару секунд)
  if (!queue || queue.length === 0) {
    queue = await discoverNewProductUrls();
  }

  const CHUNK_SIZE = 30;
  const BATCH_SIZE = 15;

  const chunk = queue.slice(0, CHUNK_SIZE);
  const remaining = queue.slice(CHUNK_SIZE);

  const newlyFound = [];

  for (let i = 0; i < chunk.length; i += BATCH_SIZE) {

    const batch = chunk.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(

      batch.map(async ({ url, categoryId }) => {
        try {
          const found = await scrapeOneProduct(url, categoryId);
          newlyFound.push(...found);
        } catch (productError) {
          console.error(`⚠️ Не удалось загрузить товар ${url}:`, productError.message);
        }
      })

    );

    if (i + BATCH_SIZE < chunk.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

  }

  const existingNewProducts = await readNewProductsFromRedis();
  const merged = existingNewProducts.concat(newlyFound);

  await writeNewProductsToRedis(merged);
  await writeNewProductQueueToRedis(remaining);

  console.log(
    `✅ Порция обработана: ${chunk.length} ссылок (успешно ${newlyFound.length}), ` +
    `осталось в очереди: ${remaining.length}. Всего новых товаров в базе: ${merged.length}.`
  );

  return { processedInChunk: chunk.length, succeededInChunk: newlyFound.length, remaining: remaining.length, total: merged.length };
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
app.use("/api/chat", chatRouter);
app.use("/api/panel-chat", require("./routes/panelChat"));

// ==============================
// АВТОРИЗАЦИЯ ДЛЯ /api/refresh-* И ПОДОБНЫХ ЭНДПОИНТОВ. Раньше эти
// эндпоинты можно было вызвать только вручную (браузером с ?secret=...) —
// то есть кто-то физически должен был об этом вспомнить. Теперь их же
// вызывает Vercel Cron Jobs по расписанию (см. vercel.json), а Vercel сам
// подставляет заголовок "Authorization: Bearer <CRON_SECRET>" при таком
// вызове — секрет при этом нигде не хранится в коде/конфиге, только в
// переменной окружения CRON_SECRET на Vercel. Ручной вызов по ссылке с
// ?secret=... по-прежнему работает как раньше, ничего не сломано.
// ==============================
function isAuthorizedRefresh(req) {
  if (req.query.secret && req.query.secret === process.env.REFRESH_SECRET) {
    return true;
  }
  const authHeader = req.headers.authorization || "";
  if (process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return true;
  }
  return false;
}

// ==============================
// REFRESH SALES
// ==============================
app.get("/api/refresh-sales", async (req, res) => {
  if (!isAuthorizedRefresh(req)) {
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
  if (!isAuthorizedRefresh(req)) {
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
// REFRESH CATALOG (поиск новых товаров) — обрабатывает ОДНУ порцию за
// вызов. Чтобы дообработать весь каталог полностью, открой эту ссылку
// несколько раз подряд (с паузой в несколько секунд) — в логах будет
// видно "осталось в очереди: N", пока N не станет 0.
// ==============================
app.get("/api/refresh-catalog", async (req, res) => {
  if (!isAuthorizedRefresh(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  res.json({ success: true, status: "started" });

  const task = scrapeNewProductsChunk()
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
  if (!isAuthorizedRefresh(req)) {
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
  if (!isAuthorizedRefresh(req)) {
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
// ПРОКСИ ФАЙЛОВ TELEGRAM (фото/голосовые в чате Android-приложения). Клиент
// обращается сюда вместо прямой ссылки на api.telegram.org — см. пояснение
// в replyMapping.js рядом с buildTelegramFileProxyUrl. path — это
// Telegram-овский file_path (без токена), полученный через getFile.
// ==============================
// Расширение файла (как отдаёт Telegram в file_path) -> правильный
// Content-Type. Сам Telegram на этой раздаче файлов часто отдаёт общий
// "application/octet-stream" без уточнения — из-за этого плеер на телефоне
// (ExoMediaPlayer) может не понять, что это именно аудио/OGG, и зависнуть
// в буферизации навсегда, не воспроизводя и не показывая ошибку. Поэтому
// определяем тип сами по расширению, а не полагаемся на заголовок Telegram.
const TELEGRAM_FILE_CONTENT_TYPES = {
  oga: "audio/ogg",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

app.get("/api/telegram-file", async (req, res) => {
  const filePath = req.query.path;

  if (!filePath || typeof filePath !== "string" || filePath.includes("..")) {
    return res.status(400).json({ error: "Некорректный path" });
  }

  try {
    // Скачиваем файл целиком на сервере (а не отдаём поток "на лету") —
    // голосовые и фото в чате небольшие, зато так у ответа гарантированно
    // есть точный Content-Length и он не зависит от того, как Telegram
    // передавал chunked-поток. Без точного Content-Length плеер на
    // некоторых Android-устройствах не понимает, когда файл закончился, и
    // "зависает" в буферизации — кнопка паузы остаётся навсегда, хотя звук
    // так и не начинает идти.
    const response = await axios.get(
      `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`,
      { responseType: "arraybuffer", timeout: 20000 }
    );

    const buffer = Buffer.from(response.data);
    const extension = filePath.split(".").pop()?.toLowerCase() || "";
    const contentType =
      TELEGRAM_FILE_CONTENT_TYPES[extension] ||
      response.headers["content-type"] ||
      "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", buffer.length);
    // Файлы в Telegram по одному и тому же file_path не меняются — можно
    // спокойно кэшировать надолго на устройстве клиента.
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");

    res.send(buffer);
  } catch (error) {
    console.error("❌ TELEGRAM FILE PROXY ERROR:", error.message);
    res.status(502).json({ error: "Не удалось загрузить файл" });
  }
});

// ==============================
// ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ (для Android-приложения — ссылка из чекбокса
// на оформлении заказа и из профиля; статический HTML, не требует
// пересборки приложения при правках текста)
// ==============================
app.get("/api/privacy", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Политика конфиденциальности — Cosmo Bong</title>
<style>
  body {
    background: #0b0b0b;
    color: #ffffff;
    font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.55;
    padding: 20px 16px 60px;
    max-width: 720px;
    margin: 0 auto;
  }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 16px; color: #7ee62c; margin-top: 28px; }
  p, li { font-size: 14px; color: #d8d8d8; }
  ul { padding-left: 20px; }
  a { color: #58BB43; }
  hr { border: none; border-top: 1px solid #2a2a2a; margin: 32px 0; }
  .muted { color: #9a9a9a; font-size: 12px; }
</style>
</head>
<body>
  <h1>Согласие на обработку персональных данных</h1>
  <p>Настоящим свободно, своей волей и в своём интересе, оформляя заказ, отправляя сообщение или голосовое сообщение в чат поддержки, включая push-уведомления, либо иным образом используя приложение Cosmo Bong, я даю согласие индивидуальному предпринимателю Воронцову Артёму Константиновичу (ОГРНИП: 321762700045487, ИНН: 290409139692), находящемуся по адресу: Россия, г. Ярославль, переулок Герцена д.6 к.2, кв. 60 (далее — Оператор), на обработку своих персональных данных.</p>
  <p>Предоставление персональных данных является добровольным. Отказ от предоставления телефона ограничивает доступ к оформлению заказа, истории заказов, программе кэшбэка и чату с магазином — остальными разделами приложения (каталог, избранное, акции) можно пользоваться без этого.</p>

  <h2>Перечень персональных данных</h2>
  <ul>
    <li>номер телефона;</li>
    <li>имя (если указано при оформлении заказа);</li>
    <li>состав и история заказов, использованные промокоды и баллы кэшбэка;</li>
    <li>текст переписки в чате поддержки, включая голосовые сообщения;</li>
    <li>фотографии и изображения, полученные от магазина в чате (например, QR-код для оплаты) — при их сохранении в галерею телефона;</li>
    <li>технический идентификатор push-уведомлений (Expo push token) — для доставки ответов из чата.</li>
  </ul>
  <p>Приложение не собирает адрес электронной почты, не использует файлы cookie, не содержит рекламных или аналитических трекеров.</p>

  <h2>Цели обработки</h2>
  <ul>
    <li>оформление и выполнение заказа, включая передачу данных для доставки;</li>
    <li>начисление и списание баллов кэшбэка;</li>
    <li>обратная связь и поддержка через чат в приложении;</li>
    <li>доставка push-уведомлений об ответах в чате.</li>
  </ul>
  <p>Приложение запрашивает доступ к микрофону (только для отправки голосовых сообщений) и к галерее телефона (только для сохранения полученных в чате изображений) — эти разрешения используются исключительно по прямому действию пользователя и не собираются автоматически.</p>

  <h2>Способы обработки</h2>
  <p>Автоматизированный и неавтоматизированный, с передачей по сети Интернет.</p>

  <h2>Передача третьим лицам</h2>
  <ul>
    <li>транспортным компаниям (СДЭК, Почта России) — для доставки заказов;</li>
    <li>сервису Telegram (Bot API) — для пересылки сообщений чата и уведомлений о заказе сотруднику магазина;</li>
    <li>сервису push-уведомлений Expo — для технической доставки push-уведомлений на устройство.</li>
  </ul>
  <p>Иным третьим лицам, включая рекламные и аналитические сервисы, персональные данные не передаются.</p>

  <h2>Срок действия согласия</h2>
  <p>До отзыва мной согласия, но не более 3 (трёх) лет с момента последнего обращения. Отозвать согласие можно в любой момент, направив письмо на адрес: <a href="mailto:yar-bong@mail.ru">yar-bong@mail.ru</a>.</p>
  <p>Оператор вправе продолжить обработку данных без моего согласия, если это предусмотрено законом (ст. 6, 10, 11 ФЗ-152 от 27.07.2006).</p>

  <hr />

  <h1>Политика конфиденциальности и обработки персональных данных</h1>

  <h2>1. Оператор</h2>
  <p>Индивидуальный предприниматель Воронцов Артём Константинович (ОГРНИП: 321762700045487, ИНН: 290409139692), адрес: Россия, г. Ярославль, переулок Герцена д.6 к.2, кв. 60.</p>

  <h2>2. Цели обработки</h2>
  <ul>
    <li>Оформление и выполнение заказов.</li>
    <li>Программа кэшбэка.</li>
    <li>Обратная связь и поддержка через чат в приложении (текст, голосовые сообщения, изображения).</li>
    <li>Доставка push-уведомлений об ответах в чате.</li>
  </ul>

  <h2>3. Перечень обрабатываемых данных</h2>
  <p>Номер телефона, имя (если указано), состав и история заказов, переписка в чате (включая голосовые сообщения), технический идентификатор push-уведомлений устройства.</p>

  <h2>4. Срок хранения данных</h2>
  <p>Не более 3 лет с момента последнего взаимодействия пользователя с приложением или Оператором.</p>

  <h2>5. Передача третьим лицам</h2>
  <ul>
    <li>Транспортным компаниям — для доставки заказов.</li>
    <li>Telegram (Bot API) — для пересылки сообщений чата и уведомлений о заказе.</li>
    <li>Expo (сервис push-уведомлений) — для технической доставки уведомлений.</li>
  </ul>

  <h2>6. Трансграничная передача данных</h2>
  <p>Трансграничная передача персональных данных не осуществляется.</p>

  <h2>7. Разрешения устройства</h2>
  <p>Приложение запрашивает доступ к микрофону (для отправки голосовых сообщений в чат) и к галерее (для сохранения изображений, полученных в чате). Оба разрешения запрашиваются только в момент соответствующего действия пользователя.</p>

  <h2>8. Уничтожение данных</h2>
  <p>Осуществляется путём полного удаления из информационных систем Оператора или обезличивания, исключающего возможность определения принадлежности данных конкретному пользователю.</p>

  <h2>9. Права пользователя</h2>
  <ul>
    <li>Получать подтверждение об обработке ваших данных и сведения о них.</li>
    <li>Требовать уточнения, блокирования или уничтожения неточных/незаконно обработанных данных.</li>
    <li>Отзывать согласие на обработку.</li>
    <li>Обжаловать действия Оператора в Роскомнадзоре или в суде.</li>
  </ul>

  <h2>10. Контакты для реализации прав</h2>
  <p>Email: <a href="mailto:yar-bong@mail.ru">yar-bong@mail.ru</a></p>

    <h2>11. Изменения в политике</h2>
  <p>Оператор оставляет за собой право вносить изменения в настоящую Политику. Актуальная версия всегда доступна по этому адресу.</p>
  <p class="muted">Последнее обновление: ${new Date().toLocaleDateString("ru-RU")}</p>

  <hr />

  <h1>Публичная оферта на оказание услуги резервирования товара</h1>
  <p><strong>Индивидуальный предприниматель Воронцов Артём Константинович</strong><br>
  ОГРНИП: 321762700045487<br>
  ИНН: 290409139692<br>
  Место регистрации: г. Ярославль<br>
  Контактный телефон: +7 999 799-72-56</p>

  <p>Настоящий документ является публичной офертой (предложением) индивидуального предпринимателя Воронцова Артёма Константиновича (далее — «Исполнитель») в адрес любого дееспособного физического лица (далее — «Пользователь»), в соответствии со статьёй 437 Гражданского кодекса Российской Федерации.</p>

  <h2>1. Термины и определения</h2>
  <p>1.1. Сайт — интернет-ресурс cosmo-bong.ru и/или мобильное приложение Cosmo Bong, представляющие собой электронный каталог товаров.</p>
  <p>1.2. Каталог — размещённая на Сайте информация о товарах, их характеристиках, изображениях и ориентировочной стоимости, носящая справочный характер.</p>
  <p>1.3. Резервирование (бронирование) — услуга, оказываемая Исполнителем, по временному закреплению за Пользователем конкретной единицы товара из Каталога на определённый срок для последующего самовывоза Пользователем.</p>
  <p>1.4. Самовывоз — способ получения товара, при котором Пользователь лично забирает зарезервированный товар в пункте выдачи, согласованном с Исполнителем.</p>

  <h2>2. Предмет оферты</h2>
  <p>2.1. Исполнитель оказывает Пользователю услугу резервирования выбранного товара из Каталога на срок, согласованный сторонами (как правило, не более 3 (трёх) календарных дней с момента резервирования, если иной срок не согласован дополнительно).</p>
  <p>2.2. Сайт не является витриной интернет-магазина в смысле дистанционной продажи товаров и не предусматривает заключение договора купли-продажи через Сайт. Оплата и передача товара происходят исключительно при самовывозе, вне рамок Сайта.</p>
  <p>2.3. Резервирование не является предоплатой и не гарантирует Пользователю обязательного приобретения товара — окончательное решение о покупке принимается Пользователем непосредственно в пункте выдачи при осмотре товара.</p>

  <h2>3. Порядок оказания услуги</h2>
  <p>3.1. Для резервирования товара Пользователь оформляет заявку через Сайт или мобильное приложение, указывая контактный номер телефона.</p>
  <p>3.2. После оформления заявки с Пользователем связывается представитель Исполнителя (через чат в приложении, мессенджер или по телефону) для подтверждения наличия товара и согласования срока и места самовывоза.</p>
  <p>3.3. Резервирование считается подтверждённым с момента подтверждения представителем Исполнителя.</p>
  <p>3.4. Если Пользователь не забирает зарезервированный товар в согласованный срок, резервирование автоматически аннулируется, а товар возвращается в свободный доступ Каталога.</p>

  <h2>4. Права и обязанности сторон</h2>
  <p>4.1. Исполнитель обязуется:</p>
  <ul>
    <li>обеспечить наличие зарезервированного товара на согласованный срок;</li>
    <li>предоставить Пользователю достоверную информацию о товаре в пределах, указанных в Каталоге.</li>
  </ul>
  <p>4.2. Пользователь обязуется:</p>
  <ul>
    <li>указывать достоверные контактные данные при оформлении резервирования;</li>
    <li>забрать товар в согласованный срок либо заблаговременно уведомить Исполнителя об отказе от резервирования.</li>
  </ul>
  <p>4.3. Исполнитель вправе отменить резервирование в одностороннем порядке в случае утраты товара, технической ошибки в Каталоге (в том числе ошибки в цене или описании) или при иных обстоятельствах, делающих исполнение невозможным, уведомив об этом Пользователя.</p>

  <h2>5. Стоимость и порядок расчётов</h2>
  <p>5.1. Услуга резервирования оказывается Пользователю бесплатно.</p>
  <p>5.2. Стоимость товара, указанная в Каталоге, носит ориентировочный характер и подлежит подтверждению при самовывозе.</p>
  <p>5.3. Оплата товара производится Пользователем непосредственно в пункте выдачи при самовывозе, наличными или иным способом по согласованию сторон.</p>

  <h2>6. Ответственность сторон</h2>
  <p>6.1. Стороны несут ответственность за неисполнение или ненадлежащее исполнение своих обязательств по настоящей оферте в соответствии с действующим законодательством Российской Федерации.</p>
  <p>6.2. Исполнитель не несёт ответственности за невозможность связаться с Пользователем по указанным им контактным данным.</p>

  <h2>7. Прочие условия</h2>
  <p>7.1. Акцептом настоящей оферты является факт оформления Пользователем заявки на резервирование товара через Сайт или мобильное приложение.</p>
  <p>7.2. Исполнитель вправе в одностороннем порядке изменять условия настоящей оферты, размещая актуальную редакцию на Сайте. Изменения вступают в силу с момента публикации.</p>
  <p>7.3. Все споры и разногласия, возникающие в связи с исполнением настоящей оферты, разрешаются путём переговоров, а при недостижении согласия — в порядке, установленном действующим законодательством Российской Федерации.</p>
  <p>7.4. Реализуемые товары являются коллекционными и декоративными предметами и не предназначены для использования в целях потребления табачных изделий, наркотических средств или психотропных веществ.</p>

  <p><em>Важно: настоящий документ не является публичной офертой на продажу товаров дистанционным способом и не заключает договор купли-продажи. Настоящая оферта регулирует исключительно услугу предварительного резервирования товара для самовывоза.</em></p>

    <p class="muted">Контакты для связи по вопросам настоящей оферты: +7 999 799-72-56</p>
</body>
</html>`);
});

// ==============================
// CATEGORIES
// ==============================
// ВРЕМЕННЫЙ диагностический эндпоинт — определить, к какому Firebase-проекту
// привязан FIREBASE_SERVICE_ACCOUNT. Убрать сразу после проверки.
app.get("/api/_debug-firebase-project", (req, res) => {
  try {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : null;
    res.json({ project_id: sa ? sa.project_id : "переменная не установлена" });
  } catch (e) {
    res.json({ error: e.message });
  }
});

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
// PROMO CODE. У Telegram Mini App и Android-приложения разные коды/ставки
// и разные условия (см. server/routes/orders.js, где сама скидка реально
// применяется и перепроверяется при заказе — этот эндпоинт только для
// предварительной проверки на клиенте): у Telegram — только на первый
// заказ, у Android — постоянный промокод.
// ==============================
const PROMO_CONFIGS = {
  telegram: { code: "cosmo420tg", rate: 0.10, firstOrderOnly: true },
  android: { code: "cosmo420", rate: 0.07, firstOrderOnly: false }
};

app.get("/api/promo-check", async (req, res) => {

  const code = String(req.query.code || "").trim().toLowerCase();
  const telegramUserId = req.query.telegramUserId;
  const promoConfig = req.query.platform === "android" ? PROMO_CONFIGS.android : PROMO_CONFIGS.telegram;

  if (code !== promoConfig.code) {
    return res.json({ valid: false, reason: "not_found" });
  }

  if (!promoConfig.firstOrderOnly) {
    return res.json({ valid: true, discountRate: promoConfig.rate });
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

  res.json({ valid: true, discountRate: promoConfig.rate });

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

// Разово регистрирует /orders в списке команд бота (появится в меню "/"
// у админа) — открыть один раз в браузере после деплоя
app.get("/api/setup-commands", async (req, res) => {
  try {
    const result = await telegramApi("setMyCommands", {
      commands: [
        { command: "orders", description: "Список неоплаченных заказов" },
        { command: "requisites", description: "Показать реквизиты для оплаты" },
        { command: "setrequisites", description: "Изменить реквизиты для оплаты" }
      ],
      scope: { type: "chat", chat_id: process.env.ADMIN_ID }
    });
    res.json({ result });
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

      // Команда /orders — список неоплаченных заказов с карточками
      // и кнопками действий, чтобы не искать их в истории чата
      if (message.text && message.text.trim().startsWith("/orders")) {

        const allOrders = await getRecentOrders();

        const activeOrders = allOrders
          .filter(o => ["accepted", "confirmed"].includes(o.status))
          .sort((a, b) => a.createdAt - b.createdAt)
          .slice(0, 20);

        if (activeOrders.length === 0) {

          await telegramApi("sendMessage", {
            chat_id: adminId,
            text: "Неоплаченных заказов нет 🎉"
          });

          res.sendStatus(200);
          return;

        }

        await telegramApi("sendMessage", {
          chat_id: adminId,
          text: `📋 Неоплаченных заказов: ${activeOrders.length}`
        });

        for (const order of activeOrders) {

          const cardText =
            buildOrderCardText(order) +
            "\n\n✍️ Можно ответить (Reply) на это сообщение — уйдёт клиенту.";

          const buttons = buildOrderActionButtons(order, order.id);

          const sendResult = await telegramApi("sendMessage", {
            chat_id: adminId,
            text: cardText,
            reply_markup: buttons.length ? { inline_keyboard: buttons } : undefined
          });

          if (sendResult.ok && order.telegramUserId) {
            await saveReplyMapping(sendResult.result.message_id, order.telegramUserId);
          }

        }

        res.sendStatus(200);
        return;

      }

      // Команда /requisites — показать текущие сохранённые реквизиты
      // для оплаты переводом по обоим банкам (то, что подставляется в счёт клиенту)
      if (message.text && message.text.trim() === "/requisites") {

        const [sber, raif] = await Promise.all([
          getPaymentRequisites("sber"),
          getPaymentRequisites("raif")
        ]);

        await telegramApi("sendMessage", {
          chat_id: adminId,
          text:
            `💳 Сбер:\n\n${sber}\n\n💳 Райф:\n\n${raif}\n\n` +
            `Чтобы изменить, пришлите:\n/setrequisites sber\n<новый текст>\nили\n/setrequisites raif\n<новый текст>`
        });

        res.sendStatus(200);
        return;

      }

      // Команда /setrequisites sber|raif — обновить реквизиты одного из
      // банков. Всё, что идёт после банка (в этом же или следующих
      // строках), сохраняется как есть и подставляется в счета клиентам
      if (message.text && message.text.trim().startsWith("/setrequisites")) {

        const withoutCommand = message.text.replace(/^\/setrequisites/, "").trim();
        const [bankRaw, ...restLines] = withoutCommand.split("\n");
        const bank = (bankRaw || "").trim().toLowerCase();
        const newRequisites = restLines.join("\n").trim();

        if ((bank !== "sber" && bank !== "raif") || !newRequisites) {

          await telegramApi("sendMessage", {
            chat_id: adminId,
            text:
              "Формат команды:\n\n/setrequisites sber\nСБЕР: 1234 5678 9012 3456\nИван Иванович И.\n(без комментариев к платежу)\n\n" +
              "(первая строка после команды — банк: sber или raif, дальше сам текст реквизитов)"
          });

          res.sendStatus(200);
          return;

        }

        await savePaymentRequisites(bank, newRequisites);

        await telegramApi("sendMessage", {
          chat_id: adminId,
          text: `✅ Реквизиты ${bank === "sber" ? "Сбера" : "Райфа"} обновлены:\n\n${newRequisites}`
        });

        res.sendStatus(200);
        return;

      }

      // Админ отвечает на запрос трек-номера — это отдельный поток,
      // проверяем его раньше обычной пересылки ответа клиенту
      const handledTracking = await tryHandleTrackingReply(message);

      if (handledTracking) {
        res.sendStatus(200);
        return;
      }

      // Админ отвечает на запрос стоимости/срока доставки (после
      // "📐 Посчитать доставку") — тоже отдельный поток
      const handledPaymentDetails = await tryHandlePaymentDetailsReply(message);

      if (handledPaymentDetails) {
        res.sendStatus(200);
        return;
      }

      // Админ отвечает на запрос правки состава/суммы заказа (после
      // "✏️ Изменить заказ") — тоже отдельный поток
      const handledOrderEdit = await tryHandleOrderEditReply(message);

      if (handledOrderEdit) {
        res.sendStatus(200);
        return;
      }

      // Админ отвечает на пересланное сообщение клиента — текстом, фото
      // (например, скрин чека/оплаты) или голосом. Раньше здесь проверялся
      // только message.text, из-за чего фото/голосовые ответы админа молча
      // пропадали и не доходили до клиента вообще — ни в Telegram, ни в
      // Android-чат.
      const hasPhoto = !!(message.photo && message.photo.length);
      const hasVoice = !!message.voice;

      if (message.reply_to_message && (message.text || hasPhoto || hasVoice)) {

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

        const bodyText = message.text || message.caption || "";

        // Telegram иногда присылает один и тот же webhook повторно (если не
        // получил ответ вовремя) — из-за этого клиенту приходило два
        // одинаковых push. Запоминаем обработанные message_id на 10 минут
        // и повторы просто пропускаем.
        if (customerChatId && isAndroidCustomerId(customerChatId)) {
          try {
            const redis = await getRedisClient();
            const dedupKey = `handledMsg:${message.message_id}`;
            const alreadyHandled = await redis.set(dedupKey, "1", { NX: true, EX: 600 });
            if (alreadyHandled === null) {
              console.log("TELEGRAM WEBHOOK: duplicate message_id", message.message_id, "- skip");
              return res.sendStatus(200);
            }
          } catch (e) {
            console.error("dedup check failed:", e.message);
          }
        }

        if (customerChatId && isAndroidCustomerId(customerChatId)) {

          // У Android-клиента нет настоящего Telegram-чата — сохраняем
          // ответ админа в историю чата приложения и доставляем
          // push-уведомлением вместо telegramApi sendMessage.
          const t1 = Date.now();

          let imageUrl;
          let audioUrl;

          if (hasPhoto) {
            // Самое большое доступное разрешение — последний элемент массива
            const fileId = message.photo[message.photo.length - 1].file_id;
            const fileInfo = await telegramApi("getFile", { file_id: fileId }).catch(
              (err) => ({ ok: false, description: err.message })
            );

            if (fileInfo.ok && fileInfo.result && fileInfo.result.file_path) {
              imageUrl = buildTelegramFileProxyUrl(fileInfo.result.file_path);
            } else {
              console.log("TELEGRAM WEBHOOK: getFile FAILED:", JSON.stringify(fileInfo));
            }
          }

          if (hasVoice) {
            const fileId = message.voice.file_id;
            const fileInfo = await telegramApi("getFile", { file_id: fileId }).catch(
              (err) => ({ ok: false, description: err.message })
            );

            if (fileInfo.ok && fileInfo.result && fileInfo.result.file_path) {
              audioUrl = buildTelegramFileProxyUrl(fileInfo.result.file_path);
            } else {
              console.log("TELEGRAM WEBHOOK: getFile (voice) FAILED:", JSON.stringify(fileInfo));
            }
          }

                   // Админ ответил — это единственный реальный сигнал, что он видел
                   // сообщения клиента (Telegram Bot API не даёт узнать "прочитано"
                   // напрямую), поэтому именно здесь помечаем все сообщения клиента
                   // прочитанными.
                   await markCustomerMessagesRead(customerChatId);
                   await appendChatMessage(customerChatId, { from: "admin", text: bodyText, imageUrl, audioUrl });

          const notificationBody = bodyText || (imageUrl ? "📷 Фото" : audioUrl ? "🎤 Голосовое сообщение" : "");

          const androidToken = await getPushToken(customerChatId, "android");
          const pushResult = await sendExpoPush(androidToken, {
            title: "Cosmo Bong",
            body: notificationBody,
            data: { type: "chat" }
          });

          console.log(`TELEGRAM WEBHOOK: push to Android customer took ${Date.now() - t1}ms`, pushResult);

          // Веб-версия (iPhone/десктоп через браузер) — отдельный токен,
          // отдельная доставка через Firebase, не связана с Expo/Android.
          const webToken = await getPushToken(customerChatId, "web");
          if (webToken) {
            const webPushResult = await sendWebPush(webToken, {
              title: "Cosmo Bong",
              body: notificationBody
            });
            console.log(`TELEGRAM WEBHOOK: push to Web customer`, webPushResult);
          }

          // Реакцию (👍) больше не ставим сразу — она ничего не говорила о
          // том, увидел ли клиент сообщение на самом деле, только о том,
          // дошёл ли push. Вместо этого копим ID в очередь и ставим 👍
          // только когда клиент реально откроет чат в приложении (см.
          // POST /api/chat/mark-read ниже).
          await addPendingReaction(customerChatId, message.message_id);

          if (!pushResult.ok) {
            // Формулировка намеренно без утверждений о том, видел ли клиент
            // сообщение — push мог не дойти по многим причинам (не разрешил
            // уведомления, ещё не открывал приложение вообще, временный сбой
            // самого Expo push), но при этом чат в приложении обновляется
            // отдельным опросом каждые несколько секунд, пока приложение
            // открыто — так что клиент вполне мог уже видеть ответ, даже
            // если push не доставлен. Раньше текст утверждал обратное
            // ("увидит, когда откроет чат"), что было неверно в этом случае.
            await telegramApi("sendMessage", {
              chat_id: adminId,
              text: "⚠️ Push-уведомление не доставлено (клиент не разрешил уведомления, ещё не открывал приложение, либо временный сбой push). Сообщение при этом сохранено в чате приложения — если клиент сейчас в приложении, он мог его уже увидеть."
            });
          }

        } else if (customerChatId) {

          const t1 = Date.now();

          // Фото/голос пересылаем тем же file_id (Telegram сам переиспользует
          // уже загруженный файл, повторно скачивать/загружать не нужно)
          const sendResult = hasPhoto
            ? await telegramApi("sendPhoto", {
                chat_id: customerChatId,
                photo: message.photo[message.photo.length - 1].file_id,
                caption: message.caption
              })
            : hasVoice
            ? await telegramApi("sendVoice", {
                chat_id: customerChatId,
                voice: message.voice.file_id,
                caption: message.caption
              })
            : await telegramApi("sendMessage", {
                chat_id: customerChatId,
                text: message.text
              });

          console.log(`TELEGRAM WEBHOOK: sendMessage to customer took ${Date.now() - t1}ms`);

          if (!sendResult.ok) {

            console.log("TELEGRAM WEBHOOK: reply to customer FAILED:", JSON.stringify(sendResult));

            // Реакцией на само сообщение админа + текстом — чтобы сразу было
            // видно и в чате, и явным предупреждением.
            // ВАЖНО: Telegram разрешает реакции только из своего
            // фиксированного набора эмодзи — "✅"/"❌" в него не входят и
            // тихо отклоняются API, поэтому используем "👎" (он в списке
            // разрешённых)
            const reactionResult = await telegramApi("setMessageReaction", {
              chat_id: adminId,
              message_id: message.message_id,
              reaction: [{ type: "emoji", emoji: "👎" }]
            }).catch(err => ({ ok: false, description: err.message }));

            if (!reactionResult.ok) {
              console.log("TELEGRAM WEBHOOK: setMessageReaction (fail) FAILED:", JSON.stringify(reactionResult));
            }

            await telegramApi("sendMessage", {
              chat_id: adminId,
              text: "⚠️ Не удалось отправить ваш ответ клиенту через бота (скорее всего, он не разрешил боту писать). Свяжитесь по телефону, указанному в заказе."
            });

          } else {

            console.log("TELEGRAM WEBHOOK: reply delivered to customer", customerChatId, `(total ${Date.now() - t0}ms)`);

            // Реакция 👍 на сообщение админа — подтверждение, что оно ушло
            // клиенту (Telegram Bot API не даёт узнать, прочитано ли оно —
            // только факт доставки). "✅" здесь не работает — см. коммент выше
            const reactionResult = await telegramApi("setMessageReaction", {
              chat_id: adminId,
              message_id: message.message_id,
              reaction: [{ type: "emoji", emoji: "👍" }]
            }).catch(err => ({ ok: false, description: err.message }));

            if (!reactionResult.ok) {
              console.log("TELEGRAM WEBHOOK: setMessageReaction (ok) FAILED:", JSON.stringify(reactionResult));
            }

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