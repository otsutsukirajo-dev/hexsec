import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pointagepro.app',
  appName: 'PointagePro',
  webDir: 'www', // On change "." par "www" pour isoler les fichiers mobiles
  server: {
    androidScheme: 'https'
  }
};

export default config;