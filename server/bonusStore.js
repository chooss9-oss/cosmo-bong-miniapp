const { getRedisClient } = require("./replyMapping");

// ==============================
// Баллы кэшбэка — 1 балл = 1 рубль.
// Начисляются 5% от суммы заказа при переходе в статус "Оплачен".
// Списать можно не больше 50% от суммы заказа — так заказ никогда не
// закрывается полностью баллами, и всегда приходят реальные деньги.
// ==============================

const CASHBACK_RATE = 0.05;
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

// Сколько баллов начислится за заказ на такую сумму
function computeCashback(total) {
  return Math.round(Number(total) * CASHBACK_RATE);
}

// Сколько баллов реально можно списать сейчас — не больше половины суммы
// заказа и не больше того, что есть на балансе
function getMaxRedeemable(total, balance) {
  const cap = Math.floor(Number(total) * MAX_REDEEM_SHARE);
  return Math.max(0, Math.min(cap, Math.floor(Number(balance) || 0)));
}

module.exports = {
  CASHBACK_RATE,
  MAX_REDEEM_SHARE,
  getBonusBalance,
  addBonusPoints,
  deductBonusPoints,
  computeCashback,
  getMaxRedeemable
};
