/* eslint-disable */
import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, onSnapshot, collection, getDocs } from "firebase/firestore";

// ─── FIREBASE ─────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDK--DuLNxgRtwc6jj1DNcfRgwsRTgVO_Q",
  authDomain: "mon-resto-3719e.firebaseapp.com",
  projectId: "mon-resto-3719e",
  storageBucket: "mon-resto-3719e.firebasestorage.app",
  messagingSenderId: "98022114260",
  appId: "1:98022114260:web:1ce8bacf850344048d4c41",
  measurementId: "G-GRNC5J6CQM"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// ─── DB HELPERS ───────────────────────────────────────────────────────────────
const dbGet = async (key) => {
  try {
    const snap = await getDoc(doc(db, "restopro", key));
    return snap.exists() ? snap.data().value : null;
  } catch { return null; }
};
const dbSet = async (key, value) => {
  try { await setDoc(doc(db, "restopro", key), { value }); } catch(e) { console.error(e); }
};

// localStorage fallback pour session uniquement
const lsGet = (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch {} };


// ─── PUSH NOTIFICATIONS + SERVICE WORKER ─────────────────────────────────────
const VAPID_PUBLIC_KEY = "BNZIreiMv4mguUr1oYDnqIiV0dceOotsip_L1m2hsFlaCL9oxYmCZSq2zp3xNUCaItr6y1S9U31isG0mgIG2CbU";

// Convertit la clé VAPID base64url en Uint8Array
const urlBase64ToUint8 = (base64String) => {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
};

// Enregistre le Service Worker et retourne la subscription
const registerSW = async () => {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8(VAPID_PUBLIC_KEY),
      });
    }
    return sub;
  } catch (e) {
    console.warn("SW registration failed:", e);
    return null;
  }
};

// Demande la permission + enregistre le SW + sauvegarde la sub dans Firebase
const askNotifPermission = async (userId) => {
  try {
    if (!("Notification" in window)) { console.warn("Notifs non supportées"); return false; }
    if (Notification.permission === "denied") { console.warn("Notifs refusées"); return false; }
    const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm !== "granted") return false;
    if (!("serviceWorker" in navigator)) { console.warn("SW non supporté"); return false; }
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8(VAPID_PUBLIC_KEY),
      });
    }
    if (!sub) { console.warn("Subscription échouée"); return false; }
    if (userId) {
      await setDoc(doc(db, "restopro_push", userId), {
        sub: JSON.stringify(sub.toJSON()),
        updatedAt: new Date().toISOString()
      });
      console.log("Push subscription sauvegardée pour", userId);
    }
    return true;
  } catch(e) {
    console.error("askNotifPermission error:", e);
    return false;
  }
};

// Envoie la notification via notre Vercel Function
const sendPushToUser = async (userId, title, body, tag="order") => {
  try {
    const snap = await getDoc(doc(db, "restopro_push", userId));
    if (!snap.exists()) return;
    const sub = JSON.parse(snap.data().sub);
    await fetch("/api/send-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub, title, body, tag, url: "/client-orders" }),
    });
  } catch(e) { console.warn("Push send failed:", e); }
};

// Fallback local si SW pas dispo (app ouverte)
const sendNotif = (title, body) => {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try { new Notification(title, { body, icon:"/logo192.png", badge:"/logo192.png" }); } catch(e) {}
};

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const SEED_USERS = [
  { id:"admin", role:"admin", name:"Patron", email:"admin@restaurant.fr", password:"admin123", points:0, createdAt:new Date().toISOString() },
];
const SEED_MENU = [
  { id:"e1", cat:"entree",  name:"Salade César",            desc:"Laitue, parmesan, croûtons, sauce césar", price:8.50,  points:8,  available:true },
  { id:"e2", cat:"entree",  name:"Soupe à l'oignon",        desc:"Gratinée au fromage",                    price:7.00,  points:7,  available:true },
  { id:"p1", cat:"plat",    name:"Entrecôte grillée",       desc:"250g, frites maison, sauce béarnaise",   price:22.00, points:22, available:true },
  { id:"p2", cat:"plat",    name:"Saumon en croûte",        desc:"Épinards, crème citronnée",              price:19.50, points:19, available:true },
  { id:"p3", cat:"plat",    name:"Risotto aux champignons", desc:"Parmesan, truffe noire",                 price:16.00, points:16, available:true },
  { id:"d1", cat:"dessert", name:"Crème brûlée",            desc:"Vanille Bourbon",                        price:6.50,  points:6,  available:true },
  { id:"d2", cat:"dessert", name:"Fondant chocolat",        desc:"Coulant, glace vanille",                 price:7.50,  points:7,  available:true },
  { id:"b1", cat:"boisson", name:"Eau minérale 50cl",       desc:"",                                       price:3.00,  points:3,  available:true },
  { id:"b2", cat:"boisson", name:"Vin rouge maison",        desc:"Bordeaux AOP (verre)",                   price:5.50,  points:5,  available:true },
  { id:"b3", cat:"boisson", name:"Jus de fruits",           desc:"Orange pressée",                         price:4.00,  points:4,  available:true },
  { id:"m1", cat:"menu",    name:"Menu Déjeuner",           desc:"Entrée + Plat + Boisson",                price:18.00, points:20, available:true },
];
const SEED_REWARDS  = [
  { id:"r1", name:"Dessert offert",       points:50,  desc:"Un dessert au choix" },
  { id:"r2", name:"Plat offert",          points:100, desc:"Un plat principal au choix" },
  { id:"r3", name:"Repas complet offert", points:200, desc:"Entrée + Plat + Dessert" },
];
const SEED_SETTINGS = { pointsPerEuro:1, currency:"€" };

// ─── UTILS ────────────────────────────────────────────────────────────────────
const genId   = () => Math.random().toString(36).slice(2,10);
const fmt     = (n) => Number(n).toFixed(2) + " €";
const fmtDate = (d) => new Date(d).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
const CAT_LABELS = { entree:"Entrées", plat:"Plats", dessert:"Desserts", boisson:"Boissons", menu:"Menus" };
const CAT_ICONS  = { entree:"🥗", plat:"🍽️", dessert:"🍮", boisson:"🥤", menu:"📋" };
const STATUS_CONFIG = {
  waiting:{ label:"En attente de paiement", color:"#f59e0b", icon:"⏳" },
  paid:   { label:"Payée",                  color:"#3b82f6", icon:"💳" },
  prep:   { label:"En préparation",         color:"#f97316", icon:"👨‍🍳" },
  ready:  { label:"Prête",                  color:"#22c55e", icon:"✅" },
  done:   { label:"Terminée",               color:"#6b7280", icon:"⚫" },
};

