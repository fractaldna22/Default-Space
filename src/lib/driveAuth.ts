import googleConfig from '../../google-oauth-config.json';

export interface GoogleUser { email: string | null; displayName: string | null; photoURL: string | null }
type TokenResponse = {access_token?:string;expires_in?:number;error?:string;error_description?:string};
type TokenClient = {requestAccessToken(options?:{prompt?:string}):void};
type GoogleIdentity = {accounts:{oauth2:{initTokenClient(config:{client_id:string;scope:string;callback:(response:TokenResponse)=>void;error_callback?:(error:{type:string})=>void}):TokenClient;revoke(token:string,callback:()=>void):void}}};

declare global { interface Window { google?:GoogleIdentity } }

const TOKEN_KEY='drive_access_token';
const EXPIRES_KEY='drive_access_token_expires_at';
const USER_KEY='drive_auth_user_email';
const SCOPES='https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly';
const listeners=new Set<{success?:(user:GoogleUser,token:string)=>void;failure?:()=>void}>();
export const auth:{currentUser:GoogleUser|null}={currentUser:null};
let cachedToken:string|null=null;
let scriptPromise:Promise<GoogleIdentity>|null=null;
let validationPromise:Promise<string|null>|null=null;

export function getGoogleClientId() { return (import.meta.env.VITE_GOOGLE_CLIENT_ID || googleConfig.clientId || '').trim(); }

function loadGoogleIdentity():Promise<GoogleIdentity> {
  if(window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if(scriptPromise) return scriptPromise;
  scriptPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';
    script.async=true;script.defer=true;
    const timeout=setTimeout(()=>fail(new Error('Google sign-in timed out. Check your connection and try again.')),12000);
    const fail=(error:Error)=>{clearTimeout(timeout);script.remove();scriptPromise=null;reject(error);};
    script.onload=()=>{clearTimeout(timeout);if(window.google?.accounts?.oauth2) resolve(window.google); else fail(new Error('Google sign-in did not load. Try again.'));};
    script.onerror=()=>fail(new Error('Google sign-in could not load. Check your connection or browser blockers.'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

function clearToken(notify=true) {
  const hadToken=!!cachedToken || !!localStorage.getItem(TOKEN_KEY);
  cachedToken=null;validationPromise=null;auth.currentUser=null;
  localStorage.removeItem(TOKEN_KEY);localStorage.removeItem(EXPIRES_KEY);localStorage.removeItem(USER_KEY);
  if(notify && hadToken) listeners.forEach(listener=>listener.failure?.());
}

async function checkToken(token:string):Promise<string|null> {
  try {
    const response=await fetch('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink)',{headers:{Authorization:`Bearer ${token}`}});
    if(response.status===401){clearToken();return null;}
    if(!response.ok) return token; // A network failure does not revoke a still valid session.
    const info=await response.json();
    auth.currentUser={email:info.user?.emailAddress || null,displayName:info.user?.displayName || null,photoURL:info.user?.photoLink || null};
    if(auth.currentUser.email) localStorage.setItem(USER_KEY,auth.currentUser.email);
    return token;
  } catch {return token;}
}

export async function getAccessToken():Promise<string|null> {
  let token=cachedToken;
  try {token=token || localStorage.getItem(TOKEN_KEY);} catch {return null;}
  if(!token) return null;
  const expires=Number(localStorage.getItem(EXPIRES_KEY) || 0);
  if(expires && Date.now()>=expires-60000){clearToken();return null;}
  if(cachedToken) return cachedToken;
  validationPromise=validationPromise || checkToken(token);
  const result=await validationPromise;
  if(result) cachedToken=result;
  return result;
}

export function initAuth(onSuccess?:(user:GoogleUser,token:string)=>void,onFailure?:()=>void) {
  const listener={success:onSuccess,failure:onFailure};listeners.add(listener);
  void getAccessToken().then(token=>{if(token && listeners.has(listener)) onSuccess?.(auth.currentUser || {email:localStorage.getItem(USER_KEY),displayName:null,photoURL:null},token);});
  if(getGoogleClientId()) void loadGoogleIdentity().catch(()=>{});
  return ()=>{listeners.delete(listener);};
}

export async function googleSignIn():Promise<{user:GoogleUser;accessToken:string}> {
  const clientId=getGoogleClientId();
  if(!clientId) throw new Error('Google Drive sign-in needs a Google OAuth web client ID. Set VITE_GOOGLE_CLIENT_ID for this deployment.');
  if(!window.isSecureContext) throw new Error('Google sign-in needs HTTPS or localhost.');
  const gis=await loadGoogleIdentity();
  return new Promise((resolve,reject)=>{
    const client=gis.accounts.oauth2.initTokenClient({client_id:clientId,scope:SCOPES,
      error_callback:error=>reject(new Error(error.type==='popup_closed'?'Google sign-in was closed.':'Google sign-in popup could not open. Allow popups for this site and try again.')),
      callback:async response=>{
        if(!response.access_token){reject(new Error(response.error_description || response.error || 'Google did not grant Drive access.'));return;}
        const token=response.access_token;
        cachedToken=token;validationPromise=null;
        localStorage.setItem(TOKEN_KEY,token);
        localStorage.setItem(EXPIRES_KEY,String(Date.now()+Math.max(0,(response.expires_in || 3600)-60)*1000));
        await checkToken(token);
        const user=auth.currentUser || {email:null,displayName:null,photoURL:null};
        listeners.forEach(listener=>listener.success?.(user,token));
        resolve({user,accessToken:token});
      }});
    client.requestAccessToken({prompt:'select_account'});
  });
}

export function setStoredAccessToken(token:string|null) {
  if(!token){clearToken();return;}
  cachedToken=token;validationPromise=null;localStorage.setItem(TOKEN_KEY,token);
  localStorage.removeItem(EXPIRES_KEY);void checkToken(token).then(valid=>{if(valid) listeners.forEach(listener=>listener.success?.(auth.currentUser || {email:null,displayName:null,photoURL:null},valid));});
}

export async function logout() {
  const token=cachedToken || localStorage.getItem(TOKEN_KEY);
  clearToken();
  if(token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token,()=>{});
}
