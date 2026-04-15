// ══════════════════════════════════════════════
//  ChatCity — Firebase Config & Shared Utils
//  v4.0 — No Backend · FCM Direct · All Features
// ══════════════════════════════════════════════

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile, updatePassword,
  EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
import {
  getDatabase, ref, set, get, push, onValue, off, remove,
  serverTimestamp, onDisconnect, query, orderByChild, equalTo, update
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';

// ══ CONFIG ══
const FB_CONFIG = {
  apiKey:            "AIzaSyAVKGyPWWQzEWfwkOwhwXabD3HbuLQz-qA",
  authDomain:        "chatcity-63c68.firebaseapp.com",
  databaseURL:       "https://chatcity-63c68-default-rtdb.firebaseio.com",
  projectId:         "chatcity-63c68",
  storageBucket:     "chatcity-63c68.firebasestorage.app",
  messagingSenderId: "1015529457316",
  appId:             "1:1015529457316:web:638f1d8e25539177844831"
};

const app  = initializeApp(FB_CONFIG);
const auth = getAuth(app);
const db   = getDatabase(app);
const gProvider = new GoogleAuthProvider();

// ══ CONSTANTS ══
const ADMIN_EMAIL   = 'admin@chatcity.com';
const ADMIN_PASS    = '9999';
const ADMIN_UID     = 'admin_system_001';
const VAPID_KEY     = 'BIzNCrJpsUisnOJqa6ETjkMUgt5LvXUKn6BtCrTgbzGfwtEXRPS1uO6T-1a4mn6djVlkZjLrio5lcsEpOfKKllo';
const VERIFIED_BADGE = 'https://i.ibb.co/W4fjDGmD/32539-removebg-preview.png';
const BASE_URL      = window.location.href.replace(/[^/]*$/, '');
const FCM_API_KEY   = FB_CONFIG.apiKey;

// ══ COLORS ══
const COLORS = ['#7c6eff','#ff6b9d','#2dd4a0','#f7c94b','#60a5fa','#fb923c','#c084fc','#34d399'];
const colorFor   = uid => { let h=0; for(const c of uid) h=(h*31+c.charCodeAt(0))%COLORS.length; return COLORS[h]; };
const initialsOf = name => { if(!name) return '?'; const p=name.trim().split(/\s+/); return p.length>=2?(p[0][0]+p[p.length-1][0]).toUpperCase():name[0].toUpperCase(); };
const chatId     = (a,b) => [a,b].sort().join('__');

// ══ TIME ══
const fmtTime = ts => { const d=new Date(ts); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
const fmtDate = ts => { const d=new Date(ts),now=new Date(); if(d.toDateString()===now.toDateString()) return 'Today'; const y=new Date(now); y.setDate(now.getDate()-1); if(d.toDateString()===y.toDateString()) return 'Yesterday'; return d.toLocaleDateString('en-GB',{day:'numeric',month:'short'}); };
const escHtml = s => s?.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')??'';

// ══ TOAST ══
let _toastTimer;
const toast = (msg, type='') => {
  const el = document.getElementById('toast'); if(!el) return;
  el.textContent = type==='error'?'⚠ '+msg : type==='ok'?'✓ '+msg : msg;
  el.style.background = type==='error'?'#ff5370' : type==='ok'?'#2dd4a0' : '';
  el.style.color = (type==='error'||type==='ok') ? '#fff' : '';
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(()=>el.classList.remove('show'), 3000);
};

// ══ ERROR REPORTING ══
const reportError = async (err, ctx='') => {
  try { await push(ref(db,'admin/errors'),{error:String(err),context:ctx,ts:Date.now(),ua:navigator.userAgent}); } catch {}
  console.warn('[ChatCity]',err,ctx);
};
window.onerror = (m,s,l) => reportError(`${m} @ ${s}:${l}`,'window.onerror');
window.onunhandledrejection = e => reportError(e.reason,'unhandledRejection');

// ══ SESSION ══
const SESSION_KEY = 'cc_session';
const saveSession  = (uid,p) => localStorage.setItem(SESSION_KEY,JSON.stringify({uid,passcode:p,ts:Date.now()}));
const getSession   = ()      => { try{return JSON.parse(localStorage.getItem(SESSION_KEY));}catch{return null;} };
const clearSession = ()      => localStorage.removeItem(SESSION_KEY);

// ══ ROUTER ══
const go = (page,data={}) => { sessionStorage.setItem('cc_route',JSON.stringify({page,data})); window.location.href=page; };

// ══ ONLINE STATUS ══
const setOnline = async uid => {
  try {
    const r = ref(db,`users/${uid}/online`);
    await set(r,true);
    onDisconnect(r).set(false);
    onDisconnect(ref(db,`users/${uid}/lastSeen`)).set(Date.now());
    await set(ref(db,`users/${uid}/lastVisit`),Date.now());
  } catch(e){ console.error('setOnline:',e); }
};

// ══════════════════════════════════════════════
// FCM PUSH NOTIFICATIONS — No Backend Needed
// Uses Firebase Cloud Messaging directly
// ══════════════════════════════════════════════

let _fcmMessaging = null;
let _fcmInitialized = false;

const initFCM = async uid => {
  if(_fcmInitialized) return;
  try {
    if(!('serviceWorker' in navigator)) return;
    // Register SW
    const reg = await navigator.serviceWorker.register('/ChatCity/firebase-messaging-sw.js', { scope: '/ChatCity/' }).catch(()=>
      navigator.serviceWorker.register('./firebase-messaging-sw.js')
    );
    await navigator.serviceWorker.ready;

    const { getMessaging, getToken, onMessage } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging.js');
    _fcmMessaging = getMessaging(app);

    const perm = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission().catch(()=>'denied');

    if(perm !== 'granted') { console.log('[FCM] Permission not granted'); return; }

    const token = await getToken(_fcmMessaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
    if(token) {
      await set(ref(db,`users/${uid}/fcmToken`), token);
      await set(ref(db,`users/${uid}/fcmUpdated`), Date.now());
      _fcmInitialized = true;
      console.log('[FCM] ✅ Token registered');
    }

    // Handle foreground messages
    onMessage(_fcmMessaging, payload => {
      const { title, body, icon } = payload.notification || {};
      const data = payload.data || {};
      if(document.visibilityState === 'hidden') return; // SW handles background
      // Show custom in-app toast for foreground
      toast(`${title||'ChatCity'}: ${body||'New message'}`);
    });
  } catch(e){ console.warn('[FCM init error]', e); }
};

// ══ SEND PUSH VIA FCM HTTP v1 (client-side using user's own token) ══
// Since we have no backend, we use FCM Legacy HTTP directly with a
// server key stored in Firebase DB (admin sets it once).
// Alternatively we use Firebase Functions stub via direct REST.
// APPROACH: Store notifications as DB records, SW reads them.
// For true push we write to /notifications/{uid} and the FCM SW
// delivers via onBackgroundMessage when the app is closed.

const sendPushToUser = async (receiverUid, title, body, url='home.html', type='message') => {
  try {
    // Write notification to receiver's notifications node
    // This is read by the receiver's onValue listener when online
    // and shown as a push when offline via SW
    const notifRef = push(ref(db, `notifications/${receiverUid}`));
    await set(notifRef, {
      id: notifRef.key,
      title,
      body,
      url,
      type, // 'message' | 'call' | 'system'
      ts: Date.now(),
      read: false
    });

    // Also try FCM via sender's own token using FCM REST API
    // We store the FCM server key in DB (admin configures once)
    const serverKeySnap = await get(ref(db, 'admin/fcmServerKey'));
    const serverKey = serverKeySnap.val();

    const receiverSnap = await get(ref(db, `users/${receiverUid}`));
    const receiver = receiverSnap.val();
    if(!receiver) return;
    if(receiver.online) return; // Don't push if online — they see it live

    const token = receiver.fcmToken;
    if(!token || !serverKey) return;

    // FCM REST API call
    await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'key=' + serverKey
      },
      body: JSON.stringify({
        to: token,
        notification: {
          title,
          body,
          icon: 'https://cdn-icons-png.flaticon.com/512/3048/3048122.png',
          badge: 'https://cdn-icons-png.flaticon.com/512/3048/3048122.png',
          click_action: url
        },
        data: { url, type },
        priority: 'high',
        android: { priority: 'high', notification: { sound: 'default', vibrate: [200,100,200] } },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } }
      })
    }).catch(()=>{}); // Silently fail if CORS blocked — DB notification still works
  } catch(e){ console.warn('[sendPush]', e); }
};

