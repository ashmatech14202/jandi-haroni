import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.494c7e0bd26943ec8f5d365700e9e1e4',
  appName: 'jandimundi',
  webDir: 'dist',
  server: {
    url: 'https://494c7e0b-d269-43ec-8f5d-365700e9e1e4.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#7C3AED',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      androidSpinnerStyle: 'large',
      iosSpinnerStyle: 'small',
      spinnerColor: '#FFD66B',
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
