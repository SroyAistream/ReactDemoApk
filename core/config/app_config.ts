
/** * Matches Android Config.java logic 
 */
export const PROD_POSTER_URL = 'https://demo.aistream.tv:8833/';
export const HUB_POSTER_URL = `http://192.168.39.20:88/`;

export const getBaseUrl = (isHubConnected: boolean) => {
  return isHubConnected ? HUB_POSTER_URL : PROD_POSTER_URL;
};