// ══ ADMIN: Send custom push to any/all users ══
const adminSendPush = async (targetUid, title, body, url='home.html') => {
  if(targetUid === 'ALL') {
    // Send to all users
    const snap = await get(ref(db, 'users'));
    const users = snap.val() || {};
    const promises = Object.keys(users).map(uid => sendPushToUser(uid, title, body, url, 'system'));
    await Promise.allSettled(promises);
    // Also write to admin/broadcasts
    await push(ref(db, 'admin/broadcasts'), { title, body, url, ts: Date.now(), sentBy: ADMIN_UID });
  } else {
    await sendPushToUser(targetUid, title, body, url, 'system');
  }
};

// ══ LISTEN NOTIFICATIONS (for current user, show in-app) ══
const listenNotifications = (uid, callback) => {
  onValue(ref(db, `notifications/${uid}`), snap => {
    const all = snap.val() || {};
    const unread = Object.entries(all)
      .filter(([,n]) => !n.read)
      .sort((a,b) => b[1].ts - a[1].ts);
    callback(unread);
  });
};

const markNotifRead = async (uid, nid) => {
  await set(ref(db, `notifications/${uid}/${nid}/read`), true);
};

const markAllNotifsRead = async uid => {
  const snap = await get(ref(db, `notifications/${uid}`));
  const all = snap.val() || {};
  const updates = {};
  Object.keys(all).forEach(k => { updates[`notifications/${uid}/${k}/read`] = true; });
  if(Object.keys(updates).length) await update(ref(db,'/'), updates);
};

