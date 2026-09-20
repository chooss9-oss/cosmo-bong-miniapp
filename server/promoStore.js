const { getRedisClient } = require("./replyMapping");

// Все промокоды лежат в Redis одним списком под одним ключом
const PROMO_KEY = "promoCodes";

async function getAllPromos() {
  try {
    const client = await getRedisClient();
    const stored = await client.get(PROMO_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("❌ Не удалось прочитать промокоды из Redis:", error.message);
    return [];
  }
}

// Сохраняет промокод. Если такой код уже есть — заменяет его новым
async function savePromo(promo) {
  const client = await getRedisClient();
  const all = await getAllPromos();
  const code = String(promo.code).trim().toLowerCase();
  const rest = all.filter(p => p.code !== code);
  rest.push({ ...promo, code });
  await client.set(PROMO_KEY, JSON.stringify(rest));
}

async function deletePromo(code) {
  const client = await getRedisClient();
  const all = await getAllPromos();
  const c = String(code || "").trim().toLowerCase();
  await client.set(PROMO_KEY, JSON.stringify(all.filter(p => p.code !== c)));
}

async function findPromo(code) {
  const all = await getAllPromos();
  const c = String(code || "").trim().toLowerCase();
  return all.find(p => p.code === c) || null;
}

// Действует ли промокод сейчас (startsAt/endsAt — время в миллисекундах)
function isPromoActive(promo, now = Date.now()) {
  if (promo.startsAt && now < promo.startsAt) return false;
  if (promo.endsAt && now > promo.endsAt) return false;
  return true;
}

module.exports = { getAllPromos, savePromo, deletePromo, findPromo, isPromoActive };