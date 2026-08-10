const { getRedisClient } = require("./replyMapping");

// ==============================
// Баллы кэшбэка — 1 балл = 1 рубль.
// Начисляются при переходе заказа в статус "Оплачен": 5% — для заказов из
// Telegram Mini App, 3% — для заказов из Android-приложения (у него своя,
// отдельная программа лояльности, см. server/routes/orders.js).
// Списать можно не больше 50% от суммы заказа (для обеих платформ) — так
// заказ никогда не закрывается полностью баллами, и всегда приходят
// реальные деньги.
// ==============================

const CASHBACK_RATE = 0.05;
const ANDROID_CASHBACK_RATE = 0.03;
const MAX_REDEEM_SHARE = 0.5;

async function getBonusBalance(telegramUserId) {

  if (!telegramUserId) return 0;

  try {
    const client = await getRedisClient();
    const raw = await client.get(`bonusBalance:${telegramUserId}`);
    return raw ? Number(raw) : 0;
  } catch (error) {
    console.error("❌ Не удалось прочитать баланс баллов:", error.message);
    return 0;
  }

}

async function addBonusPoints(telegramUserId, amount) {

  if (!telegramUserId || !amount) return;

  try {
    const client = await getRedisClient();
    await client.incrBy(`bonusBalance:${telegramUserId}`, Math.round(amount));
  } catch (error) {
    console.error("❌ Не удалось начислить баллы:", error.message);
  }

}

async function deductBonusPoints(telegramUserId, amount) {

  if (!telegramUserId || !amount) return;

  try {

    const client = await getRedisClient();
    const current = await getBonusBalance(telegramUserId);
    const next = Math.max(0, current - Math.round(amount));

    await client.set(`bonusBalance:${telegramUserId}`, String(next));

  } catch (error) {
    console.error("❌ Не удалось списать баллы:", error.message);
  }

}

// Сколько баллов начислится за заказ на такую сумму. platform === "android"
// — используем сниженную ставку Android-приложения, иначе (в том числе для
// старых заказов без поля platform) — обычную ставку Telegram Mini App.
function computeCashback(total, platform) {
  const rate = platform === "android" ? ANDROID_CASHBACK_RATE : CASHBACK_RATE;
  return Math.round(Number(total) * rate);
}

// Сколько баллов реально можно списать сейчас — не больше половины суммы
// заказа и не больше того, что есть на балансе
function getMaxRedeemable(total, balance) {
  const cap = Math.floor(Number(total) * MAX_REDEEM_SHARE);
  return Math.max(0, Math.min(cap, Math.floor(Number(balance) || 0)));
}

module.exports = {
  CASHBACK_RATE,
  ANDROID_CASHBACK_RATE,
  MAX_REDEEM_SHARE,
  getBonusBalance,
  addBonusPoints,
  deductBonusPoints,
  computeCashback,
  getMaxRedeemable
};
