/* eslint-disable */
import React, { useState, useEffect, useRef } from "react";
import bcrypt from "bcryptjs";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "firebase/firestore";

// ═══════════════════════════════════════════════════════════════════════════════
// FIREBASE
// ═══════════════════════════════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey: "AIzaSyDK--DuLNxgRtwc6jj1DNcfRgwsRTgVO_Q",
  authDomain: "mon-resto-3719e.firebaseapp.com",
  projectId: "mon-resto-3719e",
  storageBucket: "mon-resto-3719e.firebasestorage.app",
  messagingSenderId: "98022114260",
  appId: "1:98022114260:web:1ce8bacf850344048d4c41",
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const dbGet = async (k) => { try { const s = await getDoc(doc(db,"restopro",k)); return s.exists()?s.data().value:null; } catch { return null; } };
const dbSet = async (k,v) => { try { await setDoc(doc(db,"restopro",k),{value:v}); } catch(e) { console.error(e); } };

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION (localStorage uniquement — jamais de données sensibles)
// ═══════════════════════════════════════════════════════════════════════════════
const lsGet = (k) => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):null; } catch { return null; } };
const lsSet = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch {} };

// ═══════════════════════════════════════════════════════════════════════════════
// SÉCURITÉ — Bcrypt + Rate Limiting
// ═══════════════════════════════════════════════════════════════════════════════
const hashPw   = async (pw) => { if(pw&&pw.startsWith("$2")) return pw; return await bcrypt.hash(pw,10); };
const checkPw  = async (plain,hashed) => { if(hashed&&hashed.startsWith("$2")) return await bcrypt.compare(plain,hashed); return plain===hashed; };
const _attempts = {};
const rateLimit = (email) => {
  const k=email.toLowerCase().trim(), now=Date.now();
  if(!_attempts[k]) _attempts[k]={c:0,first:now,blocked:0};
  const a=_attempts[k];
  if(a.blocked>now) return `Trop de tentatives. Réessayez dans ${Math.ceil((a.blocked-now)/1000)}s`;
  if(now-a.first>300000){a.c=0;a.first=now;}
  if(++a.c>=5){a.blocked=now+300000;return "Compte bloqué 5 minutes — trop de tentatives";}
  return null;
};
const resetRate = (email) => { delete _attempts[email.toLowerCase().trim()]; };

// ═══════════════════════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════
const VAPID_PUB = "BAWcp-l7d4VWX-kAjiM0sMWLIwga-WN6Nl3vDROUxe15-_SJKG3Za9LR__x3tmWM4Uc9CoeeZvh1uc1dXXtJpGQ";
const urlB64 = (b) => { const p="=".repeat((4-b.length%4)%4), s=(b+p).replace(/-/g,"+").replace(/_/g,"/"); const r=window.atob(s); return Uint8Array.from([...r].map(c=>c.charCodeAt(0))); };
const registerPush = async (userId) => {
  try {
    if(!("Notification" in window)||!("serviceWorker" in navigator)) return false;
    const perm = Notification.permission==="granted"?"granted":await Notification.requestPermission();
    if(perm!=="granted") return false;
    const reg = await navigator.serviceWorker.register("/sw.js",{scope:"/"});
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if(!sub) sub = await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlB64(VAPID_PUB)});
    if(!sub) return false;
    if(userId) await setDoc(doc(db,"restopro_push",userId),{sub:JSON.stringify(sub.toJSON()),updatedAt:new Date().toISOString()});
    return true;
  } catch(e) { console.error("Push error:",e); return false; }
};
const sendPush = async (userId,title,body) => {
  try {
    const snap = await getDoc(doc(db,"restopro_push",userId));
    if(!snap.exists()) return;
    await fetch("/api/send-push",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subscription:JSON.parse(snap.data().sub),title,body,tag:"order-ready",url:"/"})});
  } catch(e) { console.warn("Push send failed:",e); }
};
const localNotif = (title,body) => { if(!("Notification" in window)||Notification.permission!=="granted") return; try { new Notification(title,{body,icon:"/logo192.png"}); } catch {} };

// ═══════════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════════
const genId  = () => Math.random().toString(36).slice(2,10);
const genRef = () => "REF-"+Math.random().toString(36).slice(2,7).toUpperCase();
const fmt    = (n) => Number(n).toFixed(2)+" €";
const fmtDate= (d) => new Date(d).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
const CAT_LABELS = {entree:"Entrées",plat:"Plats",dessert:"Desserts",boisson:"Boissons",menu:"Menus"};
const CAT_ICONS  = {entree:"🥗",plat:"🍽️",dessert:"🍮",boisson:"🥤",menu:"📋"};
const STATUS_CFG = {
  waiting:{label:"En attente",    color:"#f59e0b",icon:"⏳"},
  paid:   {label:"Payée",         color:"#3b82f6",icon:"💳"},
  prep:   {label:"En préparation",color:"#f97316",icon:"👨‍🍳"},
  ready:  {label:"Prête",         color:"#22c55e",icon:"✅"},
  done:   {label:"Terminée",      color:"#6b7280",icon:"⚫"},
};
const PAY_MODES = {cb:"💳 Carte bancaire",cash:"💵 Espèces",mixed:"💳+💵 Mixte"};

// ═══════════════════════════════════════════════════════════════════════════════
// SEED DATA
// ═══════════════════════════════════════════════════════════════════════════════
const SEED_USERS = [
  {id:"admin",role:"admin",name:"Patron",email:"admin@restaurant.fr",password:"admin123",points:0,refNumber:"REF-ADMIN",createdAt:new Date().toISOString()},
];
const SEED_MENU = [
  {id:"e1",cat:"entree", name:"Salade César",           desc:"Laitue, parmesan, croûtons",      price:8.50, points:8, available:true},
  {id:"e2",cat:"entree", name:"Soupe à l'oignon",       desc:"Gratinée au fromage",             price:7.00, points:7, available:true},
  {id:"p1",cat:"plat",   name:"Entrecôte grillée",      desc:"250g, frites maison, béarnaise",  price:22.00,points:22,available:true},
  {id:"p2",cat:"plat",   name:"Saumon en croûte",       desc:"Épinards, crème citronnée",       price:19.50,points:19,available:true},
  {id:"p3",cat:"plat",   name:"Risotto aux champignons",desc:"Parmesan, truffe noire",          price:16.00,points:16,available:true},
  {id:"d1",cat:"dessert",name:"Crème brûlée",           desc:"Vanille Bourbon",                 price:6.50, points:6, available:true},
  {id:"d2",cat:"dessert",name:"Fondant chocolat",       desc:"Coulant, glace vanille",          price:7.50, points:7, available:true},
  {id:"b1",cat:"boisson",name:"Eau minérale 50cl",      desc:"",                                price:3.00, points:3, available:true},
  {id:"b2",cat:"boisson",name:"Vin rouge maison",       desc:"Bordeaux AOP (verre)",            price:5.50, points:5, available:true},
  {id:"b3",cat:"boisson",name:"Jus de fruits",          desc:"Orange pressée",                  price:4.00, points:4, available:true},
  {id:"m1",cat:"menu",   name:"Menu Déjeuner",          desc:"Entrée + Plat + Boisson",         price:18.00,points:20,available:true},
];
const SEED_REWARDS  = [
  {id:"r1",name:"Dessert offert",       points:50, desc:"Un dessert au choix"},
  {id:"r2",name:"Plat offert",          points:100,desc:"Un plat principal au choix"},
  {id:"r3",name:"Repas complet offert", points:200,desc:"Entrée + Plat + Dessert"},
];
const SEED_SETTINGS = {pointsPerEuro:1,currency:"€",restaurantName:"RestoPro",address:"12 rue de la Gastronomie, 75001 Paris",phone:"01 23 45 67 89",email:"contact@restopro.fr",siret:"123 456 789 00012"};