// ═══════════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [loaded,      setLoaded]      = useState(false);
  const [users,       setUsers]       = useState([]);
  const [menu,        setMenu]        = useState([]);
  const [orders,      setOrders]      = useState([]);
  const [rewards,     setRewards]     = useState([]);
  const [settings,    setSettings]    = useState(SEED_SETTINGS);
  const [invoices,    setInvoices]    = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [page,        setPage]        = useState("login");
  const [toast,       setToast]       = useState(null);

  // ── Chargement initial depuis Firebase ───────────────────────────────────────
  useEffect(() => {
    (async () => {
      const [u, m, o, r, s, inv] = await Promise.all([
        dbGet("users"), dbGet("menu"), dbGet("orders"),
        dbGet("rewards"), dbGet("settings"), dbGet("invoices")
      ]);
      const finalUsers = u || SEED_USERS;
      if (!u) await dbSet("users", SEED_USERS);
      if (!m) await dbSet("menu",  SEED_MENU);
      if (!o) await dbSet("orders", []);
      if (!r) await dbSet("rewards", SEED_REWARDS);
      if (!s) await dbSet("settings", SEED_SETTINGS);
      if (!inv) await dbSet("invoices", []);
      setUsers(finalUsers);
      setMenu(m || SEED_MENU);
      setOrders(o || []);
      setRewards(r || SEED_REWARDS);
      setSettings(s || SEED_SETTINGS);
      setInvoices(inv || []);
      // Restore session
      const session = lsGet("rm:session");
      if (session) {
        const found = finalUsers.find(x => x.id === session.id);
        if (found) {
          setCurrentUser(found);
          setPage(found.role==="admin" ? "admin-dash" : found.role==="employee" ? "emp-orders" : "client-menu");
        }
      }
      setLoaded(true);
    })();
  }, []);

  // ── Écoute en temps réel Firebase ────────────────────────────────────────────
  useEffect(() => {
    const unsubs = [
      onSnapshot(doc(db,"restopro","orders"),   snap => { if(snap.exists()) setOrders(snap.data().value||[]); }),
      onSnapshot(doc(db,"restopro","invoices"), snap => { if(snap.exists()) setInvoices(snap.data().value||[]); }),
      onSnapshot(doc(db,"restopro","users"),    snap => { if(snap.exists()) setUsers(snap.data().value||[]); }),
      onSnapshot(doc(db,"restopro","menu"),     snap => { if(snap.exists()) setMenu(snap.data().value||[]); }),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  // ── Notifications push client ─────────────────────────────────────────────────
  // On surveille les changements de statut des commandes du client connecté
  const prevOrderStatuses = useRef({});
  useEffect(() => {
    if (!currentUser || currentUser.role !== "client") return;
    const myOrders = orders.filter(o => o.clientId === currentUser.id);
    myOrders.forEach(order => {
      const prev = prevOrderStatuses.current[order.id];
      // Déclenche la notif seulement quand le statut CHANGE vers "ready"
      if (prev && prev !== order.status && order.status === "ready") {
        const isEmporter = order.orderType === "emporter";
        const title = isEmporter ? "🥡 Commande prête !" : "✅ Commande prête !";
        const body  = isEmporter
          ? "Votre commande est prête. Veuillez la récupérer au comptoir."
          : "Votre commande est prête. Un employé arrive pour vous servir.";
        sendNotif(title, body);
      }
      prevOrderStatuses.current[order.id] = order.status;
    });
  }, [orders, currentUser]);

  const showToast = (msg, type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); };

  // ── Helpers persist Firebase ──────────────────────────────────────────────────
  const updateUsers    = async (v) => { setUsers(v);    await dbSet("users",    v); };
  const updateMenu     = async (v) => { setMenu(v);     await dbSet("menu",     v); };
  const updateRewards  = async (v) => { setRewards(v);  await dbSet("rewards",  v); };
  const updateSettings = async (v) => { setSettings(v); await dbSet("settings", v); };

  // ── Login — lit depuis Firebase pour avoir les derniers comptes ───────────────
  const login = async (email, password, remember=false) => {
    const freshData = await dbGet("users");
    const all = freshData || SEED_USERS;
    const u = all.find(x => x.email.toLowerCase().trim()===email.toLowerCase().trim() && x.password===password);
    if (!u) return showToast("Identifiants incorrects","error");
    setUsers(all);
    setCurrentUser(u);
    if (remember) lsSet("rm:session",{id:u.id});
    else lsDel("rm:session");
    setPage(u.role==="admin" ? "admin-dash" : u.role==="employee" ? "emp-orders" : "client-menu");
    showToast(`Bienvenue ${u.name} !`);
    // Demande permission notifications pour les clients
    if (u.role === "client") askNotifPermission(u.id);
  };

  const logout = () => { setCurrentUser(null); setPage("login"); lsDel("rm:session"); };

  // ── Commandes ─────────────────────────────────────────────────────────────────
  const placeOrder = async (items, orderType="surplace", tableNumber="", reward=null) => {
    const freshOrders = await dbGet("orders") || [];
    const freshUsers  = await dbGet("users")  || [];
    const total = items.reduce((s,i)=>s+i.price*i.qty, 0);
    const pointsEarned = reward ? 0 : Math.floor(total * settings.pointsPerEuro);
    const pointsDeducted = reward ? reward.points : 0;
    const order = {
      id:genId(), clientId:currentUser.id, clientName:currentUser.name,
      items, total, pointsEarned, pointsDeducted,
      rewardUsed: reward ? reward.name : null,
      status:"waiting",
      orderType, tableNumber, createdAt:new Date().toISOString()
    };
    const newOrders = [...freshOrders, order];
    await dbSet("orders", newOrders);
    setOrders(newOrders);
    // Points : on ajoute les points gagnés et on déduit les points de la récompense
    const newPoints = Math.max(0, (currentUser.points||0) + pointsEarned - pointsDeducted);
    const newUsers = freshUsers.map(u=>u.id===currentUser.id?{...u,points:newPoints}:u);
    await dbSet("users", newUsers);
    setUsers(newUsers);
    setCurrentUser(prev=>({...prev,points:newPoints}));
    return order;
  };

  const payOrder = async (order) => {
    if (!order) return;
    const freshInvoices = await dbGet("invoices") || [];
    const freshOrders   = await dbGet("orders")   || [];
    const invoice = {
      id:genId(), orderId:order.id, clientId:order.clientId, clientName:order.clientName,
      items:order.items, total:order.total, paidAt:new Date().toISOString(),
      orderType:order.orderType, tableNumber:order.tableNumber,
      rewardUsed:order.rewardUsed||null
    };
    await dbSet("invoices", [...freshInvoices, invoice]);
    await dbSet("orders", freshOrders.map(o=>o.id===order.id?{...o,status:"paid"}:o));
  };

  const updateOrderStatus = async (orderId, status) => {
    const freshOrders = await dbGet("orders") || [];
    const order = freshOrders.find(o => o.id === orderId);
    const newOrders = status==="done"
      ? freshOrders.filter(o=>o.id!==orderId)
      : freshOrders.map(o=>o.id===orderId?{...o,status}:o);
    await dbSet("orders", newOrders);
    setOrders(newOrders);
    showToast("Statut mis à jour");
    // ── Notification push au client quand commande prête ──
    if (status === "ready" && order) {
      const isEmporter = order.orderType === "emporter";
      const title = "🍽️ Votre commande est prête !";
      const body  = isEmporter
        ? "Veuillez la récupérer au comptoir 🥡"
        : "Un employé arrive pour vous servir 🪑";
      // Push réel via Vercel Function (app fermée)
      await sendPushToUser(order.clientId, title, body, "order-ready");
      // Fallback local (app ouverte)
      sendNotif(title, body);
    }
  };

  if (!loaded) return (
    <div style={S.loading}>
      <div style={S.spinner}/>
      <p style={{color:"#d4a853",marginTop:16}}>Connexion à la base de données…</p>
    </div>
  );

  const ctx = {
    users, menu, orders, rewards, settings, invoices, currentUser,
    showToast, updateUsers, updateMenu, updateRewards, updateSettings,
    login, logout, placeOrder, payOrder, updateOrderStatus, page, setPage,
    setCurrentUser
  };

  return (
    <div style={S.app}>
      <style>{CSS}</style>
      {toast && <div style={{...S.toast,background:toast.type==="error"?"#dc2626":"#166534"}}>{toast.msg}</div>}
      {page==="login"    && <LoginPage    {...ctx}/>}
      {page==="register" && <RegisterPage {...ctx}/>}
      {currentUser?.role==="admin"    && page.startsWith("admin") && <AdminLayout    {...ctx}/>}
      {currentUser?.role==="employee" && page.startsWith("emp")   && <EmployeeLayout {...ctx}/>}
      {currentUser?.role==="client"   && page.startsWith("client")&& <ClientLayout   {...ctx}/>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════
function LoginPage({ login, setPage }) {
  const [email,setEmail]=useState(""); const [pw,setPw]=useState(""); const [rem,setRem]=useState(false);
  return (
    <div style={S.authPage}><div style={S.authCard} className="auth-card-mobile">
      <div style={S.logo}>🍽️ <span>RestoPro</span></div>
      <h2 style={S.authTitle}>Connexion</h2>
      <input style={S.input} placeholder="Email"        value={email} onChange={e=>setEmail(e.target.value)} type="email"/>
      <input style={S.input} placeholder="Mot de passe" value={pw}    onChange={e=>setPw(e.target.value)}    type="password"/>
      <div style={S.remRow}>
        <input type="checkbox" id="rem" checked={rem} onChange={e=>setRem(e.target.checked)} style={{width:16,height:16,accentColor:"#d4a853",cursor:"pointer"}}/>
        <label htmlFor="rem" style={{cursor:"pointer",fontSize:13,color:"#9ca3af"}}>Rester connecté</label>
      </div>
      <button style={S.btn} onClick={()=>login(email,pw,rem)}>Se connecter</button>
      <p style={S.authLink}>Pas de compte ? <span style={S.link} onClick={()=>setPage("register")}>S'inscrire</span></p>
    </div></div>
  );
}

function RegisterPage({ setPage, showToast }) {
  const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [pw,setPw]=useState("");
  const register = async () => {
    if (!name||!email||!pw) return showToast("Remplissez tous les champs","error");
    const existing = await dbGet("users") || SEED_USERS;
    if (existing.find(u=>u.email.toLowerCase()===email.toLowerCase())) return showToast("Email déjà utilisé","error");
    const newUser = { id:genId(), role:"client", name, email, password:pw, points:0, createdAt:new Date().toISOString() };
    await dbSet("users", [...existing, newUser]);
    showToast("Compte créé ! Connectez-vous");
    setPage("login");
  };
  return (
    <div style={S.authPage}><div style={S.authCard} className="auth-card-mobile">
      <div style={S.logo}>🍽️ <span>RestoPro</span></div>
      <h2 style={S.authTitle}>Créer un compte</h2>
      <input style={S.input} placeholder="Nom complet" value={name}  onChange={e=>setName(e.target.value)}/>
      <input style={S.input} placeholder="Email"        value={email} onChange={e=>setEmail(e.target.value)} type="email"/>
      <input style={S.input} placeholder="Mot de passe" value={pw}    onChange={e=>setPw(e.target.value)}    type="password"/>
      <button style={S.btn} onClick={register}>Créer mon compte</button>
      <p style={S.authLink}>Déjà un compte ? <span style={S.link} onClick={()=>setPage("login")}>Se connecter</span></p>
    </div></div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN
// ═══════════════════════════════════════════════════════════════════════════════
function AdminLayout(ctx) {
  const { page, setPage, logout, orders } = ctx;
  const [selectedClientId, setSelectedClientId] = useState(null);
  const { isMobile, isTablet } = useBreakpoint();
  const tabs = [
    {id:"admin-dash",    icon:"📊", label:"Dashboard"},
    {id:"admin-menu",    icon:"🍽️", label:"Menu"},
    {id:"admin-orders",  icon:"📋", label:"Commandes"},
    {id:"admin-users",   icon:"👥", label:"Utilisateurs"},
    {id:"admin-rewards", icon:"⭐", label:"Fidélité"},
    {id:"admin-settings",icon:"⚙️", label:"Paramètres"},
  ];
  const active = orders.filter(o=>o.status!=="done").length;
  const mobileTabs = [
    {id:"admin-dash",    icon:"📊", label:"Board"},
    {id:"admin-orders",  icon:"📋", label:"Commandes"},
    {id:"admin-users",   icon:"👥", label:"Clients"},
    {id:"admin-rewards", icon:"⭐", label:"Fidélité"},
    {id:"admin-settings",icon:"⚙️", label:"Compte"},
  ];
  const mainContent = (
    <>
      {page==="admin-dash"           && <AdminDash     {...ctx}/>}
      {page==="admin-menu"           && <AdminMenu     {...ctx}/>}
      {page==="admin-orders"         && <AdminOrders   {...ctx} setSelectedClientId={setSelectedClientId} setPage={setPage}/>}
      {page==="admin-users"          && <AdminUsers    {...ctx} setSelectedClientId={setSelectedClientId} setPage={setPage}/>}
      {page==="admin-rewards"        && <AdminRewards  {...ctx}/>}
      {page==="admin-settings"       && <AdminSettings {...ctx} setCurrentUser={ctx.setCurrentUser}/>}
      {page==="admin-client-profile" && <ClientProfile {...ctx} clientId={selectedClientId} onBack={()=>setPage("admin-users")}/>}
    </>
  );
  if (isMobile) return (
    <div style={{...S.app,height:"100dvh",display:"flex",flexDirection:"column"}}>
      <div style={{background:"#161b22",borderBottom:"1px solid #30363d",padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:"#d4a853"}}>🍽️ RestoPro</div>
        <div style={{fontSize:11,color:"#9ca3af",background:"#0d1117",padding:"4px 10px",borderRadius:20}}>👑 Patron</div>
      </div>
      <div style={{flex:1,overflowY:"auto",paddingBottom:72}}>{mainContent}</div>
      <nav className="bottom-nav" style={{display:"block"}}>
        <div className="bottom-nav-inner">
          {mobileTabs.map(t=>(
            <div key={t.id} className={"bottom-nav-item"+(page===t.id||(page==="admin-client-profile"&&t.id==="admin-users")?" active":"")} onClick={()=>setPage(t.id)}>
              <span className="nav-icon">{t.icon}</span><span>{t.label}</span>
              {t.id==="admin-orders"&&active>0&&<span className="bottom-nav-badge">{active}</span>}
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
  return (
    <div style={S.layout}>
      <nav style={{...S.sidebar,width:isTablet?72:220}}>
        <div style={S.sidebarLogo}>🍽️{!isTablet&&<span> RestoPro</span>}</div>
        {!isTablet&&<div style={S.sidebarRole}>👑 Patron</div>}
        {tabs.map(t=>(
          <div key={t.id} style={{...S.navItem,...(page===t.id||(page==="admin-client-profile"&&t.id==="admin-users")?S.navActive:{}),justifyContent:isTablet?"center":"flex-start",padding:isTablet?"14px 0":"12px 20px"}} onClick={()=>setPage(t.id)} title={t.label}>
            <span style={{fontSize:isTablet?20:16}}>{t.icon}</span>
            {!isTablet&&<span>{t.label}</span>}
            {t.id==="admin-orders"&&active>0&&<span style={S.badge}>{active}</span>}
          </div>
        ))}
        <div style={{...S.navItem,marginTop:"auto",justifyContent:isTablet?"center":"flex-start",padding:isTablet?"14px 0":"12px 20px"}} onClick={logout} title="Déconnexion">
          <span style={{fontSize:isTablet?20:16}}>🚪</span>{!isTablet&&<span>Déconnexion</span>}
        </div>
      </nav>
      <main style={S.main}>{mainContent}</main>
    </div>
  );
}

function AdminDash({ orders, invoices }) {
  const today=new Date().toDateString();
  const caDay=invoices.filter(i=>new Date(i.paidAt).toDateString()===today).reduce((s,i)=>s+i.total,0);
  const caMon=invoices.filter(i=>new Date(i.paidAt).getMonth()===new Date().getMonth()).reduce((s,i)=>s+i.total,0);
  const active=orders.filter(o=>o.status!=="done").length;
  const sales={};
  invoices.forEach(inv=>inv.items.forEach(it=>{sales[it.name]=(sales[it.name]||0)+it.qty;}));
  const top=Object.entries(sales).sort((a,b)=>b[1]-a[1]).slice(0,5);
  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>📊 Tableau de bord</h1>
      <div style={S.statsGrid}>
        <StatCard icon="📋" label="Commandes actives" value={active}          color="#f59e0b"/>
        <StatCard icon="💰" label="CA aujourd'hui"    value={fmt(caDay)}      color="#22c55e"/>
        <StatCard icon="📅" label="CA ce mois"        value={fmt(caMon)}      color="#3b82f6"/>
        <StatCard icon="🧾" label="Factures totales"  value={invoices.length} color="#d4a853"/>
      </div>
      <div style={S.card}>
        <h3 style={S.cardTitle}>🏆 Produits les plus vendus</h3>
        {top.length===0?<p style={S.empty}>Aucune vente</p>:top.map(([name,qty])=>(
          <div key={name} style={S.row}><span>{name}</span><span style={S.pill}>{qty} vendu{qty>1?"s":""}</span></div>
        ))}
      </div>
    </div>
  );
}

function StatCard({icon,label,value,color}) {
  return <div style={{...S.statCard,borderTop:`3px solid ${color}`}}><div style={{fontSize:28}}>{icon}</div><div style={{fontSize:24,fontWeight:700,color,marginTop:8}}>{value}</div><div style={{fontSize:13,color:"#9ca3af",marginTop:4}}>{label}</div></div>;
}

function AdminMenu({ menu, updateMenu, showToast }) {
  const cats = ["entree","plat","dessert","boisson","menu"];
  const [activeTab, setActiveTab] = useState("plat");
  const [form, setForm] = useState(null);
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const { isMobile } = useBreakpoint();

  const del = async (id) => {
    await updateMenu(menu.filter(m => m.id !== id));
    setDeleteConfirm(null);
    showToast("Produit supprimé");
  };
  const toggle = async (id) => {
    await updateMenu(menu.map(m => m.id === id ? {...m, available:!m.available} : m));
    showToast("Disponibilité mise à jour ✅");
  };
  const saveItem = async (item) => {
    if (!item.name.trim()) return showToast("Nom requis","error");
    if (!item.price || isNaN(item.price)) return showToast("Prix invalide","error");
    const saved = {...item, price:parseFloat(item.price)||0, points:parseInt(item.points)||0};
    await updateMenu(saved.id ? menu.map(m=>m.id===saved.id?saved:m) : [...menu,{...saved,id:genId()}]);
    setForm(null);
    showToast(saved.id ? "Produit modifié ✅" : "Produit ajouté ✅");
  };

  const filtered = menu.filter(m =>
    m.cat === activeTab &&
    (!search || m.name.toLowerCase().includes(search.toLowerCase()) || (m.desc||"").toLowerCase().includes(search.toLowerCase()))
  );
  const totalItems = menu.filter(m => m.cat === activeTab).length;
  const availableItems = menu.filter(m => m.cat === activeTab && m.available).length;

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{...S.pageHeader, flexWrap:"wrap", gap:8}}>
        <h1 style={S.pageTitle}>🍽️ Produits & Menu</h1>
        <button style={{...S.btn,width:"auto",display:"flex",alignItems:"center",gap:6}} onClick={()=>setForm({cat:activeTab,name:"",desc:"",price:"",points:"",available:true})}>
          ＋ Nouveau produit
        </button>
      </div>

      {/* Onglets catégories */}
      <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
        {cats.map(c=>{
          const count = menu.filter(m=>m.cat===c).length;
          const isActive = activeTab===c;
          return (
            <div key={c}
              style={{...S.tab,...(isActive?S.tabActive:{}),display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}
              onClick={()=>{setActiveTab(c);setSearch("");}}>
              <span>{CAT_ICONS[c]}</span>
              {!isMobile&&<span>{CAT_LABELS[c]}</span>}
              {isMobile&&<span style={{fontSize:11}}>{CAT_LABELS[c].slice(0,3)}.</span>}
              <span style={{background:isActive?"rgba(0,0,0,0.2)":"#374151",color:isActive?"#0d1117":"#9ca3af",borderRadius:10,padding:"1px 6px",fontSize:11,fontWeight:700}}>{count}</span>
            </div>
          );
        })}
      </div>

      {/* Stats de la catégorie + barre recherche */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,gap:10,flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:10}}>
          <span style={{fontSize:12,color:"#9ca3af"}}>{totalItems} produit{totalItems>1?"s":""}</span>
          <span style={{fontSize:12,color:"#22c55e"}}>✅ {availableItems} dispo</span>
          {totalItems-availableItems>0&&<span style={{fontSize:12,color:"#ef4444"}}>🚫 {totalItems-availableItems} indispo</span>}
        </div>
        <input
          style={{...S.input,marginBottom:0,width:isMobile?"100%":220,padding:"8px 12px",fontSize:13}}
          placeholder="🔍 Rechercher..."
          value={search}
          onChange={e=>setSearch(e.target.value)}
        />
      </div>

      {/* Liste des produits */}
      {filtered.length===0 && (
        <div style={{...S.card,textAlign:"center",padding:40}}>
          <div style={{fontSize:40,marginBottom:12}}>{CAT_ICONS[activeTab]}</div>
          <p style={{color:"#6b7280",marginBottom:16}}>
            {search ? `Aucun résultat pour "${search}"` : `Aucun produit dans la catégorie ${CAT_LABELS[activeTab]}`}
          </p>
          <button style={{...S.btn,width:"auto"}} onClick={()=>setForm({cat:activeTab,name:"",desc:"",price:"",points:"",available:true})}>
            ＋ Ajouter le premier produit
          </button>
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
        {filtered.map(item=>(
          <div key={item.id} style={{
            background:"#161b22",
            border:`1px solid ${item.available?"#30363d":"#7f1d1d"}`,
            borderRadius:12,padding:16,
            opacity:item.available?1:0.7,
            transition:"all .2s",
            position:"relative"
          }}>
            {/* Badge disponibilité */}
            <div style={{position:"absolute",top:12,right:12}}>
              {item.available
                ? <span style={{...S.pill,background:"#1a3a1a",color:"#22c55e",fontSize:10}}>✅ Dispo</span>
                : <span style={{...S.pillRed,fontSize:10}}>🚫 Indispo</span>
              }
            </div>

            {/* Icône catégorie */}
            <div style={{fontSize:28,marginBottom:8}}>{CAT_ICONS[item.cat]}</div>

            {/* Nom & desc */}
            <div style={{fontWeight:700,fontSize:15,marginBottom:4,paddingRight:60}}>{item.name}</div>
            {item.desc&&<div style={{fontSize:12,color:"#9ca3af",marginBottom:8,lineHeight:1.4}}>{item.desc}</div>}

            {/* Prix & points */}
            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:12}}>
              <span style={{color:"#d4a853",fontWeight:700,fontSize:16}}>{fmt(item.price)}</span>
              <span style={{fontSize:11,color:"#9ca3af",background:"#1f2937",padding:"2px 7px",borderRadius:10}}>⭐ {item.points||0} pts</span>
            </div>

            {/* Actions */}
            <div style={{display:"flex",gap:6}}>
              <button style={{...S.btnSm,flex:1,textAlign:"center"}} onClick={()=>toggle(item.id)}>
                {item.available?"🚫 Désactiver":"✅ Activer"}
              </button>
              <button style={{...S.btnSm,padding:"7px 10px"}} onClick={()=>setForm({...item})}>✏️</button>
              <button style={{...S.btnSm,...S.btnDanger,padding:"7px 10px"}} onClick={()=>setDeleteConfirm(item)}>🗑️</button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal ajout/modification */}
      {form&&(
        <div style={S.modal}><div style={S.modalCard}>
          <h3 style={S.cardTitle}>{form.id?"✏️ Modifier":"＋ Nouveau"} produit</h3>

          <label style={S.label}>Catégorie</label>
          <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
            {cats.map(c=>(
              <div key={c}
                style={{...S.tab,...(form.cat===c?S.tabActive:{}),cursor:"pointer",fontSize:12,padding:"6px 10px"}}
                onClick={()=>setForm(p=>({...p,cat:c}))}>
                {CAT_ICONS[c]} {CAT_LABELS[c]}
              </div>
            ))}
          </div>

          <label style={S.label}>Nom du produit *</label>
          <input style={S.input} placeholder="Ex : Bœuf Bourguignon" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/>

          <label style={S.label}>Description</label>
          <textarea style={{...S.input,resize:"vertical",minHeight:64}} placeholder="Ingrédients, allergènes, préparation…" value={form.desc||""} onChange={e=>setForm(p=>({...p,desc:e.target.value}))}/>

          <div style={{display:"flex",gap:12}}>
            <div style={{flex:1}}>
              <label style={S.label}>Prix (€) *</label>
              <input style={S.input} type="number" step="0.01" min="0" placeholder="12.90" value={form.price} onChange={e=>setForm(p=>({...p,price:e.target.value}))}/>
            </div>
            <div style={{flex:1}}>
              <label style={S.label}>Points fidélité</label>
              <input style={S.input} type="number" min="0" placeholder="10" value={form.points||""} onChange={e=>setForm(p=>({...p,points:e.target.value}))}/>
            </div>
          </div>

          <label style={S.label}>Disponibilité</label>
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <div style={{...S.orderTypeBtn,...(form.available?S.orderTypeBtnActive:{}),flex:1,fontSize:13}} onClick={()=>setForm(p=>({...p,available:true}))}>✅ Disponible</div>
            <div style={{...S.orderTypeBtn,...(!form.available?{...S.orderTypeBtnActive,border:"2px solid #ef4444",color:"#ef4444",background:"#1a0000"}:{}),flex:1,fontSize:13}} onClick={()=>setForm(p=>({...p,available:false}))}>🚫 Indisponible</div>
          </div>

          <div style={{display:"flex",gap:8}}>
            <button style={S.btn} onClick={()=>saveItem(form)}>💾 Sauvegarder</button>
            <button style={S.btnOutline} onClick={()=>setForm(null)}>Annuler</button>
          </div>
        </div></div>
      )}

      {/* Modal confirmation suppression */}
      {deleteConfirm&&(
        <div style={S.modal}><div style={{...S.modalCard,maxWidth:380}}>
          <h3 style={{...S.cardTitle,color:"#ef4444"}}>🗑️ Supprimer ce produit ?</h3>
          <div style={{background:"#0d1117",borderRadius:10,padding:14,marginBottom:16,border:"1px solid #30363d"}}>
            <div style={{fontWeight:700,marginBottom:4}}>{deleteConfirm.name}</div>
            <div style={{fontSize:12,color:"#9ca3af"}}>{CAT_ICONS[deleteConfirm.cat]} {CAT_LABELS[deleteConfirm.cat]} · {fmt(deleteConfirm.price)}</div>
          </div>
          <p style={{fontSize:13,color:"#9ca3af",marginBottom:16}}>Cette action est irréversible.</p>
          <div style={{display:"flex",gap:8}}>
            <button style={{...S.btn,background:"#7f1d1d",color:"#fca5a5",border:"1px solid #991b1b"}} onClick={()=>del(deleteConfirm.id)}>🗑️ Supprimer définitivement</button>
            <button style={S.btnOutline} onClick={()=>setDeleteConfirm(null)}>Annuler</button>
          </div>
        </div></div>
      )}
    </div>
  );
}

function MenuForm({item,onSave,onCancel}) {
  const [f,setF]=useState(item);
  const upd=k=>e=>setF(p=>({...p,[k]:e.target.value}));
  return (
    <div style={S.modal}><div style={S.modalCard}>
      <h3 style={S.cardTitle}>{f.id?"Modifier":"Ajouter"} un produit</h3>
      <select style={S.input} value={f.cat} onChange={upd("cat")}>{["entree","plat","dessert","boisson","menu"].map(c=><option key={c} value={c}>{CAT_LABELS[c]}</option>)}</select>
      <input style={S.input} placeholder="Nom"         value={f.name}   onChange={upd("name")}/>
      <input style={S.input} placeholder="Description" value={f.desc}   onChange={upd("desc")}/>
      <input style={S.input} placeholder="Prix (€)" type="number" value={f.price}  onChange={upd("price")}/>
      <input style={S.input} placeholder="Points"   type="number" value={f.points} onChange={upd("points")}/>
      <div style={{display:"flex",gap:8,marginTop:8}}>
        <button style={S.btn} onClick={()=>onSave({...f,price:parseFloat(f.price)||0,points:parseInt(f.points)||0})}>Sauvegarder</button>
        <button style={S.btnOutline} onClick={onCancel}>Annuler</button>
      </div>
    </div></div>
  );
}

function AdminOrders({ orders, updateOrderStatus, invoices, users, setPage, setSelectedClientId }) {
  const [view, setView]=useState("table"); // "table" | "invoices"
  const [expandedOrder, setExpandedOrder]=useState(null);
  const [expandedInv, setExpandedInv]=useState(null);
  const active=orders.filter(o=>o.status!=="done");
  const statusCols=["waiting","paid","prep","ready"];
  const statuses=["waiting","paid","prep","ready","done"];

  const printInvoice=(inv)=>{
    const w=window.open("","_blank");
    w.document.write(`<html><body style="font-family:sans-serif;padding:32px;max-width:500px;margin:0 auto">
      <div style="text-align:center;margin-bottom:24px"><h1 style="font-size:24px;margin-bottom:4px">🍽️ RestoPro</h1><p style="color:#666;font-size:14px">Facture officielle</p></div>
      <hr/>
      <table style="width:100%;font-size:14px;margin:16px 0">
        <tr><td><strong>Date</strong></td><td style="text-align:right">${fmtDate(inv.paidAt)}</td></tr>
        <tr><td><strong>Client</strong></td><td style="text-align:right">${inv.clientName}</td></tr>
        <tr><td><strong>Mode</strong></td><td style="text-align:right">${inv.orderType==="surplace"?`Sur place — Table ${inv.tableNumber}`:"À emporter"}</td></tr>
        <tr><td><strong>Facture</strong></td><td style="text-align:right">#${inv.id}</td></tr>
      </table><hr/>
      <table style="width:100%;font-size:14px;margin:16px 0;border-collapse:collapse">
        <thead><tr style="background:#f5f5f5"><th style="text-align:left;padding:8px">Article</th><th style="text-align:center;padding:8px">Qté</th><th style="text-align:right;padding:8px">Prix</th></tr></thead>
        <tbody>${inv.items.map(it=>`<tr style="border-bottom:1px solid #eee"><td style="padding:8px">${it.name}${it.note?`<br/><em style="color:#f97316;font-size:12px">✏️ ${it.note}</em>`:""}</td><td style="text-align:center;padding:8px">${it.qty}</td><td style="text-align:right;padding:8px">${fmt(it.price*it.qty)}</td></tr>`).join("")}</tbody>
      </table><hr/>
      <div style="text-align:right;font-size:20px;font-weight:bold;margin-top:16px">Total : ${fmt(inv.total)}</div>
      ${inv.rewardUsed?`<div style="text-align:center;margin-top:12px;color:#d4a853;font-size:13px">⭐ Récompense utilisée : ${inv.rewardUsed}</div>`:""}
      <p style="text-align:center;color:#999;font-size:12px;margin-top:32px">Merci de votre visite !</p>
    </body></html>`);
    w.print();
  };

  const totalCA = invoices.reduce((s,i)=>s+i.total,0);

  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <h1 style={S.pageTitle}>📋 Commandes</h1>
        <div style={{display:"flex",gap:8}}>
          <button style={{...S.btnSm,...(view==="table"?{background:"#d4a853",color:"#0d1117",border:"1px solid #d4a853"}:{})}} onClick={()=>setView("table")}>🗂️ Tableau</button>
          <button style={{...S.btnSm,...(view==="invoices"?{background:"#d4a853",color:"#0d1117",border:"1px solid #d4a853"}:{})}} onClick={()=>setView("invoices")}>🧾 Factures ({invoices.length})</button>
        </div>
      </div>

      {view==="table" && (
        <>
          {/* Kanban table by status */}
          <div style={{overflowX:"auto",marginBottom:24}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
              <thead>
                <tr>
                  {statusCols.map(s=>(
                    <th key={s} style={{padding:"10px 12px",background:STATUS_CONFIG[s].color+"22",border:"1px solid #30363d",color:STATUS_CONFIG[s].color,fontSize:13,fontWeight:700,textAlign:"center",whiteSpace:"nowrap"}}>
                      {STATUS_CONFIG[s].icon} {STATUS_CONFIG[s].label}
                      <span style={{marginLeft:6,background:STATUS_CONFIG[s].color,color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:11}}>
                        {active.filter(o=>o.status===s).length}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{verticalAlign:"top"}}>
                  {statusCols.map(s=>{
                    const col=active.filter(o=>o.status===s);
                    return (
                      <td key={s} style={{padding:8,border:"1px solid #30363d",background:"#0d1117",minWidth:170}}>
                        {col.length===0 && <div style={{color:"#4b5563",fontSize:12,textAlign:"center",padding:8}}>—</div>}
                        {col.map(order=>(
                          <div key={order.id} style={{background:"#161b22",border:`1px solid ${STATUS_CONFIG[order.status].color}44`,borderRadius:10,padding:10,marginBottom:8,fontSize:13}}>
                            <div style={{fontWeight:700,color:"#f3f4f6",marginBottom:2}}>{order.clientName}</div>
                            <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>{fmtDate(order.createdAt)}</div>
                            {order.orderType==="surplace"
                              ?<span style={{...S.pill,background:"#1e3a5f",color:"#93c5fd",fontSize:10}}>🪑 Table {order.tableNumber}</span>
                              :<span style={{...S.pill,background:"#1a3a1a",color:"#86efac",fontSize:10}}>🥡 Emporter</span>}
                            <div style={{marginTop:6,color:"#9ca3af",fontSize:11,cursor:"pointer"}} onClick={()=>setExpandedOrder(expandedOrder===order.id?null:order.id)}>
                              {order.items.map(it=>`${it.qty}× ${it.name}`).join(", ").slice(0,50)}{order.items.join("").length>50?"…":""}
                            </div>
                            {expandedOrder===order.id&&(
                              <div style={{marginTop:6,borderTop:"1px solid #30363d",paddingTop:6}}>
                                {order.items.map((it,i)=>(
                                  <div key={i} style={{fontSize:11,color:"#d1d5db",marginBottom:2}}>
                                    {it.qty}× {it.name} — {fmt(it.price*it.qty)}
                                    {it.note&&<div style={{color:"#f97316",fontSize:10}}>✏️ {it.note}</div>}
                                  </div>
                                ))}
                              </div>
                            )}
                            <div style={{marginTop:6,fontWeight:700,color:"#d4a853",fontSize:13}}>Total : {fmt(order.total)}</div>
                            <div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:4}}>
                              {statuses.filter(st=>st!==order.status).map(st=>(
                                <button key={st} style={{...S.btnSm,fontSize:10,padding:"3px 7px"}} onClick={()=>updateOrderStatus(order.id,st)}>
                                  {STATUS_CONFIG[st].icon} {STATUS_CONFIG[st].label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {view==="invoices" && (
        <>
          {/* Summary stats */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:20}}>
            <div style={{...S.statCard,borderTop:"3px solid #22c55e"}}><div style={{fontSize:22}}>🧾</div><div style={{fontSize:20,fontWeight:700,color:"#22c55e",marginTop:6}}>{invoices.length}</div><div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>Factures</div></div>
            <div style={{...S.statCard,borderTop:"3px solid #d4a853"}}><div style={{fontSize:22}}>💰</div><div style={{fontSize:20,fontWeight:700,color:"#d4a853",marginTop:6}}>{fmt(totalCA)}</div><div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>CA Total</div></div>
            <div style={{...S.statCard,borderTop:"3px solid #3b82f6"}}><div style={{fontSize:22}}>👥</div><div style={{fontSize:20,fontWeight:700,color:"#3b82f6",marginTop:6}}>{[...new Set(invoices.map(i=>i.clientId))].length}</div><div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>Clients</div></div>
          </div>

          {/* Detailed invoices table */}
          {invoices.length===0 ? <div style={S.card}><p style={S.empty}>Aucune facture</p></div> : (
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead>
                  <tr style={{background:"#161b22",borderBottom:"2px solid #30363d"}}>
                    <th style={TH}>#Facture</th>
                    <th style={TH}>Client</th>
                    <th style={TH}>Date</th>
                    <th style={TH}>Mode</th>
                    <th style={TH}>Articles</th>
                    <th style={TH}>Récompense</th>
                    <th style={{...TH,color:"#22c55e"}}>Total</th>
                    <th style={TH}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.slice().reverse().map((inv,idx)=>(
                    <>
                      <tr key={inv.id} style={{borderBottom:"1px solid #21262d",background:idx%2===0?"#0d1117":"#111318",cursor:"pointer"}} onClick={()=>setExpandedInv(expandedInv===inv.id?null:inv.id)}>
                        <td style={TD}><span style={{color:"#9ca3af",fontSize:11}}>#{inv.id}</span></td>
                        <td style={TD}>
                          <span
                            style={{color:"#d4a853",fontWeight:700,cursor:"pointer",textDecoration:"underline"}}
                            onClick={e=>{e.stopPropagation();setSelectedClientId(inv.clientId);setPage("admin-client-profile");}}
                          >{inv.clientName}</span>
                        </td>
                        <td style={TD}><span style={{color:"#9ca3af"}}>{fmtDate(inv.paidAt)}</span></td>
                        <td style={TD}>
                          {inv.orderType==="surplace"
                            ?<span style={{...S.pill,background:"#1e3a5f",color:"#93c5fd",fontSize:10}}>🪑 T.{inv.tableNumber}</span>
                            :<span style={{...S.pill,background:"#1a3a1a",color:"#86efac",fontSize:10}}>🥡 Emporter</span>}
                        </td>
                        <td style={TD}><span style={{color:"#d1d5db"}}>{inv.items.map(it=>`${it.qty}× ${it.name}`).join(", ")}</span></td>
                        <td style={TD}>{inv.rewardUsed?<span style={{...S.pill,background:"#3b1f6e",color:"#c4b5fd",fontSize:10}}>⭐ {inv.rewardUsed}</span>:<span style={{color:"#4b5563"}}>—</span>}</td>
                        <td style={{...TD,fontWeight:700,color:"#22c55e"}}>{fmt(inv.total)}</td>
                        <td style={TD}>
                          <button style={{...S.btnSm,fontSize:11}} onClick={e=>{e.stopPropagation();printInvoice(inv);}}>🖨️</button>
                        </td>
                      </tr>
                      {expandedInv===inv.id&&(
                        <tr key={inv.id+"-detail"} style={{background:"#1a1f27"}}>
                          <td colSpan={8} style={{padding:"12px 16px"}}>
                            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                              <thead>
                                <tr style={{background:"#21262d"}}>
                                  <th style={TH}>Article</th><th style={TH}>Note</th><th style={TH}>Qté</th><th style={TH}>Prix unit.</th><th style={{...TH,color:"#d4a853"}}>Sous-total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {inv.items.map((it,i)=>(
                                  <tr key={i} style={{borderBottom:"1px solid #21262d"}}>
                                    <td style={TD}>{it.name}</td>
                                    <td style={TD}>{it.note?<span style={{color:"#f97316"}}>✏️ {it.note}</span>:<span style={{color:"#4b5563"}}>—</span>}</td>
                                    <td style={TD}>{it.qty}</td>
                                    <td style={TD}>{fmt(it.price)}</td>
                                    <td style={{...TD,color:"#d4a853",fontWeight:600}}>{fmt(it.price*it.qty)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr><td colSpan={4} style={{...TD,textAlign:"right",fontWeight:700}}>Total</td><td style={{...TD,color:"#22c55e",fontWeight:700,fontSize:14}}>{fmt(inv.total)}</td></tr>
                              </tfoot>
                            </table>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
const TH={padding:"10px 12px",textAlign:"left",color:"#9ca3af",fontWeight:600,fontSize:12,borderBottom:"1px solid #30363d"};
const TD={padding:"10px 12px",verticalAlign:"middle"};

function AdminUsers({ users, updateUsers, showToast, setSelectedClientId, setPage }) {
  const [form,setForm]=useState(null);
  const del=async(id)=>{
    if(id==="admin")return showToast("Impossible de supprimer l'admin","error");
    if(!window.confirm("Supprimer ?"))return;
    const fresh=await dbGet("users")||[];
    await updateUsers(fresh.filter(u=>u.id!==id));
    showToast("Supprimé");
  };
  const saveUser=async(u)=>{
    if(!u.name||!u.email||!u.password)return showToast("Tous les champs requis","error");
    const existing=await dbGet("users")||[];
    let newUsers;
    if(u.id){
      newUsers=existing.map(x=>x.id===u.id?u:x);
    } else {
      if(existing.find(x=>x.email.toLowerCase()===u.email.toLowerCase()))return showToast("Email déjà utilisé","error");
      newUsers=[...existing,{...u,id:genId(),points:u.points||0,createdAt:new Date().toISOString()}];
    }
    await updateUsers(newUsers);
    setForm(null);showToast("Utilisateur sauvegardé ✅");
  };
  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <h1 style={S.pageTitle}>👥 Utilisateurs</h1>
        <button style={{...S.btn,width:"auto"}} onClick={()=>setForm({role:"employee",name:"",email:"",password:"",points:0})}>+ Ajouter</button>
      </div>
      {form&&(
        <div style={S.modal}><div style={S.modalCard}>
          <h3 style={S.cardTitle}>{form.id?"Modifier":"Créer"} un utilisateur</h3>
          <select style={S.input} value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))}>
            <option value="employee">Employé</option>
            <option value="client">Client</option>
          </select>
          <input style={S.input} placeholder="Nom complet" value={form.name}         onChange={e=>setForm(p=>({...p,name:e.target.value}))}/>
          <input style={S.input} placeholder="Email"        value={form.email}        onChange={e=>setForm(p=>({...p,email:e.target.value}))} type="email"/>
          <input style={S.input} placeholder="Mot de passe" value={form.password||""} onChange={e=>setForm(p=>({...p,password:e.target.value}))} type="password"/>
          {form.role==="client"&&<input style={S.input} placeholder="Points fidélité" type="number" value={form.points||0} onChange={e=>setForm(p=>({...p,points:parseInt(e.target.value)||0}))}/>}
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <button style={S.btn} onClick={()=>saveUser(form)}>Sauvegarder</button>
            <button style={S.btnOutline} onClick={()=>setForm(null)}>Annuler</button>
          </div>
        </div></div>
      )}
      {[{role:"employee",label:"👨‍🍳 Employés"},{role:"client",label:"👤 Clients"}].map(({role,label})=>(
        <div key={role} style={S.card}>
          <h3 style={S.cardTitle}>{label}</h3>
          {users.filter(u=>u.role===role).length===0&&<p style={S.empty}>Aucun</p>}
          {users.filter(u=>u.role===role).map(u=>(
            <div key={u.id} style={S.row}>
              <div><strong>{u.name}</strong> <span style={{fontSize:12,color:"#9ca3af"}}>{u.email}</span>{role==="client"&&<span style={{...S.pill,marginLeft:8}}>⭐ {u.points||0} pts</span>}</div>
              <div style={{display:"flex",gap:8}}>
                {role==="client"&&setSelectedClientId&&<button style={{...S.btnSm,color:"#d4a853",borderColor:"#d4a853"}} onClick={()=>{setSelectedClientId(u.id);setPage("admin-client-profile");}}>👁️ Profil</button>}
                <button style={S.btnSm} onClick={()=>setForm({...u})}>✏️</button>
                <button style={{...S.btnSm,...S.btnDanger}} onClick={()=>del(u.id)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function AdminRewards({ rewards, updateRewards, settings, updateSettings, showToast }) {
  const [form,setForm]=useState(null);
  const del=async id=>{await updateRewards(rewards.filter(r=>r.id!==id));showToast("Supprimé");};
  const saveR=async r=>{
    if(!r.name||!r.points)return showToast("Nom et points requis","error");
    await updateRewards(r.id?rewards.map(x=>x.id===r.id?r:x):[...rewards,{...r,id:genId()}]);
    setForm(null);showToast("Sauvegardé ✅");
  };
  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>⭐ Système de fidélité</h1>
      <div style={S.card}>
        <h3 style={S.cardTitle}>⚙️ Règle de points</h3>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <span style={{color:"#d1d5db"}}>1 € dépensé =</span>
          <input style={{...S.input,width:80,margin:0}} type="number" value={settings.pointsPerEuro} onChange={e=>updateSettings({...settings,pointsPerEuro:parseFloat(e.target.value)||1})}/>
          <span style={{color:"#d1d5db"}}>point(s)</span>
        </div>
      </div>
      <div style={S.pageHeader}><h2 style={S.pageTitle}>🎁 Récompenses</h2><button style={{...S.btn,width:"auto"}} onClick={()=>setForm({name:"",desc:"",points:""})}>+ Ajouter</button></div>
      {form&&(
        <div style={S.modal}><div style={S.modalCard}>
          <h3 style={S.cardTitle}>{form.id?"Modifier":"Créer"} une récompense</h3>
          <input style={S.input} placeholder="Nom"           value={form.name}   onChange={e=>setForm(p=>({...p,name:e.target.value}))}/>
          <input style={S.input} placeholder="Description"   value={form.desc}   onChange={e=>setForm(p=>({...p,desc:e.target.value}))}/>
          <input style={S.input} placeholder="Points requis" type="number" value={form.points} onChange={e=>setForm(p=>({...p,points:parseInt(e.target.value)||0}))}/>
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <button style={S.btn} onClick={()=>saveR(form)}>Sauvegarder</button>
            <button style={S.btnOutline} onClick={()=>setForm(null)}>Annuler</button>
          </div>
        </div></div>
      )}
      {rewards.map(r=>(
        <div key={r.id} style={S.card}>
          <div style={S.row}>
            <div><strong>{r.name}</strong> <span style={S.pill}>⭐ {r.points} pts</span><div style={{fontSize:12,color:"#9ca3af"}}>{r.desc}</div></div>
            <div style={{display:"flex",gap:8}}>
              <button style={S.btnSm} onClick={()=>setForm({...r})}>✏️</button>
              <button style={{...S.btnSm,...S.btnDanger}} onClick={()=>del(r.id)}>🗑️</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminSettings({ settings, updateSettings, showToast, currentUser, updateUsers, users, setCurrentUser }) {
  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>⚙️ Paramètres</h1>
      <div style={S.card}>
        <h3 style={S.cardTitle}>💱 Devise</h3>
        <input style={S.input} value={settings.currency} onChange={e=>updateSettings({...settings,currency:e.target.value})}/>
        <button style={{...S.btn,width:"auto"}} onClick={()=>showToast("Sauvegardé ✅")}>Sauvegarder</button>
      </div>
      <UserSettings currentUser={currentUser} users={users} updateUsers={updateUsers} showToast={showToast} setCurrentUser={setCurrentUser} logout={logout}/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMPLOYEE
// ═══════════════════════════════════════════════════════════════════════════════
function EmployeeLayout(ctx) {
  const { logout, orders, menu, updateMenu, showToast, users, updateUsers, invoices, currentUser, setCurrentUser } = ctx;
  const [tab,setTab]=useState("orders");
  const [selectedClientId, setSelectedClientId]=useState(null);
  const { isMobile, isTablet } = useBreakpoint();
  const active=orders.filter(o=>o.status!=="done").length;
  const mobileTabs=[
    {id:"orders",icon:"📋",label:"Commandes"},
    {id:"menu",  icon:"🍽️",label:"Menu"},
    {id:"clients",icon:"👤",label:"Clients"},
    {id:"settings",icon:"⚙️",label:"Compte"},
  ];
  const mainContent = (
    <>
      {tab==="orders"   && <EmpOrders  {...ctx} invoices={invoices} users={users} setPage={setTab} setSelectedClientId={setSelectedClientId}/>}
      {tab==="emp-client-profile" && <ClientProfile {...ctx} clientId={selectedClientId} onBack={()=>setTab("orders")}/>}
      {tab==="menu"     && <EmpMenu    menu={menu} updateMenu={updateMenu} showToast={showToast}/>}
      {tab==="clients"  && <EmpCreateClient users={users} updateUsers={updateUsers} showToast={showToast} setSelectedClientId={setSelectedClientId} setTab={setTab}/>}
      {tab==="settings" && <div style={S.page}><h1 style={S.pageTitle}>⚙️ Paramètres</h1><UserSettings currentUser={currentUser} users={users} updateUsers={updateUsers} showToast={showToast} setCurrentUser={setCurrentUser} logout={logout}/></div>}
    </>
  );
  if (isMobile) return (
    <div style={{...S.app,height:"100dvh",display:"flex",flexDirection:"column"}}>
      <div style={{background:"#161b22",borderBottom:"1px solid #30363d",padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:"#d4a853"}}>🍽️ RestoPro</div>
        <div style={{fontSize:11,color:"#9ca3af",background:"#0d1117",padding:"4px 10px",borderRadius:20}}>👨‍🍳 Employé</div>
      </div>
      <div style={{flex:1,overflowY:"auto",paddingBottom:72}}>{mainContent}</div>
      <nav className="bottom-nav" style={{display:"block"}}>
        <div className="bottom-nav-inner">
          {mobileTabs.map(t=>(
            <div key={t.id} className={"bottom-nav-item"+(tab===t.id?" active":"")} onClick={()=>setTab(t.id)}>
              <span className="nav-icon">{t.icon}</span><span>{t.label}</span>
              {t.id==="orders"&&active>0&&<span className="bottom-nav-badge">{active}</span>}
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
  return (
    <div style={S.layout}>
      <nav style={{...S.sidebar,width:isTablet?72:220}}>
        <div style={S.sidebarLogo}>🍽️{!isTablet&&<span> RestoPro</span>}</div>
        {!isTablet&&<div style={S.sidebarRole}>👨‍🍳 Employé</div>}
        {[{id:"orders",icon:"📋",label:"Commandes"},{id:"menu",icon:"🍽️",label:"Disponibilité"},{id:"clients",icon:"👤",label:"Créer client"},{id:"settings",icon:"⚙️",label:"Paramètres"}].map(t=>(
          <div key={t.id} style={{...S.navItem,...(tab===t.id?S.navActive:{}),justifyContent:isTablet?"center":"flex-start",padding:isTablet?"14px 0":"12px 20px"}} onClick={()=>setTab(t.id)} title={t.label}>
            <span style={{fontSize:isTablet?20:16}}>{t.icon}</span>
            {!isTablet&&<span>{t.label}</span>}
            {t.id==="orders"&&active>0&&<span style={S.badge}>{active}</span>}
          </div>
        ))}
        <div style={{...S.navItem,marginTop:"auto",justifyContent:isTablet?"center":"flex-start",padding:isTablet?"14px 0":"12px 20px"}} onClick={logout} title="Déconnexion">
          <span style={{fontSize:isTablet?20:16}}>🚪</span>{!isTablet&&<span>Déconnexion</span>}
        </div>
      </nav>
      <main style={S.main}>{mainContent}</main>
    </div>
  );
}


function EmpOrders({ orders, updateOrderStatus, invoices, users, setPage, setSelectedClientId }) {
  const [view, setView]=useState("table");
  const [expandedOrder, setExpandedOrder]=useState(null);
  const [expandedInv, setExpandedInv]=useState(null);
  const active=orders.filter(o=>o.status!=="done");
  const statusCols=["waiting","paid","prep","ready"];
  const statuses=["waiting","paid","prep","ready","done"];
  const totalCA=invoices.reduce((s,i)=>s+i.total,0);

  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <h1 style={S.pageTitle}>📋 Commandes</h1>
        <div style={{display:"flex",gap:8}}>
          <button style={{...S.btnSm,...(view==="table"?{background:"#d4a853",color:"#0d1117",border:"1px solid #d4a853"}:{})}} onClick={()=>setView("table")}>🗂️ Tableau</button>
          <button style={{...S.btnSm,...(view==="invoices"?{background:"#d4a853",color:"#0d1117",border:"1px solid #d4a853"}:{})}} onClick={()=>setView("invoices")}>🧾 Factures ({invoices.length})</button>
        </div>
      </div>

      {view==="table"&&(
        <div style={{overflowX:"auto",marginBottom:24}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:700}}>
            <thead>
              <tr>
                {statusCols.map(s=>(
                  <th key={s} style={{padding:"10px 12px",background:STATUS_CONFIG[s].color+"22",border:"1px solid #30363d",color:STATUS_CONFIG[s].color,fontSize:13,fontWeight:700,textAlign:"center",whiteSpace:"nowrap"}}>
                    {STATUS_CONFIG[s].icon} {STATUS_CONFIG[s].label}
                    <span style={{marginLeft:6,background:STATUS_CONFIG[s].color,color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:11}}>
                      {active.filter(o=>o.status===s).length}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr style={{verticalAlign:"top"}}>
                {statusCols.map(s=>{
                  const col=active.filter(o=>o.status===s);
                  return (
                    <td key={s} style={{padding:8,border:"1px solid #30363d",background:"#0d1117",minWidth:170}}>
                      {col.length===0&&<div style={{color:"#4b5563",fontSize:12,textAlign:"center",padding:8}}>—</div>}
                      {col.map(order=>(
                        <div key={order.id} style={{background:"#161b22",border:`1px solid ${STATUS_CONFIG[order.status].color}44`,borderRadius:10,padding:10,marginBottom:8,fontSize:13}}>
                          <div style={{fontWeight:700,color:"#f3f4f6",marginBottom:2}}>{order.clientName}</div>
                          <div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>{fmtDate(order.createdAt)}</div>
                          {order.orderType==="surplace"
                            ?<span style={{...S.pill,background:"#1e3a5f",color:"#93c5fd",fontSize:10}}>🪑 Table {order.tableNumber}</span>
                            :<span style={{...S.pill,background:"#1a3a1a",color:"#86efac",fontSize:10}}>🥡 Emporter</span>}
                          <div style={{marginTop:6,color:"#9ca3af",fontSize:11,cursor:"pointer"}} onClick={()=>setExpandedOrder(expandedOrder===order.id?null:order.id)}>
                            {order.items.map(it=>`${it.qty}× ${it.name}`).join(", ").slice(0,50)}
                          </div>
                          {expandedOrder===order.id&&(
                            <div style={{marginTop:6,borderTop:"1px solid #30363d",paddingTop:6}}>
                              {order.items.map((it,i)=>(
                                <div key={i} style={{fontSize:11,color:"#d1d5db",marginBottom:2}}>
                                  {it.qty}× {it.name} — {fmt(it.price*it.qty)}
                                  {it.note&&<div style={{color:"#f97316",fontSize:10}}>✏️ {it.note}</div>}
                                </div>
                              ))}
                            </div>
                          )}
                          <div style={{marginTop:6,fontWeight:700,color:"#d4a853",fontSize:13}}>Total : {fmt(order.total)}</div>
                          <div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:4}}>
                            {statuses.filter(st=>st!==order.status).map(st=>(
                              <button key={st} style={{...S.btnSm,fontSize:10,padding:"3px 7px"}} onClick={()=>updateOrderStatus(order.id,st)}>
                                {STATUS_CONFIG[st].icon} {STATUS_CONFIG[st].label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {view==="invoices"&&(
        <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12,marginBottom:20}}>
            <div style={{...S.statCard,borderTop:"3px solid #22c55e"}}><div style={{fontSize:22}}>🧾</div><div style={{fontSize:20,fontWeight:700,color:"#22c55e",marginTop:6}}>{invoices.length}</div><div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>Factures</div></div>
            <div style={{...S.statCard,borderTop:"3px solid #d4a853"}}><div style={{fontSize:22}}>💰</div><div style={{fontSize:18,fontWeight:700,color:"#d4a853",marginTop:6}}>{fmt(totalCA)}</div><div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>CA Total</div></div>
          </div>
          {invoices.length===0?<div style={S.card}><p style={S.empty}>Aucune facture</p></div>:(
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead>
                  <tr style={{background:"#161b22",borderBottom:"2px solid #30363d"}}>
                    <th style={TH}>#</th><th style={TH}>Client</th><th style={TH}>Date</th><th style={TH}>Mode</th><th style={TH}>Articles</th><th style={{...TH,color:"#22c55e"}}>Total</th><th style={TH}>Imp.</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.slice().reverse().map((inv,idx)=>(
                    <>
                      <tr key={inv.id} style={{borderBottom:"1px solid #21262d",background:idx%2===0?"#0d1117":"#111318",cursor:"pointer"}} onClick={()=>setExpandedInv(expandedInv===inv.id?null:inv.id)}>
                        <td style={TD}><span style={{color:"#4b5563",fontSize:11}}>#{inv.id.slice(0,6)}</span></td>
                        <td style={TD}>
                          <span style={{color:"#d4a853",fontWeight:700,cursor:"pointer",textDecoration:"underline"}}
                            onClick={e=>{e.stopPropagation();if(setSelectedClientId&&setPage){setSelectedClientId(inv.clientId);setPage("emp-client-profile");}}}>
                            {inv.clientName}
                          </span>
                        </td>
                        <td style={TD}><span style={{color:"#9ca3af",fontSize:12}}>{fmtDate(inv.paidAt)}</span></td>
                        <td style={TD}>
                          {inv.orderType==="surplace"
                            ?<span style={{...S.pill,background:"#1e3a5f",color:"#93c5fd",fontSize:10}}>🪑 T.{inv.tableNumber}</span>
                            :<span style={{...S.pill,background:"#1a3a1a",color:"#86efac",fontSize:10}}>🥡 Emporter</span>}
                        </td>
                        <td style={TD}><span style={{color:"#9ca3af",fontSize:11}}>{inv.items.map(it=>`${it.qty}× ${it.name}`).join(", ")}</span></td>
                        <td style={{...TD,fontWeight:700,color:"#22c55e"}}>{fmt(inv.total)}</td>
                        <td style={TD}><button style={{...S.btnSm,fontSize:11}} onClick={e=>{e.stopPropagation();const w=window.open("","_blank");w.document.write(`<html><body style="font-family:sans-serif;padding:32px"><h2>🍽️ RestoPro</h2><p>${inv.clientName} — ${fmtDate(inv.paidAt)}</p><hr/>${inv.items.map(it=>`<p>${it.qty}× ${it.name} : ${fmt(it.price*it.qty)}</p>`).join("")}<hr/><strong>Total : ${fmt(inv.total)}</strong></body></html>`);w.print();}}>🖨️</button></td>
                      </tr>
                      {expandedInv===inv.id&&(
                        <tr key={inv.id+"-d"} style={{background:"#1a1f27"}}><td colSpan={7} style={{padding:"10px 16px"}}>
                          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                            <thead><tr style={{background:"#21262d"}}><th style={TH}>Article</th><th style={TH}>Note</th><th style={TH}>Qté</th><th style={TH}>Prix unit.</th><th style={{...TH,color:"#d4a853"}}>Sous-total</th></tr></thead>
                            <tbody>{inv.items.map((it,i)=><tr key={i} style={{borderBottom:"1px solid #21262d"}}><td style={TD}>{it.name}</td><td style={TD}>{it.note?<span style={{color:"#f97316"}}>✏️ {it.note}</span>:"—"}</td><td style={TD}>{it.qty}</td><td style={TD}>{fmt(it.price)}</td><td style={{...TD,color:"#d4a853",fontWeight:600}}>{fmt(it.price*it.qty)}</td></tr>)}</tbody>
                            <tfoot><tr><td colSpan={4} style={{...TD,textAlign:"right",fontWeight:700}}>Total</td><td style={{...TD,color:"#22c55e",fontWeight:700}}>{fmt(inv.total)}</td></tr></tfoot>
                          </table>
                        </td></tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EmpMenu({ menu, updateMenu, showToast }) {
  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>🍽️ Disponibilité</h1>
      {menu.map(m=>(
        <div key={m.id} style={{...S.card,opacity:m.available?1:0.6}}>
          <div style={S.row}>
            <div><strong>{m.name}</strong> <span style={{fontSize:12,color:"#9ca3af"}}>{CAT_LABELS[m.cat]}</span></div>
            <button style={S.btnSm} onClick={async()=>{await updateMenu(menu.map(x=>x.id===m.id?{...x,available:!x.available}:x));showToast("Mis à jour");}}>
              {m.available?"🚫 Indisponible":"✅ Disponible"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmpCreateClient({ users, updateUsers, showToast, setSelectedClientId, setTab }) {
  const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [pw,setPw]=useState("");
  const create=async()=>{
    if(!name||!email||!pw)return showToast("Remplissez tous les champs","error");
    const existing=await dbGet("users")||[];
    if(existing.find(u=>u.email.toLowerCase()===email.toLowerCase()))return showToast("Email déjà utilisé","error");
    const newUsers=[...existing,{id:genId(),role:"client",name,email,password:pw,points:0,createdAt:new Date().toISOString()}];
    await updateUsers(newUsers);
    setName("");setEmail("");setPw("");
    showToast(`Compte créé pour ${name} ✅`);
  };
  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>👤 Créer un compte client</h1>
      <div style={S.card}>
        <h3 style={S.cardTitle}>Nouveau client</h3>
        <input style={S.input} placeholder="Nom complet" value={name}  onChange={e=>setName(e.target.value)}/>
        <input style={S.input} placeholder="Email"        value={email} onChange={e=>setEmail(e.target.value)} type="email"/>
        <input style={S.input} placeholder="Mot de passe" value={pw}    onChange={e=>setPw(e.target.value)} type="password"/>
        <button style={{...S.btn,width:"auto"}} onClick={create}>Créer le compte</button>
      </div>
      <div style={S.card}>
        <h3 style={S.cardTitle}>👥 Clients existants ({users.filter(u=>u.role==="client").length})</h3>
        {users.filter(u=>u.role==="client").length===0&&<p style={S.empty}>Aucun client</p>}
        {users.filter(u=>u.role==="client").map(u=>(
          <div key={u.id} style={S.row}>
            <div><strong>{u.name}</strong><div style={{fontSize:12,color:"#9ca3af"}}>{u.email}</div></div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={S.pill}>⭐ {u.points||0} pts</span>
              {setSelectedClientId&&setTab&&<button style={{...S.btnSm,color:"#d4a853",borderColor:"#d4a853"}} onClick={()=>{setSelectedClientId(u.id);setTab("emp-client-profile");}}>👁️ Profil</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT
// ═══════════════════════════════════════════════════════════════════════════════
function ClientLayout(ctx) {
  const { logout, currentUser, page, setPage, users, updateUsers, showToast, setCurrentUser } = ctx;
  const [cart,setCart]=useState([]);
  const { isMobile, isTablet } = useBreakpoint();
  const tabs=[
    {id:"client-menu",    icon:"🍽️", label:"Menu"},
    {id:"client-orders",  icon:"📋", label:"Commandes"},
    {id:"client-history", icon:"🧾", label:"Historique"},
    {id:"client-loyalty", icon:"⭐", label:"Fidélité"},
    {id:"client-settings",icon:"⚙️", label:"Compte"},
  ];
  const mainContent = (
    <>
      {page==="client-menu"     && <ClientMenu    {...ctx} cart={cart} setCart={setCart}/>}
      {page==="client-orders"   && <ClientOrders  {...ctx}/>}
      {page==="client-history"  && <ClientHistory {...ctx}/>}
      {page==="client-loyalty"  && <ClientLoyalty {...ctx}/>}
      {page==="client-settings" && <div style={S.page}><h1 style={S.pageTitle}>⚙️ Mon compte</h1><UserSettings currentUser={currentUser} users={users} updateUsers={updateUsers} showToast={showToast} setCurrentUser={setCurrentUser} logout={logout}/></div>}
    </>
  );
  if (isMobile) return (
    <div style={{...S.app,height:"100dvh",display:"flex",flexDirection:"column"}}>
      <div style={{background:"#161b22",borderBottom:"1px solid #30363d",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,color:"#d4a853"}}>🍽️ RestoPro</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:12,color:"#d4a853",fontWeight:700}}>⭐ {currentUser.points||0} pts</span>
          <span style={{fontSize:11,color:"#9ca3af",background:"#0d1117",padding:"4px 10px",borderRadius:20}}>{currentUser.name}</span>
        </div>
      </div>
      {/* Bandeau activation notifications */}
      {"Notification" in window && Notification.permission === "default" && (
        <div style={{background:"#1c1a00",borderBottom:"1px solid #d4a853",padding:"8px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexShrink:0}}>
          <span style={{fontSize:12,color:"#fde68a"}}>🔔 Activez les notifications pour savoir quand votre commande est prête</span>
          <button style={{...S.btnSm,background:"#d4a853",color:"#0d1117",border:"none",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}} onClick={()=>askNotifPermission(currentUser.id)}>Activer</button>
        </div>
      )}
      <div style={{flex:1,overflowY:"auto",paddingBottom:72}}>{mainContent}</div>
      <nav className="bottom-nav" style={{display:"block"}}>
        <div className="bottom-nav-inner">
          {tabs.map(t=>(
            <div key={t.id} className={"bottom-nav-item"+(page===t.id?" active":"")} onClick={()=>setPage(t.id)}>
              <span className="nav-icon">{t.icon}</span><span>{t.label==="Commandes"?"En cours":t.label}</span>
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
  return (
    <div style={S.layout}>
      <nav style={{...S.sidebar,width:isTablet?72:220}}>
        <div style={S.sidebarLogo}>🍽️{!isTablet&&<span> RestoPro</span>}</div>
        {!isTablet&&<div style={S.sidebarRole}>👤 {currentUser.name}</div>}
        {!isTablet&&<div style={{color:"#d4a853",padding:"4px 20px",fontSize:13}}>⭐ {currentUser.points||0} points</div>}
        {"Notification" in window && Notification.permission === "default" && !isTablet && (
          <div style={{margin:"8px 12px",background:"#1c1a00",border:"1px solid #d4a853",borderRadius:8,padding:"8px 10px"}}>
            <div style={{fontSize:11,color:"#fde68a",marginBottom:6}}>🔔 Notifications désactivées</div>
            <button style={{...S.btnSm,background:"#d4a853",color:"#0d1117",border:"none",fontWeight:700,fontSize:11,width:"100%"}} onClick={()=>askNotifPermission(currentUser.id)}>Activer</button>
          </div>
        )}
        {tabs.map(t=>(
          <div key={t.id} style={{...S.navItem,...(page===t.id?S.navActive:{}),justifyContent:isTablet?"center":"flex-start",padding:isTablet?"14px 0":"12px 20px"}} onClick={()=>setPage(t.id)} title={t.label}>
            <span style={{fontSize:isTablet?20:16}}>{t.icon}</span>
            {!isTablet&&<span>{t.label}</span>}
          </div>
        ))}
        <div style={{...S.navItem,marginTop:"auto",justifyContent:isTablet?"center":"flex-start",padding:isTablet?"14px 0":"12px 20px"}} onClick={logout} title="Déconnexion">
          <span style={{fontSize:isTablet?20:16}}>🚪</span>{!isTablet&&<span>Déconnexion</span>}
        </div>
      </nav>
      <main style={S.main}>{mainContent}</main>
    </div>
  );
}


function ClientMenu({ menu, placeOrder, payOrder, showToast, cart, setCart, setPage }) {
  const cats=["entree","plat","dessert","boisson","menu"];
  const [activeTab,setActiveTab]=useState("entree");
  const [showCart,setShowCart]=useState(false);
  const [orderType,setOrderType]=useState("surplace");
  const [tableNum,setTableNum]=useState("");
  const [itemModal,setItemModal]=useState(null);
  const [itemNote,setItemNote]=useState("");
  const [showPay,setShowPay]=useState(false);
  const [payMode,setPayMode]=useState("comptoir"); // "cb" | "comptoir"
  const [cardName,setCardName]=useState("");
  const [cardNum,setCardNum]=useState("");
  const [cardExp,setCardExp]=useState("");
  const [cardCvv,setCardCvv]=useState("");
  const [paying,setPaying]=useState(false);

  const openItem=(item)=>{setItemModal(item);setItemNote("");};
  const confirmAdd=()=>{
    setCart(prev=>{
      const ex=prev.find(x=>x.id===itemModal.id&&x.note===itemNote);
      if(ex)return prev.map(x=>(x.id===itemModal.id&&x.note===itemNote)?{...x,qty:x.qty+1}:x);
      return [...prev,{...itemModal,qty:1,note:itemNote,cartKey:genId()}];
    });
    showToast(`${itemModal.name} ajouté ✅`);
    setItemModal(null);
  };
  const removeItem=(cartKey)=>setCart(prev=>prev.filter(x=>x.cartKey!==cartKey));
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0);

  const goToPayment=()=>{
    if(!cart.length)return showToast("Panier vide","error");
    if(orderType==="surplace"&&!tableNum.trim())return showToast("Numéro de table requis","error");
    if(payMode==="cb"){showToast("Option indisponible pour le moment","error");return;}
    setShowCart(false);setShowPay(true);
  };

  const confirmPayment=async()=>{
    setPaying(true);
    setTimeout(async()=>{
      const order=await placeOrder(cart,orderType,tableNum.trim());
      // Pour "comptoir" : on place la commande en statut "waiting" (pas encore payée)
      // Le paiement sera validé par l'employé/patron au comptoir
      if(payMode==="comptoir"){
        setCart([]);setShowPay(false);setPaying(false);
        setTableNum("");
        setPage("client-orders");
        showToast("Commande envoyée ! Réglez au comptoir 🏦");
      } else {
        await payOrder(order);
        setCart([]);setShowPay(false);setPaying(false);
        setTableNum("");setCardName("");setCardNum("");setCardExp("");setCardCvv("");
        setPage("client-orders");
        showToast("Paiement accepté ! Commande en cours 🎉");
      }
    },1000);
  };

  const fmtCard=(v)=>v.replace(/\D/g,"").slice(0,16).replace(/(.{4})/g,"$1 ").trim();
  const fmtExp=(v)=>{const d=v.replace(/\D/g,"").slice(0,4);return d.length>2?d.slice(0,2)+"/"+d.slice(2):d;};
  const items=menu.filter(m=>m.cat===activeTab&&m.available);

  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <h1 style={S.pageTitle}>🍽️ Notre menu</h1>
        <button style={{...S.btn,width:"auto",position:"relative"}} onClick={()=>setShowCart(true)}>
          🛒 Panier {cart.length>0&&<span style={S.badge}>{cart.reduce((s,i)=>s+i.qty,0)}</span>}
        </button>
      </div>
      <div style={S.tabBar}>
        {cats.map(c=>(<div key={c} style={{...S.tab,...(activeTab===c?S.tabActive:{})}} onClick={()=>setActiveTab(c)}>{CAT_ICONS[c]} {CAT_LABELS[c]}</div>))}
      </div>
      <div style={S.menuGrid}>
        {items.length===0&&<p style={S.empty}>Aucun article disponible</p>}
        {items.map(item=>(
          <div key={item.id} style={S.menuCard}>
            <div style={{fontSize:32,marginBottom:8}}>{CAT_ICONS[item.cat]}</div>
            <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>{item.name}</div>
            <div style={{fontSize:12,color:"#9ca3af",flex:1}}>{item.desc}</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12}}>
              <span style={{color:"#d4a853",fontWeight:700,fontSize:16}}>{fmt(item.price)}</span>
              <span style={{fontSize:11,color:"#9ca3af"}}>+{item.points} pts</span>
            </div>
            <button style={{...S.btn,width:"100%",marginTop:8}} onClick={()=>openItem(item)}>Ajouter</button>
          </div>
        ))}
      </div>

      {itemModal&&(
        <div style={S.modal}><div style={S.modalCard}>
          <h3 style={S.cardTitle}>{CAT_ICONS[itemModal.cat]} {itemModal.name}</h3>
          {itemModal.desc&&<p style={{fontSize:13,color:"#9ca3af",marginBottom:16}}>{itemModal.desc}</p>}
          <div style={{fontSize:13,color:"#d1d5db",fontWeight:600,marginBottom:8}}>✏️ Personnaliser (optionnel)</div>
          <textarea style={{...S.input,resize:"vertical",minHeight:72}} placeholder="Ex : sans oignons, sauce à part…" value={itemNote} onChange={e=>setItemNote(e.target.value)}/>
          <div style={{display:"flex",gap:8,marginTop:4}}>
            <button style={S.btn} onClick={confirmAdd}>Ajouter au panier</button>
            <button style={S.btnOutline} onClick={()=>setItemModal(null)}>Annuler</button>
          </div>
        </div></div>
      )}

      {showCart&&(
        <div style={S.modal}><div style={S.modalCard}>
          <h3 style={S.cardTitle}>🛒 Mon panier</h3>
          {/* Mode de retrait */}
          <div style={{fontSize:11,color:"#9ca3af",fontWeight:600,marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>Mode</div>
          <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
            <div style={{...S.orderTypeBtn,flex:"none",padding:"10px 14px",fontSize:13,...(orderType==="surplace"?S.orderTypeBtnActive:{})}} onClick={()=>setOrderType("surplace")}>🪑 Sur place</div>
            <div style={{...S.orderTypeBtn,flex:"none",padding:"10px 14px",fontSize:13,...(orderType==="emporter"?S.orderTypeBtnActive:{})}} onClick={()=>setOrderType("emporter")}>🥡 À emporter</div>
          </div>
          {orderType==="surplace"&&(
            <div style={{marginBottom:16}}>
              <label style={S.label}>🔢 Numéro de table <span style={{color:"#dc2626"}}>*</span></label>
              <input style={{...S.input,marginBottom:0}} placeholder="Ex : 5, 12, Terrasse…" value={tableNum} onChange={e=>setTableNum(e.target.value)}/>
            </div>
          )}
          {/* Mode de paiement */}
          <div style={{fontSize:11,color:"#9ca3af",fontWeight:600,marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>Paiement</div>
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <div style={{...S.orderTypeBtn,flex:1,fontSize:13,...(payMode==="comptoir"?S.orderTypeBtnActive:{})}} onClick={()=>setPayMode("comptoir")}>🏦 Au comptoir</div>
            <div
              style={{...S.orderTypeBtn,flex:1,fontSize:13,opacity:0.4,cursor:"not-allowed",position:"relative"}}
              onClick={()=>showToast("Option indisponible pour le moment","error")}
              title="Indisponible"
            >
              💳 Carte bancaire
              <span style={{position:"absolute",top:-8,right:-6,background:"#374151",color:"#9ca3af",fontSize:9,padding:"2px 5px",borderRadius:6,fontWeight:700,letterSpacing:0.5}}>BIENTÔT</span>
            </div>
          </div>
          {cart.length===0?<p style={S.empty}>Panier vide</p>:
            cart.map(it=>(
              <div key={it.cartKey} style={{...S.row,flexDirection:"column",alignItems:"flex-start",gap:4}}>
                <div style={{display:"flex",justifyContent:"space-between",width:"100%"}}>
                  <span style={{fontWeight:600}}>{it.qty}× {it.name}</span>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{color:"#d4a853"}}>{fmt(it.price*it.qty)}</span>
                    <button style={S.btnSm} onClick={()=>removeItem(it.cartKey)}>🗑️</button>
                  </div>
                </div>
                {it.note&&<div style={{fontSize:11,color:"#f97316",background:"#431407",padding:"3px 8px",borderRadius:6}}>✏️ {it.note}</div>}
              </div>
            ))
          }
          {cart.length>0&&(
            <div style={{borderTop:"1px solid #374151",paddingTop:12,marginTop:8}}>
              <div style={{display:"flex",justifyContent:"space-between",fontWeight:700,marginBottom:12}}>
                <span>Total</span><span style={{color:"#d4a853"}}>{fmt(total)}</span>
              </div>
              <button style={S.btn} onClick={goToPayment}>{payMode==="comptoir"?"🏦 Commander & payer au comptoir":"💳 Passer au paiement CB"}</button>
            </div>
          )}
          <button style={{...S.btnOutline,marginTop:8}} onClick={()=>setShowCart(false)}>Fermer</button>
        </div></div>
      )}

      {showPay&&(
        <div style={S.modal}><div style={S.modalCard}>
          <h3 style={S.cardTitle}>🏦 Commande confirmée !</h3>
          <div style={{background:"#0d1117",border:"1px solid #374151",borderRadius:12,padding:16,marginBottom:20}}>
            <div style={{fontSize:13,color:"#9ca3af",marginBottom:4}}>Total à payer</div>
            <div style={{fontSize:28,fontWeight:700,color:"#d4a853"}}>{fmt(total)}</div>
            {orderType==="surplace"&&<div style={{fontSize:12,color:"#93c5fd",marginTop:4}}>🪑 Table {tableNum}</div>}
            {orderType==="emporter"&&<div style={{fontSize:12,color:"#86efac",marginTop:4}}>🥡 À emporter</div>}
            <div style={{fontSize:12,color:"#f59e0b",marginTop:4}}>🏦 Paiement au comptoir</div>
          </div>
          <div style={{background:"#1c1a00",border:"1px solid #d4a853",borderRadius:10,padding:14,marginBottom:16,fontSize:13,color:"#fde68a",lineHeight:1.6}}>
            📋 <strong>Votre commande va être envoyée en cuisine.</strong><br/>
            Rendez-vous au comptoir pour régler <strong>{fmt(total)}</strong> à la fin de votre repas.
          </div>
          {paying
            ?<div style={{textAlign:"center",padding:16,color:"#d4a853",fontWeight:600}}>⏳ Envoi en cuisine…</div>
            :<div style={{display:"flex",gap:8}}>
              <button style={S.btn} onClick={confirmPayment}>✅ Confirmer la commande</button>
              <button style={S.btnOutline} onClick={()=>{setShowPay(false);setShowCart(true);}}>← Retour</button>
            </div>
          }
        </div></div>
      )}
    </div>
  );
}

function ClientOrders({ orders, currentUser }) {
  const mine=orders.filter(o=>o.clientId===currentUser.id&&o.status!=="done");
  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>📋 Mes commandes en cours</h1>
      {mine.length===0?<div style={S.card}><p style={S.empty}>Aucune commande en cours</p></div>:
        mine.map(order=>(
          <div key={order.id} style={S.orderCard}>
            <div style={S.orderHeader}>
              <div>
                <span style={{fontSize:12,color:"#9ca3af"}}>{fmtDate(order.createdAt)}</span>
                <div style={{marginTop:4,display:"flex",gap:6}}>
                  {order.orderType==="surplace"
                    ?<span style={{...S.pill,background:"#1e3a5f",color:"#93c5fd"}}>🪑 Table {order.tableNumber}</span>
                    :<span style={{...S.pill,background:"#1a3a1a",color:"#86efac"}}>🥡 À emporter</span>}
                </div>
              </div>
              <span style={{...S.statusBadge,background:STATUS_CONFIG[order.status].color}}>{STATUS_CONFIG[order.status].icon} {STATUS_CONFIG[order.status].label}</span>
            </div>
            {order.items.map((it,i)=>(
              <div key={i} style={{marginBottom:4}}>
                <div style={{fontSize:13,color:"#d1d5db"}}>{it.qty}× {it.name} — {fmt(it.price*it.qty)}</div>
                {it.note&&<div style={{fontSize:11,color:"#f97316",background:"#431407",padding:"2px 8px",borderRadius:6,marginTop:2,display:"inline-block"}}>✏️ {it.note}</div>}
              </div>
            ))}
            <div style={{marginTop:8,fontWeight:700,color:"#d4a853"}}>Total : {fmt(order.total)} · +{order.pointsEarned} pts</div>
          </div>
        ))
      }
    </div>
  );
}

function ClientHistory({ invoices, currentUser }) {
  const mine=invoices.filter(i=>i.clientId===currentUser.id).slice().reverse();
  const [expanded, setExpanded]=useState(null);
  const print=(inv)=>{
    const w=window.open("","_blank");
    w.document.write(`<html><body style="font-family:sans-serif;padding:32px;max-width:500px;margin:0 auto">
      <div style="text-align:center;margin-bottom:24px">
        <h1 style="font-size:24px;margin-bottom:4px">🍽️ RestoPro</h1>
        <p style="color:#666;font-size:14px">Facture officielle</p>
      </div>
      <hr/>
      <table style="width:100%;font-size:14px;margin:16px 0">
        <tr><td><strong>Date</strong></td><td style="text-align:right">${fmtDate(inv.paidAt)}</td></tr>
        <tr><td><strong>Client</strong></td><td style="text-align:right">${inv.clientName}</td></tr>
        <tr><td><strong>Mode</strong></td><td style="text-align:right">${inv.orderType==="surplace"?`Sur place — Table ${inv.tableNumber}`:"À emporter"}</td></tr>
        <tr><td><strong>Facture</strong></td><td style="text-align:right">#${inv.id}</td></tr>
      </table>
      <hr/>
      <table style="width:100%;font-size:14px;margin:16px 0;border-collapse:collapse">
        <thead><tr style="background:#f5f5f5"><th style="text-align:left;padding:8px">Article</th><th style="text-align:center;padding:8px">Qté</th><th style="text-align:right;padding:8px">Prix</th></tr></thead>
        <tbody>
          ${inv.items.map(it=>`
            <tr style="border-bottom:1px solid #eee">
              <td style="padding:8px">${it.name}${it.note?`<br/><em style="color:#f97316;font-size:12px">✏️ ${it.note}</em>`:""}</td>
              <td style="text-align:center;padding:8px">${it.qty}</td>
              <td style="text-align:right;padding:8px">${fmt(it.price*it.qty)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
      <hr/>
      <div style="text-align:right;font-size:20px;font-weight:bold;margin-top:16px">Total : ${fmt(inv.total)}</div>
      ${inv.rewardUsed?`<div style="text-align:center;margin-top:12px;color:#d4a853;font-size:13px">⭐ Récompense utilisée : ${inv.rewardUsed}</div>`:""}
      <p style="text-align:center;color:#999;font-size:12px;margin-top:32px">Merci de votre visite !</p>
    </body></html>`);
    w.print();
  };
  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>🧾 Historique des commandes</h1>
      {mine.length===0?<div style={S.card}><p style={S.empty}>Aucune commande passée</p></div>:
        mine.map(inv=>(
          <div key={inv.id} style={S.card}>
            {/* En-tête de la facture */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
              <div>
                <div style={{fontWeight:700,fontSize:15}}>{fmtDate(inv.paidAt)}</div>
                <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>#{inv.id}</div>
                <div style={{marginTop:6,display:"flex",gap:6}}>
                  {inv.orderType==="surplace"
                    ?<span style={{...S.pill,background:"#1e3a5f",color:"#93c5fd"}}>🪑 Table {inv.tableNumber}</span>
                    :<span style={{...S.pill,background:"#1a3a1a",color:"#86efac"}}>🥡 À emporter</span>}
                  {inv.rewardUsed&&<span style={{...S.pill,background:"#3b1f6e",color:"#c4b5fd"}}>⭐ {inv.rewardUsed}</span>}
                </div>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{color:"#22c55e",fontWeight:700,fontSize:16}}>{fmt(inv.total)}</span>
                <button style={S.btnSm} onClick={()=>setExpanded(expanded===inv.id?null:inv.id)}>
                  {expanded===inv.id?"▲ Réduire":"▼ Détails"}
                </button>
                <button style={S.btnSm} onClick={()=>print(inv)}>🖨️</button>
              </div>
            </div>
            {/* Détail des articles — toujours visible en résumé */}
            <div style={{fontSize:12,color:"#9ca3af",marginBottom:expanded===inv.id?12:0}}>
              {inv.items.map(it=>`${it.qty}× ${it.name}`).join(" · ")}
            </div>
            {/* Détail complet si expanded */}
            {expanded===inv.id&&(
              <div style={{borderTop:"1px solid #30363d",paddingTop:12}}>
                {inv.items.map((it,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #21262d"}}>
                    <div>
                      <span style={{fontWeight:600}}>{it.qty}× {it.name}</span>
                      {it.note&&<div style={{fontSize:11,color:"#f97316",background:"#431407",padding:"2px 6px",borderRadius:4,marginTop:2,display:"inline-block"}}>✏️ {it.note}</div>}
                    </div>
                    <span style={{color:"#d4a853",fontWeight:600}}>{fmt(it.price*it.qty)}</span>
                  </div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",marginTop:12,fontWeight:700,fontSize:16}}>
                  <span>Total</span>
                  <span style={{color:"#22c55e"}}>{fmt(inv.total)}</span>
                </div>
              </div>
            )}
          </div>
        ))
      }
    </div>
  );
}

function ClientLoyalty({ currentUser, rewards, placeOrder, payOrder, showToast, setPage }) {
  const [confirming, setConfirming]=useState(null);
  const [orderType, setOrderType]=useState("surplace");
  const [tableNum, setTableNum]=useState("");

  const redeemReward = async (r) => {
    if ((currentUser.points||0) < r.points) return showToast("Pas assez de points","error");
    if (orderType==="surplace" && !tableNum.trim()) return showToast("Numéro de table requis","error");
    // Créer une commande gratuite avec la récompense
    const fakeItem = { id:"reward-"+r.id, cat:"menu", name:r.name, desc:r.desc, price:0, points:0, qty:1, note:"🎁 Récompense fidélité", cartKey:genId() };
    const order = await placeOrder([fakeItem], orderType, tableNum.trim(), r);
    await payOrder(order);
    setConfirming(null);
    setTableNum("");
    setPage("client-orders");
    showToast(`Récompense "${r.name}" utilisée ! 🎉`);
  };

  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>⭐ Programme de fidélité</h1>
      <div style={S.card}>
        <div style={{textAlign:"center",padding:24}}>
          <div style={{fontSize:48}}>⭐</div>
          <div style={{fontSize:36,fontWeight:700,color:"#d4a853",marginTop:8}}>{currentUser.points||0}</div>
          <div style={{color:"#9ca3af",marginTop:4}}>points fidélité</div>
        </div>
      </div>
      <h2 style={{...S.pageTitle,marginTop:24}}>🎁 Récompenses disponibles</h2>
      {rewards.map(r=>{
        const canRedeem=(currentUser.points||0)>=r.points;
        return (
          <div key={r.id} style={{...S.card,opacity:canRedeem?1:0.5,border:canRedeem?"1px solid #d4a853":"1px solid #30363d"}}>
            <div style={S.row}>
              <div>
                <strong>{r.name}</strong>
                <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>{r.desc}</div>
              </div>
              <div style={{textAlign:"right",minWidth:120}}>
                <div style={S.pill}>⭐ {r.points} pts</div>
                {canRedeem
                  ?<button style={{...S.btn,width:"auto",marginTop:8,padding:"6px 14px",fontSize:13}} onClick={()=>setConfirming(r)}>🎁 Utiliser</button>
                  :<div style={{fontSize:11,color:"#9ca3af",marginTop:6}}>{r.points-(currentUser.points||0)} pts manquants</div>}
              </div>
            </div>
          </div>
        );
      })}

      {/* Modal confirmation récompense */}
      {confirming&&(
        <div style={S.modal}><div style={S.modalCard}>
          <h3 style={S.cardTitle}>🎁 Utiliser "{confirming.name}"</h3>
          <p style={{fontSize:13,color:"#9ca3af",marginBottom:16}}>Cette récompense sera envoyée en cuisine. Choisissez votre mode :</p>
          <div style={S.orderTypeRow}>
            <div style={{...S.orderTypeBtn,...(orderType==="surplace"?S.orderTypeBtnActive:{})}} onClick={()=>setOrderType("surplace")}>🪑 Sur place</div>
            <div style={{...S.orderTypeBtn,...(orderType==="emporter"?S.orderTypeBtnActive:{})}} onClick={()=>setOrderType("emporter")}>🥡 À emporter</div>
          </div>
          {orderType==="surplace"&&(
            <div style={{marginBottom:16}}>
              <label style={S.label}>🔢 Numéro de table <span style={{color:"#dc2626"}}>*</span></label>
              <input style={{...S.input,marginBottom:0}} placeholder="Ex : 5, 12…" value={tableNum} onChange={e=>setTableNum(e.target.value)}/>
            </div>
          )}
          <div style={{background:"#1a3a1a",border:"1px solid #166534",borderRadius:8,padding:10,marginBottom:16,fontSize:13,color:"#86efac"}}>
            ⭐ {confirming.points} points seront déduits de votre compte
          </div>
          <div style={{display:"flex",gap:8}}>
            <button style={S.btn} onClick={()=>redeemReward(confirming)}>✅ Confirmer</button>
            <button style={S.btnOutline} onClick={()=>{setConfirming(null);setTableNum("");}}>Annuler</button>
          </div>
        </div></div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// USER SETTINGS (partagé admin / employé / client)
// ═══════════════════════════════════════════════════════════════════════════════
function UserSettings({ currentUser, users, updateUsers, showToast, setCurrentUser, logout }) {
  const [name,    setName]    = useState(currentUser.name    || "");
  const [email,   setEmail]   = useState(currentUser.email   || "");
  const [pwOld,   setPwOld]   = useState("");
  const [pwNew,   setPwNew]   = useState("");
  const [pwConf,  setPwConf]  = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const saveProfile = async () => {
    if (!name.trim() || !email.trim()) return showToast("Nom et email requis", "error");
    const fresh = await dbGet("users") || [];
    const emailTaken = fresh.find(u => u.email.toLowerCase() === email.toLowerCase() && u.id !== currentUser.id);
    if (emailTaken) return showToast("Cet email est déjà utilisé", "error");
    setLoading(true);
    const updated = { ...currentUser, name: name.trim(), email: email.trim() };
    const newUsers = fresh.map(u => u.id === currentUser.id ? updated : u);
    await updateUsers(newUsers);
    setCurrentUser(updated);
    setLoading(false);
    showToast("Profil mis à jour ✅");
  };

  const savePassword = async () => {
    if (!pwOld || !pwNew || !pwConf) return showToast("Remplissez tous les champs", "error");
    if (pwOld !== currentUser.password) return showToast("Mot de passe actuel incorrect", "error");
    if (pwNew.length < 6) return showToast("Le nouveau mot de passe doit faire au moins 6 caractères", "error");
    if (pwNew !== pwConf) return showToast("Les mots de passe ne correspondent pas", "error");
    setLoading(true);
    const fresh = await dbGet("users") || [];
    const updated = { ...currentUser, password: pwNew };
    const newUsers = fresh.map(u => u.id === currentUser.id ? updated : u);
    await updateUsers(newUsers);
    setCurrentUser(updated);
    setPwOld(""); setPwNew(""); setPwConf("");
    setLoading(false);
    showToast("Mot de passe modifié ✅");
  };

  return (
    <>
      {/* Infos du compte */}
      <div style={S.card}>
        <h3 style={S.cardTitle}>👤 Informations du compte</h3>
        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20,padding:16,background:"#0d1117",borderRadius:10,border:"1px solid #21262d"}}>
          <div style={{width:52,height:52,borderRadius:"50%",background:"#1f2937",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>
            {currentUser.role==="admin"?"👑":currentUser.role==="employee"?"👨‍🍳":"👤"}
          </div>
          <div>
            <div style={{fontWeight:700,fontSize:15,color:"#f3f4f6"}}>{currentUser.name}</div>
            <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>{currentUser.email}</div>
            <div style={{fontSize:11,color:"#6b7280",marginTop:2,textTransform:"capitalize"}}>
              {currentUser.role==="admin"?"Patron":currentUser.role==="employee"?"Employé":"Client"}
              {currentUser.role==="client" && <span style={{...S.pill,marginLeft:8,fontSize:10}}>⭐ {currentUser.points||0} pts</span>}
            </div>
          </div>
        </div>

        <label style={S.label}>Nom complet</label>
        <input style={S.input} value={name} onChange={e=>setName(e.target.value)} placeholder="Votre nom"/>

        <label style={S.label}>Adresse email</label>
        <input style={S.input} value={email} onChange={e=>setEmail(e.target.value)} placeholder="votre@email.com" type="email"/>

        <button style={{...S.btn,width:"auto",opacity:loading?0.6:1}} onClick={saveProfile} disabled={loading}>
          {loading?"⏳ Sauvegarde…":"💾 Sauvegarder les informations"}
        </button>
      </div>

      {/* Changement de mot de passe */}
      <div style={S.card}>
        <h3 style={S.cardTitle}>🔒 Changer le mot de passe</h3>

        <label style={S.label}>Mot de passe actuel</label>
        <input style={S.input} value={pwOld} onChange={e=>setPwOld(e.target.value)} placeholder="••••••••" type="password"/>

        <label style={S.label}>Nouveau mot de passe</label>
        <input style={S.input} value={pwNew} onChange={e=>setPwNew(e.target.value)} placeholder="Minimum 6 caractères" type="password"/>

        <label style={S.label}>Confirmer le nouveau mot de passe</label>
        <input style={{...S.input,marginBottom:16}} value={pwConf} onChange={e=>setPwConf(e.target.value)} placeholder="••••••••" type="password"/>

        {pwNew && pwConf && (
          <div style={{marginBottom:12,fontSize:12,display:"flex",alignItems:"center",gap:6}}>
            {pwNew===pwConf
              ? <span style={{color:"#22c55e"}}>✅ Les mots de passe correspondent</span>
              : <span style={{color:"#ef4444"}}>❌ Les mots de passe ne correspondent pas</span>}
          </div>
        )}

        <button style={{...S.btn,width:"auto",opacity:loading?0.6:1}} onClick={savePassword} disabled={loading}>
          {loading?"⏳ Sauvegarde…":"🔑 Changer le mot de passe"}
        </button>
      </div>

      {/* Déconnexion */}
      <div style={S.card}>
        <h3 style={S.cardTitle}>🚪 Déconnexion</h3>
        <p style={{fontSize:13,color:"#9ca3af",marginBottom:16}}>
          Vous serez redirigé vers la page de connexion. Vos données sont sauvegardées.
        </p>
        {!confirmLogout
          ? <button style={{...S.btn,background:"#7f1d1d",color:"#fca5a5",border:"1px solid #991b1b",width:"auto"}} onClick={()=>setConfirmLogout(true)}>
              🚪 Se déconnecter
            </button>
          : <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{fontSize:13,color:"#fca5a5"}}>Confirmer la déconnexion ?</span>
              <button style={{...S.btn,background:"#7f1d1d",color:"#fca5a5",border:"1px solid #991b1b",width:"auto"}} onClick={logout}>
                ✅ Oui, déconnecter
              </button>
              <button style={{...S.btnOutline,width:"auto"}} onClick={()=>setConfirmLogout(false)}>
                Annuler
              </button>
            </div>
        }
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT PROFILE (admin/employee view)
// ═══════════════════════════════════════════════════════════════════════════════
function ClientProfile({ users, invoices, orders, clientId, onBack }) {
  const client = users.find(u=>u.id===clientId);
  const [expandedInv, setExpandedInv]=useState(null);
  if (!client) return <div style={S.page}><button style={{...S.btnOutline,width:"auto"}} onClick={onBack}>← Retour</button><p style={S.empty}>Client introuvable</p></div>;

  const clientInvoices = invoices.filter(i=>i.clientId===clientId).slice().reverse();
  const clientOrders   = orders.filter(o=>o.clientId===clientId&&o.status!=="done");
  const totalSpent     = clientInvoices.reduce((s,i)=>s+i.total,0);
  const totalVisits    = clientInvoices.length;

  const printInvoice=(inv)=>{
    const w=window.open("","_blank");
    w.document.write(`<html><body style="font-family:sans-serif;padding:32px;max-width:500px;margin:0 auto">
      <div style="text-align:center;margin-bottom:24px"><h1>🍽️ RestoPro</h1><p style="color:#666;font-size:14px">Facture officielle</p></div><hr/>
      <table style="width:100%;font-size:14px;margin:16px 0">
        <tr><td><strong>Client</strong></td><td style="text-align:right">${inv.clientName}</td></tr>
        <tr><td><strong>Date</strong></td><td style="text-align:right">${fmtDate(inv.paidAt)}</td></tr>
        <tr><td><strong>Mode</strong></td><td style="text-align:right">${inv.orderType==="surplace"?`Sur place — Table ${inv.tableNumber}`:"À emporter"}</td></tr>
        <tr><td><strong>Facture</strong></td><td style="text-align:right">#${inv.id}</td></tr>
      </table><hr/>
      <table style="width:100%;font-size:14px;margin:16px 0;border-collapse:collapse">
        <thead><tr style="background:#f5f5f5"><th style="text-align:left;padding:8px">Article</th><th style="text-align:center;padding:8px">Qté</th><th style="text-align:right;padding:8px">Prix</th></tr></thead>
        <tbody>${inv.items.map(it=>`<tr style="border-bottom:1px solid #eee"><td style="padding:8px">${it.name}</td><td style="text-align:center;padding:8px">${it.qty}</td><td style="text-align:right;padding:8px">${fmt(it.price*it.qty)}</td></tr>`).join("")}</tbody>
      </table><hr/>
      <div style="text-align:right;font-size:20px;font-weight:bold;margin-top:16px">Total : ${fmt(inv.total)}</div>
      ${inv.rewardUsed?`<div style="text-align:center;margin-top:12px;color:#d4a853;font-size:13px">⭐ Récompense : ${inv.rewardUsed}</div>`:""}
      <p style="text-align:center;color:#999;font-size:12px;margin-top:32px">Merci de votre visite !</p>
    </body></html>`);
    w.print();
  };

  return (
    <div style={S.page}>
      <button style={{...S.btnOutline,width:"auto",marginBottom:20}} onClick={onBack}>← Retour</button>

      {/* Client header */}
      <div style={{...S.card,display:"flex",alignItems:"center",gap:20,marginBottom:20}}>
        <div style={{width:60,height:60,borderRadius:"50%",background:"#1f2937",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0}}>👤</div>
        <div style={{flex:1}}>
          <h2 style={{...S.cardTitle,marginBottom:4}}>{client.name}</h2>
          <div style={{fontSize:13,color:"#9ca3af"}}>{client.email}</div>
          <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>Inscrit le {fmtDate(client.createdAt)}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:28,fontWeight:700,color:"#d4a853"}}>{client.points||0}</div>
          <div style={{fontSize:12,color:"#9ca3af"}}>points fidélité</div>
        </div>
      </div>

      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
        <div style={{...S.statCard,borderTop:"3px solid #d4a853"}}><div style={{fontSize:20}}>🧾</div><div style={{fontSize:22,fontWeight:700,color:"#d4a853",marginTop:4}}>{totalVisits}</div><div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>Visites</div></div>
        <div style={{...S.statCard,borderTop:"3px solid #22c55e"}}><div style={{fontSize:20}}>💰</div><div style={{fontSize:22,fontWeight:700,color:"#22c55e",marginTop:4}}>{fmt(totalSpent)}</div><div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>Total dépensé</div></div>
        <div style={{...S.statCard,borderTop:"3px solid #f59e0b"}}><div style={{fontSize:20}}>📋</div><div style={{fontSize:22,fontWeight:700,color:"#f59e0b",marginTop:4}}>{clientOrders.length}</div><div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>En cours</div></div>
      </div>

      {/* Active orders */}
      {clientOrders.length>0&&(
        <div style={S.card}>
          <h3 style={S.cardTitle}>📋 Commandes en cours</h3>
          {clientOrders.map(order=>(
            <div key={order.id} style={{padding:"10px 0",borderBottom:"1px solid #21262d"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <span style={{...S.statusBadge,background:STATUS_CONFIG[order.status].color,fontSize:11}}>{STATUS_CONFIG[order.status].icon} {STATUS_CONFIG[order.status].label}</span>
                  <span style={{marginLeft:10,fontSize:12,color:"#9ca3af"}}>{fmtDate(order.createdAt)}</span>
                </div>
                <span style={{color:"#d4a853",fontWeight:700}}>{fmt(order.total)}</span>
              </div>
              <div style={{marginTop:4,fontSize:12,color:"#9ca3af"}}>{order.items.map(it=>`${it.qty}× ${it.name}`).join(" · ")}</div>
            </div>
          ))}
        </div>
      )}

      {/* Invoice history table */}
      <h3 style={{...S.pageTitle,marginTop:8,marginBottom:12,fontSize:18}}>🧾 Historique des commandes</h3>
      {clientInvoices.length===0?<div style={S.card}><p style={S.empty}>Aucune commande passée</p></div>:(
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{background:"#161b22",borderBottom:"2px solid #30363d"}}>
                <th style={TH}>Date</th>
                <th style={TH}>Mode</th>
                <th style={TH}>Articles</th>
                <th style={TH}>Récompense</th>
                <th style={{...TH,color:"#22c55e"}}>Total</th>
                <th style={TH}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {clientInvoices.map((inv,idx)=>(
                <>
                  <tr key={inv.id} style={{borderBottom:"1px solid #21262d",background:idx%2===0?"#0d1117":"#111318",cursor:"pointer"}} onClick={()=>setExpandedInv(expandedInv===inv.id?null:inv.id)}>
                    <td style={TD}><span style={{color:"#d1d5db"}}>{fmtDate(inv.paidAt)}</span><div style={{fontSize:10,color:"#4b5563"}}>#{inv.id}</div></td>
                    <td style={TD}>
                      {inv.orderType==="surplace"
                        ?<span style={{...S.pill,background:"#1e3a5f",color:"#93c5fd",fontSize:10}}>🪑 T.{inv.tableNumber}</span>
                        :<span style={{...S.pill,background:"#1a3a1a",color:"#86efac",fontSize:10}}>🥡 Emporter</span>}
                    </td>
                    <td style={TD}><span style={{color:"#9ca3af"}}>{inv.items.map(it=>`${it.qty}× ${it.name}`).join(", ")}</span></td>
                    <td style={TD}>{inv.rewardUsed?<span style={{...S.pill,background:"#3b1f6e",color:"#c4b5fd",fontSize:10}}>⭐ {inv.rewardUsed}</span>:<span style={{color:"#4b5563"}}>—</span>}</td>
                    <td style={{...TD,fontWeight:700,color:"#22c55e"}}>{fmt(inv.total)}</td>
                    <td style={TD}>
                      <button style={{...S.btnSm,fontSize:11}} onClick={e=>{e.stopPropagation();printInvoice(inv);}}>🖨️</button>
                    </td>
                  </tr>
                  {expandedInv===inv.id&&(
                    <tr key={inv.id+"-d"} style={{background:"#1a1f27"}}>
                      <td colSpan={6} style={{padding:"10px 16px"}}>
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                          <thead><tr style={{background:"#21262d"}}><th style={TH}>Article</th><th style={TH}>Note</th><th style={TH}>Qté</th><th style={TH}>Prix unit.</th><th style={{...TH,color:"#d4a853"}}>Sous-total</th></tr></thead>
                          <tbody>
                            {inv.items.map((it,i)=>(
                              <tr key={i} style={{borderBottom:"1px solid #21262d"}}>
                                <td style={TD}>{it.name}</td>
                                <td style={TD}>{it.note?<span style={{color:"#f97316"}}>✏️ {it.note}</span>:<span style={{color:"#4b5563"}}>—</span>}</td>
                                <td style={TD}>{it.qty}</td>
                                <td style={TD}>{fmt(it.price)}</td>
                                <td style={{...TD,color:"#d4a853",fontWeight:600}}>{fmt(it.price*it.qty)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot><tr><td colSpan={4} style={{...TD,textAlign:"right",fontWeight:700}}>Total</td><td style={{...TD,color:"#22c55e",fontWeight:700,fontSize:14}}>{fmt(inv.total)}</td></tr></tfoot>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSIVE HOOK
// ═══════════════════════════════════════════════════════════════════════════════
function useBreakpoint() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return { isMobile: w < 640, isTablet: w >= 640 && w < 1024, isDesktop: w >= 1024, w };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════
const CSS=`
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#0d1117;overscroll-behavior:none;}
  html,body{height:100%;width:100%;}
  ::-webkit-scrollbar{width:4px;}
  ::-webkit-scrollbar-track{background:#161b22;}
  ::-webkit-scrollbar-thumb{background:#374151;border-radius:3px;}
  textarea,input,select,button{font-family:'DM Sans',sans-serif;-webkit-tap-highlight-color:transparent;}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}

  /* ── Bottom nav (mobile) ── */
  .bottom-nav{
    display:none;position:fixed;bottom:0;left:0;right:0;
    background:#161b22;border-top:1px solid #30363d;
    z-index:500;padding-bottom:env(safe-area-inset-bottom);
  }
  .bottom-nav-inner{display:flex;height:60px;}
  .bottom-nav-item{
    flex:1;display:flex;flex-direction:column;align-items:center;
    justify-content:center;gap:2px;cursor:pointer;
    color:#6b7280;font-size:10px;font-weight:600;
    transition:color .15s;position:relative;
    -webkit-tap-highlight-color:transparent;
  }
  .bottom-nav-item.active{color:#d4a853;}
  .bottom-nav-item .nav-icon{font-size:20px;line-height:1;}
  .bottom-nav-badge{
    position:absolute;top:6px;right:calc(50% - 16px);
    background:#d4a853;color:#0d1117;border-radius:8px;
    padding:1px 5px;font-size:9px;font-weight:800;
  }

  /* ── Sidebar (desktop/tablet) ── */
  .sidebar-desktop{display:flex;}

  @media(max-width:639px){
    .bottom-nav{display:block;}
    .sidebar-desktop{display:none!important;}
    .main-mobile-pad{padding-bottom:72px!important;}
    .page-pad{padding:12px!important;}
    .hide-mobile{display:none!important;}
    .card-mobile{padding:14px!important;}
    .table-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;}
    .auth-card-mobile{padding:24px 20px!important;margin:16px!important;border-radius:12px!important;}
    .modal-mobile{padding:12px!important;align-items:flex-end!important;}
    .modal-card-mobile{border-radius:16px 16px 0 0!important;max-height:92vh!important;padding:20px!important;}
    .page-title-mobile{font-size:18px!important;margin-bottom:12px!important;}
    .stats-grid-mobile{grid-template-columns:repeat(2,1fr)!important;gap:8px!important;}
    .menu-grid-mobile{grid-template-columns:repeat(2,1fr)!important;gap:10px!important;}
    .menu-card-mobile{padding:14px!important;}
    .page-header-mobile{flex-wrap:wrap;gap:8px;}
  }

  @media(min-width:640px) and (max-width:1023px){
    .sidebar-desktop{width:72px!important;}
    .sidebar-label{display:none!important;}
    .sidebar-role-text{display:none!important;}
    .sidebar-logo-text{display:none!important;}
    .sidebar-points{display:none!important;}
    .nav-item-tablet{justify-content:center!important;padding:14px 0!important;}
    .page-pad{padding:16px!important;}
    .menu-grid-tablet{grid-template-columns:repeat(3,1fr)!important;}
    .stats-grid-tablet{grid-template-columns:repeat(3,1fr)!important;}
  }
`;

const S={
  app:{fontFamily:"'DM Sans',sans-serif",minHeight:"100vh",background:"#0d1117",color:"#f3f4f6"},
  loading:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0d1117"},
  spinner:{width:40,height:40,border:"3px solid #374151",borderTop:"3px solid #d4a853",borderRadius:"50%",animation:"spin 1s linear infinite"},
  toast:{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:99999,padding:"12px 20px",borderRadius:10,color:"#fff",fontWeight:600,fontSize:14,boxShadow:"0 4px 24px rgba(0,0,0,.5)",whiteSpace:"nowrap",maxWidth:"90vw",textAlign:"center",animation:"fadeIn .2s ease"},
  authPage:{minHeight:"100vh",minHeight:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#0d1117,#161b22,#0d1117)",padding:16},
  authCard:{background:"#161b22",border:"1px solid #30363d",borderRadius:16,padding:40,width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,.5)"},
  logo:{fontSize:28,fontFamily:"'Playfair Display',serif",color:"#d4a853",textAlign:"center",marginBottom:8},
  authTitle:{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,textAlign:"center",marginBottom:24,color:"#f3f4f6"},
  authLink:{textAlign:"center",marginTop:16,fontSize:13,color:"#9ca3af"},
  link:{color:"#d4a853",cursor:"pointer",fontWeight:600},
  remRow:{display:"flex",alignItems:"center",gap:8,marginBottom:12},
  layout:{display:"flex",height:"100vh",height:"100dvh",overflow:"hidden"},
  sidebar:{width:220,height:"100vh",height:"100dvh",overflowY:"auto",background:"#161b22",borderRight:"1px solid #30363d",display:"flex",flexDirection:"column",padding:"0 0 20px",flexShrink:0},
  sidebarLogo:{fontFamily:"'Playfair Display',serif",fontSize:20,color:"#d4a853",padding:"20px 20px 8px",borderBottom:"1px solid #30363d",marginBottom:8},
  sidebarRole:{padding:"4px 20px 8px",fontSize:12,color:"#9ca3af",fontWeight:600,textTransform:"uppercase",letterSpacing:1},
  navItem:{display:"flex",alignItems:"center",gap:10,padding:"12px 20px",cursor:"pointer",color:"#9ca3af",fontSize:14,transition:"all .2s",borderLeft:"3px solid transparent"},
  navActive:{background:"#1f2937",color:"#d4a853",borderLeft:"3px solid #d4a853"},
  main:{flex:1,overflowY:"auto",background:"#0d1117",height:"100vh",height:"100dvh"},
  page:{padding:24,maxWidth:900,margin:"0 auto"},
  pageTitle:{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:700,color:"#f3f4f6",marginBottom:20},
  pageHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20},
  card:{background:"#161b22",border:"1px solid #30363d",borderRadius:12,padding:20,marginBottom:16},
  cardTitle:{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:600,color:"#d4a853",marginBottom:16},
  statsGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:20},
  statCard:{background:"#161b22",border:"1px solid #30363d",borderRadius:12,padding:16,textAlign:"center"},
  row:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #21262d"},
  menuGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:14},
  menuCard:{background:"#161b22",border:"1px solid #30363d",borderRadius:12,padding:18,display:"flex",flexDirection:"column"},
  tabBar:{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"},
  tab:{padding:"7px 14px",borderRadius:20,cursor:"pointer",fontSize:13,background:"#161b22",border:"1px solid #30363d",color:"#9ca3af",transition:"all .2s",whiteSpace:"nowrap"},
  tabActive:{background:"#d4a853",color:"#0d1117",border:"1px solid #d4a853",fontWeight:600},
  orderCard:{background:"#161b22",border:"1px solid #30363d",borderRadius:12,padding:16,marginBottom:12},
  orderHeader:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12},
  statusBadge:{padding:"4px 10px",borderRadius:20,fontSize:11,fontWeight:600,color:"#fff",whiteSpace:"nowrap"},
  modal:{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:99999,padding:20},
  modalCard:{background:"#161b22",border:"1px solid #30363d",borderRadius:16,padding:28,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",position:"relative",zIndex:100000,animation:"slideUp .2s ease"},
  input:{display:"block",width:"100%",padding:"12px 14px",marginBottom:12,background:"#0d1117",border:"1px solid #30363d",borderRadius:8,color:"#f3f4f6",fontSize:16,outline:"none",WebkitAppearance:"none"},
  label:{display:"block",fontSize:12,color:"#9ca3af",fontWeight:600,marginBottom:4},
  btn:{padding:"12px 20px",background:"#d4a853",color:"#0d1117",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:15,fontFamily:"'DM Sans',sans-serif",width:"100%",WebkitAppearance:"none"},
  btnOutline:{padding:"12px 20px",background:"transparent",color:"#d4a853",border:"1px solid #d4a853",borderRadius:8,cursor:"pointer",fontWeight:600,fontSize:15,width:"100%"},
  btnSm:{padding:"7px 12px",background:"#1f2937",color:"#d1d5db",border:"1px solid #374151",borderRadius:6,cursor:"pointer",fontSize:12,whiteSpace:"nowrap"},
  btnDanger:{background:"#7f1d1d",color:"#fca5a5",border:"1px solid #991b1b"},
  badge:{background:"#d4a853",color:"#0d1117",borderRadius:10,padding:"2px 7px",fontSize:10,fontWeight:700,marginLeft:"auto"},
  pill:{background:"#1f2937",color:"#d4a853",borderRadius:12,padding:"2px 8px",fontSize:11,fontWeight:600},
  pillRed:{background:"#7f1d1d",color:"#fca5a5",borderRadius:12,padding:"2px 8px",fontSize:11,fontWeight:600,marginLeft:8},
  empty:{color:"#6b7280",textAlign:"center",padding:"24px 0",fontSize:14},
  orderTypeRow:{display:"flex",gap:10,marginBottom:16},
  orderTypeBtn:{flex:1,padding:"12px",borderRadius:10,cursor:"pointer",border:"2px solid #374151",textAlign:"center",fontSize:14,fontWeight:600,color:"#9ca3af",background:"#0d1117",transition:"all .2s"},
  orderTypeBtnActive:{border:"2px solid #d4a853",color:"#d4a853",background:"#1f1a00"},
};
