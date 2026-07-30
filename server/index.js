require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const { waitUntil } = require("@vercel/functions");
const { createClient } = require("redis");

const orderRouter = require("./routes/orders");

const app = express();

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

// ==============================
// REDIS (постоянное хранилище скидок, наличия и новых товаров)
// ==============================
let redisClient = null;

async function getRedisClient() {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  redisClient = createClient({ url: process.env.REDIS_URL });

  redisClient.on("error", (err) => {
    console.error("❌ Redis Client Error:", err.message);
  });

  await redisClient.connect();

  return redisClient;
}

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
// ПРОВЕРКА НАЛИЧИЯ (обходит ВСЕ товары, батчами по 20)
// ==============================
async function scrapeStockData() {
  console.log("🔄 Обновление данных о наличии товаров...");

  const newStockCache = {};
  const BATCH_SIZE = 20;

  const newProducts = await readNewProductsFromRedis();

  const productUrls = [...new Set(
    products.concat(newProducts)
      .filter(p => p.url)
      .map(p => p.url.split('?')[0])
  )];

  for (let i = 0; i < productUrls.length; i += BATCH_SIZE) {

    const batch = productUrls.slice(i, i + BATCH_SIZE);

    await Promise.allSettled(

      batch.map(async (url) => {

        try {
          const { data: productPage } = await axios.get(url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
            timeout: 10000
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

        } catch (innerError) {
          console.error(`⚠️ Не удалось проверить наличие ${url}:`, innerError.message);
        }

      })

    );

  }

  console.log(`✅ Наличие обновлено: проверено ${Object.keys(newStockCache).length} модификаций из ${productUrls.length} товаров.`);

  return newStockCache;
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

  // Шаг 1: параллельно проверяем ВСЕ категории, собираем новые URL
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

  // Шаг 2: параллельно (батчами по 20) заходим на страницы новых товаров
  const BATCH_SIZE = 20;

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
// REFRESH STOCK
// ==============================
app.get("/api/refresh-stock", async (req, res) => {
  if (req.query.secret !== process.env.REFRESH_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  res.json({ success: true, status: "started" });

  const task = scrapeStockData()
    .then(async result => {
      await writeStockCacheToRedis(result);
      console.log(`✅ Наличие обновлено в фоне: сохранено ${Object.keys(result).length} модификаций.`);
    })
    .catch(error => {
      console.error("❌ Ошибка обновления наличия:", error.message);
    });

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

      const existing = await readNewProductsFromRedis();
      const existingIds = new Set(existing.map(p => p.id));

      const merged = existing.concat(
        result.filter(p => !existingIds.has(p.id))
      );

      await writeNewProductsToRedis(merged);

      console.log(`✅ Каталог обновлён в фоне: всего новых товаров в Redis — ${merged.length}.`);
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
// ALL PRODUCTS
// ==============================
app.get("/api/products", async (req, res) => {
  try {
    const redisSalesData = await readSalesCacheFromRedis();
    const salesData = redisSalesData || salesCache;
    const stockData = await readStockCacheFromRedis();
    const newProducts = await readNewProductsFromRedis();

    if (!redisSalesData) {
      refreshSalesDataInBackground();
    }

    const allProducts = products.concat(newProducts);

    const productsWithSales = allProducts.map(product => {
      const saleInfo = salesData[product.id];
      const stockValue = stockData ? stockData[product.id] : undefined;
      const inStock = stockValue === undefined ? true : stockValue > 0;

      const lightProduct = {
        id: product.id,
        name: product.name,
        price: product.price,
        images: product.images,
        categoryIds: product.categoryIds,
        inStock
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

  res.json({
    id: product.id,
    name: product.name,
    price: Number(product.price),
    oldPrice: saleInfo ? saleInfo.oldPrice : undefined,
    discount: saleInfo ? saleInfo.discount : undefined,
    inStock,
    description: product.description || "",
    images: product.images ? product.images : (product.image ? [product.image] : []),
    categoryIds: product.categoryIds || []
  });
});

// ==============================
// CATEGORIES
// ==============================
app.get("/api/categories", (req, res) => {
  res.json(categories);
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