// ═══════════════════════════════════════════════════════════════════════════════
// PRINT HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
const printTicket = (inv, settings, cashierName) => {
  const w = window.open("","_blank","width=400,height=700");
  const isCB = inv.payMode==="cb" || inv.payMode==="mixed";
  const isAnon = !inv.clientName || inv.clientName==="Anonyme";
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ticket</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Courier New',monospace;font-size:12px;background:#fff;color:#000;padding:16px;max-width:300px;margin:0 auto;}
    .center{text-align:center;} .bold{font-weight:bold;} .big{font-size:16px;} .sep{border:none;border-top:1px dashed #000;margin:8px 0;}
    .row{display:flex;justify-content:space-between;margin:3px 0;}
    .total{font-size:15px;font-weight:bold;border-top:2px solid #000;padding-top:6px;margin-top:4px;}
    .receipt{border:1px solid #000;padding:10px;margin-top:10px;font-size:11px;}
    .receipt-title{text-align:center;font-weight:bold;font-size:13px;margin-bottom:8px;border-bottom:1px solid #000;padding-bottom:6px;}
    @media print{body{padding:0;}}
  </style></head><body>
  <div class="center bold big">${settings.restaurantName||"RestoPro"}</div>
  <div class="center" style="font-size:10px;margin-top:4px;">${settings.address||""}</div>
  <div class="center" style="font-size:10px;">Tél : ${settings.phone||""}</div>
  ${settings.siret?`<div class="center" style="font-size:10px;">SIRET : ${settings.siret}</div>`:""}
  <hr class="sep"/>
  <div class="row"><span>Date :</span><span>${fmtDate(inv.paidAt)}</span></div>
  <div class="row"><span>Caissier :</span><span>${cashierName||"—"}</span></div>
  <div class="row"><span>Facture :</span><span>#${inv.id.slice(0,8).toUpperCase()}</span></div>
  ${!isAnon?`<div class="row"><span>Client :</span><span>${inv.clientName}</span></div>`:""}
  ${inv.refNumber?`<div class="row"><span>Réf :</span><span>${inv.refNumber}</span></div>`:""}
  <div class="row"><span>Mode :</span><span>${inv.orderType==="surplace"?`Table ${inv.tableNumber}`:"À emporter"}</span></div>
  <hr class="sep"/>
  ${inv.items.map(it=>`
    <div class="row">
      <span>${it.qty}x ${it.name}${it.note?` <em>(${it.note})</em>`:""}</span>
      <span>${fmt(it.price*it.qty)}</span>
    </div>`).join("")}
  <hr class="sep"/>
  <div class="row total"><span>TOTAL</span><span>${fmt(inv.total)}</span></div>
  <div class="row" style="margin-top:6px;"><span>Règlement :</span><span>${PAY_MODES[inv.payMode]||inv.payMode||"—"}</span></div>
  ${inv.rewardUsed?`<div class="row" style="color:#b45309;"><span>⭐ Récompense :</span><span>${inv.rewardUsed}</span></div>`:""}
  <hr class="sep"/>
  ${isCB?`
  <div class="receipt">
    <div class="receipt-title">REÇU DE PAIEMENT CB</div>
    <div class="row"><span>Commerçant :</span><span>${settings.restaurantName||"RestoPro"}</span></div>
    <div class="row"><span>Date :</span><span>${fmtDate(inv.paidAt)}</span></div>
    <div class="row"><span>Carte :</span><span>**** **** **** ${inv.cardLast4||"XXXX"}</span></div>
    <div class="row"><span>Type :</span><span>CB ${inv.cardType||"VISA"}</span></div>
    <div class="row bold"><span>MONTANT :</span><span>${fmt(inv.total)}</span></div>
    <div class="center" style="margin-top:8px;font-size:10px;">TRANSACTION APPROUVÉE</div>
    <div class="center" style="font-size:10px;">Merci de conserver ce reçu</div>
  </div>`:""}
  <div class="center" style="margin-top:12px;font-size:11px;">Merci de votre visite !</div>
  <div class="center" style="font-size:10px;color:#666;">${settings.email||""}</div>
  <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),500);}<\/script>
  </body></html>`);
  w.document.close();
};


// ═══════════════════════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [loaded,setLoaded]           = useState(false);
  const [users,setUsers]             = useState([]);
  const [menu,setMenu]               = useState([]);
  const [orders,setOrders]           = useState([]);
  const [rewards,setRewards]         = useState([]);
  const [settings,setSettings]       = useState(SEED_SETTINGS);
  const [invoices,setInvoices]       = useState([]);
  const [currentUser,setCurrentUser] = useState(null);
  const [page,setPage]               = useState("login");
  const [toast,setToast]             = useState(null);
  const [selectedClientId,setSelectedClientId] = useState(null);
  const prevStatuses = useRef({});

  useEffect(()=>{
    (async()=>{
      const [u,m,o,r,s,inv]=await Promise.all([dbGet("users"),dbGet("menu"),dbGet("orders"),dbGet("rewards"),dbGet("settings"),dbGet("invoices")]);
      const fu=u||SEED_USERS;
      if(!u) await dbSet("users",SEED_USERS);
      if(!m) await dbSet("menu",SEED_MENU);
      if(!o) await dbSet("orders",[]);
      if(!r) await dbSet("rewards",SEED_REWARDS);
      if(!s) await dbSet("settings",SEED_SETTINGS);
      if(!inv) await dbSet("invoices",[]);
      setUsers(fu); setMenu(m||SEED_MENU); setOrders(o||[]); setRewards(r||SEED_REWARDS); setSettings(s||SEED_SETTINGS); setInvoices(inv||[]);
      const sess=lsGet("rm:sess");
      if(sess){const f=fu.find(x=>x.id===sess.id); if(f){setCurrentUser(f);setPage(f.role==="admin"?"admin-dash":f.role==="employee"?"emp-orders":"client-menu");}}
      setLoaded(true);
    })();
  },[]);

  useEffect(()=>{
    const uns=[
      onSnapshot(doc(db,"restopro","orders"),  s=>{if(s.exists())setOrders(s.data().value||[]);}),
      onSnapshot(doc(db,"restopro","invoices"),s=>{if(s.exists())setInvoices(s.data().value||[]);}),
      onSnapshot(doc(db,"restopro","users"),   s=>{if(s.exists())setUsers(s.data().value||[]);}),
      onSnapshot(doc(db,"restopro","menu"),    s=>{if(s.exists())setMenu(s.data().value||[]);}),
    ];
    return ()=>uns.forEach(u=>u());
  },[]);

  // Push notifications quand commande → ready
  useEffect(()=>{
    if(!currentUser||currentUser.role!=="client") return;
    orders.filter(o=>o.clientId===currentUser.id).forEach(order=>{
      const prev=prevStatuses.current[order.id];
      if(prev&&prev!==order.status&&order.status==="ready"){
        const isEmp=order.orderType==="emporter";
        const title="🍽️ Votre commande est prête !";
        const body=isEmp?"Veuillez la récupérer au comptoir 🥡":"Un employé arrive pour vous servir 🪑";
        localNotif(title,body);
      }
      prevStatuses.current[order.id]=order.status;
    });
  },[orders,currentUser]);

  const showToast=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),3500);};

  // ── Auth ──────────────────────────────────────────────────────────────────
  const login = async (email,password,remember=false)=>{
    const err=rateLimit(email); if(err) return showToast(err,"error");
    const all=await dbGet("users")||SEED_USERS;
    const candidate=all.find(x=>x.email.toLowerCase().trim()===email.toLowerCase().trim());
    if(!candidate) return showToast("Identifiants incorrects","error");
    const ok=await checkPw(password,candidate.password);
    if(!ok) return showToast("Identifiants incorrects","error");
    resetRate(email);
    // Migration bcrypt à la volée
    if(!candidate.password.startsWith("$2")){
      const hashed=await hashPw(password);
      const migrated=all.map(x=>x.id===candidate.id?{...x,password:hashed}:x);
      await dbSet("users",migrated);
    }
    setUsers(all); setCurrentUser(candidate);
    if(remember) lsSet("rm:sess",{id:candidate.id}); else lsDel("rm:sess");
    setPage(candidate.role==="admin"?"admin-dash":candidate.role==="employee"?"emp-orders":"client-menu");
    showToast(`Bienvenue ${candidate.name} !`);
    if(candidate.role==="client") registerPush(candidate.id);
  };

  const logout=()=>{setCurrentUser(null);setPage("login");lsDel("rm:sess");};

  // ── Commandes ─────────────────────────────────────────────────────────────
  const placeOrder=async(items,orderType="surplace",tableNumber="",reward=null,clientOverride=null)=>{
    const freshOrders=await dbGet("orders")||[];
    const freshUsers=await dbGet("users")||[];
    const client=clientOverride||currentUser;
    const total=items.reduce((s,i)=>s+i.price*i.qty,0);
    const pointsEarned=reward?0:Math.floor(total*(settings.pointsPerEuro||1));
    const pointsDeducted=reward?reward.points:0;
    const order={
      id:genId(),clientId:client?client.id:null,clientName:client?client.name:"Anonyme",
      refNumber:client?client.refNumber:null,
      items,total,pointsEarned,pointsDeducted,rewardUsed:reward?reward.name:null,
      status:"waiting",orderType,tableNumber,createdAt:new Date().toISOString(),
      cashierId:currentUser?currentUser.id:null,cashierName:currentUser?currentUser.name:null,
    };
    await dbSet("orders",[...freshOrders,order]);
    setOrders([...freshOrders,order]);
    if(client&&pointsEarned>0){
      const newPts=Math.max(0,(client.points||0)+pointsEarned-pointsDeducted);
      const nu=freshUsers.map(u=>u.id===client.id?{...u,points:newPts}:u);
      await dbSet("users",nu); setUsers(nu);
      if(currentUser&&currentUser.id===client.id) setCurrentUser(p=>({...p,points:newPts}));
    }
    return order;
  };

  const payOrder=async(order,payMode="cb",cardLast4="",cardType="VISA")=>{
    if(!order) return;
    const freshInv=await dbGet("invoices")||[];
    const freshOrd=await dbGet("orders")||[];
    const client=users.find(u=>u.id===order.clientId);
    const invoice={
      id:genId(),orderId:order.id,clientId:order.clientId,clientName:order.clientName||"Anonyme",
      refNumber:client?client.refNumber:null,
      items:order.items,total:order.total,paidAt:new Date().toISOString(),
      orderType:order.orderType,tableNumber:order.tableNumber,
      rewardUsed:order.rewardUsed||null,
      payMode,cardLast4,cardType,
      cashierId:order.cashierId||currentUser?.id,cashierName:order.cashierName||currentUser?.name,
    };
    await dbSet("invoices",[...freshInv,invoice]);
    await dbSet("orders",freshOrd.map(o=>o.id===order.id?{...o,status:"paid"}:o));
    setInvoices([...freshInv,invoice]);
    return invoice;
  };

  const updateOrderStatus=async(orderId,status)=>{
    const freshOrd=await dbGet("orders")||[];
    const order=freshOrd.find(o=>o.id===orderId);
    const newOrd=status==="done"?freshOrd.filter(o=>o.id!==orderId):freshOrd.map(o=>o.id===orderId?{...o,status}:o);
    await dbSet("orders",newOrd); setOrders(newOrd);
    showToast("Statut mis à jour");
    if(status==="ready"&&order&&order.clientId){
      const isEmp=order.orderType==="emporter";
      const title="🍽️ Votre commande est prête !";
      const body=isEmp?"Veuillez la récupérer au comptoir 🥡":"Un employé arrive pour vous servir 🪑";
      await sendPush(order.clientId,title,body);
      localNotif(title,body);
    }
  };

  const updateMenu    =async(v)=>{setMenu(v);await dbSet("menu",v);};
  const updateRewards =async(v)=>{setRewards(v);await dbSet("rewards",v);};
  const updateSettings=async(v)=>{setSettings(v);await dbSet("settings",v);};
  const updateUsers   =async(v)=>{setUsers(v);await dbSet("users",v);};

  if(!loaded) return (
    <div style={S.loading}>
      {CSS_TAG}
      <div style={S.spinner}/>
      <div style={{color:"#9ca3af",marginTop:16,fontSize:14}}>Chargement…</div>
    </div>
  );

  const ctx={users,menu,orders,rewards,settings,invoices,currentUser,setCurrentUser,page,setPage,
    login,logout,placeOrder,payOrder,updateOrderStatus,updateMenu,updateRewards,updateSettings,updateUsers,
    showToast,selectedClientId,setSelectedClientId};

  return (
    <div style={S.app}>
      {CSS_TAG}
      {toast&&<div style={{...S.toast,background:toast.type==="error"?"#dc2626":"#166534"}}>{toast.msg}</div>}
      {!currentUser&&page==="login"    && <LoginPage    {...ctx}/>}
      {!currentUser&&page==="register" && <RegisterPage {...ctx}/>}
      {currentUser&&currentUser.role==="admin"    && <AdminLayout    {...ctx}/>}
      {currentUser&&currentUser.role==="employee" && <EmployeeLayout {...ctx}/>}
      {currentUser&&currentUser.role==="client"   && <ClientLayout   {...ctx}/>}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// AUTH PAGES
// ═══════════════════════════════════════════════════════════════════════════════
function LoginPage({login,setPage}) {
  const [email,setEmail]=useState(""); const [pw,setPw]=useState(""); const [rem,setRem]=useState(false); const [loading,setLoading]=useState(false);
  const go=async()=>{if(!email||!pw)return;setLoading(true);await login(email,pw,rem);setLoading(false);};
  return (
    <div style={S.authPage}>{CSS_TAG}
      <div style={S.authCard} className="auth-card-mobile">
        <div style={S.logo}>🍽️ RestoPro</div>
        <h2 style={S.authTitle}>Connexion</h2>
        <label style={S.label}>Email</label>
        <input style={S.input} placeholder="votre@email.com" value={email} onChange={e=>setEmail(e.target.value)} type="email" autoComplete="email"/>
        <label style={S.label}>Mot de passe</label>
        <input style={S.input} placeholder="••••••••" value={pw} onChange={e=>setPw(e.target.value)} type="password" onKeyDown={e=>e.key==="Enter"&&go()} autoComplete="current-password"/>
        <div style={S.remRow}><input type="checkbox" checked={rem} onChange={e=>setRem(e.target.checked)} id="rem"/><label htmlFor="rem" style={{fontSize:13,color:"#9ca3af",cursor:"pointer"}}>Se souvenir de moi</label></div>
        <button style={{...S.btn,opacity:loading?0.6:1}} onClick={go} disabled={loading}>{loading?"⏳ Connexion…":"Se connecter"}</button>
        <p style={S.authLink}>Pas de compte ? <span style={S.link} onClick={()=>setPage("register")}>S'inscrire</span></p>
      </div>
    </div>
  );
}

function RegisterPage({setPage,users,updateUsers,showToast}) {
  const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [pw,setPw]=useState(""); const [conf,setConf]=useState(""); const [loading,setLoading]=useState(false);
  const go=async()=>{
    if(!name.trim()||!email.trim()||!pw||!conf) return showToast("Remplissez tous les champs","error");
    if(pw.length<6) return showToast("Mot de passe minimum 6 caractères","error");
    if(pw!==conf) return showToast("Les mots de passe ne correspondent pas","error");
    setLoading(true);
    const existing=await dbGet("users")||[];
    if(existing.find(u=>u.email.toLowerCase()===email.toLowerCase())) {setLoading(false);return showToast("Email déjà utilisé","error");}
    const hashed=await hashPw(pw);
    const newUser={id:genId(),role:"client",name:name.trim(),email:email.trim(),password:hashed,points:0,refNumber:genRef(),createdAt:new Date().toISOString()};
    await updateUsers([...existing,newUser]);
    setLoading(false); showToast("Compte créé ! Connectez-vous ✅"); setPage("login");
  };
  return (
    <div style={S.authPage}>{CSS_TAG}
      <div style={S.authCard} className="auth-card-mobile">
        <div style={S.logo}>🍽️ RestoPro</div>
        <h2 style={S.authTitle}>Créer un compte</h2>
        <label style={S.label}>Nom complet</label>
        <input style={S.input} placeholder="Jean Dupont" value={name} onChange={e=>setName(e.target.value)}/>
        <label style={S.label}>Email</label>
        <input style={S.input} placeholder="votre@email.com" value={email} onChange={e=>setEmail(e.target.value)} type="email"/>
        <label style={S.label}>Mot de passe</label>
        <input style={S.input} placeholder="Minimum 6 caractères" value={pw} onChange={e=>setPw(e.target.value)} type="password"/>
        <label style={S.label}>Confirmer le mot de passe</label>
        <input style={{...S.input,marginBottom:16}} placeholder="••••••••" value={conf} onChange={e=>setConf(e.target.value)} type="password"/>
        {pw&&conf&&<div style={{marginBottom:12,fontSize:12}}>{pw===conf?<span style={{color:"#22c55e"}}>✅ Correspondent</span>:<span style={{color:"#ef4444"}}>❌ Ne correspondent pas</span>}</div>}
        <button style={{...S.btn,opacity:loading?0.6:1}} onClick={go} disabled={loading}>{loading?"⏳ Création…":"Créer mon compte"}</button>
        <p style={S.authLink}>Déjà un compte ? <span style={S.link} onClick={()=>setPage("login")}>Se connecter</span></p>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN LAYOUT
// ═══════════════════════════════════════════════════════════════════════════════
function AdminLayout(ctx) {
  const {logout,currentUser,page,setPage,orders,invoices,settings}=ctx;
  const {isMobile,isTablet}=useBreakpoint();
  const tabs=[
    {id:"admin-dash",    icon:"📊",label:"Tableau de bord"},
    {id:"admin-orders",  icon:"📋",label:"Commandes"},
    {id:"admin-products",icon:"🍽️",label:"Produits"},
    {id:"admin-clients", icon:"👥",label:"Clients"},
    {id:"admin-loyalty", icon:"⭐",label:"Fidélité"},
    {id:"admin-cashier", icon:"🧾",label:"Encaissement"},
    {id:"admin-contact", icon:"📍",label:"Contact"},
    {id:"admin-settings",icon:"⚙️",label:"Paramètres"},
  ];
  const active=orders.filter(o=>o.status!=="done").length;
  const mainContent=(
    <>
      {page==="admin-dash"     && <AdminDash     {...ctx}/>}
      {page==="admin-orders"   && <AdminOrders   {...ctx}/>}
      {page==="admin-products" && <AdminProducts {...ctx}/>}
      {page==="admin-clients"  && <AdminClients  {...ctx}/>}
      {page==="admin-loyalty"  && <AdminLoyalty  {...ctx}/>}
      {page==="admin-cashier"  && <CashierPage   {...ctx} role="admin"/>}
      {page==="admin-contact"  && <ContactPage   {...ctx}/>}
      {page==="admin-settings" && <AdminSettings {...ctx}/>}
    </>
  );
  if(isMobile) return (
    <div style={{...S.app,height:"100dvh",display:"flex",flexDirection:"column"}}>
      <div style={{background:"#161b22",borderBottom:"1px solid #30363d",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,color:"#d4a853"}}>🍽️ RestoPro</div>
        <span style={{fontSize:11,background:"#d4a853",color:"#0d1117",padding:"3px 10px",borderRadius:20,fontWeight:700}}>👑 Patron</span>
      </div>
      <div style={{flex:1,overflowY:"auto",paddingBottom:72}}>{mainContent}</div>
      <nav className="bottom-nav"><div className="bottom-nav-inner">
        {[tabs[0],tabs[1],tabs[2],tabs[5],tabs[7]].map(t=>(
          <div key={t.id} className={`bottom-nav-item${page===t.id?" active":""}`} onClick={()=>setPage(t.id)}>
            <span className="nav-icon">{t.icon}</span>
            <span>{t.label.split(" ")[0]}</span>
            {t.id==="admin-orders"&&active>0&&<span className="bottom-nav-badge">{active}</span>}
          </div>
        ))}
      </div></nav>
    </div>
  );
  return (
    <div style={S.layout} className="sidebar-desktop">
      <div style={S.sidebar}>
        <div style={S.sidebarLogo}><span className="sidebar-logo-text">🍽️ RestoPro</span></div>
        <div style={S.sidebarRole}><span className="sidebar-role-text">👑 Patron</span></div>
        {tabs.map(t=>(
          <div key={t.id} style={{...S.navItem,...(page===t.id?S.navActive:{})}} className="nav-item-tablet" onClick={()=>setPage(t.id)}>
            <span style={{fontSize:18}}>{t.icon}</span>
            <span className="sidebar-label" style={{display:isTablet?"none":"inline"}}>{t.label}</span>
            {t.id==="admin-orders"&&active>0&&<span style={S.badge}>{active}</span>}
          </div>
        ))}
        <div style={{marginTop:"auto",padding:"12px 20px"}} className="sidebar-label">
          <button style={{...S.btnOutline,padding:"8px 12px",fontSize:12,width:"100%"}} onClick={logout}>🚪 Déconnexion</button>
        </div>
      </div>
      <div style={S.main}>{mainContent}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMPLOYEE LAYOUT
// ═══════════════════════════════════════════════════════════════════════════════
function EmployeeLayout(ctx) {
  const {logout,currentUser,page,setPage,orders}=ctx;
  const {isMobile,isTablet}=useBreakpoint();
  const tabs=[
    {id:"emp-orders",  icon:"📋",label:"Commandes"},
    {id:"emp-cashier", icon:"🧾",label:"Encaissement"},
    {id:"emp-clients", icon:"👥",label:"Clients"},
    {id:"emp-contact", icon:"📍",label:"Contact"},
    {id:"emp-settings",icon:"⚙️",label:"Compte"},
  ];
  const active=orders.filter(o=>o.status!=="done").length;
  const mainContent=(
    <>
      {page==="emp-orders"   && <EmpOrders  {...ctx}/>}
      {page==="emp-cashier"  && <CashierPage {...ctx} role="employee"/>}
      {page==="emp-clients"  && <EmpClients {...ctx}/>}
      {page==="emp-contact"  && <ContactPage {...ctx}/>}
      {page==="emp-settings" && <div style={S.page}><h1 style={S.pageTitle}>⚙️ Mon compte</h1><UserSettings {...ctx} logout={logout}/></div>}
    </>
  );
  if(isMobile) return (
    <div style={{...S.app,height:"100dvh",display:"flex",flexDirection:"column"}}>
      <div style={{background:"#161b22",borderBottom:"1px solid #30363d",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,color:"#d4a853"}}>🍽️ RestoPro</div>
        <span style={{fontSize:11,background:"#374151",color:"#d1d5db",padding:"3px 10px",borderRadius:20,fontWeight:700}}>👨‍🍳 Employé</span>
      </div>
      <div style={{flex:1,overflowY:"auto",paddingBottom:72}}>{mainContent}</div>
      <nav className="bottom-nav"><div className="bottom-nav-inner">
        {tabs.map(t=>(
          <div key={t.id} className={`bottom-nav-item${page===t.id?" active":""}`} onClick={()=>setPage(t.id)}>
            <span className="nav-icon">{t.icon}</span>
            <span>{t.label.split(" ")[0]}</span>
            {t.id==="emp-orders"&&active>0&&<span className="bottom-nav-badge">{active}</span>}
          </div>
        ))}
      </div></nav>
    </div>
  );
  return (
    <div style={S.layout} className="sidebar-desktop">
      <div style={S.sidebar}>
        <div style={S.sidebarLogo}><span className="sidebar-logo-text">🍽️ RestoPro</span></div>
        <div style={S.sidebarRole}><span className="sidebar-role-text">👨‍🍳 Employé</span></div>
        {tabs.map(t=>(
          <div key={t.id} style={{...S.navItem,...(page===t.id?S.navActive:{})}} className="nav-item-tablet" onClick={()=>setPage(t.id)}>
            <span style={{fontSize:18}}>{t.icon}</span>
            <span className="sidebar-label" style={{display:isTablet?"none":"inline"}}>{t.label}</span>
            {t.id==="emp-orders"&&active>0&&<span style={S.badge}>{active}</span>}
          </div>
        ))}
        <div style={{marginTop:"auto",padding:"12px 20px"}} className="sidebar-label">
          <button style={{...S.btnOutline,padding:"8px 12px",fontSize:12,width:"100%"}} onClick={logout}>🚪 Déconnexion</button>
        </div>
      </div>
      <div style={S.main}>{mainContent}</div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT LAYOUT
// ═══════════════════════════════════════════════════════════════════════════════
function ClientLayout(ctx) {
  const {logout,currentUser,page,setPage,users,updateUsers,showToast,setCurrentUser}=ctx;
  const [cart,setCart]=useState([]);
  const {isMobile,isTablet}=useBreakpoint();
  const tabs=[
    {id:"client-menu",    icon:"🍽️",label:"Menu"},
    {id:"client-orders",  icon:"📋",label:"Commandes"},
    {id:"client-history", icon:"🧾",label:"Historique"},
    {id:"client-loyalty", icon:"⭐",label:"Fidélité"},
    {id:"client-settings",icon:"⚙️",label:"Compte"},
  ];
  const mainContent=(
    <>
      {page==="client-menu"     && <ClientMenu    {...ctx} cart={cart} setCart={setCart}/>}
      {page==="client-orders"   && <ClientOrders  {...ctx}/>}
      {page==="client-history"  && <ClientHistory {...ctx}/>}
      {page==="client-loyalty"  && <ClientLoyalty {...ctx}/>}
      {page==="client-settings" && <div style={S.page}><h1 style={S.pageTitle}>⚙️ Mon compte</h1><UserSettings {...ctx} logout={logout}/></div>}
    </>
  );
  if(isMobile) return (
    <div style={{...S.app,height:"100dvh",display:"flex",flexDirection:"column"}}>
      <div style={{background:"#161b22",borderBottom:"1px solid #30363d",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,color:"#d4a853"}}>🍽️ RestoPro</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <span style={{fontSize:12,color:"#d4a853",fontWeight:700}}>⭐ {currentUser.points||0} pts</span>
          <span style={{fontSize:11,color:"#9ca3af",background:"#0d1117",padding:"4px 10px",borderRadius:20}}>{currentUser.name}</span>
        </div>
      </div>
      {"Notification" in window&&Notification.permission==="default"&&(
        <div style={{background:"#1c1a00",borderBottom:"1px solid #d4a853",padding:"8px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexShrink:0}}>
          <span style={{fontSize:12,color:"#fde68a"}}>🔔 Activez les notifications pour savoir quand votre commande est prête</span>
          <button style={{...S.btnSm,background:"#d4a853",color:"#0d1117",border:"none",fontWeight:700,fontSize:11,whiteSpace:"nowrap"}} onClick={()=>registerPush(currentUser.id)}>Activer</button>
        </div>
      )}
      <div style={{flex:1,overflowY:"auto",paddingBottom:72}}>{mainContent}</div>
      <nav className="bottom-nav"><div className="bottom-nav-inner">
        {tabs.map(t=>(
          <div key={t.id} className={`bottom-nav-item${page===t.id?" active":""}`} onClick={()=>setPage(t.id)}>
            <span className="nav-icon">{t.icon}</span>
            <span>{t.label.split(" ")[0]}</span>
          </div>
        ))}
      </div></nav>
    </div>
  );
  return (
    <div style={S.layout} className="sidebar-desktop">
      <div style={S.sidebar}>
        <div style={S.sidebarLogo}><span className="sidebar-logo-text">🍽️ RestoPro</span></div>
        <div style={{padding:"8px 20px 4px"}}><div style={{fontWeight:700,fontSize:14}}>{currentUser.name}</div><div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>{currentUser.refNumber||""}</div></div>
        <div style={{color:"#d4a853",padding:"2px 20px 10px",fontSize:13}} className="sidebar-points">⭐ {currentUser.points||0} points</div>
        {"Notification" in window&&Notification.permission==="default"&&!isTablet&&(
          <div style={{margin:"0 12px 10px",background:"#1c1a00",border:"1px solid #d4a853",borderRadius:8,padding:"8px 10px"}}>
            <div style={{fontSize:11,color:"#fde68a",marginBottom:6}}>🔔 Notifications désactivées</div>
            <button style={{...S.btnSm,background:"#d4a853",color:"#0d1117",border:"none",fontWeight:700,fontSize:11,width:"100%"}} onClick={()=>registerPush(currentUser.id)}>Activer</button>
          </div>
        )}
        {tabs.map(t=>(
          <div key={t.id} style={{...S.navItem,...(page===t.id?S.navActive:{})}} className="nav-item-tablet" onClick={()=>setPage(t.id)}>
            <span style={{fontSize:18}}>{t.icon}</span>
            <span className="sidebar-label" style={{display:isTablet?"none":"inline"}}>{t.label}</span>
          </div>
        ))}
        <div style={{marginTop:"auto",padding:"12px 20px"}} className="sidebar-label">
          <button style={{...S.btnOutline,padding:"8px 12px",fontSize:12,width:"100%"}} onClick={logout}>🚪 Déconnexion</button>
        </div>
      </div>
      <div style={S.main}>{mainContent}</div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN DASH
// ═══════════════════════════════════════════════════════════════════════════════
function StatCard({icon,label,value,color="#d4a853"}){
  return <div style={S.statCard}><div style={{fontSize:24,marginBottom:6}}>{icon}</div><div style={{fontSize:20,fontWeight:700,color,marginBottom:4}}>{value}</div><div style={{fontSize:12,color:"#9ca3af"}}>{label}</div></div>;
}
function AdminDash({orders,invoices,users,menu,setPage}) {
  const active=orders.filter(o=>o.status!=="done").length;
  const today=new Date().toDateString();
  const caDay=invoices.filter(i=>new Date(i.paidAt).toDateString()===today).reduce((s,i)=>s+i.total,0);
  const caMon=invoices.filter(i=>{const d=new Date(i.paidAt);const n=new Date();return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear();}).reduce((s,i)=>s+i.total,0);
  const clients=users.filter(u=>u.role==="client").length;
  const sales={};
  invoices.forEach(inv=>inv.items.forEach(it=>{sales[it.name]=(sales[it.name]||0)+it.qty;}));
  const top=Object.entries(sales).sort((a,b)=>b[1]-a[1]).slice(0,5);
  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>📊 Tableau de bord</h1>
      <div style={S.statsGrid} className="stats-grid-mobile stats-grid-tablet">
        <StatCard icon="📋" label="Commandes actives" value={active} color="#f59e0b"/>
        <StatCard icon="💰" label="CA aujourd'hui" value={fmt(caDay)} color="#22c55e"/>
        <StatCard icon="📅" label="CA ce mois" value={fmt(caMon)} color="#3b82f6"/>
        <StatCard icon="👥" label="Clients" value={clients} color="#a78bfa"/>
        <StatCard icon="🧾" label="Factures total" value={invoices.length} color="#d4a853"/>
        <StatCard icon="🍽️" label="Articles menu" value={menu.filter(m=>m.available).length} color="#34d399"/>
      </div>
      {top.length>0&&<div style={S.card}><h3 style={S.cardTitle}>🏆 Top ventes</h3>
        {top.map(([name,qty],i)=>(
          <div key={name} style={{...S.row}}>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <span style={{fontWeight:700,color:"#d4a853",width:20}}>#{i+1}</span><span>{name}</span>
            </div>
            <span style={{color:"#9ca3af",fontSize:13}}>{qty} vendus</span>
          </div>
        ))}
      </div>}
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button style={{...S.btn,width:"auto"}} onClick={()=>setPage("admin-orders")}>📋 Voir les commandes</button>
        <button style={{...S.btnOutline,width:"auto"}} onClick={()=>setPage("admin-cashier")}>🧾 Encaissement</button>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ORDERS (Admin + Employee shared)
// ═══════════════════════════════════════════════════════════════════════════════
function OrdersView({orders,invoices,updateOrderStatus,users,settings,currentUser,showToast,role}) {
  const [view,setView]=useState("kanban");
  const [expandedInv,setExpandedInv]=useState(null);
  const active=orders.filter(o=>o.status!=="done");
  const cols=["waiting","paid","prep","ready"];
  const statuses=["waiting","paid","prep","ready","done"];

  const handlePrint=(inv)=>{
    const cashier=users.find(u=>u.id===inv.cashierId);
    printTicket(inv,settings,cashier?cashier.name:inv.cashierName||currentUser.name);
  };

  return (
    <div style={S.page}>
      <div style={{...S.pageHeader,flexWrap:"wrap",gap:8}}>
        <h1 style={S.pageTitle}>📋 Commandes</h1>
        <div style={{display:"flex",gap:8}}>
          <button style={{...S.btnSm,...(view==="kanban"?{background:"#d4a853",color:"#0d1117",border:"1px solid #d4a853"}:{})}} onClick={()=>setView("kanban")}>🗂️ Kanban</button>
          <button style={{...S.btnSm,...(view==="invoices"?{background:"#d4a853",color:"#0d1117",border:"1px solid #d4a853"}:{})}} onClick={()=>setView("invoices")}>🧾 Factures ({invoices.length})</button>
        </div>
      </div>

      {view==="kanban"&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12,overflowX:"auto"}}>
          {cols.map(st=>(
            <div key={st} style={{background:"#161b22",border:`1px solid ${STATUS_CFG[st].color}33`,borderRadius:12,padding:12,minHeight:200}}>
              <div style={{fontWeight:700,color:STATUS_CFG[st].color,marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span>{STATUS_CFG[st].icon} {STATUS_CFG[st].label}</span>
                <span style={{background:STATUS_CFG[st].color,color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:11}}>{active.filter(o=>o.status===st).length}</span>
              </div>
              {active.filter(o=>o.status===st).map(order=>(
                <div key={order.id} style={{background:"#0d1117",border:"1px solid #30363d",borderRadius:10,padding:10,marginBottom:8,fontSize:12}}>
                  <div style={{fontWeight:700,marginBottom:4}}>{order.clientName}</div>
                  {order.refNumber&&<div style={{fontSize:10,color:"#d4a853",marginBottom:4}}>{order.refNumber}</div>}
                  <div style={{color:"#9ca3af",fontSize:11,marginBottom:4}}>{order.orderType==="surplace"?`🪑 Table ${order.tableNumber}`:"🥡 À emporter"}</div>
                  <div style={{color:"#d4a853",fontWeight:700,marginBottom:8}}>{fmt(order.total)}</div>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    {statuses.filter(s=>s!==order.status).map(s=>(
                      <button key={s} style={{...S.btnSm,fontSize:10,padding:"3px 7px"}} onClick={()=>updateOrderStatus(order.id,s)}>
                        {STATUS_CFG[s].icon} {STATUS_CFG[s].label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {view==="invoices"&&(
        <div>
          {invoices.length===0&&<p style={S.empty}>Aucune facture</p>}
          {[...invoices].reverse().map(inv=>(
            <div key={inv.id} style={S.card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                <div>
                  <div style={{fontWeight:700}}>{inv.clientName||"Anonyme"}</div>
                  {inv.refNumber&&<div style={{fontSize:11,color:"#d4a853"}}>{inv.refNumber}</div>}
                  <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>{fmtDate(inv.paidAt)}</div>
                  <div style={{fontSize:12,color:"#9ca3af"}}>{inv.orderType==="surplace"?`🪑 Table ${inv.tableNumber}`:"🥡 À emporter"} · {PAY_MODES[inv.payMode]||"—"}</div>
                  {inv.cashierName&&<div style={{fontSize:11,color:"#6b7280",marginTop:2}}>Caissier : {inv.cashierName}</div>}
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{color:"#d4a853",fontWeight:700,fontSize:18}}>{fmt(inv.total)}</span>
                  <button style={S.btnSm} onClick={()=>setExpandedInv(expandedInv===inv.id?null:inv.id)}>🔍 Détail</button>
                  <button style={{...S.btnSm,background:"#1a3a1a",color:"#86efac",borderColor:"#166534"}} onClick={()=>handlePrint(inv)}>🖨️ Ticket</button>
                </div>
              </div>
              {expandedInv===inv.id&&(
                <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #30363d"}}>
                  {inv.items.map((it,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
                      <span>{it.qty}× {it.name}{it.note&&<span style={{color:"#f97316",fontSize:11}}> ({it.note})</span>}</span>
                      <span style={{color:"#d4a853"}}>{fmt(it.price*it.qty)}</span>
                    </div>
                  ))}
                  {inv.rewardUsed&&<div style={{fontSize:12,color:"#d4a853",marginTop:4}}>⭐ Récompense : {inv.rewardUsed}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminOrders(ctx) { return <OrdersView {...ctx} role="admin"/>; }
function EmpOrders(ctx)   { return <OrdersView {...ctx} role="employee"/>; }


// ═══════════════════════════════════════════════════════════════════════════════
// CASHIER PAGE — Employé/Patron passe commande pour client ou anonyme
// ═══════════════════════════════════════════════════════════════════════════════
function CashierPage({menu,users,placeOrder,payOrder,invoices,settings,currentUser,showToast,updateUsers,role}) {
  const cats=["entree","plat","dessert","boisson","menu"];
  const [activeTab,setActiveTab]=useState("plat");
  const [cart,setCart]=useState([]);
  const [orderType,setOrderType]=useState("surplace");
  const [tableNum,setTableNum]=useState("");
  const [payMode,setPayMode]=useState("cb");
  const [cardLast4,setCardLast4]=useState("");
  const [cardType,setCardType]=useState("VISA");
  const [step,setStep]=useState("menu"); // menu | client | payment | done
  const [selectedClient,setSelectedClient]=useState(null); // null = anonyme
  const [clientSearch,setClientSearch]=useState("");
  const [lastInvoice,setLastInvoice]=useState(null);
  const {isMobile}=useBreakpoint();

  const clients=users.filter(u=>u.role==="client");
  const filteredClients=clientSearch.trim()===""?[]:clients.filter(c=>
    c.name.toLowerCase().includes(clientSearch.toLowerCase())||
    (c.refNumber&&c.refNumber.toLowerCase().includes(clientSearch.toLowerCase()))
  );
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0);
  const items=menu.filter(m=>m.cat===activeTab&&m.available);

  const addToCart=(item)=>{
    setCart(prev=>{
      const ex=prev.find(x=>x.id===item.id);
      if(ex) return prev.map(x=>x.id===item.id?{...x,qty:x.qty+1}:x);
      return [...prev,{...item,qty:1,cartKey:genId()}];
    });
  };
  const removeFromCart=(id)=>setCart(prev=>{
    const ex=prev.find(x=>x.id===id);
    if(ex&&ex.qty>1) return prev.map(x=>x.id===id?{...x,qty:x.qty-1}:x);
    return prev.filter(x=>x.id!==id);
  });

  const confirmOrder=async()=>{
    if(!cart.length) return showToast("Panier vide","error");
    if(orderType==="surplace"&&!tableNum.trim()) return showToast("Numéro de table requis","error");
    if(payMode==="cb"&&!cardLast4.trim()) return showToast("4 derniers chiffres de la carte requis","error");
    const order=await placeOrder(cart,orderType,tableNum.trim(),null,selectedClient);
    // Marquer payée directement
    await payOrder({...order,cashierId:currentUser.id,cashierName:currentUser.name},payMode,cardLast4,cardType);
    // Récupérer la facture fraîche
    const freshInv=await dbGet("invoices")||[];
    const inv=freshInv[freshInv.length-1];
    setLastInvoice(inv);
    setStep("done");
    showToast("Commande encaissée ✅");
  };

  const reset=()=>{setCart([]);setOrderType("surplace");setTableNum("");setPayMode("cb");setCardLast4("");setCardType("VISA");setStep("menu");setSelectedClient(null);setClientSearch("");setLastInvoice(null);};

  if(step==="done"&&lastInvoice) return (
    <div style={S.page}>
      <div style={{...S.card,textAlign:"center",padding:32}}>
        <div style={{fontSize:48,marginBottom:16}}>✅</div>
        <h2 style={{...S.cardTitle,textAlign:"center"}}>Commande encaissée !</h2>
        <div style={{fontSize:28,fontWeight:700,color:"#d4a853",marginBottom:8}}>{fmt(total)}</div>
        <div style={{fontSize:13,color:"#9ca3af",marginBottom:4}}>{PAY_MODES[payMode]}</div>
        {selectedClient&&<div style={{fontSize:13,color:"#9ca3af",marginBottom:4}}>Client : {selectedClient.name} · {selectedClient.refNumber}</div>}
        {!selectedClient&&<div style={{fontSize:13,color:"#9ca3af",marginBottom:4}}>Client anonyme</div>}
        <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:20,flexWrap:"wrap"}}>
          <button style={{...S.btn,width:"auto"}} onClick={()=>{const cashier=users.find(u=>u.id===lastInvoice.cashierId);printTicket(lastInvoice,settings,cashier?cashier.name:currentUser.name);}}>🖨️ Imprimer le ticket</button>
          <button style={{...S.btnOutline,width:"auto"}} onClick={reset}>➕ Nouvelle commande</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>🧾 Encaissement</h1>

      {/* Onglets catégories */}
      <div style={S.tabBar}>
        {cats.map(c=><div key={c} style={{...S.tab,...(activeTab===c?S.tabActive:{})}} onClick={()=>setActiveTab(c)}>{CAT_ICONS[c]} {CAT_LABELS[c]}</div>)}
      </div>

      <div style={{display:"flex",gap:16,flexWrap:isMobile?"wrap":"nowrap"}}>
        {/* Grille menu */}
        <div style={{flex:2}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:10}}>
            {items.map(item=>{
              const inCart=cart.find(x=>x.id===item.id);
              return (
                <div key={item.id} style={{...S.menuCard,cursor:"pointer",border:`1px solid ${inCart?"#d4a853":"#30363d"}`,position:"relative"}} onClick={()=>addToCart(item)}>
                  {inCart&&<div style={{position:"absolute",top:8,right:8,background:"#d4a853",color:"#0d1117",borderRadius:"50%",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:12}}>{inCart.qty}</div>}
                  <div style={{fontSize:24,marginBottom:6}}>{CAT_ICONS[item.cat]}</div>
                  <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>{item.name}</div>
                  <div style={{color:"#d4a853",fontWeight:700,marginTop:"auto"}}>{fmt(item.price)}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Panier + infos */}
        <div style={{flex:1,minWidth:260}}>
          <div style={S.card}>
            <h3 style={S.cardTitle}>🛒 Panier</h3>
            {cart.length===0&&<p style={S.empty}>Panier vide</p>}
            {cart.map(it=>(
              <div key={it.cartKey} style={{...S.row}}>
                <span style={{fontWeight:600}}>{it.qty}× {it.name}</span>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{color:"#d4a853"}}>{fmt(it.price*it.qty)}</span>
                  <button style={S.btnSm} onClick={()=>removeFromCart(it.id)}>−</button>
                </div>
              </div>
            ))}
            {cart.length>0&&<div style={{fontWeight:700,fontSize:18,color:"#d4a853",textAlign:"right",marginTop:10}}>{fmt(total)}</div>}
          </div>

          {/* Mode */}
          <div style={S.card}>
            <h3 style={{...S.cardTitle,fontSize:14,marginBottom:10}}>📍 Mode</h3>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <div style={{...S.orderTypeBtn,flex:1,fontSize:13,...(orderType==="surplace"?S.orderTypeBtnActive:{})}} onClick={()=>setOrderType("surplace")}>🪑 Sur place</div>
              <div style={{...S.orderTypeBtn,flex:1,fontSize:13,...(orderType==="emporter"?S.orderTypeBtnActive:{})}} onClick={()=>setOrderType("emporter")}>🥡 À emporter</div>
            </div>
            {orderType==="surplace"&&<input style={{...S.input,marginBottom:0}} placeholder="N° de table" value={tableNum} onChange={e=>setTableNum(e.target.value)}/>}
          </div>

          {/* Client */}
          <div style={S.card}>
            <h3 style={{...S.cardTitle,fontSize:14,marginBottom:10}}>👤 Client</h3>
            <input style={S.input} placeholder="Rechercher par nom ou REF-XXXXX" value={clientSearch} onChange={e=>{setClientSearch(e.target.value);setSelectedClient(null);}}/>
            {filteredClients.length>0&&(
              <div style={{maxHeight:160,overflowY:"auto",marginBottom:8}}>
                {filteredClients.map(c=>(
                  <div key={c.id} style={{...S.row,cursor:"pointer",background:selectedClient?.id===c.id?"#1f2937":"transparent",padding:"8px 10px",borderRadius:6}} onClick={()=>{setSelectedClient(c);setClientSearch(c.name);}}>
                    <div><div style={{fontWeight:700,fontSize:13}}>{c.name}</div><div style={{fontSize:11,color:"#d4a853"}}>{c.refNumber}</div></div>
                    <span style={S.pill}>⭐ {c.points||0} pts</span>
                  </div>
                ))}
              </div>
            )}
            {selectedClient&&<div style={{background:"#1a3a1a",border:"1px solid #166534",borderRadius:8,padding:10,fontSize:12,color:"#86efac"}}>✅ {selectedClient.name} · {selectedClient.refNumber}</div>}
            {!selectedClient&&clientSearch===""&&<div style={{fontSize:12,color:"#6b7280",textAlign:"center"}}>Laissez vide pour une facture anonyme</div>}
          </div>

          {/* Paiement */}
          <div style={S.card}>
            <h3 style={{...S.cardTitle,fontSize:14,marginBottom:10}}>💳 Paiement</h3>
            <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
              {Object.entries(PAY_MODES).map(([k,v])=>(
                <div key={k} style={{...S.tab,...(payMode===k?S.tabActive:{}),cursor:"pointer",fontSize:12,padding:"6px 10px"}} onClick={()=>setPayMode(k)}>{v}</div>
              ))}
            </div>
            {(payMode==="cb"||payMode==="mixed")&&(
              <>
                <label style={S.label}>4 derniers chiffres de la carte</label>
                <input style={S.input} placeholder="ex: 4321" maxLength={4} value={cardLast4} onChange={e=>setCardLast4(e.target.value.replace(/\D/g,"").slice(0,4))}/>
                <label style={S.label}>Type de carte</label>
                <select style={S.input} value={cardType} onChange={e=>setCardType(e.target.value)}>
                  <option>VISA</option><option>Mastercard</option><option>CB</option><option>American Express</option>
                </select>
              </>
            )}
          </div>

          <button style={{...S.btn,fontSize:16}} onClick={confirmOrder}>✅ Encaisser {fmt(total)}</button>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN PRODUCTS
// ═══════════════════════════════════════════════════════════════════════════════
function AdminProducts({menu,updateMenu,showToast}) {
  const cats=["entree","plat","dessert","boisson","menu"];
  const [activeTab,setActiveTab]=useState("plat");
  const [form,setForm]=useState(null);
  const [search,setSearch]=useState("");
  const [deleteConfirm,setDeleteConfirm]=useState(null);
  const {isMobile}=useBreakpoint();

  const del=async(id)=>{await updateMenu(menu.filter(m=>m.id!==id));setDeleteConfirm(null);showToast("Produit supprimé");};
  const toggle=async(id)=>{await updateMenu(menu.map(m=>m.id===id?{...m,available:!m.available}:m));showToast("Disponibilité mise à jour ✅");};
  const save=async(item)=>{
    if(!item.name.trim()) return showToast("Nom requis","error");
    if(!item.price||isNaN(item.price)) return showToast("Prix invalide","error");
    const saved={...item,price:parseFloat(item.price)||0,points:parseInt(item.points)||0};
    await updateMenu(saved.id?menu.map(m=>m.id===saved.id?saved:m):[...menu,{...saved,id:genId()}]);
    setForm(null); showToast(saved.id?"Produit modifié ✅":"Produit ajouté ✅");
  };
  const filtered=menu.filter(m=>m.cat===activeTab&&(!search||m.name.toLowerCase().includes(search.toLowerCase())));

  return (
    <div style={S.page}>
      <div style={{...S.pageHeader,flexWrap:"wrap",gap:8}}>
        <h1 style={S.pageTitle}>🍽️ Produits & Menu</h1>
        <button style={{...S.btn,width:"auto"}} onClick={()=>setForm({cat:activeTab,name:"",desc:"",price:"",points:"",available:true})}>＋ Nouveau produit</button>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
        {cats.map(c=>{
          const count=menu.filter(m=>m.cat===c).length;
          return <div key={c} style={{...S.tab,...(activeTab===c?S.tabActive:{}),cursor:"pointer"}} onClick={()=>{setActiveTab(c);setSearch("");}}>
            {CAT_ICONS[c]} {!isMobile&&CAT_LABELS[c]} <span style={{background:"rgba(0,0,0,0.2)",borderRadius:10,padding:"1px 6px",fontSize:11,marginLeft:4}}>{count}</span>
          </div>;
        })}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <span style={{fontSize:12,color:"#9ca3af"}}>{filtered.length} produit{filtered.length>1?"s":""} · {menu.filter(m=>m.cat===activeTab&&m.available).length} dispos</span>
        <input style={{...S.input,marginBottom:0,width:isMobile?"100%":200,padding:"8px 12px",fontSize:13}} placeholder="🔍 Rechercher..." value={search} onChange={e=>setSearch(e.target.value)}/>
      </div>
      {filtered.length===0&&<div style={{...S.card,textAlign:"center",padding:40}}><div style={{fontSize:40,marginBottom:12}}>{CAT_ICONS[activeTab]}</div><p style={{color:"#6b7280",marginBottom:16}}>Aucun produit</p><button style={{...S.btn,width:"auto"}} onClick={()=>setForm({cat:activeTab,name:"",desc:"",price:"",points:"",available:true})}>＋ Ajouter</button></div>}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
        {filtered.map(item=>(
          <div key={item.id} style={{background:"#161b22",border:`1px solid ${item.available?"#30363d":"#7f1d1d"}`,borderRadius:12,padding:16,opacity:item.available?1:0.7,position:"relative"}}>
            <div style={{position:"absolute",top:12,right:12}}>{item.available?<span style={{...S.pill,background:"#1a3a1a",color:"#22c55e",fontSize:10}}>✅ Dispo</span>:<span style={{...S.pillRed,fontSize:10}}>🚫 Indispo</span>}</div>
            <div style={{fontSize:28,marginBottom:8}}>{CAT_ICONS[item.cat]}</div>
            <div style={{fontWeight:700,fontSize:15,marginBottom:4,paddingRight:60}}>{item.name}</div>
            {item.desc&&<div style={{fontSize:12,color:"#9ca3af",marginBottom:8}}>{item.desc}</div>}
            <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:12}}>
              <span style={{color:"#d4a853",fontWeight:700,fontSize:16}}>{fmt(item.price)}</span>
              <span style={{fontSize:11,color:"#9ca3af",background:"#1f2937",padding:"2px 7px",borderRadius:10}}>⭐ {item.points||0} pts</span>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button style={{...S.btnSm,flex:1,textAlign:"center"}} onClick={()=>toggle(item.id)}>{item.available?"🚫 Désactiver":"✅ Activer"}</button>
              <button style={{...S.btnSm,padding:"7px 10px"}} onClick={()=>setForm({...item})}>✏️</button>
              <button style={{...S.btnSm,...S.btnDanger,padding:"7px 10px"}} onClick={()=>setDeleteConfirm(item)}>🗑️</button>
            </div>
          </div>
        ))}
      </div>

      {form&&<div style={S.modal}><div style={S.modalCard} className="modal-card-mobile">
        <h3 style={S.cardTitle}>{form.id?"✏️ Modifier":"＋ Nouveau"} produit</h3>
        <label style={S.label}>Catégorie</label>
        <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
          {cats.map(c=><div key={c} style={{...S.tab,...(form.cat===c?S.tabActive:{}),cursor:"pointer",fontSize:12,padding:"6px 10px"}} onClick={()=>setForm(p=>({...p,cat:c}))}>{CAT_ICONS[c]} {CAT_LABELS[c]}</div>)}
        </div>
        <label style={S.label}>Nom *</label>
        <input style={S.input} placeholder="Ex : Bœuf Bourguignon" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/>
        <label style={S.label}>Description</label>
        <textarea style={{...S.input,resize:"vertical",minHeight:64}} placeholder="Ingrédients, allergènes…" value={form.desc||""} onChange={e=>setForm(p=>({...p,desc:e.target.value}))}/>
        <div style={{display:"flex",gap:12}}>
          <div style={{flex:1}}><label style={S.label}>Prix (€) *</label><input style={S.input} type="number" step="0.01" min="0" value={form.price} onChange={e=>setForm(p=>({...p,price:e.target.value}))}/></div>
          <div style={{flex:1}}><label style={S.label}>Points fidélité</label><input style={S.input} type="number" min="0" value={form.points||""} onChange={e=>setForm(p=>({...p,points:e.target.value}))}/></div>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <div style={{...S.orderTypeBtn,flex:1,fontSize:13,...(form.available?S.orderTypeBtnActive:{})}} onClick={()=>setForm(p=>({...p,available:true}))}>✅ Disponible</div>
          <div style={{...S.orderTypeBtn,flex:1,fontSize:13,...(!form.available?{...S.orderTypeBtnActive,border:"2px solid #ef4444",color:"#ef4444",background:"#1a0000"}:{})}} onClick={()=>setForm(p=>({...p,available:false}))}>🚫 Indisponible</div>
        </div>
        <div style={{display:"flex",gap:8}}><button style={S.btn} onClick={()=>save(form)}>💾 Sauvegarder</button><button style={S.btnOutline} onClick={()=>setForm(null)}>Annuler</button></div>
      </div></div>}

      {deleteConfirm&&<div style={S.modal}><div style={{...S.modalCard,maxWidth:380}}>
        <h3 style={{...S.cardTitle,color:"#ef4444"}}>🗑️ Supprimer ce produit ?</h3>
        <div style={{background:"#0d1117",borderRadius:10,padding:14,marginBottom:16,border:"1px solid #30363d"}}>
          <div style={{fontWeight:700,marginBottom:4}}>{deleteConfirm.name}</div>
          <div style={{fontSize:12,color:"#9ca3af"}}>{CAT_ICONS[deleteConfirm.cat]} {CAT_LABELS[deleteConfirm.cat]} · {fmt(deleteConfirm.price)}</div>
        </div>
        <p style={{fontSize:13,color:"#9ca3af",marginBottom:16}}>Cette action est irréversible.</p>
        <div style={{display:"flex",gap:8}}>
          <button style={{...S.btn,background:"#7f1d1d",color:"#fca5a5",border:"1px solid #991b1b"}} onClick={()=>del(deleteConfirm.id)}>🗑️ Supprimer</button>
          <button style={S.btnOutline} onClick={()=>setDeleteConfirm(null)}>Annuler</button>
        </div>
      </div></div>}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN CLIENTS
// ═══════════════════════════════════════════════════════════════════════════════
function AdminClients({users,updateUsers,invoices,orders,showToast}) {
  const [form,setForm]=useState(null);
  const [search,setSearch]=useState("");
  const [selected,setSelected]=useState(null);
  const [deleteConfirm,setDeleteConfirm]=useState(null);
  const clients=users.filter(u=>u.role==="client");
  const filtered=clients.filter(c=>!search||c.name.toLowerCase().includes(search.toLowerCase())||c.email.toLowerCase().includes(search.toLowerCase())||(c.refNumber&&c.refNumber.toLowerCase().includes(search.toLowerCase())));

  const saveClient=async(c)=>{
    if(!c.name.trim()||!c.email.trim()) return showToast("Nom et email requis","error");
    const existing=await dbGet("users")||[];
    const emailTaken=existing.find(u=>u.email.toLowerCase()===c.email.toLowerCase()&&u.id!==c.id);
    if(emailTaken) return showToast("Email déjà utilisé","error");
    let newUsers;
    if(c.id){
      const pw=c._newPw?await hashPw(c._newPw):c.password;
      const {_newPw,...clean}=c;
      newUsers=existing.map(u=>u.id===c.id?{...clean,password:pw}:u);
    } else {
      const hashed=await hashPw(c.password||"client123");
      newUsers=[...existing,{...c,id:genId(),role:"client",points:c.points||0,refNumber:c.refNumber||genRef(),password:hashed,createdAt:new Date().toISOString()}];
    }
    await updateUsers(newUsers); setForm(null); showToast("Client sauvegardé ✅");
  };
  const delClient=async(id)=>{
    const existing=await dbGet("users")||[];
    await updateUsers(existing.filter(u=>u.id!==id));
    setDeleteConfirm(null); if(selected?.id===id) setSelected(null); showToast("Client supprimé");
  };

  if(selected){
    const clientInv=invoices.filter(i=>i.clientId===selected.id).slice().reverse();
    const clientOrd=orders.filter(o=>o.clientId===selected.id&&o.status!=="done");
    const spent=clientInv.reduce((s,i)=>s+i.total,0);
    return (
      <div style={S.page}>
        <button style={{...S.btnOutline,width:"auto",marginBottom:16}} onClick={()=>setSelected(null)}>← Retour</button>
        <div style={S.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
            <div>
              <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:20,color:"#f3f4f6",marginBottom:4}}>{selected.name}</h2>
              <div style={{fontSize:13,color:"#9ca3af"}}>{selected.email}</div>
              <div style={{fontSize:12,color:"#d4a853",marginTop:4,fontWeight:700}}>{selected.refNumber}</div>
              <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>Membre depuis {fmtDate(selected.createdAt)}</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:24,fontWeight:700,color:"#d4a853"}}>⭐ {selected.points||0} pts</div>
              <div style={{fontSize:12,color:"#9ca3af"}}>CA total : {fmt(spent)}</div>
              <div style={{fontSize:12,color:"#9ca3af"}}>{clientInv.length} commande{clientInv.length>1?"s":""}</div>
            </div>
          </div>
        </div>
        {clientOrd.length>0&&<div style={S.card}><h3 style={S.cardTitle}>📋 En cours</h3>
          {clientOrd.map(o=><div key={o.id} style={S.row}><span>{o.items.map(i=>i.name).join(", ")}</span><span style={{...S.statusBadge,background:STATUS_CFG[o.status].color}}>{STATUS_CFG[o.status].icon} {STATUS_CFG[o.status].label}</span></div>)}
        </div>}
        <div style={S.card}><h3 style={S.cardTitle}>🧾 Historique factures</h3>
          {clientInv.length===0&&<p style={S.empty}>Aucune facture</p>}
          {clientInv.map(inv=>(
            <div key={inv.id} style={S.row}>
              <div><div style={{fontWeight:600}}>{fmt(inv.total)}</div><div style={{fontSize:11,color:"#9ca3af"}}>{fmtDate(inv.paidAt)} · {PAY_MODES[inv.payMode]||"—"}</div></div>
              <span style={{fontSize:11,color:"#9ca3af"}}>{inv.items.length} article{inv.items.length>1?"s":""}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={{...S.pageHeader,flexWrap:"wrap",gap:8}}>
        <h1 style={S.pageTitle}>👥 Clients ({clients.length})</h1>
        <button style={{...S.btn,width:"auto"}} onClick={()=>setForm({role:"client",name:"",email:"",password:"client123",points:0,refNumber:genRef()})}>＋ Nouveau client</button>
      </div>
      <input style={S.input} placeholder="🔍 Rechercher par nom, email ou REF..." value={search} onChange={e=>setSearch(e.target.value)}/>
      {filtered.length===0&&<p style={S.empty}>Aucun client trouvé</p>}
      {filtered.map(c=>(
        <div key={c.id} style={S.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div style={{cursor:"pointer"}} onClick={()=>setSelected(c)}>
              <div style={{fontWeight:700,fontSize:15}}>{c.name}</div>
              <div style={{fontSize:12,color:"#9ca3af"}}>{c.email}</div>
              <div style={{fontSize:11,color:"#d4a853",fontWeight:700}}>{c.refNumber}</div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <span style={S.pill}>⭐ {c.points||0} pts</span>
              <button style={S.btnSm} onClick={()=>setSelected(c)}>👁️ Profil</button>
              <button style={S.btnSm} onClick={()=>setForm({...c,_newPw:""})}>✏️</button>
              <button style={{...S.btnSm,...S.btnDanger}} onClick={()=>setDeleteConfirm(c)}>🗑️</button>
            </div>
          </div>
        </div>
      ))}

      {form&&<div style={S.modal}><div style={S.modalCard} className="modal-card-mobile">
        <h3 style={S.cardTitle}>{form.id?"✏️ Modifier":"＋ Nouveau"} client</h3>
        <label style={S.label}>Nom complet</label><input style={S.input} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/>
        <label style={S.label}>Email</label><input style={S.input} type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}/>
        <label style={S.label}>{form.id?"Nouveau mot de passe (laisser vide = inchangé)":"Mot de passe"}</label>
        <input style={S.input} type="password" placeholder={form.id?"Laisser vide pour ne pas changer":"Minimum 6 caractères"} value={form._newPw!==undefined?form._newPw:form.password} onChange={e=>setForm(p=>({...p,[p.id?"_newPw":"password"]:e.target.value}))}/>
        <label style={S.label}>Points fidélité</label><input style={S.input} type="number" min="0" value={form.points||0} onChange={e=>setForm(p=>({...p,points:parseInt(e.target.value)||0}))}/>
        <label style={S.label}>Numéro de référence</label>
        <div style={{display:"flex",gap:8}}><input style={{...S.input,marginBottom:0}} value={form.refNumber||""} onChange={e=>setForm(p=>({...p,refNumber:e.target.value}))}/><button style={{...S.btnSm,whiteSpace:"nowrap"}} onClick={()=>setForm(p=>({...p,refNumber:genRef()}))}>🔄</button></div>
        <div style={{height:12}}/>
        <div style={{display:"flex",gap:8}}><button style={S.btn} onClick={()=>saveClient(form)}>💾 Sauvegarder</button><button style={S.btnOutline} onClick={()=>setForm(null)}>Annuler</button></div>
      </div></div>}

      {deleteConfirm&&<div style={S.modal}><div style={{...S.modalCard,maxWidth:380}}>
        <h3 style={{...S.cardTitle,color:"#ef4444"}}>🗑️ Supprimer {deleteConfirm.name} ?</h3>
        <p style={{fontSize:13,color:"#9ca3af",marginBottom:16}}>Cette action est irréversible. Les factures existantes seront conservées.</p>
        <div style={{display:"flex",gap:8}}><button style={{...S.btn,background:"#7f1d1d",color:"#fca5a5",border:"1px solid #991b1b"}} onClick={()=>delClient(deleteConfirm.id)}>🗑️ Supprimer</button><button style={S.btnOutline} onClick={()=>setDeleteConfirm(null)}>Annuler</button></div>
      </div></div>}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN LOYALTY
// ═══════════════════════════════════════════════════════════════════════════════
function AdminLoyalty({rewards,updateRewards,settings,updateSettings,users,showToast}) {
  const [form,setForm]=useState(null);
  const top=[...users].filter(u=>u.role==="client").sort((a,b)=>(b.points||0)-(a.points||0)).slice(0,10);
  const save=async(r)=>{
    if(!r.name||!r.points) return showToast("Nom et points requis","error");
    await updateRewards(r.id?rewards.map(x=>x.id===r.id?r:x):[...rewards,{...r,id:genId()}]);
    setForm(null); showToast("Récompense sauvegardée ✅");
  };
  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>⭐ Programme fidélité</h1>
      <div style={S.card}>
        <h3 style={S.cardTitle}>⚙️ Paramètres</h3>
        <label style={S.label}>Points par euro dépensé</label>
        <div style={{display:"flex",gap:8,marginBottom:0}}>
          <input style={{...S.input,marginBottom:0,flex:1}} type="number" min="0" step="0.1" value={settings.pointsPerEuro||1} onChange={e=>updateSettings({...settings,pointsPerEuro:parseFloat(e.target.value)||1})}/>
          <button style={{...S.btnSm,whiteSpace:"nowrap"}} onClick={()=>showToast("Paramètre sauvegardé ✅")}>Sauvegarder</button>
        </div>
      </div>
      <div style={S.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{...S.cardTitle,marginBottom:0}}>🎁 Récompenses</h3>
          <button style={{...S.btn,width:"auto"}} onClick={()=>setForm({name:"",points:"",desc:""})}>＋ Ajouter</button>
        </div>
        {rewards.map(r=>(
          <div key={r.id} style={S.row}>
            <div><div style={{fontWeight:700}}>{r.name}</div><div style={{fontSize:12,color:"#9ca3af"}}>{r.desc}</div></div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={S.pill}>⭐ {r.points} pts</span>
              <button style={S.btnSm} onClick={()=>setForm({...r})}>✏️</button>
              <button style={{...S.btnSm,...S.btnDanger}} onClick={async()=>{await updateRewards(rewards.filter(x=>x.id!==r.id));showToast("Supprimé");}}>🗑️</button>
            </div>
          </div>
        ))}
      </div>
      {top.length>0&&<div style={S.card}><h3 style={S.cardTitle}>🏆 Top clients</h3>
        {top.map((c,i)=>(
          <div key={c.id} style={S.row}>
            <div style={{display:"flex",gap:10,alignItems:"center"}}>
              <span style={{fontWeight:700,color:"#d4a853",width:20}}>#{i+1}</span>
              <div><div style={{fontWeight:600}}>{c.name}</div><div style={{fontSize:11,color:"#d4a853"}}>{c.refNumber}</div></div>
            </div>
            <span style={S.pill}>⭐ {c.points||0} pts</span>
          </div>
        ))}
      </div>}
      {form&&<div style={S.modal}><div style={S.modalCard}>
        <h3 style={S.cardTitle}>{form.id?"Modifier":"Ajouter"} une récompense</h3>
        <label style={S.label}>Nom</label><input style={S.input} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/>
        <label style={S.label}>Description</label><input style={S.input} value={form.desc||""} onChange={e=>setForm(p=>({...p,desc:e.target.value}))}/>
        <label style={S.label}>Points requis</label><input style={S.input} type="number" min="0" value={form.points} onChange={e=>setForm(p=>({...p,points:parseInt(e.target.value)||0}))}/>
        <div style={{display:"flex",gap:8}}><button style={S.btn} onClick={()=>save(form)}>💾 Sauvegarder</button><button style={S.btnOutline} onClick={()=>setForm(null)}>Annuler</button></div>
      </div></div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACT PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function ContactPage({settings,updateSettings,showToast,currentUser}) {
  const isAdmin=currentUser.role==="admin";
  const [form,setForm]=useState({...settings});
  const [editing,setEditing]=useState(false);
  const save=async()=>{await updateSettings(form);setEditing(false);showToast("Informations mises à jour ✅");};
  const info=[
    {icon:"🏠",label:"Nom",key:"restaurantName"},
    {icon:"📍",label:"Adresse",key:"address"},
    {icon:"📞",label:"Téléphone",key:"phone"},
    {icon:"✉️",label:"Email",key:"email"},
    {icon:"🏢",label:"SIRET",key:"siret"},
  ];
  return (
    <div style={S.page}>
      <div style={{...S.pageHeader,flexWrap:"wrap",gap:8}}>
        <h1 style={S.pageTitle}>📍 Informations du restaurant</h1>
        {isAdmin&&!editing&&<button style={{...S.btn,width:"auto"}} onClick={()=>setEditing(true)}>✏️ Modifier</button>}
      </div>
      <div style={S.card}>
        {info.map(({icon,label,key})=>(
          <div key={key} style={{...S.row,flexDirection:editing?"column":"row",alignItems:editing?"flex-start":"center",paddingBottom:editing?12:undefined}}>
            {!editing&&<>
              <div style={{display:"flex",gap:10,alignItems:"center"}}><span style={{fontSize:20}}>{icon}</span><div><div style={{fontSize:11,color:"#9ca3af",fontWeight:600}}>{label}</div><div style={{fontWeight:600,marginTop:2}}>{settings[key]||"—"}</div></div></div>
            </>}
            {editing&&<>
              <label style={S.label}>{icon} {label}</label>
              <input style={{...S.input,marginBottom:0}} value={form[key]||""} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))}/>
            </>}
          </div>
        ))}
        {editing&&<div style={{display:"flex",gap:8,marginTop:16}}><button style={S.btn} onClick={save}>💾 Sauvegarder</button><button style={S.btnOutline} onClick={()=>{setForm({...settings});setEditing(false);}}>Annuler</button></div>}
      </div>
      {!editing&&<div style={S.card}>
        <h3 style={S.cardTitle}>🗺️ Nous trouver</h3>
        <div style={{background:"#0d1117",borderRadius:10,padding:20,textAlign:"center",border:"1px dashed #374151"}}>
          <div style={{fontSize:40,marginBottom:12}}>📍</div>
          <div style={{fontWeight:700,marginBottom:4}}>{settings.restaurantName||"RestoPro"}</div>
          <div style={{fontSize:13,color:"#9ca3af",marginBottom:4}}>{settings.address||"Adresse non renseignée"}</div>
          <div style={{fontSize:13,color:"#9ca3af",marginBottom:4}}>📞 {settings.phone||"—"}</div>
          <div style={{fontSize:13,color:"#9ca3af"}}>✉️ {settings.email||"—"}</div>
        </div>
      </div>}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════
function AdminSettings({settings,updateSettings,currentUser,updateUsers,users,showToast,logout}) {
  const [employees,setEmployees]=useState(users.filter(u=>u.role==="employee"));
  const [form,setForm]=useState(null);
  useEffect(()=>setEmployees(users.filter(u=>u.role==="employee")),[users]);
  const saveEmp=async(e)=>{
    if(!e.name||!e.email) return showToast("Nom et email requis","error");
    const existing=await dbGet("users")||[];
    let newUsers;
    if(e.id){
      const orig=existing.find(u=>u.id===e.id);
      const pw=e._newPw?await hashPw(e._newPw):orig.password;
      const {_newPw,...clean}=e;
      newUsers=existing.map(u=>u.id===e.id?{...clean,password:pw}:u);
    } else {
      if(!e.password||e.password.length<6) return showToast("Mot de passe minimum 6 caractères","error");
      const hashed=await hashPw(e.password);
      newUsers=[...existing,{...e,id:genId(),role:"employee",points:0,refNumber:genRef(),password:hashed,createdAt:new Date().toISOString()}];
    }
    await updateUsers(newUsers); setForm(null); showToast("Employé sauvegardé ✅");
  };
  const delEmp=async(id)=>{const existing=await dbGet("users")||[];await updateUsers(existing.filter(u=>u.id!==id));showToast("Employé supprimé");};
  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>⚙️ Paramètres</h1>
      <div style={S.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{...S.cardTitle,marginBottom:0}}>👨‍🍳 Employés ({employees.length})</h3>
          <button style={{...S.btn,width:"auto"}} onClick={()=>setForm({role:"employee",name:"",email:"",password:""})}>＋ Ajouter</button>
        </div>
        {employees.length===0&&<p style={S.empty}>Aucun employé</p>}
        {employees.map(e=>(
          <div key={e.id} style={S.row}>
            <div><div style={{fontWeight:700}}>{e.name}</div><div style={{fontSize:12,color:"#9ca3af"}}>{e.email}</div></div>
            <div style={{display:"flex",gap:8}}>
              <button style={S.btnSm} onClick={()=>setForm({...e,_newPw:""})}>✏️</button>
              <button style={{...S.btnSm,...S.btnDanger}} onClick={()=>delEmp(e.id)}>🗑️</button>
            </div>
          </div>
        ))}
      </div>
      <UserSettings currentUser={currentUser} users={users} updateUsers={updateUsers} showToast={showToast} setCurrentUser={()=>{}} logout={logout}/>
      {form&&<div style={S.modal}><div style={S.modalCard}>
        <h3 style={S.cardTitle}>{form.id?"✏️ Modifier":"＋ Nouvel"} employé</h3>
        <label style={S.label}>Nom</label><input style={S.input} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/>
        <label style={S.label}>Email</label><input style={S.input} type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}/>
        <label style={S.label}>{form.id?"Nouveau mot de passe (laisser vide = inchangé)":"Mot de passe *"}</label>
        <input style={S.input} type="password" value={form._newPw!==undefined?form._newPw:form.password||""} onChange={e=>setForm(p=>({...p,[p.id?"_newPw":"password"]:e.target.value}))}/>
        <div style={{display:"flex",gap:8}}><button style={S.btn} onClick={()=>saveEmp(form)}>💾 Sauvegarder</button><button style={S.btnOutline} onClick={()=>setForm(null)}>Annuler</button></div>
      </div></div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMP CLIENTS — Créer compte sans voir les infos existants
// ═══════════════════════════════════════════════════════════════════════════════
function EmpClients({users,updateUsers,showToast}) {
  const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [pw,setPw]=useState(""); const [loading,setLoading]=useState(false);
  const create=async()=>{
    if(!name||!email||!pw) return showToast("Remplissez tous les champs","error");
    if(pw.length<6) return showToast("Mot de passe minimum 6 caractères","error");
    setLoading(true);
    const existing=await dbGet("users")||[];
    if(existing.find(u=>u.email.toLowerCase()===email.toLowerCase())) {setLoading(false);return showToast("Email déjà utilisé","error");}
    const hashed=await hashPw(pw);
    const newUser={id:genId(),role:"client",name:name.trim(),email:email.trim(),password:hashed,points:0,refNumber:genRef(),createdAt:new Date().toISOString()};
    await updateUsers([...existing,newUser]);
    const ref=newUser.refNumber;
    setName("");setEmail("");setPw("");setLoading(false);
    showToast(`Compte créé ! Réf : ${ref} ✅`);
  };
  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>👤 Créer un compte client</h1>
      <div style={S.card}>
        <h3 style={S.cardTitle}>Nouveau client</h3>
        <div style={{background:"#1c1a00",border:"1px solid #d4a853",borderRadius:8,padding:10,marginBottom:16,fontSize:12,color:"#fde68a"}}>
          ℹ️ En tant qu'employé, vous pouvez uniquement créer de nouveaux comptes. Les informations des comptes existants sont confidentielles.
        </div>
        <label style={S.label}>Nom complet</label><input style={S.input} placeholder="Jean Dupont" value={name} onChange={e=>setName(e.target.value)}/>
        <label style={S.label}>Email</label><input style={S.input} placeholder="client@email.com" value={email} onChange={e=>setEmail(e.target.value)} type="email"/>
        <label style={S.label}>Mot de passe temporaire</label><input style={S.input} placeholder="Minimum 6 caractères" value={pw} onChange={e=>setPw(e.target.value)} type="password"/>
        <button style={{...S.btn,width:"auto",opacity:loading?0.6:1}} onClick={create} disabled={loading}>{loading?"⏳ Création…":"Créer le compte"}</button>
      </div>
      <div style={S.card}>
        <h3 style={S.cardTitle}>ℹ️ Comment ça marche ?</h3>
        <p style={{fontSize:13,color:"#9ca3af",lineHeight:1.6}}>
          Après création du compte, communiquez le <strong style={{color:"#d4a853"}}>numéro de référence REF-XXXXX</strong> au client. Il pourra se connecter et retrouver ce numéro sous son prénom dans les paramètres de son compte.
        </p>
        <p style={{fontSize:13,color:"#9ca3af",lineHeight:1.6,marginTop:8}}>
          Lors d'un encaissement, recherchez le client par son <strong style={{color:"#d4a853"}}>nom ou numéro REF</strong> dans l'onglet Encaissement pour créditer ses points fidélité.
        </p>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// USER SETTINGS (shared)
// ═══════════════════════════════════════════════════════════════════════════════
function UserSettings({currentUser,users,updateUsers,showToast,setCurrentUser,logout}) {
  const [name,setName]=useState(currentUser.name||"");
  const [email,setEmail]=useState(currentUser.email||"");
  const [pwOld,setPwOld]=useState(""); const [pwNew,setPwNew]=useState(""); const [pwConf,setPwConf]=useState("");
  const [loading,setLoading]=useState(false);
  const [confirmLogout,setConfirmLogout]=useState(false);

  const saveProfile=async()=>{
    if(!name.trim()||!email.trim()) return showToast("Nom et email requis","error");
    const fresh=await dbGet("users")||[];
    const taken=fresh.find(u=>u.email.toLowerCase()===email.toLowerCase()&&u.id!==currentUser.id);
    if(taken) return showToast("Email déjà utilisé","error");
    setLoading(true);
    const updated={...currentUser,name:name.trim(),email:email.trim()};
    await updateUsers(fresh.map(u=>u.id===currentUser.id?updated:u));
    if(setCurrentUser) setCurrentUser(updated);
    setLoading(false); showToast("Profil mis à jour ✅");
  };
  const savePassword=async()=>{
    if(!pwOld||!pwNew||!pwConf) return showToast("Remplissez tous les champs","error");
    const ok=await checkPw(pwOld,currentUser.password);
    if(!ok) return showToast("Mot de passe actuel incorrect","error");
    if(pwNew.length<6) return showToast("Minimum 6 caractères","error");
    if(pwNew!==pwConf) return showToast("Les mots de passe ne correspondent pas","error");
    setLoading(true);
    const fresh=await dbGet("users")||[];
    const hashed=await hashPw(pwNew);
    const updated={...currentUser,password:hashed};
    await updateUsers(fresh.map(u=>u.id===currentUser.id?updated:u));
    if(setCurrentUser) setCurrentUser(updated);
    setPwOld("");setPwNew("");setPwConf("");
    setLoading(false); showToast("Mot de passe modifié ✅");
  };

  return (
    <>
      {/* Infos compte */}
      <div style={S.card}>
        <h3 style={S.cardTitle}>👤 Informations du compte</h3>
        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20,padding:16,background:"#0d1117",borderRadius:10,border:"1px solid #21262d"}}>
          <div style={{width:52,height:52,borderRadius:"50%",background:"#1f2937",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,flexShrink:0}}>
            {currentUser.role==="admin"?"👑":currentUser.role==="employee"?"👨‍🍳":"👤"}
          </div>
          <div>
            <div style={{fontWeight:700,fontSize:15}}>{currentUser.name}</div>
            <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>{currentUser.email}</div>
            {currentUser.refNumber&&<div style={{fontSize:12,color:"#d4a853",marginTop:4,fontWeight:700,letterSpacing:1}}>{currentUser.refNumber}</div>}
            <div style={{fontSize:11,color:"#6b7280",marginTop:2,textTransform:"capitalize"}}>
              {currentUser.role==="admin"?"👑 Patron":currentUser.role==="employee"?"👨‍🍳 Employé":"👤 Client"}
              {currentUser.role==="client"&&<span style={{...S.pill,marginLeft:8,fontSize:10}}>⭐ {currentUser.points||0} pts</span>}
            </div>
          </div>
        </div>
        <label style={S.label}>Nom complet</label><input style={S.input} value={name} onChange={e=>setName(e.target.value)}/>
        <label style={S.label}>Email</label><input style={S.input} type="email" value={email} onChange={e=>setEmail(e.target.value)}/>
        <button style={{...S.btn,width:"auto",opacity:loading?0.6:1}} onClick={saveProfile} disabled={loading}>{loading?"⏳…":"💾 Sauvegarder"}</button>
      </div>

      {/* Mot de passe */}
      <div style={S.card}>
        <h3 style={S.cardTitle}>🔒 Changer le mot de passe</h3>
        <label style={S.label}>Mot de passe actuel</label><input style={S.input} type="password" value={pwOld} onChange={e=>setPwOld(e.target.value)} placeholder="••••••••"/>
        <label style={S.label}>Nouveau mot de passe</label><input style={S.input} type="password" value={pwNew} onChange={e=>setPwNew(e.target.value)} placeholder="Minimum 6 caractères"/>
        <label style={S.label}>Confirmer</label><input style={{...S.input,marginBottom:12}} type="password" value={pwConf} onChange={e=>setPwConf(e.target.value)} placeholder="••••••••"/>
        {pwNew&&pwConf&&<div style={{marginBottom:12,fontSize:12}}>{pwNew===pwConf?<span style={{color:"#22c55e"}}>✅ Correspondent</span>:<span style={{color:"#ef4444"}}>❌ Ne correspondent pas</span>}</div>}
        <button style={{...S.btn,width:"auto",opacity:loading?0.6:1}} onClick={savePassword} disabled={loading}>{loading?"⏳…":"🔑 Changer le mot de passe"}</button>
      </div>

      {/* Déconnexion */}
      {logout&&<div style={S.card}>
        <h3 style={S.cardTitle}>🚪 Déconnexion</h3>
        <p style={{fontSize:13,color:"#9ca3af",marginBottom:16}}>Vous serez redirigé vers la page de connexion.</p>
        {!confirmLogout
          ?<button style={{...S.btn,background:"#7f1d1d",color:"#fca5a5",border:"1px solid #991b1b",width:"auto"}} onClick={()=>setConfirmLogout(true)}>🚪 Se déconnecter</button>
          :<div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:13,color:"#fca5a5"}}>Confirmer ?</span>
            <button style={{...S.btn,background:"#7f1d1d",color:"#fca5a5",border:"1px solid #991b1b",width:"auto"}} onClick={logout}>✅ Oui, déconnecter</button>
            <button style={{...S.btnOutline,width:"auto"}} onClick={()=>setConfirmLogout(false)}>Annuler</button>
          </div>
        }
      </div>}
    </>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT PAGES
// ═══════════════════════════════════════════════════════════════════════════════
function ClientMenu({menu,placeOrder,payOrder,showToast,cart,setCart,setPage,currentUser}) {
  const cats=["entree","plat","dessert","boisson","menu"];
  const [activeTab,setActiveTab]=useState("entree");
  const [showCart,setShowCart]=useState(false);
  const [orderType,setOrderType]=useState("surplace");
  const [payMode,setPayMode]=useState("comptoir");
  const [tableNum,setTableNum]=useState("");
  const [itemModal,setItemModal]=useState(null);
  const [itemNote,setItemNote]=useState("");
  const [showPay,setShowPay]=useState(false);
  const [paying,setPaying]=useState(false);

  const addItem=(item)=>{setCart(prev=>{const ex=prev.find(x=>x.id===item.id&&x.note===itemNote);if(ex)return prev.map(x=>(x.id===item.id&&x.note===itemNote)?{...x,qty:x.qty+1}:x);return[...prev,{...item,qty:1,note:itemNote,cartKey:genId()}]});showToast(`${item.name} ajouté ✅`);setItemModal(null);};
  const removeItem=(cartKey)=>setCart(prev=>prev.filter(x=>x.cartKey!==cartKey));
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0);

  const goPayment=()=>{
    if(!cart.length) return showToast("Panier vide","error");
    if(orderType==="surplace"&&!tableNum.trim()) return showToast("Numéro de table requis","error");
    if(payMode==="cb") return showToast("Option indisponible pour le moment","error");
    setShowCart(false);setShowPay(true);
  };
  const confirmPayment=async()=>{
    setPaying(true);
    const order=await placeOrder(cart,orderType,tableNum.trim());
    setCart([]);setShowPay(false);setPaying(false);setTableNum("");setPage("client-orders");
    showToast(payMode==="comptoir"?"Commande envoyée ! Réglez au comptoir 🏦":"Commande confirmée 🎉");
  };

  const items=menu.filter(m=>m.cat===activeTab&&m.available);
  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <h1 style={S.pageTitle}>🍽️ Notre menu</h1>
        <button style={{...S.btn,width:"auto",position:"relative"}} onClick={()=>setShowCart(true)}>
          🛒 Panier {cart.length>0&&<span style={S.badge}>{cart.reduce((s,i)=>s+i.qty,0)}</span>}
        </button>
      </div>
      <div style={S.tabBar}>{cats.map(c=><div key={c} style={{...S.tab,...(activeTab===c?S.tabActive:{})}} onClick={()=>setActiveTab(c)}>{CAT_ICONS[c]} {CAT_LABELS[c]}</div>)}</div>
      <div style={S.menuGrid} className="menu-grid-mobile menu-grid-tablet">
        {items.length===0&&<p style={S.empty}>Aucun article disponible</p>}
        {items.map(item=>(
          <div key={item.id} style={S.menuCard} className="menu-card-mobile">
            <div style={{fontSize:32,marginBottom:8}}>{CAT_ICONS[item.cat]}</div>
            <div style={{fontWeight:700,fontSize:16,marginBottom:4}}>{item.name}</div>
            <div style={{fontSize:12,color:"#9ca3af",flex:1}}>{item.desc}</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12}}>
              <span style={{color:"#d4a853",fontWeight:700,fontSize:16}}>{fmt(item.price)}</span>
              <span style={{fontSize:11,color:"#9ca3af"}}>+{item.points} pts</span>
            </div>
            <button style={{...S.btn,width:"100%",marginTop:8}} onClick={()=>{setItemModal(item);setItemNote("");}}>Ajouter</button>
          </div>
        ))}
      </div>

      {itemModal&&<div style={S.modal} className="modal-mobile"><div style={S.modalCard} className="modal-card-mobile">
        <h3 style={S.cardTitle}>{CAT_ICONS[itemModal.cat]} {itemModal.name}</h3>
        {itemModal.desc&&<p style={{fontSize:13,color:"#9ca3af",marginBottom:16}}>{itemModal.desc}</p>}
        <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>✏️ Personnaliser (optionnel)</div>
        <textarea style={{...S.input,resize:"vertical",minHeight:72}} placeholder="Ex : sans oignons…" value={itemNote} onChange={e=>setItemNote(e.target.value)}/>
        <div style={{display:"flex",gap:8}}>
          <button style={S.btn} onClick={()=>addItem(itemModal)}>Ajouter au panier</button>
          <button style={S.btnOutline} onClick={()=>setItemModal(null)}>Annuler</button>
        </div>
      </div></div>}

      {showCart&&<div style={S.modal} className="modal-mobile"><div style={S.modalCard} className="modal-card-mobile">
        <h3 style={S.cardTitle}>🛒 Mon panier</h3>
        <div style={{fontSize:11,color:"#9ca3af",fontWeight:600,marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>Mode</div>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <div style={{...S.orderTypeBtn,flex:1,fontSize:13,...(orderType==="surplace"?S.orderTypeBtnActive:{})}} onClick={()=>setOrderType("surplace")}>🪑 Sur place</div>
          <div style={{...S.orderTypeBtn,flex:1,fontSize:13,...(orderType==="emporter"?S.orderTypeBtnActive:{})}} onClick={()=>setOrderType("emporter")}>🥡 À emporter</div>
        </div>
        {orderType==="surplace"&&<div style={{marginBottom:12}}><label style={S.label}>🔢 N° de table *</label><input style={{...S.input,marginBottom:0}} placeholder="Ex : 5, Terrasse…" value={tableNum} onChange={e=>setTableNum(e.target.value)}/></div>}
        <div style={{fontSize:11,color:"#9ca3af",fontWeight:600,marginBottom:6,textTransform:"uppercase",letterSpacing:1}}>Paiement</div>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <div style={{...S.orderTypeBtn,flex:1,fontSize:13,...(payMode==="comptoir"?S.orderTypeBtnActive:{})}} onClick={()=>setPayMode("comptoir")}>🏦 Au comptoir</div>
          <div style={{...S.orderTypeBtn,flex:1,fontSize:13,opacity:0.4,cursor:"not-allowed",position:"relative"}} onClick={()=>showToast("Option indisponible pour le moment","error")}>
            💳 Carte bancaire
            <span style={{position:"absolute",top:-8,right:-6,background:"#374151",color:"#9ca3af",fontSize:9,padding:"2px 5px",borderRadius:6,fontWeight:700}}>BIENTÔT</span>
          </div>
        </div>
        {cart.length===0?<p style={S.empty}>Panier vide</p>:cart.map(it=>(
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
        ))}
        {cart.length>0&&<div style={{borderTop:"1px solid #374151",paddingTop:12,marginTop:8}}>
          <div style={{display:"flex",justifyContent:"space-between",fontWeight:700,marginBottom:12}}><span>Total</span><span style={{color:"#d4a853"}}>{fmt(total)}</span></div>
          <button style={S.btn} onClick={goPayment}>{payMode==="comptoir"?"🏦 Commander & payer au comptoir":"💳 Passer au paiement"}</button>
        </div>}
        <button style={{...S.btnOutline,marginTop:8}} onClick={()=>setShowCart(false)}>Fermer</button>
      </div></div>}

      {showPay&&<div style={S.modal} className="modal-mobile"><div style={S.modalCard} className="modal-card-mobile">
        <h3 style={S.cardTitle}>🏦 Commande confirmée !</h3>
        <div style={{background:"#0d1117",border:"1px solid #374151",borderRadius:12,padding:16,marginBottom:20}}>
          <div style={{fontSize:13,color:"#9ca3af",marginBottom:4}}>Total à payer</div>
          <div style={{fontSize:28,fontWeight:700,color:"#d4a853"}}>{fmt(total)}</div>
          {orderType==="surplace"&&<div style={{fontSize:12,color:"#93c5fd",marginTop:4}}>🪑 Table {tableNum}</div>}
          {orderType==="emporter"&&<div style={{fontSize:12,color:"#86efac",marginTop:4}}>🥡 À emporter</div>}
          <div style={{fontSize:12,color:"#f59e0b",marginTop:4}}>🏦 Paiement au comptoir</div>
        </div>
        <div style={{background:"#1c1a00",border:"1px solid #d4a853",borderRadius:10,padding:14,marginBottom:16,fontSize:13,color:"#fde68a",lineHeight:1.6}}>
          📋 <strong>Votre commande va être envoyée en cuisine.</strong><br/>Rendez-vous au comptoir pour régler <strong>{fmt(total)}</strong>.
        </div>
        {paying?<div style={{textAlign:"center",padding:16,color:"#d4a853",fontWeight:600}}>⏳ Envoi en cuisine…</div>
          :<div style={{display:"flex",gap:8}}>
            <button style={S.btn} onClick={confirmPayment}>✅ Confirmer la commande</button>
            <button style={S.btnOutline} onClick={()=>{setShowPay(false);setShowCart(true);}}>← Retour</button>
          </div>
        }
      </div></div>}
    </div>
  );
}

function ClientOrders({orders,currentUser}) {
  const mine=orders.filter(o=>o.clientId===currentUser.id&&o.status!=="done");
  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>📋 Mes commandes en cours</h1>
      {mine.length===0&&<div style={{...S.card,textAlign:"center",padding:40}}><div style={{fontSize:40,marginBottom:12}}>✅</div><p style={{color:"#6b7280"}}>Aucune commande en cours</p></div>}
      {mine.map(order=>(
        <div key={order.id} style={S.orderCard}>
          <div style={S.orderHeader}>
            <div>
              <div style={{fontWeight:700,marginBottom:4}}>Commande #{order.id.slice(0,6).toUpperCase()}</div>
              <div style={{fontSize:12,color:"#9ca3af"}}>{fmtDate(order.createdAt)}</div>
              <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>{order.orderType==="surplace"?`🪑 Table ${order.tableNumber}`:"🥡 À emporter"}</div>
            </div>
            <span style={{...S.statusBadge,background:STATUS_CFG[order.status].color}}>{STATUS_CFG[order.status].icon} {STATUS_CFG[order.status].label}</span>
          </div>
          {order.items.map((it,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}><span>{it.qty}× {it.name}</span><span style={{color:"#d4a853"}}>{fmt(it.price*it.qty)}</span></div>)}
          <div style={{borderTop:"1px solid #30363d",paddingTop:10,marginTop:8,display:"flex",justifyContent:"space-between",fontWeight:700}}>
            <span>Total</span><span style={{color:"#d4a853"}}>{fmt(order.total)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ClientHistory({invoices,currentUser,settings,users}) {
  const mine=[...invoices].filter(i=>i.clientId===currentUser.id).reverse();
  const total=mine.reduce((s,i)=>s+i.total,0);
  const [expanded,setExpanded]=useState(null);
  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>🧾 Historique</h1>
      {mine.length>0&&<div style={S.statsGrid}><div style={S.statCard}><div style={{fontSize:20,marginBottom:4}}>🧾</div><div style={{fontSize:18,fontWeight:700,color:"#d4a853"}}>{mine.length}</div><div style={{fontSize:12,color:"#9ca3af"}}>Commandes</div></div><div style={S.statCard}><div style={{fontSize:20,marginBottom:4}}>💰</div><div style={{fontSize:18,fontWeight:700,color:"#22c55e"}}>{fmt(total)}</div><div style={{fontSize:12,color:"#9ca3af"}}>Total dépensé</div></div></div>}
      {mine.length===0&&<p style={S.empty}>Aucune commande passée</p>}
      {mine.map(inv=>(
        <div key={inv.id} style={S.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div><div style={{fontWeight:700}}>#{inv.id.slice(0,8).toUpperCase()}</div><div style={{fontSize:12,color:"#9ca3af"}}>{fmtDate(inv.paidAt)}</div><div style={{fontSize:12,color:"#9ca3af"}}>{inv.orderType==="surplace"?`🪑 Table ${inv.tableNumber}`:"🥡 À emporter"}</div></div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{color:"#d4a853",fontWeight:700,fontSize:16}}>{fmt(inv.total)}</span>
              <button style={S.btnSm} onClick={()=>setExpanded(expanded===inv.id?null:inv.id)}>🔍</button>
              <button style={{...S.btnSm,background:"#1a3a1a",color:"#86efac",borderColor:"#166534"}} onClick={()=>{const cashier=users.find(u=>u.id===inv.cashierId);printTicket(inv,settings,cashier?cashier.name:inv.cashierName||"");}}>🖨️</button>
            </div>
          </div>
          {expanded===inv.id&&<div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #30363d"}}>
            {inv.items.map((it,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}><span>{it.qty}× {it.name}{it.note&&<span style={{color:"#f97316",fontSize:11}}> ({it.note})</span>}</span><span style={{color:"#d4a853"}}>{fmt(it.price*it.qty)}</span></div>)}
            {inv.rewardUsed&&<div style={{fontSize:12,color:"#d4a853",marginTop:4}}>⭐ Récompense : {inv.rewardUsed}</div>}
          </div>}
        </div>
      ))}
    </div>
  );
}

function ClientLoyalty({currentUser,rewards,placeOrder,showToast,setPage}) {
  const [redeeming,setRedeeming]=useState(null);
  const available=rewards.filter(r=>r.points<=(currentUser.points||0));
  const redeemReward=async(r)=>{
    const fakeItem={id:"reward-"+r.id,cat:"menu",name:r.name,desc:r.desc,price:0,points:0,qty:1,note:"🎁 Récompense fidélité",cartKey:genId()};
    await placeOrder([fakeItem],"surplace","",r);
    setRedeeming(null);showToast(`Récompense "${r.name}" utilisée ! 🎉`);setPage("client-orders");
  };
  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>⭐ Programme fidélité</h1>
      <div style={{...S.card,textAlign:"center",padding:32}}>
        <div style={{fontSize:56,fontWeight:800,color:"#d4a853",marginBottom:8}}>{currentUser.points||0}</div>
        <div style={{fontSize:16,color:"#9ca3af"}}>points accumulés</div>
        {currentUser.refNumber&&<div style={{fontSize:13,color:"#d4a853",marginTop:12,padding:"6px 16px",background:"#1c1a00",borderRadius:20,display:"inline-block",letterSpacing:2,fontWeight:700}}>{currentUser.refNumber}</div>}
      </div>
      <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:18,marginBottom:12,color:"#f3f4f6"}}>🎁 Récompenses disponibles</h2>
      {available.length===0&&<p style={S.empty}>Continuez à accumuler des points !</p>}
      {rewards.map(r=>{
        const canUse=r.points<=(currentUser.points||0);
        return (
          <div key={r.id} style={{...S.card,opacity:canUse?1:0.5}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
              <div><div style={{fontWeight:700,fontSize:15}}>{r.name}</div><div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>{r.desc}</div></div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={S.pill}>⭐ {r.points} pts</span>
                {canUse&&<button style={{...S.btn,width:"auto",padding:"8px 16px"}} onClick={()=>setRedeeming(r)}>Utiliser</button>}
              </div>
            </div>
          </div>
        );
      })}
      {redeeming&&<div style={S.modal}><div style={S.modalCard}>
        <h3 style={S.cardTitle}>🎁 Utiliser cette récompense ?</h3>
        <div style={{background:"#0d1117",borderRadius:10,padding:16,marginBottom:16,border:"1px solid #30363d"}}>
          <div style={{fontWeight:700,marginBottom:4}}>{redeeming.name}</div>
          <div style={{fontSize:12,color:"#9ca3af"}}>{redeeming.desc}</div>
          <div style={{color:"#d4a853",marginTop:8}}>Coût : ⭐ {redeeming.points} points</div>
          <div style={{color:"#9ca3af",fontSize:12}}>Il vous restera {(currentUser.points||0)-redeeming.points} points</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button style={S.btn} onClick={()=>redeemReward(redeeming)}>✅ Confirmer</button>
          <button style={S.btnOutline} onClick={()=>setRedeeming(null)}>Annuler</button>
        </div>
      </div></div>}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSIVE HOOK
// ═══════════════════════════════════════════════════════════════════════════════
function useBreakpoint() {
  const [w,setW]=useState(window.innerWidth);
  useEffect(()=>{const h=()=>setW(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);
  return {isMobile:w<640,isTablet:w>=640&&w<1024,isDesktop:w>=1024,w};
}

// ═══════════════════════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════════════════════
const CSS=`
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#0d1117;overscroll-behavior:none;}
  html,body{height:100%;width:100%;}
  ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:#161b22;}::-webkit-scrollbar-thumb{background:#374151;border-radius:3px;}
  textarea,input,select,button{font-family:'DM Sans',sans-serif;-webkit-tap-highlight-color:transparent;}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  .bottom-nav{display:none;position:fixed;bottom:0;left:0;right:0;background:#161b22;border-top:1px solid #30363d;z-index:500;padding-bottom:env(safe-area-inset-bottom);}
  .bottom-nav-inner{display:flex;height:60px;}
  .bottom-nav-item{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer;color:#6b7280;font-size:10px;font-weight:600;transition:color .15s;position:relative;-webkit-tap-highlight-color:transparent;}
  .bottom-nav-item.active{color:#d4a853;}
  .bottom-nav-item .nav-icon{font-size:20px;line-height:1;}
  .bottom-nav-badge{position:absolute;top:6px;right:calc(50% - 16px);background:#d4a853;color:#0d1117;border-radius:8px;padding:1px 5px;font-size:9px;font-weight:800;}
  .sidebar-desktop{display:flex;}
  @media(max-width:639px){
    .bottom-nav{display:block;}.sidebar-desktop{display:none!important;}
    .main-mobile-pad{padding-bottom:72px!important;}.page-pad{padding:12px!important;}
    .hide-mobile{display:none!important;}.auth-card-mobile{padding:24px 20px!important;margin:16px!important;border-radius:12px!important;}
    .modal-mobile{padding:12px!important;align-items:flex-end!important;}.modal-card-mobile{border-radius:16px 16px 0 0!important;max-height:92vh!important;padding:20px!important;}
    .menu-grid-mobile{grid-template-columns:repeat(2,1fr)!important;gap:10px!important;}.menu-card-mobile{padding:14px!important;}
    .stats-grid-mobile{grid-template-columns:repeat(2,1fr)!important;gap:8px!important;}
  }
  @media(min-width:640px) and (max-width:1023px){
    .sidebar-desktop{width:72px!important;}.sidebar-label{display:none!important;}.sidebar-role-text{display:none!important;}
    .sidebar-logo-text{display:none!important;}.sidebar-points{display:none!important;}
    .nav-item-tablet{justify-content:center!important;padding:14px 0!important;}
    .menu-grid-tablet{grid-template-columns:repeat(3,1fr)!important;}.stats-grid-tablet{grid-template-columns:repeat(3,1fr)!important;}
  }
`;
const CSS_TAG = <style dangerouslySetInnerHTML={{__html:CSS}}/>;

const S={
  app:{fontFamily:"'DM Sans',sans-serif",minHeight:"100vh",background:"#0d1117",color:"#f3f4f6"},
  loading:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0d1117"},
  spinner:{width:40,height:40,border:"3px solid #374151",borderTop:"3px solid #d4a853",borderRadius:"50%",animation:"spin 1s linear infinite"},
  toast:{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:99999,padding:"12px 20px",borderRadius:10,color:"#fff",fontWeight:600,fontSize:14,boxShadow:"0 4px 24px rgba(0,0,0,.5)",whiteSpace:"nowrap",maxWidth:"90vw",textAlign:"center",animation:"fadeIn .2s ease"},
  authPage:{minHeight:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#0d1117,#161b22,#0d1117)",padding:16},
  authCard:{background:"#161b22",border:"1px solid #30363d",borderRadius:16,padding:40,width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,.5)"},
  logo:{fontSize:28,fontFamily:"'Playfair Display',serif",color:"#d4a853",textAlign:"center",marginBottom:8},
  authTitle:{fontFamily:"'Playfair Display',serif",fontSize:22,fontWeight:700,textAlign:"center",marginBottom:24,color:"#f3f4f6"},
  authLink:{textAlign:"center",marginTop:16,fontSize:13,color:"#9ca3af"},
  link:{color:"#d4a853",cursor:"pointer",fontWeight:600},
  remRow:{display:"flex",alignItems:"center",gap:8,marginBottom:12},
  layout:{display:"flex",height:"100dvh",overflow:"hidden"},
  sidebar:{width:220,height:"100dvh",overflowY:"auto",background:"#161b22",borderRight:"1px solid #30363d",display:"flex",flexDirection:"column",padding:"0 0 20px",flexShrink:0},
  sidebarLogo:{fontFamily:"'Playfair Display',serif",fontSize:20,color:"#d4a853",padding:"20px 20px 8px",borderBottom:"1px solid #30363d",marginBottom:8},
  sidebarRole:{padding:"4px 20px 8px",fontSize:12,color:"#9ca3af",fontWeight:600,textTransform:"uppercase",letterSpacing:1},
  navItem:{display:"flex",alignItems:"center",gap:10,padding:"12px 20px",cursor:"pointer",color:"#9ca3af",fontSize:14,transition:"all .2s",borderLeft:"3px solid transparent"},
  navActive:{background:"#1f2937",color:"#d4a853",borderLeft:"3px solid #d4a853"},
  main:{flex:1,overflowY:"auto",background:"#0d1117",height:"100dvh"},
  page:{padding:24,maxWidth:960,margin:"0 auto"},
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
  modalCard:{background:"#161b22",border:"1px solid #30363d",borderRadius:16,padding:28,width:"100%",maxWidth:500,maxHeight:"90vh",overflowY:"auto",animation:"slideUp .2s ease"},
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

