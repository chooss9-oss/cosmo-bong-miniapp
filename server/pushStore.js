const { getRedisClient } = require("./replyMapping");
const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");

// Firebase Admin — нужен только для отправки Web Push (уведомления клиентам
// на iPhone/десктопе через браузер). Android по-прежнему идёт через
// Expo Push (см. sendExpoPush ниже) — это никак не пересекается.
if (!getApps().length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : require("./firebase-service-account.json");
  initializeApp({
    credential: cert(serviceAccount),
  });
}

async function sendWebPush(token, { title, body }) {
  if (!token) return { ok: false, error: "no_token" };

  try {
    // Только data, без notification — иначе браузер показывает уведомление
    // сам, а наш обработчик onBackgroundMessage показывает второе, и клиенту
    // приходит два одинаковых push.
    await getMessaging().send({
      token,
      data: { title: String(title || ""), body: String(body || "") },
    });
    return { ok: true };
  } catch (error) {
    console.error("❌ Не удалось отправить web push:", error.message);
    return { ok: false, error: error.message };
  }
}

// ==============================
// Push-токены Android-приложения (Expo Push Token) — по одному на клиента
// (customerId = "android:<телефон>"). Используются, чтобы доставить
// сообщение админа из чата прямо на телефон клиента, даже если приложение
// закрыто.
// ==============================

async function savePushToken(customerId, token, platform = "android") {
  if (!customerId || !token) return;

  try {
    const client = await getRedisClient();
    await client.set(`pushToken:${customerId}:${platform}`, String(token));

        // Дата первого открытия приложения — фиксируется один раз (HSETNX не
    // перезаписывает уже существующее поле), чтобы дальнейшие обновления
    // токена (например при переустановке) не сбрасывали исходную дату
    // установки. И Android, и iPhone (platform: "web") считаем установкой —
    // ключ хранит "<дата>:<платформа>" одной строкой, чтобы не заводить
    // вторую отдельную структуру в Redis.
    await client.hSetNX("androidInstalls", customerId, `${Date.now()}:${platform}`);
  } catch (error) {
    console.error("❌ Не удалось сохранить push-токен:", error.message);
  }
}

// Список всех клиентов, хотя бы раз открывших Android-приложение (есть
// зафиксированная дата первого сохранения push-токена) — для вкладки
// "Установки" в панели оператора.
async function listAndroidInstalls() {
  try {
    const client = await getRedisClient();
    const all = await client.hGetAll("androidInstalls");

    return Object.entries(all)
      .map(([customerId, raw]) => {
        // Старые записи (сохранены до этой правки) хранят просто число —
        // считаем их Android по умолчанию, раз тогда фиксировался только он.
        const [installedAtStr, platform] = String(raw).split(":");
        return {
          customerId,
          phone: customerId.startsWith("android:") ? customerId.slice("android:".length) : customerId,
          installedAt: Number(installedAtStr) || 0,
          platform: platform || "android"
        };
      })
      .sort((a, b) => b.installedAt - a.installedAt);
  } catch (error) {
    console.error("❌ Не удалось получить список установок:", error.message);
    return [];
  }
}

async function getPushToken(customerId, platform = "android") {
  if (!customerId) return null;

  try {
    const client = await getRedisClient();
    return await client.get(`pushToken:${customerId}:${platform}`);
  } catch (error) {
    console.error("❌ Не удалось прочитать push-токен:", error.message);
    return null;
  }
}

// Отправка через Expo Push API — токен вида "ExponentPushToken[...]",
// авторизация не требуется для базовой отправки.
async function sendExpoPush(token, { title, body, data }) {
  if (!token) return { ok: false, error: "no_token" };

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        to: token,
        title,
        body,
        data,
        sound: "default"
      })
    });

    const result = await response.json();
    const ticket = result && result.data;

    if (ticket && ticket.status === "error") {
      console.error("❌ Expo push error:", ticket.message);
      return { ok: false, error: ticket.message };
    }

    return { ok: true };
  } catch (error) {
    console.error("❌ Не удалось отправить push:", error.message);
    return { ok: false, error: error.message };
  }
}

module.exports = {
  savePushToken,
  getPushToken,
  listAndroidInstalls,
  sendExpoPush,
  sendWebPush
};