// Email stub (not used — FCM only)
const sendBrevoEmail = async () => true;
const notifyMessageByEmail = async () => {};
const checkAndSendDigestEmail = async () => {};
const checkMissYouEmail = async () => {};
const validateEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

// ══════════════════════════════════════════════
// BADGE SYSTEM
// Admin can assign verified badge to any user
// Badge shows everywhere: chat list, contacts, chat header
// ══════════════════════════════════════════════

const assignBadge = async (targetUid, hasBadge=true) => {
  await set(ref(db, `users/${targetUid}/verified`), hasBadge ? true : null);
  // Update search index too
  const snap = await get(ref(db, `users/${targetUid}`));
  const u = snap.val();
  if(u) await createUserSearchIndex(targetUid, u);
};

const getBadgeHtml = (user, size=16) => {
  if(!user?.verified) return '';
  return `<img src="${VERIFIED_BADGE}" class="verified-badge" style="width:${size}px;height:${size}px;vertical-align:middle;margin-left:3px;animation:shine 2s infinite;" title="Verified">`;
};

// ══════════════════════════════════════════════
// USER CODE SYSTEM
// ══════════════════════════════════════════════
const generateUserCode = uid => {
  try {
    let hash=0;
    for(let i=0;i<uid.length;i++){const c=uid.charCodeAt(i);hash=((hash<<5)-hash)+c;hash=hash&hash;}
    const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code='',num=Math.abs(hash);
    for(let i=0;i<6;i++){code+=chars[num%chars.length];num=Math.floor(num/chars.length);}
    let cs=0; for(let i=0;i<code.length;i++) cs+=code.charCodeAt(i);
    return code+(cs%10); // 7-char code
  } catch { return 'ERROR01'; }
};

