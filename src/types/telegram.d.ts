interface TelegramWebAppUser {

  id: number;

  first_name: string;

  last_name?: string;

  username?: string;

  allows_write_to_pm?: boolean;

}



interface TelegramWebApp {


  initDataUnsafe: {

    user?: TelegramWebAppUser;

  };


  ready(): void;


  requestWriteAccess(callback?: (granted: boolean) => void): void;


}





interface Window {

  Telegram?: {

    WebApp: TelegramWebApp;

  };


}