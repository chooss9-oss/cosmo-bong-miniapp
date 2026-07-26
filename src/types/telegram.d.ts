interface TelegramWebAppUser {

  id: number;

  first_name: string;

  last_name?: string;

  username?: string;

}



interface TelegramWebApp {


  initDataUnsafe: {

    user?: TelegramWebAppUser;

  };


  ready(): void;


}





interface Window {

  Telegram?: {

    WebApp: TelegramWebApp;

  };


}