const findUserByCode = async code => {
  try {
    if(!code || code.length !== 7) return null;
    const upperCode = code.toUpperCase();
    // First check search index
    const snap = await get(ref(db,'search/users'));
    const users = snap.val() || {};
    for(const [uid, u] of Object.entries(users)){
      if(u && u.code === upperCode) return {uid, ...u};
    }
    // Fallback: scan all users and compute code
    const usersSnap = await get(ref(db,'users'));
    const allUsers = usersSnap.val() || {};
    for(const [uid, u] of Object.entries(allUsers)){
      if(generateUserCode(uid) === upperCode) return {uid, ...u};
    }
    return null;
  } catch(e) { console.warn('[findUserByCode]',e); return null; }
};

const addFriendByCode = async (myUid, code) => {
  const user = await findUserByCode(code);
  if(!user) throw new Error('User code not found. Make sure you entered the correct 7-character code.');
  if(user.uid === myUid) throw new Error('You cannot add yourself');
  const ex = await get(ref(db,`users/${myUid}/contacts/${user.uid}`));
  if(ex.exists()) throw new Error('Already in your contacts');
  await set(ref(db,`users/${myUid}/contacts/${user.uid}`), true);
  await set(ref(db,`users/${user.uid}/contacts/${myUid}`), true);
  // Notify the other user
  const mySnap = await get(ref(db,`users/${myUid}`));
  const me = mySnap.val() || {};
  await sendPushToUser(user.uid, 'New Contact Added! 🎉', `${me.name||'Someone'} added you as a contact`, 'contacts.html', 'system');
  return {success:true, user};
};

// ══ SEARCH ══
const createUserSearchIndex = async (uid, user) => {
  try {
    const code = generateUserCode(uid);
    const ni = (user.name||'').toLowerCase().trim();
    const ei = (user.email||'').toLowerCase().trim();
    const nt = ni.split(/\s+/).filter(t=>t.length>0);
    const et = ei.split('@')[0].split(/[\._\-]+/).filter(t=>t.length>0);
    await set(ref(db,`search/users/${uid}`),{
      uid, code,
      name: user.name||'',
      email: user.email||'',
      nameIndex: ni,
      emailIndex: ei,
      tokens: [...new Set([...nt,...et,ni,ei,code.toLowerCase()])],
      color: user.color||colorFor(uid),
      initials: user.initials||initialsOf(user.name||'?'),
      photo: user.photo||'',
      verified: user.verified||false,
      createdAt: user.createdAt||Date.now()
    });
  } catch(e){ console.error('[Search index]',e); }
};

const searchUsers = async (query, excludeUid=null) => {
  try {
    if(!query||query.length<1) return [];
    const q = query.toLowerCase().trim();
    const snap = await get(ref(db,'search/users'));
    const users = snap.val() || {};
    const results = Object.values(users).filter(u => {
      if(!u||typeof u!=='object') return false;
      if(excludeUid && u.uid===excludeUid) return false;
      return (u.nameIndex && (u.nameIndex.includes(q) || u.tokens?.some(t=>t.includes(q))))
          || (u.emailIndex && u.emailIndex.includes(q))
          || (u.code && u.code.toLowerCase() === q.toLowerCase())
          || (generateUserCode(u.uid||'').toLowerCase() === q.toLowerCase());
    });
    return results
      .sort((a,b) => {
        // Exact name match first
        const aExact = (a.nameIndex||'').startsWith(q) ? 0 : 1;
        const bExact = (b.nameIndex||'').startsWith(q) ? 0 : 1;
        return aExact - bExact || (a.name||'').length - (b.name||'').length;
      })
      .slice(0, 50);
  } catch(e) { console.warn('[searchUsers]',e); return []; }
};

