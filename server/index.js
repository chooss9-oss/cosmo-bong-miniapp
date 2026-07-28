require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");

const orderRouter = require("./routes/orders");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

let products = [];
let categories = [];

// ==============================
// КЭШ РАСПРОДАЖИ
// ==============================
let salesCache = null;
let lastSalesFetch = 0;

async function fetchSalesData() {
  const now = Date.now();
  if (salesCache && now - lastSalesFetch < 600000) {
    return salesCache;
  }

  try {
    console.log("🔄 Обновление данных распродажи с cosmo-bong.ru...");

    // Шаг 1: получаем список товаров, которые сейчас на распродаже
    const { data: listPage } = await axios.get("https://cosmo-bong.ru/discount/Rasprodazha", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
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

    // Шаг 2: заходим на страницу каждого товара и берём цены ВСЕХ его модификаций
    for (const url of productUrls) {
      try {
        const { data: productPage } = await axios.get(url, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
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
    }

    salesCache = newSalesCache;
    lastSalesFetch = now;
    console.log(`✅ Данные распродажи обновлены: найдено ${Object.keys(salesCache).length} модификаций.`);
  } catch (error) {
    console.error("❌ Ошибка при получении данных распродажи:", error.message);
    return salesCache || {};
  }

  return salesCache;
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
// ALL PRODUCTS
// ==============================
app.get("/api/products", async (req, res) => {
  try {
    const salesData = await fetchSalesData();

    const productsWithSales = products.map(product => {
      const saleInfo = salesData[product.id];
      if (saleInfo) {
        return {
          ...product,
          oldPrice: saleInfo.oldPrice,
          discount: saleInfo.discount
        };
      }
      return product;
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
  const product = products.find(item => String(item.id) === id);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  const salesData = await fetchSalesData();
  const saleInfo = salesData[id];

  res.json({
    id: product.id,
    name: product.name,
    price: Number(product.price),
    oldPrice: saleInfo ? saleInfo.oldPrice : undefined,
    discount: saleInfo ? saleInfo.discount : undefined,
    description: product.description || "",
    images: product.images ? product.images : (product.image ? [product.image] : []),
    categoryIds: product.categoryIds || []
  });
});/api/product/:id", (req, res) => {
  const id = String(req.params.id);
  const product = products.find(item => String(item.id) === id);

  if (!product) {
    return res.status(404).json({ error: "Product not found" });
  }

  res.json({
    id: product.id,
    name: product.name,
    price: Number(product.price),
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