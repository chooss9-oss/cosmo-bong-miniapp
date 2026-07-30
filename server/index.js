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

// ==============================
// REDIS (постоянное хранилище скидок и наличия)
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

  // Шаг 1: получаем список товаров, которые сейчас на распродаже
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

  // Шаг 2: заходим на страницы всех товаров ОДНОВРЕМЕННО (параллельно), а не по очереди
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

  const productUrls = products
    .filter(p => p.url)
    .map(p => p.url);

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
// REFRESH SALES (вызывается внешним планировщиком, не пользователями)
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
// REFRESH STOCK (вызывается внешним планировщиком, не пользователями)
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
    // waitUntil доступен только в среде Vercel;
    // при локальном запуске просто игнорируем это
  }
});

// ==============================
// ALL PRODUCTS (быстрый ответ, скидки и наличие — из Redis)
// ==============================
app.get("/api/products", async (req, res) => {
  try {
    const redisSalesData = await readSalesCacheFromRedis();
    const salesData = redisSalesData || salesCache;
    const stockData = await readStockCacheFromRedis();

    if (!redisSalesData) {
      refreshSalesDataInBackground();
    }

    const productsWithSales = products.map(product => {
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
// ONE PRODUCT (быстрый ответ, скидка и наличие — из Redis)
// ==============================
app.get("/api/product/:id", async (req, res) => {
  const id = String(req.params.id);
  const product = products.find(item => String(item.id) === id);

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