const getAllUsers = async (useCache=true) => {
  try {
    const ck='users_cache', ct=ck+'_time';
    const cached=localStorage.getItem(ck), ctime=localStorage.getItem(ct);
    if(useCache&&cached&&ctime&&(Date.now()-parseInt(ctime))<300000) return JSON.parse(cached);
    const snap=await get(ref(db,'users'));
    const users=Object.entries(snap.val()||{}).map(([uid,u])=>({uid,...u})).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
    localStorage.setItem(ck,JSON.stringify(users)); localStorage.setItem(ct,Date.now().toString());
    return users;
  } catch { return []; }
};

const deleteUserSearchIndex = async uid => { try{await remove(ref(db,`search/users/${uid}`));}catch{} };
const updateUserSearchIndex = async (uid,user) => { await deleteUserSearchIndex(uid); await createUserSearchIndex(uid,user); };

// ══ OFFLINE QUEUE ══
const QUEUE_KEY='cc_msg_queue';
const addToOfflineQueue  = (cid,msg) => { try{const q=JSON.parse(localStorage.getItem(QUEUE_KEY))||{};if(!q[cid])q[cid]=[];q[cid].push(msg);localStorage.setItem(QUEUE_KEY,JSON.stringify(q));}catch{} };
const getOfflineQueue    = cid       => { try{return(JSON.parse(localStorage.getItem(QUEUE_KEY))||{})[cid]||[];}catch{return[];} };
const clearOfflineQueue  = cid       => { try{const q=JSON.parse(localStorage.getItem(QUEUE_KEY))||{};delete q[cid];localStorage.setItem(QUEUE_KEY,JSON.stringify(q));}catch{} };

// ══ ONLINE DETECTION ══
let _online=navigator.onLine;
window.addEventListener('online', ()=>{_online=true; window.dispatchEvent(new CustomEvent('appOnline'));});
window.addEventListener('offline',()=>{_online=false;});
const isAppOnline=()=>_online;

const sendMessageOfflineAware = async (cid,uid,payload) => {
  if(!_online){addToOfflineQueue(cid,payload);return{offline:true,queued:true};}
  const r=push(ref(db,`chats/${cid}/messages`));
  await set(r,{id:r.key,senderId:uid,ts:Date.now(),seen:false,...payload});
  return{offline:false,sent:true};
};

// ══ BAN ══
const isUserBanned  = async uid => { try{const s=await get(ref(db,`admin/banned/${uid}`));return s.val()===true;}catch{return false;} };
const checkWarning  = async uid => { try{const s=await get(ref(db,`admin/warnings/${uid}`));return s.val()===true;}catch{return false;} };

// ══ EXPORT ══
export {
  app, auth, db, gProvider,
  ADMIN_EMAIL, ADMIN_PASS, ADMIN_UID, VAPID_KEY, VERIFIED_BADGE, BASE_URL, COLORS,
  colorFor, initialsOf, chatId, fmtTime, fmtDate, escHtml,
  toast, reportError,
  saveSession, getSession, clearSession, go,
  setOnline, isAppOnline,
  initFCM, sendPushToUser, adminSendPush,
  listenNotifications, markNotifRead, markAllNotifsRead,
  assignBadge, getBadgeHtml,
  sendBrevoEmail, validateEmail,
  notifyMessageByEmail, checkAndSendDigestEmail, checkMissYouEmail,
  generateUserCode, findUserByCode, addFriendByCode,
  createUserSearchIndex, searchUsers, getAllUsers,
  deleteUserSearchIndex, updateUserSearchIndex,
  addToOfflineQueue, getOfflineQueue, clearOfflineQueue, sendMessageOfflineAware,
  isUserBanned, checkWarning,
  ref, set, get, push, onValue, off, remove, update,
  serverTimestamp, onDisconnect, query, orderByChild, equalTo,
  signOut, onAuthStateChanged, updateProfile, updatePassword,
  EmailAuthProvider, reauthenticateWithCredential,
  GoogleAuthProvider, signInWithPopup,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail
};
