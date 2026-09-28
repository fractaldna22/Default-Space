# Default Space — mobile edition

A phone-first model chat interface with conversations, model search, settings, file attachments, voice clips, and live calls for GPT Realtime models.

## Run locally

1. Install Node.js 20 or newer and run `npm install`.
2. Set any server-side API keys you use in `.env.local`, or enter them in **Tools → Settings → API connections**. The browser key option is intended for personal/local use.
3. Run `npm run dev`, then open the local URL printed by the server.
4. For a production build, run `npm run build` and `npm start`.

The interface saves chats locally in the browser. Google Drive backup is optional and can be connected from **Tools → Google Drive**.

## Google Drive connection

Google Drive authorization uses [Google Identity Services](https://developers.google.com/identity/oauth2/web/guides/use-token-model) directly; Firebase is not required. This source includes the **public Default Space Mobile OAuth client ID** in `google-oauth-config.json`, registered for `http://127.0.0.1:5173`. A deployment can override it with `VITE_GOOGLE_CLIENT_ID` in its build environment. An OAuth client ID is public configuration, not a client secret.

For a new host/domain, create a Google OAuth **Web application** client in Google Cloud, enable the Drive API, and add the exact site origin to **Authorized JavaScript origins**. Put that client's ID in `VITE_GOOGLE_CLIENT_ID` before building. The OAuth consent screen also needs to be published for external users. Google may require verification for the Drive scopes this app requests. A Google project's testing audience or unregistered site origin cannot be expanded by app code alone. See Google's [client ID setup guide](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid).

Google access tokens expire and are checked on reload. If the token has expired, use the Google Drive panel to reconnect. Chats continue to save locally even when Drive is disconnected; export a backup before clearing browser data or moving to another device.

## Voice and files

The paperclip accepts images, audio, and readable text/code files. PDF and Office documents need a text export first. Audio uploads and recorded clips are converted to mono WAV for supported models. A recorded clip appears in the composer with playback before sending. GPT Audio replies default to text; audio replies are an optional per-conversation setting.

For a GPT Realtime model, the phone composer shows a call button. It opens a live voice screen; tapping **Start voice chat** requests microphone access. Your selected model receives recent text context, and completed transcriptions are saved back into the conversation. The browser needs HTTPS or localhost for microphone access. The Realtime call requires a direct OpenAI API key. Audio turns are handled through WebRTC; the app server proxies only session setup.
