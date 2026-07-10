/**
 * firebase-config.js
 * -----------------------------------------------------------------------
 * Replace the placeholder values below with your own Firebase project
 * credentials (Project settings → General → Your apps → SDK setup).
 *
 * Until real values are provided, HUB Chat automatically runs in
 * DEMO MODE: authentication, messaging, stories, etc. are simulated
 * entirely in the browser (see js/services/demo-data.js) so the full
 * UI/UX can be explored without a backend.
 * -----------------------------------------------------------------------
 */
export const firebaseConfig = {
  apiKey: "AIzaSyCQfj0DKAETR5CeZkgbMVbfTTAXlVo10PU",
  authDomain: "hubchat-cee01.firebaseapp.com",
  databaseURL: "https://hubchat-cee01-default-rtdb.firebaseio.com",
  projectId: "hubchat-cee01",
  storageBucket: "hubchat-cee01.firebasestorage.app",
  messagingSenderId: "201867856922",
  appId: "1:201867856922:web:1a96d74d2cc5b1adf295a3"
};

/** VAPID key for Firebase Cloud Messaging (web push). */
export const fcmVapidKey = 'BG34RmMZjTkHtxkDbbX243F0mCS0Y2ca-Vl57fcELAqGknH3kms_4_WpbFjKQvLvUHAuULVes6TOXEFI8J16LWE';

/** True once the placeholders above have been replaced with real values. */
export const isFirebaseConfigured =
  firebaseConfig.apiKey !== 'AIzaSyCQfj0DKAETR5CeZkgbMVbfTTAXlVo10PU' &&
  !firebaseConfig.apiKey.includes('YOUR_');
