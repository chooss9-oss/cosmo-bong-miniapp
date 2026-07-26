export function getTelegramUser() {


  const tg =
    window.Telegram?.WebApp;



  if (!tg) {

    return null;

  }



  return tg.initDataUnsafe?.user || null;


}