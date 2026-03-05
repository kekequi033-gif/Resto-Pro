/* eslint-disable */
import React, { useState, useEffect, useRef } from "react";
import bcrypt from "bcryptjs";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "firebase/firestore";

// ═══════════════════════════════════════════════════════════════════════════════
// FIREBASE
// ═══════════════════════════════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FB_API_KEY,
  authDomain:        process.env.REACT_APP_FB_AUTH_DOMAIN,
  projectId:         process.env.REACT_APP_FB_PROJECT_ID,
  storageBucket:     process.env.REACT_APP_FB_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FB_MESSAGING_SENDER_ID,
  appId:             process.env.REACT_APP_FB_APP_ID,
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const dbGet = async (k) => { try { const s = await getDoc(doc(db,"restopro",k)); return s.exists()?s.data().value:null; } catch { return null; } };
const dbSet = async (k,v) => { try { await setDoc(doc(db,"restopro",k),{value:v}); } catch(e) { console.error(e); } };

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION
// ═══════════════════════════════════════════════════════════════════════════════
const lsGet = (k) => { try { const v=localStorage.getItem(k); return v?JSON.parse(v):null; } catch { return null; } };
const lsSet = (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch {} };

// ═══════════════════════════════════════════════════════════════════════════════
// SÉCURITÉ
// ═══════════════════════════════════════════════════════════════════════════════
const hashPw  = async (pw) => { if(pw&&pw.startsWith("$2")) return pw; return await bcrypt.hash(pw,10); };
const checkPw = async (plain,hashed) => { if(hashed&&hashed.startsWith("$2")) return await bcrypt.compare(plain,hashed); return plain===hashed; };
const _att = {};
const rateLimit = (email) => {
  const k=email.toLowerCase().trim(), now=Date.now();
  if(!_att[k]) _att[k]={c:0,first:now,blocked:0};
  const a=_att[k];
  if(a.blocked>now) return `Trop de tentatives. Réessayez dans ${Math.ceil((a.blocked-now)/1000)}s`;
  if(now-a.first>300000){a.c=0;a.first=now;}
  if(++a.c>=5){a.blocked=now+300000;return "Compte bloqué 5 minutes";}
  return null;
};
const resetRate = (e) => { delete _att[e.toLowerCase().trim()]; };

// ═══════════════════════════════════════════════════════════════════════════════
// PUSH
// ═══════════════════════════════════════════════════════════════════════════════
const VAPID_PUB = "BAWcp-l7d4VWX-kAjiM0sMWLIwga-WN6Nl3vDROUxe15-_SJKG3Za9LR__x3tmWM4Uc9CoeeZvh1uc1dXXtJpGQ";
const urlB64 = (b) => { const p="=".repeat((4-b.length%4)%4),s=(b+p).replace(/-/g,"+").replace(/_/g,"/"); return Uint8Array.from([...window.atob(s)].map(c=>c.charCodeAt(0))); };
const registerPush = async (userId) => {
  try {
    if(!("Notification" in window)||!("serviceWorker" in navigator)) return false;
    const perm=Notification.permission==="granted"?"granted":await Notification.requestPermission();
    if(perm!=="granted") return false;
    const reg=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
    await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlB64(VAPID_PUB)});
    if(!sub||!userId) return false;
    await setDoc(doc(db,"restopro_push",userId),{sub:JSON.stringify(sub.toJSON()),updatedAt:new Date().toISOString()});
    return true;
  } catch(e){console.error("Push:",e);return false;}
};
const sendPush = async (userId,title,body) => {
  try {
    const snap=await getDoc(doc(db,"restopro_push",userId));
    if(!snap.exists()) return;
    await fetch("/api/send-push",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subscription:JSON.parse(snap.data().sub),title,body,tag:"notif",url:"/"})});
  } catch(e){console.warn("Push send:",e);}
};
const localNotif = (title,body) => { if(!("Notification" in window)||Notification.permission!=="granted") return; try{new Notification(title,{body,icon:"/logo192.png"});}catch{} };

// ═══════════════════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════════════════
const genId   = () => Math.random().toString(36).slice(2,10);
const genRef  = () => "REF-"+Math.random().toString(36).slice(2,7).toUpperCase();
const fmt     = (n) => Number(n).toFixed(2)+" €";
const fmtDate = (d) => new Date(d).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
const fmtDateOnly = (d) => new Date(d).toLocaleDateString("fr-FR",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});
const CAT_LABELS = {entree:"Entrées",plat:"Plats",dessert:"Desserts",boisson:"Boissons",menu:"Menus"};
const CAT_ICONS  = {entree:"🥗",plat:"🍽️",dessert:"🍮",boisson:"🥤",menu:"📋"};
const STATUS_CFG = {
  waiting:{label:"En attente",    color:"#f59e0b",icon:"⏳"},
  paid:   {label:"Payée",         color:"#3b82f6",icon:"💳"},
  prep:   {label:"En préparation",color:"#f97316",icon:"👨‍🍳"},
  ready:  {label:"Prête",         color:"#22c55e",icon:"✅"},
  done:   {label:"Terminée",      color:"#6b7280",icon:"⚫"},
};
const PAY_MODES = {cb:"💳 Carte bancaire",cash:"💵 Espèces",mixed:"💳+💵 Mixte",drive:"🚗 Drive"};
const STARS = [1,2,3,4,5];

// ═══════════════════════════════════════════════════════════════════════════════
// SEED DATA — pas de compte admin en dur
// ═══════════════════════════════════════════════════════════════════════════════
const SEED_MENU = [
  {id:"e1",cat:"entree", name:"Salade César",           desc:"Laitue, parmesan, croûtons",     price:8.50, points:8, available:true},
  {id:"e2",cat:"entree", name:"Soupe à l'oignon",       desc:"Gratinée au fromage",            price:7.00, points:7, available:true},
  {id:"p1",cat:"plat",   name:"Entrecôte grillée",      desc:"250g, frites maison, béarnaise", price:22.00,points:22,available:true},
  {id:"p2",cat:"plat",   name:"Saumon en croûte",       desc:"Épinards, crème citronnée",      price:19.50,points:19,available:true},
  {id:"p3",cat:"plat",   name:"Risotto aux champignons",desc:"Parmesan, truffe noire",         price:16.00,points:16,available:true},
  {id:"d1",cat:"dessert",name:"Crème brûlée",           desc:"Vanille Bourbon",                price:6.50, points:6, available:true},
  {id:"d2",cat:"dessert",name:"Fondant chocolat",       desc:"Coulant, glace vanille",         price:7.50, points:7, available:true},
  {id:"b1",cat:"boisson",name:"Eau minérale 50cl",      desc:"",                               price:3.00, points:3, available:true},
  {id:"b2",cat:"boisson",name:"Vin rouge maison",       desc:"Bordeaux AOP (verre)",           price:5.50, points:5, available:true},
  {id:"b3",cat:"boisson",name:"Jus de fruits",          desc:"Orange pressée",                 price:4.00, points:4, available:true},
  {id:"m1",cat:"menu",   name:"Menu Déjeuner",          desc:"Entrée + Plat + Boisson",        price:18.00,points:20,available:true},
];
const SEED_REWARDS  = [
  {id:"r1",name:"Dessert offert",       points:50, desc:"Un dessert au choix"},
  {id:"r2",name:"Plat offert",          points:100,desc:"Un plat principal au choix"},
  {id:"r3",name:"Repas complet offert", points:200,desc:"Entrée + Plat + Dessert"},
];
const SEED_SETTINGS = {
  pointsPerEuro:1,currency:"€",
  restaurantName:"RestoPro",address:"12 rue de la Gastronomie, 75001 Paris",
  phone:"01 23 45 67 89",email:"contact@restopro.fr",siret:"123 456 789 00012",
  hours:{
    lundi:"10:00-00:00",mardi:"10:00-00:00",mercredi:"10:00-00:00",
    jeudi:"10:00-00:00",vendredi:"10:00-00:00",
    samedi:"09:30-00:00",dimanche:"Fermé"
  },
  tableCount:10,tableCapacity:4,
  seoDescription:"Restaurant gastronomique au cœur de Paris. Menu fait maison, produits frais.",
  seoKeywords:"restaurant paris, cuisine française, réservation en ligne",
  googleMapsUrl:"",
};

// ═══════════════════════════════════════════════════════════════════════════════
// PRINT
// ═══════════════════════════════════════════════════════════════════════════════
const printTicket = (inv,settings,cashierName) => {
  const w=window.open("","_blank","width=400,height=700");
  const isCB=inv.payMode==="cb"||inv.payMode==="mixed";
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ticket</title>
  <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Courier New',monospace;font-size:12px;padding:16px;max-width:300px;margin:0 auto;}
  .center{text-align:center;}.bold{font-weight:bold;}.big{font-size:16px;}.sep{border:none;border-top:1px dashed #000;margin:8px 0;}
  .row{display:flex;justify-content:space-between;margin:3px 0;}.total{font-size:15px;font-weight:bold;border-top:2px solid #000;padding-top:6px;margin-top:4px;}
  .receipt{border:1px solid #000;padding:10px;margin-top:10px;font-size:11px;}.receipt-title{text-align:center;font-weight:bold;font-size:13px;margin-bottom:8px;border-bottom:1px solid #000;padding-bottom:6px;}
  @media print{body{padding:0;}}</style></head><body>
  <div class="center bold big">${settings.restaurantName||"RestoPro"}</div>
  <div class="center" style="font-size:10px;margin-top:4px;">${settings.address||""}</div>
  <div class="center" style="font-size:10px;">Tél : ${settings.phone||""}</div>
  ${settings.siret?`<div class="center" style="font-size:10px;">SIRET : ${settings.siret}</div>`:""}
  <hr class="sep"/>
  <div class="row"><span>Date :</span><span>${fmtDate(inv.paidAt)}</span></div>
  <div class="row"><span>Caissier :</span><span>${cashierName||"—"}</span></div>
  <div class="row"><span>Facture :</span><span>${inv.invoiceNum||'#'+inv.id.slice(0,8).toUpperCase()}</span></div>
  ${inv.clientName&&inv.clientName!=="Anonyme"?`<div class="row"><span>Client :</span><span>${inv.clientName}</span></div>`:""}
  ${inv.refNumber?`<div class="row"><span>Réf :</span><span>${inv.refNumber}</span></div>`:""}
  <div class="row"><span>Mode :</span><span>${inv.orderType==="surplace"?`Table ${inv.tableNumber}`:"À emporter"}</span></div>
  <hr class="sep"/>
  ${inv.items.map(it=>`<div class="row"><span>${it.qty}x ${it.name}</span><span>${fmt(it.price*it.qty)}</span></div>`).join("")}
  <hr class="sep"/>
  <div class="row total"><span>TOTAL</span><span>${fmt(inv.total)}</span></div>
  <div class="row" style="margin-top:6px;"><span>Règlement :</span><span>${PAY_MODES[inv.payMode]||"—"}</span></div>
  ${inv.rewardUsed?`<div class="row" style="color:#b45309;"><span>⭐ Récompense :</span><span>${inv.rewardUsed}</span></div>`:""}
  <hr class="sep"/>
  ${isCB?`<div class="receipt"><div class="receipt-title">REÇU DE PAIEMENT CB</div>
  <div class="row"><span>Commerçant :</span><span>${settings.restaurantName||"RestoPro"}</span></div>
  <div class="row"><span>Date :</span><span>${fmtDate(inv.paidAt)}</span></div>
  <div class="row"><span>Carte :</span><span>**** **** **** ${inv.cardLast4||"XXXX"}</span></div>
  <div class="row"><span>Type :</span><span>${inv.cardType||"VISA"}</span></div>
  <div class="row bold"><span>MONTANT :</span><span>${fmt(inv.total)}</span></div>
  <div class="center" style="margin-top:8px;font-size:10px;">TRANSACTION APPROUVÉE</div></div>`:""}
  <div class="center" style="margin-top:12px;font-size:11px;">Merci de votre visite !</div>
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
  const [messages,setMessages]       = useState([]);
  const [reviews,setReviews]         = useState([]);
  const [reservations,setReservations] = useState([]);
  const [currentUser,setCurrentUser] = useState(null);
  const [page,setPage]               = useState("login");
  const [toast,setToast]             = useState(null);
  const prevStatuses = useRef({});

  // ── Chargement initial ───────────────────────────────────────────────────────
  useEffect(()=>{
    (async()=>{
      const [u,m,o,r,s,inv,msg,rev,res]=await Promise.all([
        dbGet("users"),dbGet("menu"),dbGet("orders"),dbGet("rewards"),dbGet("settings"),
        dbGet("invoices"),dbGet("messages"),dbGet("reviews"),dbGet("reservations")
      ]);
      if(!m)  await dbSet("menu",SEED_MENU);
      if(!o)  await dbSet("orders",[]);
      if(!r)  await dbSet("rewards",SEED_REWARDS);
      if(!s)  await dbSet("settings",SEED_SETTINGS);
      if(!inv) await dbSet("invoices",[]);
      if(!msg) await dbSet("messages",[]);
      if(!rev) await dbSet("reviews",[]);
      if(!res) await dbSet("reservations",[]);
      const fu=u||[];
      setUsers(fu); setMenu(m||SEED_MENU); setOrders(o||[]); setRewards(r||SEED_REWARDS);
      setSettings(s||SEED_SETTINGS); setInvoices(inv||[]); setMessages(msg||[]);
      setReviews(rev||[]); setReservations(res||[]);
      const sess=lsGet("rm:sess");
      if(sess){const f=fu.find(x=>x.id===sess.id);if(f){setCurrentUser(f);setPage(f.role==="admin"?"admin-dash":f.role==="employee"?"emp-orders":"client-menu");}}
      setLoaded(true);
    })();
  },[]);

  // ── Temps réel Firebase ──────────────────────────────────────────────────────
  useEffect(()=>{
    const uns=[
      onSnapshot(doc(db,"restopro","orders"),      s=>{if(s.exists())setOrders(s.data().value||[]);}),
      onSnapshot(doc(db,"restopro","invoices"),    s=>{if(s.exists())setInvoices(s.data().value||[]);}),
      onSnapshot(doc(db,"restopro","users"),       s=>{if(s.exists())setUsers(s.data().value||[]);}),
      onSnapshot(doc(db,"restopro","menu"),        s=>{if(s.exists())setMenu(s.data().value||[]);}),
      onSnapshot(doc(db,"restopro","messages"),    s=>{if(s.exists())setMessages(s.data().value||[]);}),
      onSnapshot(doc(db,"restopro","reviews"),     s=>{if(s.exists())setReviews(s.data().value||[]);}),
      onSnapshot(doc(db,"restopro","reservations"),s=>{if(s.exists())setReservations(s.data().value||[]);}),
      onSnapshot(doc(db,"restopro","settings"),    s=>{if(s.exists())setSettings(s.data().value||SEED_SETTINGS);}),
    ];
    return ()=>uns.forEach(u=>u());
  },[]);

  // ── Push quand commande prête ────────────────────────────────────────────────
  useEffect(()=>{
    if(!currentUser||currentUser.role!=="client") return;
    orders.filter(o=>o.clientId===currentUser.id).forEach(order=>{
      const prev=prevStatuses.current[order.id];
      if(prev&&prev!==order.status&&order.status==="ready"){
        const title="🍽️ Votre commande est prête !";
        const body=order.orderType==="emporter"?"Veuillez la récupérer au comptoir 🥡":"Un employé arrive pour vous servir 🪑";
        localNotif(title,body);
      }
      prevStatuses.current[order.id]=order.status;
    });
  },[orders,currentUser]);

  // ── Sync currentUser avec users ──────────────────────────────────────────────
  useEffect(()=>{
    if(!currentUser) return;
    const fresh=users.find(u=>u.id===currentUser.id);
    if(fresh&&JSON.stringify(fresh)!==JSON.stringify(currentUser)) setCurrentUser(fresh);
  },[users]);

  const showToast=(msg,type="success")=>{setToast({msg,type});setTimeout(()=>setToast(null),3500);};

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const login=async(email,password,remember=false)=>{
    const err=rateLimit(email); if(err) return showToast(err,"error");
    const all=await dbGet("users")||[];
    const candidate=all.find(x=>x.email.toLowerCase().trim()===email.toLowerCase().trim());
    if(!candidate) return showToast("Identifiants incorrects","error");
    const ok=await checkPw(password,candidate.password);
    if(!ok) return showToast("Identifiants incorrects","error");
    resetRate(email);
    if(!candidate.password.startsWith("$2")){
      const hashed=await hashPw(password);
      await dbSet("users",all.map(x=>x.id===candidate.id?{...x,password:hashed}:x));
    }
    setCurrentUser(candidate);
    if(remember) lsSet("rm:sess",{id:candidate.id}); else lsDel("rm:sess");
    if(candidate.mustChangePassword){
      setPage("force-change-password");
    } else {
      setPage(candidate.role==="admin"?"admin-dash":candidate.role==="employee"?"emp-orders":"client-menu");
      showToast(`Bienvenue ${candidate.name} !`);
    }
    if(candidate.role==="client") registerPush(candidate.id);
  };
  const logout=()=>{setCurrentUser(null);setPage("login");lsDel("rm:sess");};

  // ── Commandes ─────────────────────────────────────────────────────────────────
  const placeOrder=async(items,orderType="surplace",tableNumber="",reward=null,clientOverride=null)=>{
    const freshOrders=await dbGet("orders")||[];
    const freshUsers=await dbGet("users")||[];
    const client=clientOverride||currentUser;
    const total=items.reduce((s,i)=>s+i.price*i.qty,0);
    const pointsEarned=reward?0:Math.floor(total*(settings.pointsPerEuro||1));
    const pointsDeducted=reward?reward.points:0;
    const order={
      id:genId(),clientId:client?.id||null,clientName:client?.name||"Anonyme",
      refNumber:client?.refNumber||null,items,total,pointsEarned,pointsDeducted,
      rewardUsed:reward?.name||null,status:"waiting",orderType,tableNumber,
      createdAt:new Date().toISOString(),
      cashierId:currentUser?.id||null,cashierName:currentUser?.name||null,
    };
    const newOrders=[...freshOrders,order];
    await dbSet("orders",newOrders);
    if(client?.id&&pointsEarned>0){
      const newPts=Math.max(0,(client.points||0)+pointsEarned-pointsDeducted);
      const nu=freshUsers.map(u=>u.id===client.id?{...u,points:newPts}:u);
      await dbSet("users",nu);
    }
    return order;
  };

  const genInvoiceNum=(payMode)=>{
    const prefix=payMode==="cash"?"ESP":payMode==="cb"?"CB":"MIX";
    const num=Math.floor(Math.random()*900000)+100000;
    return `${prefix}${num}`;
  };
  const payOrder=async(order,payMode="cb",cardLast4="",cardType="VISA")=>{
    if(!order) return;
    const freshInv=await dbGet("invoices")||[];
    const freshOrd=await dbGet("orders")||[];
    const freshUsers=await dbGet("users")||[];
    const client=freshUsers.find(u=>u.id===order.clientId);
    const invoice={
      id:genId(),invoiceNum:genInvoiceNum(payMode),
      orderId:order.id,clientId:order.clientId,clientName:order.clientName||"Anonyme",
      refNumber:client?.refNumber||null,items:order.items,total:order.total,
      paidAt:new Date().toISOString(),orderType:order.orderType,tableNumber:order.tableNumber,
      rewardUsed:order.rewardUsed||null,payMode,cardLast4,cardType,
      cashierId:order.cashierId||currentUser?.id,cashierName:order.cashierName||currentUser?.name,
    };
    await dbSet("invoices",[...freshInv,invoice]);
    await dbSet("orders",freshOrd.map(o=>o.id===order.id?{...o,status:"paid"}:o));
    return invoice;
  };

  const updateOrderStatus=async(orderId,status)=>{
    const freshOrd=await dbGet("orders")||[];
    const order=freshOrd.find(o=>o.id===orderId);
    const newOrd=status==="done"?freshOrd.filter(o=>o.id!==orderId):freshOrd.map(o=>o.id===orderId?{...o,status}:o);
    await dbSet("orders",newOrd);
    showToast("Statut mis à jour");
    if(status==="ready"&&order?.clientId){
      const title="🍽️ Votre commande est prête !";
      const body=order.orderType==="emporter"?"Veuillez la récupérer au comptoir 🥡":"Un employé arrive pour vous servir 🪑";
      await sendPush(order.clientId,title,body);
      localNotif(title,body);
    }
  };

  const updateMenu        = async(v)=>{setMenu(v);await dbSet("menu",v);};
  const updateRewards     = async(v)=>{setRewards(v);await dbSet("rewards",v);};
  const updateSettings    = async(v)=>{setSettings(v);await dbSet("settings",v);};
  const updateUsers       = async(v)=>{setUsers(v);await dbSet("users",v);};
  const updateMessages    = async(v)=>{setMessages(v);await dbSet("messages",v);};
  const updateReviews     = async(v)=>{setReviews(v);await dbSet("reviews",v);};
  const updateReservations= async(v)=>{setReservations(v);await dbSet("reservations",v);};

  if(!loaded) return (<div style={S.loading}>{CSS_TAG}<div style={S.spinner}/><div style={{color:"#9ca3af",marginTop:16,fontSize:14}}>Chargement…</div></div>);

  const ctx={users,menu,orders,rewards,settings,invoices,messages,reviews,reservations,
    currentUser,setCurrentUser,page,setPage,login,logout,placeOrder,payOrder,
    updateOrderStatus,updateMenu,updateRewards,updateSettings,updateUsers,
    updateMessages,updateReviews,updateReservations,showToast};

  return (
    <div style={S.app}>
      {CSS_TAG}
      {toast&&<div style={{...S.toast,background:toast.type==="error"?"#dc2626":"#166534"}}>{toast.msg}</div>}
      {!currentUser&&page==="login"    && <LoginPage    {...ctx}/>}
      {!currentUser&&page==="register" && <RegisterPage {...ctx}/>}
      {currentUser&&page==="force-change-password" && <ForceChangePassword {...ctx}/>}
      {currentUser?.role==="admin"     && page!=="force-change-password" && <AdminLayout    {...ctx}/>}
      {currentUser?.role==="employee"  && page!=="force-change-password" && <EmployeeLayout {...ctx}/>}
      {currentUser?.role==="client"    && page!=="force-change-password" && <ClientLayout   {...ctx}/>}
      {!currentUser&&page!=="login"&&page!=="register" && <Page404 setPage={setPage}/>}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════
function ForceChangePassword({currentUser,updateUsers,users,setCurrentUser,setPage,showToast,logout}) {
  const [pwNew,setPwNew]=useState("");
  const [pwConf,setPwConf]=useState("");
  const [loading,setLoading]=useState(false);

  const save=async()=>{
    if(!pwNew||!pwConf) return showToast("Remplissez les deux champs","error");
    if(pwNew.length<6) return showToast("Minimum 6 caractères","error");
    if(pwNew!==pwConf) return showToast("Les mots de passe ne correspondent pas","error");
    setLoading(true);
    const fresh=await dbGet("users")||[];
    const hashed=await hashPw(pwNew);
    const updated={...currentUser,password:hashed,mustChangePassword:false};
    await updateUsers(fresh.map(u=>u.id===currentUser.id?updated:u));
    setCurrentUser(updated);
    setPage(currentUser.role==="admin"?"admin-dash":currentUser.role==="employee"?"emp-orders":"client-menu");
    setLoading(false);
    showToast("Mot de passe mis à jour ! Bienvenue 🎉");
  };

  return (
    <div style={S.authPage}>
      <div style={{...S.authCard,maxWidth:440}} className="auth-card-mobile">
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:48,marginBottom:8}}>🔑</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:22,color:"#d4a853",marginBottom:6}}>Bienvenue, {currentUser.name} !</div>
          <p style={{fontSize:14,color:"#9ca3af",lineHeight:1.6}}>
            Votre compte a été créé par notre équipe.<br/>
            Pour votre sécurité, choisissez un nouveau mot de passe avant de continuer.
          </p>
        </div>
        <div style={{background:"#1c1a00",border:"1px solid #d4a853",borderRadius:10,padding:12,marginBottom:20,fontSize:13,color:"#fde68a",lineHeight:1.6}}>
          🔒 Cette étape est obligatoire. Votre mot de passe temporaire ne fonctionnera plus après ce changement.
        </div>
        <label style={S.label}>Nouveau mot de passe</label>
        <input style={S.input} type="password" placeholder="Minimum 6 caractères" value={pwNew} onChange={e=>setPwNew(e.target.value)} autoFocus/>
        <label style={S.label}>Confirmer le mot de passe</label>
        <input style={{...S.input,marginBottom:10}} type="password" placeholder="Répétez votre mot de passe" value={pwConf} onChange={e=>setPwConf(e.target.value)} onKeyDown={e=>e.key==="Enter"&&save()}/>
        {pwNew&&pwConf&&(
          <div style={{marginBottom:12,fontSize:13}}>
            {pwNew===pwConf
              ?<span style={{color:"#22c55e"}}>✅ Les mots de passe correspondent</span>
              :<span style={{color:"#ef4444"}}>❌ Ne correspondent pas</span>}
          </div>
        )}
        <button style={{...S.btn,opacity:loading?0.6:1,marginBottom:10}} onClick={save} disabled={loading}>
          {loading?"⏳ Enregistrement…":"✅ Définir mon mot de passe"}
        </button>
        <button style={{...S.btnOutline,fontSize:13,padding:"10px"}} onClick={logout}>Se déconnecter</button>
      </div>
    </div>
  );
}

function Page404({setPage}) {
  return (
    <div style={{...S.authPage,flexDirection:"column",gap:0}}>
      <div style={{textAlign:"center",maxWidth:480,padding:24}}>
        <div style={{fontSize:80,marginBottom:8,filter:"grayscale(0.3)"}}>🍽️</div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:80,fontWeight:800,color:"#d4a853",lineHeight:1,marginBottom:8}}>404</div>
        <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:24,color:"#f3f4f6",marginBottom:12}}>Table introuvable !</h1>
        <p style={{fontSize:15,color:"#9ca3af",lineHeight:1.7,marginBottom:28}}>
          Cette page n'existe pas, comme ce plat qui n'est plus à la carte.<br/>
          Retournez à l'accueil pour trouver votre bonheur.
        </p>
        <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
          <button style={{...S.btn,width:"auto",padding:"13px 28px",fontSize:15}} onClick={()=>setPage("login")}>🏠 Retour à l'accueil</button>
        </div>
        <div style={{marginTop:32,padding:20,background:"#161b22",borderRadius:12,border:"1px solid #30363d"}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:16,color:"#d4a853",marginBottom:8}}>Notre menu du jour</div>
          <div style={{fontSize:13,color:"#6b7280",lineHeight:1.8}}>
            🥗 Salade de liens brisés<br/>
            🍝 Spaghetti aux erreurs 404<br/>
            🍮 Crème brûlée aux pixels perdus
          </div>
        </div>
      </div>
    </div>
  );
}

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

function RegisterPage({setPage,updateUsers,showToast}) {
  const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [pw,setPw]=useState(""); const [conf,setConf]=useState(""); const [loading,setLoading]=useState(false);
  const go=async()=>{
    if(!name.trim()||!email.trim()||!pw||!conf) return showToast("Remplissez tous les champs","error");
    if(pw.length<6) return showToast("Mot de passe minimum 6 caractères","error");
    if(pw!==conf) return showToast("Les mots de passe ne correspondent pas","error");
    setLoading(true);
    const existing=await dbGet("users")||[];
    if(existing.find(u=>u.email.toLowerCase()===email.toLowerCase())){setLoading(false);return showToast("Email déjà utilisé","error");}
    const hashed=await hashPw(pw);
    await updateUsers([...existing,{id:genId(),role:"client",name:name.trim(),email:email.trim(),password:hashed,points:0,refNumber:genRef(),createdAt:new Date().toISOString()}]);
    setLoading(false); showToast("Compte créé ! Connectez-vous ✅"); setPage("login");
  };
  return (
    <div style={S.authPage}>{CSS_TAG}
      <div style={S.authCard} className="auth-card-mobile">
        <div style={S.logo}>🍽️ RestoPro</div>
        <h2 style={S.authTitle}>Créer un compte</h2>
        <label style={S.label}>Nom complet</label><input style={S.input} placeholder="Jean Dupont" value={name} onChange={e=>setName(e.target.value)}/>
        <label style={S.label}>Email</label><input style={S.input} placeholder="votre@email.com" value={email} onChange={e=>setEmail(e.target.value)} type="email"/>
        <label style={S.label}>Mot de passe</label><input style={S.input} placeholder="Minimum 6 caractères" value={pw} onChange={e=>setPw(e.target.value)} type="password"/>
        <label style={S.label}>Confirmer</label><input style={{...S.input,marginBottom:12}} placeholder="••••••••" value={conf} onChange={e=>setConf(e.target.value)} type="password"/>
        {pw&&conf&&<div style={{marginBottom:12,fontSize:12}}>{pw===conf?<span style={{color:"#22c55e"}}>✅ Correspondent</span>:<span style={{color:"#ef4444"}}>❌ Ne correspondent pas</span>}</div>}
        <button style={{...S.btn,opacity:loading?0.6:1}} onClick={go} disabled={loading}>{loading?"⏳…":"Créer mon compte"}</button>
        <p style={S.authLink}>Déjà un compte ? <span style={S.link} onClick={()=>setPage("login")}>Se connecter</span></p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LAYOUTS
// ═══════════════════════════════════════════════════════════════════════════════
function Layout({ctx,tabs,role,children}) {
  const {logout,page,setPage,orders,messages,currentUser}=ctx;
  const {isMobile,isTablet}=useBreakpoint();
  const [drawerOpen,setDrawerOpen]=useState(false);
  const activeOrders=orders.filter(o=>o.status!=="done").length;
  const unreadMsg=messages.filter(m=>role==="admin"?!m.readByAdmin:!m.readByClient&&m.clientId===currentUser?.id).length;

  const badgeFor=(id)=>{
    if((id==="admin-orders"||id==="emp-orders")&&activeOrders>0) return activeOrders;
    if((id==="admin-messages"||id==="emp-messages")&&unreadMsg>0) return unreadMsg;
    if(id==="client-messages"&&unreadMsg>0) return unreadMsg;
    return 0;
  };

  if(isMobile) return (
    <div style={{...S.app,height:"100dvh",display:"flex",flexDirection:"column",position:"relative"}}>
      {/* Header mobile */}
      <div style={{background:"#161b22",borderBottom:"1px solid #30363d",padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0,position:"relative",zIndex:200}}>
        <button style={{background:"none",border:"none",cursor:"pointer",padding:"6px",display:"flex",flexDirection:"column",gap:5,WebkitTapHighlightColor:"transparent",position:"relative"}} onClick={()=>setDrawerOpen(true)}>
          <span style={{display:"block",width:24,height:2,background:"#d4a853",borderRadius:2}}/>
          <span style={{display:"block",width:24,height:2,background:"#d4a853",borderRadius:2}}/>
          <span style={{display:"block",width:24,height:2,background:"#d4a853",borderRadius:2}}/>
          {(activeOrders>0||unreadMsg>0)&&<span style={{position:"absolute",top:4,right:2,background:"#ef4444",width:8,height:8,borderRadius:"50%",display:"block"}}/>}
        </button>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:17,color:"#d4a853"}}>🍽️ RestoPro</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {role==="client"&&<span style={{fontSize:12,color:"#d4a853",fontWeight:700}}>⭐ {currentUser?.points||0}</span>}
          <button style={{background:"#7f1d1d",color:"#fca5a5",border:"1px solid #991b1b",borderRadius:6,padding:"6px 12px",cursor:"pointer",fontSize:12,fontWeight:700}} onClick={logout}>🚪</button>
        </div>
      </div>
      {role==="client"&&"Notification" in window&&Notification.permission==="default"&&(
        <div style={{background:"#1c1a00",borderBottom:"1px solid #d4a853",padding:"6px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexShrink:0}}>
          <span style={{fontSize:11,color:"#fde68a"}}>🔔 Activez les notifications</span>
          <button style={{...S.btnSm,background:"#d4a853",color:"#0d1117",border:"none",fontWeight:700,fontSize:11}} onClick={()=>registerPush(currentUser.id)}>Activer</button>
        </div>
      )}
      {/* Contenu */}
      <div style={{flex:1,overflowY:"auto"}}>{children}</div>
      {/* Overlay */}
      {drawerOpen&&<div style={{position:"fixed",inset:0,zIndex:9998,background:"rgba(0,0,0,0.65)"}} onClick={()=>setDrawerOpen(false)}/>}
      {/* Drawer */}
      <div style={{position:"fixed",top:0,left:0,bottom:0,width:280,background:"#161b22",borderRight:"1px solid #30363d",zIndex:9999,transform:drawerOpen?"translateX(0)":"translateX(-100%)",transition:"transform .25s ease",display:"flex",flexDirection:"column",paddingBottom:"env(safe-area-inset-bottom)"}}>
        <div style={{padding:"16px 20px",borderBottom:"1px solid #30363d",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,color:"#d4a853"}}>🍽️ RestoPro</div>
            <div style={{fontSize:12,color:role==="admin"?"#d4a853":role==="employee"?"#9ca3af":"#9ca3af",marginTop:3,fontWeight:600}}>
              {role==="admin"?"👑 Patron":role==="employee"?"👨‍🍳 Employé":"👤 "+currentUser?.name}
            </div>
            {role==="client"&&currentUser?.refNumber&&<div style={{fontSize:11,color:"#d4a853",marginTop:2,fontWeight:700,letterSpacing:1}}>{currentUser.refNumber}</div>}
            {role==="client"&&<div style={{fontSize:11,color:"#9ca3af",marginTop:1}}>⭐ {currentUser?.points||0} points</div>}
          </div>
          <button style={{background:"none",border:"none",color:"#9ca3af",fontSize:24,cursor:"pointer",padding:"4px",lineHeight:1}} onClick={()=>setDrawerOpen(false)}>✕</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"6px 0"}}>
          {tabs.map(t=>{const b=badgeFor(t.id);const active=page===t.id;return(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 20px",cursor:"pointer",background:active?"#1f2937":"transparent",color:active?"#d4a853":"#d1d5db",borderLeft:active?"3px solid #d4a853":"3px solid transparent",transition:"all .15s",WebkitTapHighlightColor:"transparent"}} onClick={()=>{setPage(t.id);setDrawerOpen(false);}}>
              <span style={{fontSize:20,flexShrink:0}}>{t.icon}</span>
              <span style={{fontSize:15,fontWeight:active?700:400,flex:1}}>{t.label}</span>
              {b>0&&<span style={{background:"#d4a853",color:"#0d1117",borderRadius:10,padding:"1px 7px",fontSize:11,fontWeight:800,minWidth:20,textAlign:"center"}}>{b}</span>}
            </div>
          );})}
        </div>
        <div style={{padding:"12px 16px",borderTop:"1px solid #30363d",flexShrink:0}}>
          {role==="client"&&"Notification" in window&&Notification.permission==="default"&&(
            <button style={{...S.btnSm,width:"100%",marginBottom:10,background:"#d4a853",color:"#0d1117",border:"none",fontWeight:700,padding:"10px"}} onClick={()=>{registerPush(currentUser.id);setDrawerOpen(false);}}>🔔 Activer les notifications</button>
          )}
          <button style={{...S.btn,background:"#7f1d1d",color:"#fca5a5",border:"1px solid #991b1b",display:"flex",alignItems:"center",justifyContent:"center",gap:8}} onClick={logout}>🚪 Se déconnecter</button>
        </div>
      </div>
    </div>
  );
  return (
    <div style={S.layout} className="sidebar-desktop">
      <div style={S.sidebar}>
        <div style={S.sidebarLogo}><span className="sidebar-logo-text">🍽️ RestoPro</span></div>
        <div style={S.sidebarRole}><span className="sidebar-role-text">{role==="admin"?"👑 Patron":role==="employee"?"👨‍🍳 Employé":"👤 Client"}</span></div>
        {role==="client"&&!isTablet&&<div style={{padding:"4px 20px 8px",fontSize:13,color:"#d4a853"}}>⭐ {currentUser?.points||0} pts · <span style={{fontSize:11,color:"#9ca3af"}}>{currentUser?.refNumber}</span></div>}
        {tabs.map(t=>{const b=badgeFor(t.id);return(
          <div key={t.id} style={{...S.navItem,...(page===t.id?S.navActive:{})}} className="nav-item-tablet" onClick={()=>setPage(t.id)}>
            <span style={{fontSize:18}}>{t.icon}</span>
            <span className="sidebar-label" style={{display:isTablet?"none":"inline"}}>{t.label}</span>
            {b>0&&<span style={S.badge}>{b}</span>}
          </div>
        );})}
        <div style={{marginTop:"auto",padding:"12px 16px"}}>
          {role==="client"&&!isTablet&&"Notification" in window&&Notification.permission==="default"&&(
            <button style={{...S.btnSm,width:"100%",marginBottom:8,background:"#d4a853",color:"#0d1117",border:"none",fontWeight:700}} onClick={()=>registerPush(currentUser.id)}>🔔 Activer notifs</button>
          )}
          <button style={{...S.btnOutline,padding:"10px 12px",fontSize:13,width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:6}} onClick={logout}>
            <span>🚪</span><span className="sidebar-label" style={{display:isTablet?"none":"inline"}}>Déconnexion</span>
          </button>
        </div>
      </div>
      <div style={S.main}>{children}</div>
    </div>
  );
}

function AdminLayout(ctx) {
  const {page}=ctx;
  const tabs=[
    {id:"admin-dash",    icon:"📊",label:"Tableau de bord",short:"Dash"},
    {id:"admin-orders",  icon:"📋",label:"Commandes",short:"Cmdes"},
    {id:"admin-products",icon:"🍽️",label:"Produits",short:"Menu"},
    {id:"admin-clients", icon:"👥",label:"Clients",short:"Clients"},
    {id:"admin-cashier", icon:"🧾",label:"Encaissement",short:"Caisse"},
    {id:"admin-messages",icon:"💬",label:"Messagerie",short:"Msgs"},
    {id:"admin-reservations",icon:"📅",label:"Réservations",short:"Résa"},
    {id:"admin-loyalty", icon:"⭐",label:"Fidélité",short:"Fidé"},
    {id:"admin-settings",icon:"⚙️",label:"Paramètres",short:"Params"},
    {id:"admin-reviews", icon:"⭐",label:"Avis",short:"Avis"},
  ];
  return (
    <Layout ctx={ctx} tabs={tabs} role="admin">
      {page==="admin-dash"         && <AdminDash        {...ctx}/>}
      {page==="admin-orders"       && <OrdersView       {...ctx} role="admin"/>}
      {page==="admin-products"     && <AdminProducts    {...ctx}/>}
      {page==="admin-clients"      && <AdminClients     {...ctx}/>}
      {page==="admin-cashier"      && <CashierPage      {...ctx}/>}
      {page==="admin-messages"     && <MessagesPage     {...ctx} role="admin"/>}
      {page==="admin-reservations" && <ReservationsAdmin {...ctx}/>}
      {page==="admin-loyalty"      && <AdminLoyalty     {...ctx}/>}
      {page==="admin-settings"     && <AdminSettings    {...ctx}/>}
      {page==="admin-reviews"      && <ReviewsPage      {...ctx}/>}
    </Layout>
  );
}

function EmployeeLayout(ctx) {
  const {page}=ctx;
  const tabs=[
    {id:"emp-orders",       icon:"📋",label:"Commandes"},
    {id:"emp-cashier",      icon:"🧾",label:"Encaissement"},
    {id:"emp-reservations", icon:"📅",label:"Réservations"},
    {id:"emp-clients",      icon:"👥",label:"Clients"},
    {id:"emp-messages",     icon:"💬",label:"Messagerie"},
    {id:"emp-reviews",      icon:"⭐",label:"Avis"},
    {id:"emp-settings",     icon:"⚙️",label:"Compte"},
  ];
  return (
    <Layout ctx={ctx} tabs={tabs} role="employee">
      {page==="emp-orders"       && <OrdersView       {...ctx} role="employee"/>}
      {page==="emp-cashier"      && <CashierPage      {...ctx}/>}
      {page==="emp-reservations" && <ReservationsAdmin {...ctx}/>}
      {page==="emp-clients"      && <EmpClients        {...ctx}/>}
      {page==="emp-messages"     && <MessagesPage      {...ctx} role="admin"/>}
      {page==="emp-reviews"      && <ReviewsPage       {...ctx}/>}
      {page==="emp-settings"     && <div style={S.page}><h1 style={S.pageTitle}>⚙️ Mon compte</h1><UserSettings {...ctx}/></div>}
    </Layout>
  );
}

function ClientLayout(ctx) {
  const {page,currentUser}=ctx;
  const tabs=[
    {id:"client-menu",        icon:"🍽️",label:"Menu",short:"Menu"},
    {id:"client-orders",      icon:"📋",label:"Commandes",short:"Cmdes"},
    {id:"client-history",     icon:"🧾",label:"Historique",short:"Histo"},
    {id:"client-loyalty",     icon:"⭐",label:"Fidélité",short:"Fidé"},
    {id:"client-reservations",icon:"📅",label:"Réserver",short:"Résa"},
    {id:"client-messages",    icon:"💬",label:"Messages",short:"Msgs"},
    {id:"client-contact",     icon:"📍",label:"Contact",short:"Contact"},
    {id:"client-chatbot",     icon:"🤖",label:"Assistant",short:"Bot"},
    {id:"client-settings",    icon:"⚙️",label:"Compte",short:"Compte"},
    {id:"client-reviews",     icon:"⭐",label:"Avis",short:"Avis"},
  ];
  const [cart,setCart]=useState([]);
  return (
    <Layout ctx={ctx} tabs={tabs} role="client">
      {page==="client-menu"         && <ClientMenu        {...ctx} cart={cart} setCart={setCart}/>}
      {page==="client-orders"       && <ClientOrders      {...ctx}/>}
      {page==="client-history"      && <ClientHistory     {...ctx}/>}
      {page==="client-loyalty"      && <ClientLoyalty     {...ctx}/>}
      {page==="client-reservations" && <ReservationsClient {...ctx}/>}
      {page==="client-messages"     && <MessagesPage      {...ctx} role="client"/>}
      {page==="client-contact"      && <ContactPage       {...ctx}/>}
      {page==="client-chatbot"      && <ChatbotPage       {...ctx}/>}
      {page==="client-settings"     && <div style={S.page}><h1 style={S.pageTitle}>⚙️ Mon compte</h1><UserSettings {...ctx}/></div>}
      {page==="client-reviews"      && <ReviewsPage       {...ctx}/>}
    </Layout>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN DASH
// ═══════════════════════════════════════════════════════════════════════════════
function StatCard({icon,label,value,color="#d4a853"}){
  return <div style={S.statCard}><div style={{fontSize:24,marginBottom:6}}>{icon}</div><div style={{fontSize:20,fontWeight:700,color,marginBottom:4}}>{value}</div><div style={{fontSize:12,color:"#9ca3af"}}>{label}</div></div>;
}
function AdminDash({orders,invoices,users,menu,reservations,setPage}) {
  const active=orders.filter(o=>o.status!=="done").length;
  const today=new Date().toDateString();
  const caDay=invoices.filter(i=>new Date(i.paidAt).toDateString()===today).reduce((s,i)=>s+i.total,0);
  const caMon=invoices.filter(i=>{const d=new Date(i.paidAt),n=new Date();return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear();}).reduce((s,i)=>s+i.total,0);
  const todayRes=reservations.filter(r=>new Date(r.date).toDateString()===today).length;
  const sales={};
  invoices.forEach(inv=>inv.items.forEach(it=>{sales[it.name]=(sales[it.name]||0)+it.qty;}));
  const top=Object.entries(sales).sort((a,b)=>b[1]-a[1]).slice(0,5);
  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>📊 Tableau de bord</h1>
      <div style={S.statsGrid} className="stats-grid-mobile">
        <StatCard icon="📋" label="Commandes actives" value={active} color="#f59e0b"/>
        <StatCard icon="💰" label="CA aujourd'hui" value={fmt(caDay)} color="#22c55e"/>
        <StatCard icon="📅" label="CA ce mois" value={fmt(caMon)} color="#3b82f6"/>
        <StatCard icon="👥" label="Clients" value={users.filter(u=>u.role==="client").length} color="#a78bfa"/>
        <StatCard icon="📅" label="Résa aujourd'hui" value={todayRes} color="#f97316"/>
        <StatCard icon="🧾" label="Factures total" value={invoices.length} color="#d4a853"/>
      </div>
      {top.length>0&&<div style={S.card}><h3 style={S.cardTitle}>🏆 Top ventes</h3>
        {top.map(([name,qty],i)=>(
          <div key={name} style={S.row}><div style={{display:"flex",gap:10,alignItems:"center"}}><span style={{fontWeight:700,color:"#d4a853",width:20}}>#{i+1}</span><span>{name}</span></div><span style={{color:"#9ca3af",fontSize:13}}>{qty} vendus</span></div>
        ))}
      </div>}
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <button style={{...S.btn,width:"auto"}} onClick={()=>setPage("admin-orders")}>📋 Commandes</button>
        <button style={{...S.btnOutline,width:"auto"}} onClick={()=>setPage("admin-cashier")}>🧾 Encaissement</button>
        <button style={{...S.btnOutline,width:"auto"}} onClick={()=>setPage("admin-reservations")}>📅 Réservations</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORDERS VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function OrdersView({orders,invoices,updateOrderStatus,users,settings,currentUser,showToast,role}) {
  const [view,setView]=useState("kanban");
  const [expanded,setExpanded]=useState(null);
  const active=orders.filter(o=>o.status!=="done");
  const cols=["waiting","paid","prep","ready"];
  const statuses=["waiting","paid","prep","ready","done"];
  const handlePrint=(inv)=>{ const c=users.find(u=>u.id===inv.cashierId); printTicket(inv,settings,c?c.name:inv.cashierName||currentUser.name); };
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
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:12}}>
          {cols.map(st=>(
            <div key={st} style={{background:"#161b22",border:`1px solid ${STATUS_CFG[st].color}33`,borderRadius:12,padding:12,minHeight:160}}>
              <div style={{fontWeight:700,color:STATUS_CFG[st].color,marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span>{STATUS_CFG[st].icon} {STATUS_CFG[st].label}</span>
                <span style={{background:STATUS_CFG[st].color,color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:11}}>{active.filter(o=>o.status===st).length}</span>
              </div>
              {active.filter(o=>o.status===st).map(order=>(
                <div key={order.id} style={{background:"#0d1117",border:"1px solid #30363d",borderRadius:10,padding:10,marginBottom:8,fontSize:12}}>
                  <div style={{fontWeight:700,marginBottom:2}}>{order.clientName}</div>
                  {order.refNumber&&<div style={{fontSize:10,color:"#d4a853",marginBottom:3}}>{order.refNumber}</div>}
                  <div style={{color:"#9ca3af",fontSize:11,marginBottom:3}}>{order.orderType==="surplace"?`🪑 Table ${order.tableNumber}`:"🥡 À emporter"}</div>
                  <div style={{color:"#d4a853",fontWeight:700,marginBottom:8}}>{fmt(order.total)}</div>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    {statuses.filter(s=>s!==order.status).map(s=>(
                      <button key={s} style={{...S.btnSm,fontSize:10,padding:"3px 7px"}} onClick={()=>updateOrderStatus(order.id,s)}>{STATUS_CFG[s].icon} {STATUS_CFG[s].label}</button>
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
                  <div style={{fontSize:12,color:"#9ca3af"}}>{fmtDate(inv.paidAt)}</div>
                  <div style={{fontSize:12,color:"#9ca3af"}}>{inv.orderType==="surplace"?`🪑 Table ${inv.tableNumber}`:"🥡 À emporter"} · {PAY_MODES[inv.payMode]||"—"}</div>
                  {inv.cashierName&&<div style={{fontSize:11,color:"#6b7280"}}>Caissier : {inv.cashierName}</div>}
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <span style={{color:"#d4a853",fontWeight:700,fontSize:18}}>{fmt(inv.total)}</span>
                  <button style={S.btnSm} onClick={()=>setExpanded(expanded===inv.id?null:inv.id)}>🔍</button>
                  <button style={{...S.btnSm,background:"#1a3a1a",color:"#86efac",borderColor:"#166534"}} onClick={()=>handlePrint(inv)}>🖨️</button>
                </div>
              </div>
              {expanded===inv.id&&<div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #30363d"}}>
                {inv.items.map((it,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}><span>{it.qty}× {it.name}</span><span style={{color:"#d4a853"}}>{fmt(it.price*it.qty)}</span></div>)}
                {inv.rewardUsed&&<div style={{fontSize:12,color:"#d4a853",marginTop:4}}>⭐ {inv.rewardUsed}</div>}
              </div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// CAISSE
// ═══════════════════════════════════════════════════════════════════════════════
function CashierPage({menu,users,placeOrder,payOrder,invoices,settings,currentUser,showToast}) {
  const cats=["entree","plat","dessert","boisson","menu"];
  const [activeTab,setActiveTab]=useState("plat");
  const [cart,setCart]=useState([]);
  const [orderType,setOrderType]=useState("surplace");
  const [tableNum,setTableNum]=useState("");
  const [payMode,setPayMode]=useState("cb");
  const [cardLast4,setCardLast4]=useState("");
  const [cardType,setCardType]=useState("VISA");
  const [selectedClient,setSelectedClient]=useState(null);
  const [clientSearch,setClientSearch]=useState("");
  const [lastInvoice,setLastInvoice]=useState(null);
  const [step,setStep]=useState("order");
  const {isMobile}=useBreakpoint();
  const clients=users.filter(u=>u.role==="client");
  const filtered=clientSearch.trim()===""?[]:clients.filter(c=>c.name.toLowerCase().includes(clientSearch.toLowerCase())||(c.refNumber&&c.refNumber.toLowerCase().includes(clientSearch.toLowerCase())));
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0);
  const addToCart=(item)=>setCart(prev=>{const ex=prev.find(x=>x.id===item.id);return ex?prev.map(x=>x.id===item.id?{...x,qty:x.qty+1}:x):[...prev,{...item,qty:1,cartKey:genId()}];});
  const removeFromCart=(id)=>setCart(prev=>{const ex=prev.find(x=>x.id===id);return(ex&&ex.qty>1)?prev.map(x=>x.id===id?{...x,qty:x.qty-1}:x):prev.filter(x=>x.id!==id);});
  const reset=()=>{setCart([]);setOrderType("surplace");setTableNum("");setPayMode("cb");setCardLast4("");setCardType("VISA");setStep("order");setSelectedClient(null);setClientSearch("");setLastInvoice(null);};

  const confirm=async()=>{
    if(!cart.length) return showToast("Panier vide","error");
    if(orderType==="surplace"&&!tableNum.trim()) return showToast("N° de table requis","error");
    if((payMode==="cb"||payMode==="mixed")&&!cardLast4.trim()) return showToast("4 derniers chiffres requis","error");
    const order=await placeOrder(cart,orderType,tableNum,null,selectedClient);
    const inv=await payOrder({...order,cashierId:currentUser.id,cashierName:currentUser.name},payMode,cardLast4,cardType);
    const freshInv=await dbGet("invoices")||[];
    setLastInvoice(freshInv[freshInv.length-1]||inv);
    setStep("done"); showToast("Commande encaissée ✅");
  };

  if(step==="done"&&lastInvoice) return (
    <div style={S.page}>
      <div style={{...S.card,textAlign:"center",padding:32}}>
        <div style={{fontSize:48,marginBottom:12}}>✅</div>
        <h2 style={S.cardTitle}>Commande encaissée !</h2>
        <div style={{fontSize:28,fontWeight:700,color:"#d4a853",marginBottom:8}}>{fmt(total)}</div>
        <div style={{fontSize:13,color:"#9ca3af",marginBottom:4}}>{PAY_MODES[payMode]}</div>
        {selectedClient&&<div style={{fontSize:13,color:"#d4a853",marginBottom:4}}>{selectedClient.name} · {selectedClient.refNumber}</div>}
        {!selectedClient&&<div style={{fontSize:13,color:"#6b7280",marginBottom:4}}>Client anonyme</div>}
        <div style={{display:"flex",gap:10,justifyContent:"center",marginTop:20,flexWrap:"wrap"}}>
          <button style={{...S.btn,width:"auto"}} onClick={()=>{const c=users.find(u=>u.id===lastInvoice?.cashierId);printTicket(lastInvoice,settings,c?c.name:currentUser.name);}}>🖨️ Ticket</button>
          <button style={{...S.btnOutline,width:"auto"}} onClick={reset}>➕ Nouvelle commande</button>
        </div>
      </div>
    </div>
  );

  const items=menu.filter(m=>m.cat===activeTab&&m.available);
  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>🧾 Encaissement</h1>
      <div style={S.tabBar}>{cats.map(c=><div key={c} style={{...S.tab,...(activeTab===c?S.tabActive:{})}} onClick={()=>setActiveTab(c)}>{CAT_ICONS[c]} {CAT_LABELS[c]}</div>)}</div>
      <div style={{display:"flex",gap:16,flexWrap:isMobile?"wrap":"nowrap"}}>
        <div style={{flex:2,minWidth:0}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10}}>
            {items.map(item=>{const inCart=cart.find(x=>x.id===item.id);return(
              <div key={item.id} style={{...S.menuCard,cursor:"pointer",border:`1px solid ${inCart?"#d4a853":"#30363d"}`,position:"relative"}} onClick={()=>addToCart(item)}>
                {inCart&&<div style={{position:"absolute",top:8,right:8,background:"#d4a853",color:"#0d1117",borderRadius:"50%",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:12}}>{inCart.qty}</div>}
                <div style={{fontSize:22,marginBottom:4}}>{CAT_ICONS[item.cat]}</div>
                <div style={{fontWeight:700,fontSize:12,marginBottom:4}}>{item.name}</div>
                <div style={{color:"#d4a853",fontWeight:700,marginTop:"auto",fontSize:13}}>{fmt(item.price)}</div>
              </div>
            );})}
          </div>
        </div>
        <div style={{flex:1,minWidth:240}}>
          <div style={S.card}>
            <h3 style={S.cardTitle}>🛒 Panier</h3>
            {cart.length===0&&<p style={S.empty}>Vide</p>}
            {cart.map(it=>(
              <div key={it.cartKey} style={S.row}>
                <span style={{fontWeight:600,fontSize:13}}>{it.qty}× {it.name}</span>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <span style={{color:"#d4a853",fontSize:13}}>{fmt(it.price*it.qty)}</span>
                  <button style={{...S.btnSm,padding:"3px 8px"}} onClick={()=>removeFromCart(it.id)}>−</button>
                </div>
              </div>
            ))}
            {cart.length>0&&<div style={{fontWeight:700,fontSize:16,color:"#d4a853",textAlign:"right",marginTop:8}}>{fmt(total)}</div>}
          </div>
          <div style={S.card}>
            <h3 style={{...S.cardTitle,fontSize:14,marginBottom:10}}>📍 Mode</h3>
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <div style={{...S.orderTypeBtn,flex:1,fontSize:11,...(orderType==="surplace"?S.orderTypeBtnActive:{})}} onClick={()=>setOrderType("surplace")}>🪑 Sur place</div>
              <div style={{...S.orderTypeBtn,flex:1,fontSize:11,...(orderType==="emporter"?S.orderTypeBtnActive:{})}} onClick={()=>setOrderType("emporter")}>🥡 Emporter</div>
              <div style={{...S.orderTypeBtn,flex:1,fontSize:11,...(orderType==="drive"?S.orderTypeBtnActive:{})}} onClick={()=>setOrderType("drive")}>🚗 Drive</div>
            </div>
            {orderType==="surplace"&&<input style={{...S.input,marginBottom:0}} placeholder="N° de table" value={tableNum} onChange={e=>setTableNum(e.target.value)}/>}
          </div>
          <div style={S.card}>
            <h3 style={{...S.cardTitle,fontSize:14,marginBottom:10}}>👤 Client</h3>
            <input style={S.input} placeholder="Nom ou REF-XXXXX" value={clientSearch} onChange={e=>{setClientSearch(e.target.value);setSelectedClient(null);}}/>
            {filtered.length>0&&<div style={{maxHeight:150,overflowY:"auto",marginBottom:8}}>
              {filtered.map(c=>(
                <div key={c.id} style={{...S.row,cursor:"pointer",padding:"6px 8px",borderRadius:6,background:selectedClient?.id===c.id?"#1f2937":"transparent"}} onClick={()=>{setSelectedClient(c);setClientSearch(c.name);}}>
                  <div><div style={{fontWeight:700,fontSize:13}}>{c.name}</div><div style={{fontSize:11,color:"#d4a853"}}>{c.refNumber}</div></div>
                  <span style={S.pill}>⭐ {c.points||0}</span>
                </div>
              ))}
            </div>}
            {selectedClient&&<div style={{background:"#1a3a1a",border:"1px solid #166534",borderRadius:8,padding:8,fontSize:12,color:"#86efac"}}>✅ {selectedClient.name} · {selectedClient.refNumber}</div>}
            {!selectedClient&&clientSearch===""&&<div style={{fontSize:12,color:"#6b7280",textAlign:"center"}}>Vide = facture anonyme</div>}
          </div>
          <div style={S.card}>
            <h3 style={{...S.cardTitle,fontSize:14,marginBottom:10}}>💳 Paiement</h3>
            <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
              {Object.entries(PAY_MODES).map(([k,v])=><div key={k} style={{...S.tab,...(payMode===k?S.tabActive:{}),cursor:"pointer",fontSize:11,padding:"5px 8px"}} onClick={()=>setPayMode(k)}>{v}</div>)}
            </div>
            {(payMode==="cb"||payMode==="mixed")&&<>
              <label style={S.label}>4 derniers chiffres</label>
              <input style={S.input} placeholder="4321" maxLength={4} value={cardLast4} onChange={e=>setCardLast4(e.target.value.replace(/\D/g,"").slice(0,4))}/>
              <select style={S.input} value={cardType} onChange={e=>setCardType(e.target.value)}>
                <option>VISA</option><option>Mastercard</option><option>CB</option><option>American Express</option>
              </select>
            </>}
          </div>
          <button style={{...S.btn,fontSize:15}} onClick={confirm}>✅ Encaisser {fmt(total)}</button>
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGERIE
// ═══════════════════════════════════════════════════════════════════════════════
function MessagesPage({messages,updateMessages,currentUser,users,showToast,role}) {
  const isAdmin=role==="admin";
  const [selected,setSelected]=useState(null);
  const [reply,setReply]=useState("");
  const [motif,setMotif]=useState("Question");
  const [text,setText]=useState("");
  const [sending,setSending]=useState(false);
  const MOTIFS=["Question","Réclamation","Compliment","Réservation","Autre"];

  // Threads par client (admin) ou mes messages (client)
  const threads=isAdmin
    ? Object.values(messages.reduce((acc,m)=>{
        const cid=m.clientId;
        if(!acc[cid]) acc[cid]={clientId:cid,clientName:m.clientName,msgs:[],unread:0};
        acc[cid].msgs.push(m);
        if(!m.readByAdmin) acc[cid].unread++;
        return acc;
      },{}))
    : null;
  const myMessages=!isAdmin?messages.filter(m=>m.clientId===currentUser.id):null;

  const sendMessage=async()=>{
    if(!text.trim()) return showToast("Message vide","error");
    setSending(true);
    const newMsg={id:genId(),clientId:currentUser.id,clientName:currentUser.name,motif,text:text.trim(),createdAt:new Date().toISOString(),fromAdmin:false,readByAdmin:false,readByClient:true};
    await updateMessages([...messages,newMsg]);
    setText(""); setSending(false); showToast("Message envoyé ✅");
  };

  const sendReply=async()=>{
    if(!reply.trim()||!selected) return;
    setSending(true);
    const newMsg={id:genId(),clientId:selected.clientId,clientName:selected.clientName,motif:"Réponse",text:reply.trim(),createdAt:new Date().toISOString(),fromAdmin:true,readByAdmin:true,readByClient:false};
    const markRead=messages.map(m=>m.clientId===selected.clientId&&!m.readByAdmin?{...m,readByAdmin:true}:m);
    await updateMessages([...markRead,newMsg]);
    setReply(""); setSending(false); showToast("Réponse envoyée ✅");
  };

  const markRead=async(clientId)=>{
    const updated=messages.map(m=>m.clientId===clientId&&!m.readByAdmin?{...m,readByAdmin:true}:m);
    await updateMessages(updated);
  };

  // Admin : liste des threads
  if(isAdmin&&!selected) return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>💬 Messagerie</h1>
      {threads.length===0&&<p style={S.empty}>Aucun message</p>}
      {threads.sort((a,b)=>b.unread-a.unread).map(t=>(
        <div key={t.clientId} style={{...S.card,cursor:"pointer",border:`1px solid ${t.unread>0?"#d4a853":"#30363d"}`}} onClick={()=>{setSelected(t);markRead(t.clientId);}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:700,fontSize:15}}>{t.clientName}</div>
              <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>{t.msgs.length} message{t.msgs.length>1?"s":""} · {fmtDate(t.msgs[t.msgs.length-1].createdAt)}</div>
              <div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>{t.msgs[t.msgs.length-1].text.slice(0,60)}…</div>
            </div>
            {t.unread>0&&<span style={{background:"#d4a853",color:"#0d1117",borderRadius:12,padding:"2px 8px",fontSize:12,fontWeight:700}}>{t.unread} nouveau{t.unread>1?"x":""}</span>}
          </div>
        </div>
      ))}
    </div>
  );

  const closeConversation=async(clientId)=>{
    const updated=messages.map(m=>m.clientId===clientId?{...m,closed:true}:m);
    await updateMessages(updated);
    setSelected(null);
    showToast("Conversation clôturée");
  };

  // Admin : conversation sélectionnée
  if(isAdmin&&selected) {
    const thread=messages.filter(m=>m.clientId===selected.clientId).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
    const isClosed=thread.length>0&&thread[thread.length-1].closed;
    return (
      <div style={S.page}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
          <button style={{...S.btnOutline,width:"auto"}} onClick={()=>setSelected(null)}>← Retour</button>
          <button style={{...S.btnSm,background:"#7f1d1d",color:"#fca5a5",border:"1px solid #991b1b"}} onClick={()=>closeConversation(selected.clientId)}>🔒 Clore la conversation</button>
        </div>
        <h2 style={{...S.pageTitle,fontSize:18}}>💬 {selected.clientName}</h2>
        {isClosed&&<div style={{background:"#1a1a1a",border:"1px solid #374151",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:12,color:"#6b7280",textAlign:"center"}}>🔒 Cette conversation a été clôturée</div>}
        <div style={{...S.card,maxHeight:400,overflowY:"auto",display:"flex",flexDirection:"column",gap:10}}>
          {thread.map(m=>(
            <div key={m.id} style={{display:"flex",justifyContent:m.fromAdmin?"flex-end":"flex-start"}}>
              <div style={{maxWidth:"80%",background:m.fromAdmin?"#1a3a1a":"#1f2937",border:`1px solid ${m.fromAdmin?"#166534":"#374151"}`,borderRadius:12,padding:"10px 14px"}}>
                <div style={{fontSize:10,color:m.fromAdmin?"#86efac":"#d4a853",fontWeight:700,marginBottom:4}}>{m.fromAdmin?"Vous":m.clientName} · {m.motif}</div>
                <div style={{fontSize:14,lineHeight:1.5}}>{m.text}</div>
                <div style={{fontSize:10,color:"#6b7280",marginTop:4,textAlign:"right"}}>{fmtDate(m.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
        {!isClosed&&<div style={{...S.card,marginTop:0}}>
          <label style={S.label}>Votre réponse</label>
          <textarea style={{...S.input,resize:"vertical",minHeight:80}} placeholder="Tapez votre réponse…" value={reply} onChange={e=>setReply(e.target.value)}/>
          <button style={{...S.btn,width:"auto",opacity:sending?0.6:1}} onClick={sendReply} disabled={sending}>{sending?"⏳…":"📤 Envoyer"}</button>
        </div>}
      </div>
    );
  }

  // Client : ses messages + formulaire
  const myThread=myMessages.sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>💬 Messages</h1>
      {myThread.length>0&&(
        <div style={{...S.card,maxHeight:350,overflowY:"auto",display:"flex",flexDirection:"column",gap:10,marginBottom:16}}>
          {myThread.map(m=>(
            <div key={m.id} style={{display:"flex",justifyContent:m.fromAdmin?"flex-start":"flex-end"}}>
              <div style={{maxWidth:"80%",background:m.fromAdmin?"#1a3a1a":"#1f2937",border:`1px solid ${m.fromAdmin?"#166534":"#374151"}`,borderRadius:12,padding:"10px 14px"}}>
                <div style={{fontSize:10,color:m.fromAdmin?"#86efac":"#d4a853",fontWeight:700,marginBottom:4}}>{m.fromAdmin?"Restaurant":"Vous"} · {m.motif}</div>
                <div style={{fontSize:14,lineHeight:1.5}}>{m.text}</div>
                <div style={{fontSize:10,color:"#6b7280",marginTop:4,textAlign:"right"}}>{fmtDate(m.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {myThread.length>0&&!myThread[myThread.length-1]?.closed&&(
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8}}>
          <button style={{...S.btnSm,background:"#7f1d1d",color:"#fca5a5",border:"1px solid #991b1b"}} onClick={async()=>{const updated=messages.map(m=>m.clientId===currentUser.id?{...m,closed:true}:m);await updateMessages(updated);showToast("Conversation clôturée");}}>🔒 Clore la conversation</button>
        </div>
      )}
      {myThread.length>0&&myThread[myThread.length-1]?.closed&&(
        <div style={{background:"#1a1a1a",border:"1px solid #374151",borderRadius:8,padding:"8px 14px",marginBottom:12,fontSize:12,color:"#6b7280",textAlign:"center"}}>🔒 Conversation clôturée — envoyez un nouveau message pour la rouvrir</div>
      )}
      <div style={S.card}>
        <h3 style={S.cardTitle}>✉️ Nouveau message</h3>
        <label style={S.label}>Motif</label>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
          {MOTIFS.map(m=><div key={m} style={{...S.tab,...(motif===m?S.tabActive:{}),cursor:"pointer",fontSize:12,padding:"5px 10px"}} onClick={()=>setMotif(m)}>{m}</div>)}
        </div>
        <label style={S.label}>Message</label>
        <textarea style={{...S.input,resize:"vertical",minHeight:100}} placeholder="Votre message…" value={text} onChange={e=>setText(e.target.value)}/>
        <button style={{...S.btn,width:"auto",opacity:sending?0.6:1}} onClick={sendMessage} disabled={sending}>{sending?"⏳…":"📤 Envoyer"}</button>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// RÉSERVATIONS
// ═══════════════════════════════════════════════════════════════════════════════
function ReservationsAdmin({reservations,updateReservations,settings,updateSettings,users,showToast,currentUser}) {
  const [tab,setTab]=useState("today");
  const [editSettings,setEditSettings]=useState(false);
  const [showNew,setShowNew]=useState(false);
  const [tableCount,setTableCount]=useState(settings.tableCount||10);
  const [tableCapacity,setTableCapacity]=useState(settings.tableCapacity||4);
  // Formulaire nouvelle réservation
  const [nDate,setNDate]=useState("");
  const [nTime,setNTime]=useState("12:00");
  const [nGuests,setNGuests]=useState(2);
  const [nNote,setNNote]=useState("");
  const [nClientSearch,setNClientSearch]=useState("");
  const [nClient,setNClient]=useState(null);
  const [nLoading,setNLoading]=useState(false);

  const today=new Date().toDateString();
  const todayRes=reservations.filter(r=>new Date(r.date).toDateString()===today).sort((a,b)=>a.time.localeCompare(b.time));
  const upcomingRes=reservations.filter(r=>new Date(r.date)>new Date()&&new Date(r.date).toDateString()!==today).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const pastRes=reservations.filter(r=>new Date(r.date)<new Date()&&new Date(r.date).toDateString()!==today).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const clients=users.filter(u=>u.role==="client");
  const filteredClients=nClientSearch.trim()===""?[]:clients.filter(c=>
    c.name.toLowerCase().includes(nClientSearch.toLowerCase())||(c.refNumber&&c.refNumber.toLowerCase().includes(nClientSearch.toLowerCase()))
  );

  const getAvailableTable=(dateStr,timeStr)=>{
    const dayRes=reservations.filter(r=>r.date===dateStr&&r.status!=="cancelled"&&Math.abs(parseInt(r.time)-parseInt(timeStr))<2);
    const usedTables=dayRes.map(r=>r.tableNumber);
    for(let i=1;i<=(settings.tableCount||10);i++){if(!usedTables.includes(i)) return i;}
    return null;
  };

  const saveTableSettings=async()=>{
    await updateSettings({...settings,tableCount:parseInt(tableCount)||10,tableCapacity:parseInt(tableCapacity)||4});
    setEditSettings(false);showToast("Tables mises à jour ✅");
  };

  const createReservation=async()=>{
    if(!nDate) return showToast("Date requise","error");
    if(!nTime) return showToast("Heure requise","error");
    if(nGuests<1) return showToast("Nombre de personnes invalide","error");
    setNLoading(true);
    const tableNum=getAvailableTable(nDate,nTime);
    if(!tableNum){setNLoading(false);return showToast("Complet pour ce créneau !","error");}
    const res={
      id:genId(),
      clientId:nClient?.id||null,
      clientName:nClient?.name||"Anonyme",
      refNumber:nClient?.refNumber||null,
      date:nDate,time:nTime,
      guests:nGuests,
      note:nNote.trim(),
      tableNumber:tableNum,
      status:"confirmed", // direct confirmée par le staff
      createdAt:new Date().toISOString(),
      createdBy:currentUser?.name||"Staff",
    };
    await updateReservations([...reservations,res]);
    setNDate("");setNTime("12:00");setNGuests(2);setNNote("");setNClient(null);setNClientSearch("");
    setNLoading(false);setShowNew(false);
    showToast(`Réservation créée — Table ${tableNum} ✅`);
  };

  const cancelRes=async(id)=>{
    await updateReservations(reservations.map(r=>r.id===id?{...r,status:"cancelled"}:r));
    showToast("Réservation annulée");
  };
  const confirmRes=async(id)=>{
    await updateReservations(reservations.map(r=>r.id===id?{...r,status:"confirmed"}:r));
    showToast("Réservation confirmée ✅");
  };
  const deleteRes=async(id)=>{
    await updateReservations(reservations.filter(r=>r.id!==id));
    showToast("Réservation supprimée");
  };

  const ResCard=({r})=>{
    const client=users.find(u=>u.id===r.clientId);
    const isAnon=!r.clientId||r.clientName==="Anonyme";
    return (
      <div style={{...S.card,border:`1px solid ${r.status==="confirmed"?"#166534":r.status==="cancelled"?"#991b1b":"#30363d"}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
              <div style={{fontWeight:700,fontSize:15}}>{r.clientName}</div>
              {isAnon&&<span style={{fontSize:10,background:"#374151",color:"#9ca3af",padding:"1px 6px",borderRadius:8}}>anonyme</span>}
              {r.createdBy&&<span style={{fontSize:10,background:"#1c1a00",color:"#d4a853",padding:"1px 6px",borderRadius:8}}>par {r.createdBy}</span>}
            </div>
            {client?.refNumber&&<div style={{fontSize:11,color:"#d4a853",marginBottom:2}}>{client.refNumber}</div>}
            <div style={{fontSize:13,color:"#9ca3af",marginTop:2}}>
              📅 {fmtDateOnly(r.date)} à {r.time}<br/>
              👥 {r.guests} personne{r.guests>1?"s":""} · 🪑 Table {r.tableNumber}
            </div>
            {r.note&&<div style={{fontSize:12,color:"#f97316",marginTop:4}}>📝 {r.note}</div>}
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
            <span style={{padding:"3px 10px",borderRadius:12,fontSize:11,fontWeight:700,background:r.status==="confirmed"?"#1a3a1a":r.status==="cancelled"?"#7f1d1d":"#1f2937",color:r.status==="confirmed"?"#86efac":r.status==="cancelled"?"#fca5a5":"#9ca3af"}}>
              {r.status==="confirmed"?"✅ Confirmée":r.status==="cancelled"?"❌ Annulée":"⏳ En attente"}
            </span>
            {r.status==="pending"&&<button style={{...S.btnSm,background:"#1a3a1a",color:"#86efac",borderColor:"#166534"}} onClick={()=>confirmRes(r.id)}>✅</button>}
            {r.status!=="cancelled"&&<button style={{...S.btnSm,...S.btnDanger}} onClick={()=>cancelRes(r.id)}>❌</button>}
            <button style={{...S.btnSm,background:"#3b0764",color:"#d8b4fe",borderColor:"#6d28d9"}} onClick={()=>deleteRes(r.id)}>🗑️</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={S.page}>
      <div style={{...S.pageHeader,flexWrap:"wrap",gap:8}}>
        <h1 style={S.pageTitle}>📅 Réservations</h1>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button style={{...S.btn,width:"auto",padding:"9px 16px",fontSize:13}} onClick={()=>setShowNew(true)}>＋ Nouvelle résa</button>
          <button style={{...S.btnSm}} onClick={()=>setEditSettings(!editSettings)}>⚙️ Tables</button>
        </div>
      </div>

      {/* Modal nouvelle réservation */}
      {showNew&&<div style={S.modal}><div style={S.modalCard} className="modal-card-mobile">
        <h3 style={S.cardTitle}>📅 Nouvelle réservation</h3>

        {/* Recherche client */}
        <label style={S.label}>👤 Client (optionnel)</label>
        <input style={S.input} placeholder="Nom ou REF-XXXXX pour lier un compte…" value={nClientSearch}
          onChange={e=>{setNClientSearch(e.target.value);setNClient(null);}}/>
        {filteredClients.length>0&&<div style={{background:"#0d1117",border:"1px solid #30363d",borderRadius:8,marginBottom:12,maxHeight:140,overflowY:"auto"}}>
          {filteredClients.map(cl=>(
            <div key={cl.id} style={{padding:"9px 12px",cursor:"pointer",borderBottom:"1px solid #21262d",display:"flex",justifyContent:"space-between",alignItems:"center",background:nClient?.id===cl.id?"#1f2937":"transparent"}}
              onClick={()=>{setNClient(cl);setNClientSearch(cl.name);}}>
              <div>
                <div style={{fontWeight:700,fontSize:13}}>{cl.name}</div>
                <div style={{fontSize:11,color:"#d4a853"}}>{cl.refNumber}</div>
              </div>
              <span style={{fontSize:11,color:"#9ca3af"}}>⭐ {cl.points||0}</span>
            </div>
          ))}
        </div>}
        {nClient
          ?<div style={{background:"#1a3a1a",border:"1px solid #166534",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:13,color:"#86efac"}}>✅ Lié à : {nClient.name} · {nClient.refNumber}</div>
          :nClientSearch===""&&<div style={{background:"#1a1a2e",border:"1px solid #374151",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:"#9ca3af"}}>📋 Aucun compte lié → réservation anonyme</div>
        }

        {/* Détails */}
        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:130}}>
            <label style={S.label}>📅 Date</label>
            <input style={S.input} type="date" value={nDate} min={new Date().toISOString().split("T")[0]} onChange={e=>setNDate(e.target.value)}/>
          </div>
          <div style={{flex:1,minWidth:110}}>
            <label style={S.label}>🕐 Heure</label>
            <input style={S.input} type="time" value={nTime} onChange={e=>setNTime(e.target.value)}/>
          </div>
          <div style={{flex:1,minWidth:100}}>
            <label style={S.label}>👥 Personnes</label>
            <input style={S.input} type="number" min="1" max={settings.tableCapacity||10} value={nGuests} onChange={e=>setNGuests(parseInt(e.target.value)||1)}/>
          </div>
        </div>
        <label style={S.label}>📝 Note</label>
        <input style={S.input} placeholder="Anniversaire, allergie…" value={nNote} onChange={e=>setNNote(e.target.value)}/>

        <div style={{display:"flex",gap:8}}>
          <button style={{...S.btn,opacity:nLoading?0.6:1}} onClick={createReservation} disabled={nLoading}>{nLoading?"⏳…":"📅 Créer"}</button>
          <button style={S.btnOutline} onClick={()=>{setShowNew(false);setNClient(null);setNClientSearch("");}}>Annuler</button>
        </div>
      </div></div>}

      {/* Config tables */}
      {editSettings&&<div style={S.card}>
        <h3 style={S.cardTitle}>🪑 Configuration des tables</h3>
        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:120}}>
            <label style={S.label}>Nombre de tables</label>
            <input style={S.input} type="number" min="1" value={tableCount} onChange={e=>setTableCount(e.target.value)}/>
          </div>
          <div style={{flex:1,minWidth:120}}>
            <label style={S.label}>Places par table</label>
            <input style={S.input} type="number" min="1" value={tableCapacity} onChange={e=>setTableCapacity(e.target.value)}/>
          </div>
        </div>
        <div style={{fontSize:13,color:"#9ca3af",marginBottom:12}}>Capacité totale : {(parseInt(tableCount)||0)*(parseInt(tableCapacity)||0)} couverts</div>
        <div style={{display:"flex",gap:8}}><button style={{...S.btn,width:"auto"}} onClick={saveTableSettings}>💾 Sauvegarder</button><button style={{...S.btnOutline,width:"auto"}} onClick={()=>setEditSettings(false)}>Annuler</button></div>
      </div>}

      <div style={S.statsGrid}>
        <div style={S.statCard}><div style={{fontSize:20,marginBottom:4}}>📅</div><div style={{fontSize:20,fontWeight:700,color:"#d4a853"}}>{todayRes.length}</div><div style={{fontSize:12,color:"#9ca3af"}}>Aujourd'hui</div></div>
        <div style={S.statCard}><div style={{fontSize:20,marginBottom:4}}>🪑</div><div style={{fontSize:20,fontWeight:700,color:"#3b82f6"}}>{settings.tableCount||10}</div><div style={{fontSize:12,color:"#9ca3af"}}>Tables ({settings.tableCapacity||4} pl.)</div></div>
        <div style={S.statCard}><div style={{fontSize:20,marginBottom:4}}>📆</div><div style={{fontSize:20,fontWeight:700,color:"#22c55e"}}>{upcomingRes.length}</div><div style={{fontSize:12,color:"#9ca3af"}}>À venir</div></div>
      </div>

      <div style={S.tabBar}>
        {[["today","Aujourd'hui"],["upcoming","À venir"],["past","Passées"]].map(([k,l])=>(
          <div key={k} style={{...S.tab,...(tab===k?S.tabActive:{})}} onClick={()=>setTab(k)}>{l}</div>
        ))}
      </div>

      {tab==="today"&&(todayRes.length===0?<p style={S.empty}>Aucune réservation aujourd'hui</p>:todayRes.map(r=><ResCard key={r.id} r={r}/>))}
      {tab==="upcoming"&&(upcomingRes.length===0?<p style={S.empty}>Aucune réservation à venir</p>:upcomingRes.map(r=><ResCard key={r.id} r={r}/>))}
      {tab==="past"&&(pastRes.length===0?<p style={S.empty}>Aucune réservation passée</p>:pastRes.slice(0,20).map(r=><ResCard key={r.id} r={r}/>))}
    </div>
  );
}

function ReservationsClient({reservations,updateReservations,settings,currentUser,showToast}) {
  const [date,setDate]=useState("");
  const [time,setTime]=useState("12:00");
  const [guests,setGuests]=useState(2);
  const [note,setNote]=useState("");
  const [loading,setLoading]=useState(false);
  const myRes=reservations.filter(r=>r.clientId===currentUser.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const tableCount=settings.tableCount||10;
  const tableCapacity=settings.tableCapacity||4;

  const getAvailableTable=(dateStr,timeStr)=>{
    const dayRes=reservations.filter(r=>r.date===dateStr&&r.status!=="cancelled"&&Math.abs(parseInt(r.time)-parseInt(timeStr))<2);
    const usedTables=dayRes.map(r=>r.tableNumber);
    for(let i=1;i<=tableCount;i++){if(!usedTables.includes(i)) return i;}
    return null;
  };

  const book=async()=>{
    if(!date) return showToast("Choisissez une date","error");
    if(!time) return showToast("Choisissez une heure","error");
    if(guests<1||guests>tableCapacity) return showToast(`Entre 1 et ${tableCapacity} personnes par table`,"error");
    if(new Date(date)<new Date(new Date().toDateString())) return showToast("Date passée","error");
    setLoading(true);
    const tableNum=getAvailableTable(date,time);
    if(!tableNum){setLoading(false);return showToast("Complet pour ce créneau ! Essayez un autre horaire.","error");}
    const res={id:genId(),clientId:currentUser.id,clientName:currentUser.name,refNumber:currentUser.refNumber||null,date,time,guests,note:note.trim(),tableNumber:tableNum,status:"pending",createdAt:new Date().toISOString()};
    await updateReservations([...reservations,res]);
    setDate("");setTime("12:00");setGuests(2);setNote("");
    setLoading(false);showToast(`Réservation confirmée ! Table ${tableNum} ✅`);
  };

  const cancel=async(id)=>{
    await updateReservations(reservations.map(r=>r.id===id?{...r,status:"cancelled"}:r));
    showToast("Réservation annulée");
  };

  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>📅 Réserver une table</h1>
      <div style={S.card}>
        <h3 style={S.cardTitle}>Nouvelle réservation</h3>
        <div style={{background:"#0d1117",borderRadius:10,padding:12,marginBottom:16,fontSize:13,color:"#9ca3af",lineHeight:1.6}}>
          🪑 {tableCount} tables disponibles · {tableCapacity} personnes max par table
        </div>
        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:140}}>
            <label style={S.label}>📅 Date</label>
            <input style={S.input} type="date" value={date} min={new Date().toISOString().split("T")[0]} onChange={e=>setDate(e.target.value)}/>
          </div>
          <div style={{flex:1,minWidth:120}}>
            <label style={S.label}>🕐 Heure d'arrivée</label>
            <input style={S.input} type="time" value={time} onChange={e=>setTime(e.target.value)}/>
          </div>
          <div style={{flex:1,minWidth:100}}>
            <label style={S.label}>👥 Nb personnes</label>
            <input style={S.input} type="number" min="1" max={tableCapacity} value={guests} onChange={e=>setGuests(parseInt(e.target.value)||1)}/>
          </div>
        </div>
        <label style={S.label}>📝 Note (optionnel)</label>
        <input style={S.input} placeholder="Ex : anniversaire, allergie…" value={note} onChange={e=>setNote(e.target.value)}/>
        <button style={{...S.btn,width:"auto",opacity:loading?0.6:1}} onClick={book} disabled={loading}>{loading?"⏳…":"📅 Réserver"}</button>
      </div>

      {myRes.length>0&&<div>
        <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:18,marginBottom:12}}>Mes réservations</h2>
        {myRes.map(r=>(
          <div key={r.id} style={{...S.card,border:`1px solid ${r.status==="confirmed"?"#166534":r.status==="cancelled"?"#991b1b":"#30363d"}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontWeight:700}}>{fmtDateOnly(r.date)} à {r.time}</div>
                <div style={{fontSize:13,color:"#9ca3af",marginTop:2}}>👥 {r.guests} personne{r.guests>1?"s":""} · 🪑 Table {r.tableNumber}</div>
                {r.note&&<div style={{fontSize:12,color:"#f97316",marginTop:2}}>📝 {r.note}</div>}
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{padding:"3px 10px",borderRadius:12,fontSize:11,fontWeight:700,background:r.status==="confirmed"?"#1a3a1a":r.status==="cancelled"?"#7f1d1d":"#1f2937",color:r.status==="confirmed"?"#86efac":r.status==="cancelled"?"#fca5a5":"#9ca3af"}}>
                  {r.status==="confirmed"?"✅ Confirmée":r.status==="cancelled"?"❌ Annulée":"⏳ En attente"}
                </span>
                {r.status!=="cancelled"&&new Date(r.date)>new Date()&&<button style={{...S.btnSm,...S.btnDanger}} onClick={()=>cancel(r.id)}>Annuler</button>}
              </div>
            </div>
          </div>
        ))}
      </div>}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// REVIEWS
// ═══════════════════════════════════════════════════════════════════════════════
function ReviewsPage({reviews,updateReviews,currentUser,showToast}) {
  const [stars,setStars]=useState(5);
  const [comment,setComment]=useState("");
  const [hover,setHover]=useState(0);
  const [sending,setSending]=useState(false);
  const myReview=reviews.find(r=>r.clientId===currentUser.id);
  const avg=reviews.length>0?(reviews.reduce((s,r)=>s+r.stars,0)/reviews.length).toFixed(1):0;

  const submit=async()=>{
    if(!comment.trim()) return showToast("Écrivez un commentaire","error");
    setSending(true);
    const review={id:genId(),clientId:currentUser.id,clientName:currentUser.name,stars,comment:comment.trim(),createdAt:new Date().toISOString()};
    const existing=myReview?reviews.filter(r=>r.clientId!==currentUser.id):reviews;
    await updateReviews([...existing,review]);
    setComment("");setSending(false);showToast("Avis publié ✅");
  };

  const deleteMyReview=async()=>{
    await updateReviews(reviews.filter(r=>r.clientId!==currentUser.id));
    showToast("Avis supprimé");
  };

  const StarRow=({value,onClick,onHover,active})=>(
    <div style={{display:"flex",gap:4,marginBottom:12}}>
      {STARS.map(s=>(
        <span key={s} style={{fontSize:28,cursor:onClick?"pointer":"default",color:s<=(hover||value)?"#d4a853":"#374151",transition:"color .1s"}}
          onClick={()=>onClick&&onClick(s)} onMouseEnter={()=>onHover&&onHover(s)} onMouseLeave={()=>onHover&&onHover(0)}>★</span>
      ))}
    </div>
  );

  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>⭐ Avis clients</h1>
      {reviews.length>0&&<div style={{...S.card,textAlign:"center",padding:24}}>
        <div style={{fontSize:48,fontWeight:800,color:"#d4a853"}}>{avg}</div>
        <StarRow value={Math.round(avg)}/>
        <div style={{fontSize:13,color:"#9ca3af"}}>{reviews.length} avis</div>
      </div>}

      {currentUser.role==="client"&&(
        <div style={S.card}>
          <h3 style={S.cardTitle}>{myReview?"Mon avis":"Laisser un avis"}</h3>
          {myReview&&<div style={{background:"#0d1117",borderRadius:10,padding:12,marginBottom:12}}>
            <StarRow value={myReview.stars}/>
            <div style={{fontSize:13,lineHeight:1.6}}>{myReview.comment}</div>
            <div style={{fontSize:11,color:"#6b7280",marginTop:6}}>{fmtDate(myReview.createdAt)}</div>
            <button style={{...S.btnSm,...S.btnDanger,marginTop:10}} onClick={deleteMyReview}>🗑️ Supprimer mon avis</button>
          </div>}
          {!myReview&&<>
            <label style={S.label}>Note</label>
            <StarRow value={stars} onClick={setStars} onHover={setHover}/>
            <label style={S.label}>Commentaire</label>
            <textarea style={{...S.input,resize:"vertical",minHeight:80}} placeholder="Votre expérience…" value={comment} onChange={e=>setComment(e.target.value)}/>
            <button style={{...S.btn,width:"auto",opacity:sending?0.6:1}} onClick={submit} disabled={sending}>{sending?"⏳…":"📤 Publier"}</button>
          </>}
        </div>
      )}

      <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:18,marginBottom:12}}>Tous les avis</h2>
      {reviews.length===0&&<p style={S.empty}>Aucun avis pour le moment</p>}
      {[...reviews].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).map(r=>(
        <div key={r.id} style={S.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
            <div>
              <div style={{fontWeight:700}}>{r.clientName}</div>
              <div style={{fontSize:11,color:"#6b7280"}}>{fmtDate(r.createdAt)}</div>
            </div>
            <div style={{display:"flex",gap:2}}>
              {STARS.map(s=><span key={s} style={{color:s<=r.stars?"#d4a853":"#374151",fontSize:16}}>★</span>)}
            </div>
          </div>
          <div style={{fontSize:13,color:"#d1d5db",lineHeight:1.6}}>{r.comment}</div>
          {(currentUser.role==="admin"||r.clientId===currentUser.id)&&(
            <button style={{...S.btnSm,...S.btnDanger,marginTop:10,fontSize:11}} onClick={async()=>{await updateReviews(reviews.filter(x=>x.id!==r.id));showToast("Avis supprimé");}}>🗑️</button>
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACT
// ═══════════════════════════════════════════════════════════════════════════════
function ContactPage({settings}) {
  const DAYS=[["lundi","Lun"],["mardi","Mar"],["mercredi","Mer"],["jeudi","Jeu"],["vendredi","Ven"],["samedi","Sam"],["dimanche","Dim"]];
  const hours=typeof settings.hours==="object"?settings.hours:null;
  const todayKey=["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"][new Date().getDay()];
  const todayHours=hours?hours[todayKey]:null;
  const isOpen=todayHours&&todayHours!=="Fermé";
  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>📍 Nous contacter</h1>
      {/* Statut ouvert/fermé */}
      <div style={{...S.card,textAlign:"center",padding:20,border:`1px solid ${isOpen?"#166534":"#991b1b"}`,background:isOpen?"#0a1a0a":"#1a0a0a"}}>
        <div style={{fontSize:32,marginBottom:6}}>{isOpen?"✅":"🔒"}</div>
        <div style={{fontWeight:700,fontSize:18,color:isOpen?"#86efac":"#fca5a5"}}>{isOpen?"Ouvert maintenant":"Fermé actuellement"}</div>
        {todayHours&&<div style={{fontSize:13,color:"#9ca3af",marginTop:4}}>Aujourd'hui : {todayHours}</div>}
      </div>
      {/* Infos */}
      <div style={S.card}>
        {[["🏠","Restaurant",settings.restaurantName],["📍","Adresse",settings.address],["📞","Téléphone",settings.phone],["✉️","Email",settings.email],["🏢","SIRET",settings.siret]].map(([icon,label,val])=>val&&(
          <div key={label} style={{...S.row,alignItems:"flex-start",paddingTop:14,paddingBottom:14}}>
            <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
              <span style={{fontSize:22,flexShrink:0}}>{icon}</span>
              <div><div style={{fontSize:11,color:"#9ca3af",fontWeight:600,marginBottom:2}}>{label}</div><div style={{fontWeight:600}}>{val}</div></div>
            </div>
          </div>
        ))}
        {settings.googleMapsUrl&&<a href={settings.googleMapsUrl} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:10,padding:"14px 0",borderTop:"1px solid #21262d",color:"#3b82f6",textDecoration:"none",fontWeight:600}}>
          <span style={{fontSize:22}}>🗺️</span><span>Voir sur Google Maps</span>
        </a>}
      </div>
      {/* Horaires */}
      {hours&&<div style={S.card}>
        <h3 style={S.cardTitle}>🕐 Horaires d'ouverture</h3>
        {DAYS.map(([key,short])=>{const h=hours[key]||"Fermé";const isToday=key===todayKey;return(
          <div key={key} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #21262d",background:isToday?"transparent":"transparent"}}>
            <div style={{fontWeight:isToday?700:400,color:isToday?"#d4a853":"#f3f4f6",fontSize:14}}>{isToday?"→ ":""}{key.charAt(0).toUpperCase()+key.slice(1)}</div>
            <div style={{color:h==="Fermé"?"#6b7280":isToday?"#d4a853":"#9ca3af",fontWeight:isToday?700:400,fontSize:14}}>{h}</div>
          </div>
        );})}
      </div>}
      {!hours&&settings.hours&&<div style={S.card}><h3 style={S.cardTitle}>🕐 Horaires</h3><div style={{color:"#9ca3af"}}>{settings.hours}</div></div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHATBOT
// ═══════════════════════════════════════════════════════════════════════════════
function ChatbotPage({menu,settings,reservations,currentUser,reviews}) {
  const name=settings.restaurantName||"RestoPro";
  const [msgs,setMsgs]=useState([{from:"bot",text:`Bonjour ${currentUser.name} ! 👋 Je suis l'assistant de **${name}**. Posez-moi vos questions sur le restaurant, le menu, les horaires ou vos réservations !`,time:new Date()}]);
  const [input,setInput]=useState("");
  const endRef=useRef(null);
  useEffect(()=>endRef.current?.scrollIntoView({behavior:"smooth"}),[msgs]);

  // ── Moteur de réponse local ──────────────────────────────────────────────────
  const buildReply=(q)=>{
    const t=q.toLowerCase().trim();
    const has=(...words)=>words.some(w=>t.includes(w));

    // Horaires
    if(has("horaire","heure","ouvert","ferme","ouverture","fermeture","quand")){
      return settings.hours
        ? `🕐 **Horaires d'ouverture :**
${settings.hours}`
        : "Les horaires ne sont pas encore renseignés. Contactez-nous au "+( settings.phone||"numéro indiqué dans Contact")+" pour confirmer.";
    }

    // Adresse / localisation
    if(has("adresse","où","situe","trouver","localisation","plan","comment venir")){
      return `📍 **Adresse :**
${settings.address||"Non renseignée"}

Tél : ${settings.phone||"—"}
Email : ${settings.email||"—"}`;
    }

    // Téléphone / contact
    if(has("telephone","téléphone","appeler","contact","email","mail")){
      return `📞 **Contact :**
Tél : ${settings.phone||"—"}
Email : ${settings.email||"—"}`;
    }

    // Réservation
    if(has("réservation","réserver","reserver","table","place","dispo")){
      const myRes=reservations.filter(r=>r.clientId===currentUser.id&&r.status!=="cancelled");
      const upcoming=myRes.filter(r=>new Date(r.date)>=new Date());
      let reply="📅 **Réservations :**\nPour réserver une table, rendez-vous dans l'onglet **📅 Réserver** de l'application.";
      if(upcoming.length>0){
        reply+="\n\n**Vos réservations à venir :**";
        upcoming.forEach(r=>{reply+=`
• ${fmtDateOnly(r.date)} à ${r.time} — Table ${r.tableNumber} — ${r.guests} pers. (${r.status==="confirmed"?"✅ Confirmée":"⏳ En attente"})`;});
      }
      return reply;
    }

    // Menu complet
    if(has("menu","carte","manger","plat","entrée","dessert","boisson","prix")){
      const cats=["entree","plat","dessert","boisson","menu"];
      const available=menu.filter(m=>m.available);
      if(available.length===0) return "Le menu n'est pas encore disponible. Revenez bientôt !";
      let reply="🍽️ **Notre menu :**\n";
      cats.forEach(cat=>{
        const items=available.filter(m=>m.cat===cat);
        if(items.length===0) return;
        reply+=`
**${CAT_ICONS[cat]} ${CAT_LABELS[cat]}**
`;
        items.forEach(it=>{reply+=`• ${it.name}${it.desc?" — "+it.desc:""} → **${fmt(it.price)}**
`;});
      });
      return reply.trim();
    }

    // Entrées spécifique
    if(has("entrée","salade","soupe","starter")){
      const items=menu.filter(m=>m.cat==="entree"&&m.available);
      if(!items.length) return "Pas d'entrées disponibles pour le moment.";
      return "🥗 **Nos entrées :**\n"+items.map(i=>`• ${i.name}${i.desc?" — "+i.desc:""} — ${fmt(i.price)}`).join("\n");
    }

    // Plats
    if(has("plat","principal","main","viande","poisson","risotto")){
      const items=menu.filter(m=>m.cat==="plat"&&m.available);
      if(!items.length) return "Pas de plats disponibles pour le moment.";
      return "🍽️ **Nos plats :**\n"+items.map(i=>`• ${i.name}${i.desc?" — "+i.desc:""} — ${fmt(i.price)}`).join("\n");
    }

    // Desserts
    if(has("dessert","sucré","gâteau","glace","fondant","crème")){
      const items=menu.filter(m=>m.cat==="dessert"&&m.available);
      if(!items.length) return "Pas de desserts disponibles pour le moment.";
      return "🍮 **Nos desserts :**\n"+items.map(i=>`• ${i.name}${i.desc?" — "+i.desc:""} — ${fmt(i.price)}`).join("\n");
    }

    // Boissons
    if(has("boisson","boire","eau","vin","jus","verre","alcool")){
      const items=menu.filter(m=>m.cat==="boisson"&&m.available);
      if(!items.length) return "Pas de boissons disponibles pour le moment.";
      return "🥤 **Nos boissons :**\n"+items.map(i=>`• ${i.name}${i.desc?" — "+i.desc:""} — ${fmt(i.price)}`).join("\n");
    }

    // Fidélité / points
    if(has("fidélité","fidelite","point","récompense","recompense","carte")){
      return `⭐ **Programme fidélité :**
Vous cumulez **${settings.pointsPerEuro||1} point par euro** dépensé.
Vous avez actuellement **${currentUser.points||0} points**.

Consultez vos récompenses disponibles dans l'onglet **⭐ Fidélité**.`;
    }

    // Commande / commander
    if(has("commander","commande","passer commande","comment commander")){
      return "📋 **Comment commander :**\n1. Allez dans l'onglet **🍽️ Menu**\n2. Ajoutez vos articles au panier\n3. Choisissez Sur place ou À emporter\n4. Confirmez et réglez au comptoir";
    }

    // Avis / notes
    if(has("avis","note","étoile","etoile","commentaire","avis client")){
      const avg=reviews&&reviews.length>0?(reviews.reduce((s,r)=>s+r.stars,0)/reviews.length).toFixed(1):null;
      return avg
        ? `⭐ **Avis clients :**
Note moyenne : **${avg}/5** sur ${reviews.length} avis.

Consultez tous les avis dans l'onglet **⭐ Avis**.`
        : "Pas encore d'avis. Soyez le premier à donner votre avis dans l'onglet **⭐ Avis** !";
    }

    // Paiement
    if(has("paiement","payer","carte","espèces","cb","cash","moyen de paiement")){
      return "💳 **Modes de paiement acceptés :**\n• Carte bancaire (CB, Visa, Mastercard)\n• Espèces\n\nLe règlement se fait au comptoir.";
    }

    // Allergie / régime
    if(has("allergie","allergène","allergene","vegetarien","végétarien","vegan","sans gluten","halal","kasher")){
      return `🥗 Pour toute question sur les allergènes ou régimes alimentaires spéciaux, contactez-nous directement :
📞 ${settings.phone||"—"}
✉️ ${settings.email||"—"}

Nos équipes vous conseilleront avec plaisir.`;
    }

    // Messagerie / contact humain
    if(has("parler","humain","personne","équipe","message","ecrire")){
      return "💬 Vous pouvez contacter directement notre équipe via l'onglet **💬 Messages** de l'application. Nous vous répondrons dans les plus brefs délais !";
    }

    // Merci / salutation
    if(has("merci","super","parfait","génial","excellent","bravo")){
      return `😊 Avec plaisir ! N'hésitez pas si vous avez d'autres questions sur ${name}.`;
    }
    if(has("bonjour","salut","bonsoir","hello","coucou")){
      return `👋 Bonjour ! Comment puis-je vous aider concernant ${name} ?`;
    }
    if(has("au revoir","bye","bonne journée","bonne soirée","à bientôt")){
      return `👋 À bientôt chez ${name} ! Bonne journée !`;
    }

    // Hors sujet / inconnu
    return `Je suis uniquement là pour vous aider concernant **${name}** (menu, horaires, réservations, contact, fidélité…).

Voici ce que je peux faire :
• 🍽️ Vous montrer le menu
• 🕐 Donner les horaires
• 📍 Indiquer l'adresse
• 📅 Infos sur vos réservations
• ⭐ Programme fidélité

Quelle est votre question ?`;
  };

  const send=()=>{
    if(!input.trim()) return;
    const q=input.trim();
    const userMsg={from:"user",text:q,time:new Date()};
    const reply=buildReply(q);
    setMsgs(p=>[...p,userMsg,{from:"bot",text:reply,time:new Date()}]);
    setInput("");
  };

  const suggestions=["📋 Voir le menu","🕐 Horaires","📍 Adresse","📅 Mes réservations","⭐ Mes points"];

  // Render text avec **bold**
  const renderText=(text)=>{
    const parts=text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((p,i)=>p.startsWith("**")&&p.endsWith("**")
      ?<strong key={i} style={{color:"#f3f4f6"}}>{p.slice(2,-2)}</strong>
      :<span key={i}>{p}</span>
    );
  };

  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>🤖 Assistant {name}</h1>
      <div style={{...S.card,padding:0,overflow:"hidden"}}>
        {/* Header */}
        <div style={{background:"#1f2937",padding:"12px 16px",borderBottom:"1px solid #30363d",display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:38,height:38,borderRadius:"50%",background:"#d4a853",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>🤖</div>
          <div>
            <div style={{fontWeight:700,fontSize:14}}>Assistant {name}</div>
            <div style={{fontSize:11,color:"#22c55e"}}>● Toujours disponible</div>
          </div>
        </div>

        {/* Messages */}
        <div style={{minHeight:300,maxHeight:450,overflowY:"auto",padding:16,display:"flex",flexDirection:"column",gap:12,background:"#0d1117"}}>
          {msgs.map((m,i)=>(
            <div key={i} style={{display:"flex",justifyContent:m.from==="user"?"flex-end":"flex-start",alignItems:"flex-end",gap:8}}>
              {m.from==="bot"&&<div style={{width:28,height:28,borderRadius:"50%",background:"#d4a853",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>🤖</div>}
              <div style={{maxWidth:"78%",background:m.from==="user"?"#1f2937":"#161b22",border:`1px solid ${m.from==="user"?"#374151":"#d4a853"}`,borderRadius:m.from==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",padding:"10px 14px",fontSize:14,lineHeight:1.7,color:"#f3f4f6",whiteSpace:"pre-wrap"}}>
                {renderText(m.text)}
                <div style={{fontSize:9,color:"#6b7280",marginTop:4,textAlign:"right"}}>{m.time.getHours().toString().padStart(2,"0")}:{m.time.getMinutes().toString().padStart(2,"0")}</div>
              </div>
            </div>
          ))}
          <div ref={endRef}/>
        </div>

        {/* Suggestions rapides */}
        <div style={{padding:"8px 12px",borderTop:"1px solid #21262d",display:"flex",gap:6,flexWrap:"wrap",background:"#0d1117"}}>
          {suggestions.map(s=>(
            <button key={s} style={{...S.btnSm,fontSize:11,padding:"5px 10px",background:"#1f2937",borderRadius:16}} onClick={()=>{setInput(s.replace(/^[^\s]+\s/,""));setTimeout(()=>document.querySelector("#chatbot-input")?.focus(),50);}}>
              {s}
            </button>
          ))}
        </div>

        {/* Input */}
        <div style={{borderTop:"1px solid #30363d",padding:"10px 12px",display:"flex",gap:8,background:"#161b22"}}>
          <input id="chatbot-input" style={{...S.input,marginBottom:0,flex:1,fontSize:14,padding:"10px 14px"}} placeholder="Posez votre question…" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}/>
          <button style={{...S.btn,width:"auto",padding:"10px 16px",fontSize:16}} onClick={send}>📤</button>
        </div>
      </div>
      <div style={{marginTop:10,fontSize:11,color:"#6b7280",textAlign:"center"}}>Assistant disponible 24h/24 — répond uniquement sur {name}</div>
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
  const [del,setDel]=useState(null);
  const {isMobile}=useBreakpoint();
  const toggle=async(id)=>{await updateMenu(menu.map(m=>m.id===id?{...m,available:!m.available}:m));showToast("Mise à jour ✅");};
  const save=async(item)=>{
    if(!item.name.trim()) return showToast("Nom requis","error");
    if(!item.price||isNaN(item.price)) return showToast("Prix invalide","error");
    const saved={...item,price:parseFloat(item.price)||0,points:parseInt(item.points)||0};
    await updateMenu(saved.id?menu.map(m=>m.id===saved.id?saved:m):[...menu,{...saved,id:genId()}]);
    setForm(null);showToast(saved.id?"Modifié ✅":"Ajouté ✅");
  };
  const filtered=menu.filter(m=>m.cat===activeTab&&(!search||m.name.toLowerCase().includes(search.toLowerCase())));
  return (
    <div style={S.page}>
      <div style={{...S.pageHeader,flexWrap:"wrap",gap:8}}>
        <h1 style={S.pageTitle}>🍽️ Produits</h1>
        <button style={{...S.btn,width:"auto"}} onClick={()=>setForm({cat:activeTab,name:"",desc:"",price:"",points:"",available:true})}>＋ Nouveau</button>
      </div>
      <div style={S.tabBar}>{cats.map(c=>{const cnt=menu.filter(m=>m.cat===c).length;return<div key={c} style={{...S.tab,...(activeTab===c?S.tabActive:{})}} onClick={()=>{setActiveTab(c);setSearch("");}}>{CAT_ICONS[c]} {!isMobile&&CAT_LABELS[c]} <span style={{background:"rgba(0,0,0,0.2)",borderRadius:10,padding:"1px 5px",fontSize:10,marginLeft:3}}>{cnt}</span></div>;})}</div>
      <input style={{...S.input,marginBottom:12}} placeholder="🔍 Rechercher…" value={search} onChange={e=>setSearch(e.target.value)}/>
      {filtered.length===0&&<div style={{...S.card,textAlign:"center",padding:40}}><div style={{fontSize:40}}>{CAT_ICONS[activeTab]}</div><p style={{color:"#6b7280",marginBottom:12,marginTop:8}}>Aucun produit</p><button style={{...S.btn,width:"auto"}} onClick={()=>setForm({cat:activeTab,name:"",desc:"",price:"",points:"",available:true})}>＋ Ajouter</button></div>}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(auto-fill,minmax(250px,1fr))",gap:12}}>
        {filtered.map(item=>(
          <div key={item.id} style={{background:"#161b22",border:`1px solid ${item.available?"#30363d":"#7f1d1d"}`,borderRadius:12,padding:16,opacity:item.available?1:0.7,position:"relative"}}>
            <div style={{position:"absolute",top:10,right:10,fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:10,background:item.available?"#1a3a1a":"#7f1d1d",color:item.available?"#86efac":"#fca5a5"}}>{item.available?"✅":"🚫"}</div>
            <div style={{fontSize:26,marginBottom:6}}>{CAT_ICONS[item.cat]}</div>
            <div style={{fontWeight:700,fontSize:14,marginBottom:3,paddingRight:50}}>{item.name}</div>
            {item.desc&&<div style={{fontSize:12,color:"#9ca3af",marginBottom:8}}>{item.desc}</div>}
            <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
              <span style={{color:"#d4a853",fontWeight:700}}>{fmt(item.price)}</span>
              <span style={{fontSize:11,color:"#9ca3af",background:"#1f2937",padding:"2px 6px",borderRadius:8}}>⭐ {item.points||0}</span>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button style={{...S.btnSm,flex:1}} onClick={()=>toggle(item.id)}>{item.available?"🚫 Désact.":"✅ Act."}</button>
              <button style={{...S.btnSm,padding:"7px 10px"}} onClick={()=>setForm({...item})}>✏️</button>
              <button style={{...S.btnSm,...S.btnDanger,padding:"7px 10px"}} onClick={()=>setDel(item)}>🗑️</button>
            </div>
          </div>
        ))}
      </div>
      {form&&<div style={S.modal}><div style={S.modalCard} className="modal-card-mobile">
        <h3 style={S.cardTitle}>{form.id?"✏️ Modifier":"＋ Nouveau"}</h3>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>{cats.map(c=><div key={c} style={{...S.tab,...(form.cat===c?S.tabActive:{}),cursor:"pointer",fontSize:11,padding:"5px 9px"}} onClick={()=>setForm(p=>({...p,cat:c}))}>{CAT_ICONS[c]} {CAT_LABELS[c]}</div>)}</div>
        <label style={S.label}>Nom *</label><input style={S.input} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/>
        <label style={S.label}>Description courte</label><textarea style={{...S.input,resize:"vertical",minHeight:60}} value={form.desc||""} onChange={e=>setForm(p=>({...p,desc:e.target.value}))}/>
        <label style={S.label}>📋 Détails du plat (ingrédients, préparation, origine…)</label><textarea style={{...S.input,resize:"vertical",minHeight:80}} placeholder="Ex: Entrecôte de bœuf charolais 250g, pommes de terre ratte sautées au beurre, sauce béarnaise maison..." value={form.details||""} onChange={e=>setForm(p=>({...p,details:e.target.value}))}/>
        <label style={S.label}>⚠️ Allergènes</label><input style={S.input} placeholder="Ex: Gluten, Lactose, Œufs…" value={form.allergens||""} onChange={e=>setForm(p=>({...p,allergens:e.target.value}))}/>
        <div style={{display:"flex",gap:12}}><div style={{flex:1}}><label style={S.label}>Prix (€) *</label><input style={S.input} type="number" step="0.01" min="0" value={form.price} onChange={e=>setForm(p=>({...p,price:e.target.value}))}/></div><div style={{flex:1}}><label style={S.label}>Points</label><input style={S.input} type="number" min="0" value={form.points||""} onChange={e=>setForm(p=>({...p,points:e.target.value}))}/></div></div>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <div style={{...S.orderTypeBtn,flex:1,fontSize:13,...(form.available?S.orderTypeBtnActive:{})}} onClick={()=>setForm(p=>({...p,available:true}))}>✅ Disponible</div>
          <div style={{...S.orderTypeBtn,flex:1,fontSize:13,...(!form.available?{...S.orderTypeBtnActive,border:"2px solid #ef4444",color:"#ef4444"}:{})}} onClick={()=>setForm(p=>({...p,available:false}))}>🚫 Indispo</div>
        </div>
        <div style={{display:"flex",gap:8}}><button style={S.btn} onClick={()=>save(form)}>💾 Sauvegarder</button><button style={S.btnOutline} onClick={()=>setForm(null)}>Annuler</button></div>
      </div></div>}
      {del&&<div style={S.modal}><div style={{...S.modalCard,maxWidth:360}}>
        <h3 style={{...S.cardTitle,color:"#ef4444"}}>🗑️ Supprimer ?</h3>
        <div style={{background:"#0d1117",borderRadius:10,padding:12,marginBottom:12}}><div style={{fontWeight:700}}>{del.name}</div><div style={{fontSize:12,color:"#9ca3af"}}>{fmt(del.price)}</div></div>
        <p style={{fontSize:13,color:"#9ca3af",marginBottom:12}}>Action irréversible.</p>
        <div style={{display:"flex",gap:8}}><button style={{...S.btn,background:"#7f1d1d",color:"#fca5a5",border:"1px solid #991b1b"}} onClick={async()=>{await updateMenu(menu.filter(m=>m.id!==del.id));setDel(null);showToast("Supprimé");}}>🗑️ Supprimer</button><button style={S.btnOutline} onClick={()=>setDel(null)}>Annuler</button></div>
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
  const [delConfirm,setDelConfirm]=useState(null);
  const clients=users.filter(u=>u.role==="client");
  const filtered=clients.filter(c=>!search||c.name.toLowerCase().includes(search.toLowerCase())||c.email.toLowerCase().includes(search.toLowerCase())||(c.refNumber&&c.refNumber.toLowerCase().includes(search.toLowerCase())));

  const saveClient=async(c)=>{
    if(!c.name.trim()||!c.email.trim()) return showToast("Nom et email requis","error");
    const existing=await dbGet("users")||[];
    if(existing.find(u=>u.email.toLowerCase()===c.email.toLowerCase()&&u.id!==c.id)) return showToast("Email déjà utilisé","error");
    let nu;
    if(c.id){const pw=c._newPw?await hashPw(c._newPw):c.password;const{_newPw,...clean}=c;nu=existing.map(u=>u.id===c.id?{...clean,password:pw}:u);}
    else{
      const h=await hashPw(c.password||"client123");
      const newRef=c.refNumber||genRef();
      const newId=genId();
      const newU={...c,id:newId,role:"client",points:c.points||0,refNumber:newRef,password:h,createdAt:new Date().toISOString(),mustChangePassword:true};
      nu=[...existing,newU];
      // Message de bienvenue
      const freshMsgs=await dbGet("messages")||[];
      const welcomeMsg={id:genId(),clientId:newId,clientName:c.name,motif:"Bienvenue",text:`Bonjour ${c.name} ! 👋 Votre compte RestoPro vient d'être créé par notre équipe.

🔑 Pour votre sécurité, modifiez votre mot de passe dès maintenant dans ⚙️ Mon compte → Changer le mot de passe.

Votre numéro de référence fidélité : ${newRef}

Bienvenue !`,createdAt:new Date().toISOString(),fromAdmin:true,readByAdmin:true,readByClient:false};
      await dbSet("messages",[...freshMsgs,welcomeMsg]);
    }
    await updateUsers(nu);setForm(null);showToast("Client sauvegardé ✅");
  };
  const delClient=async(id)=>{const e=await dbGet("users")||[];await updateUsers(e.filter(u=>u.id!==id));setDelConfirm(null);if(selected?.id===id)setSelected(null);showToast("Client supprimé");};

  if(selected){
    const cInv=invoices.filter(i=>i.clientId===selected.id).slice().reverse();
    const spent=cInv.reduce((s,i)=>s+i.total,0);
    return(
      <div style={S.page}>
        <button style={{...S.btnOutline,width:"auto",marginBottom:16}} onClick={()=>setSelected(null)}>← Retour</button>
        <div style={S.card}>
          <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <div><h2 style={{fontFamily:"'Playfair Display',serif",fontSize:20,marginBottom:4}}>{selected.name}</h2><div style={{fontSize:13,color:"#9ca3af"}}>{selected.email}</div><div style={{fontSize:12,color:"#d4a853",marginTop:4,fontWeight:700}}>{selected.refNumber}</div><div style={{fontSize:11,color:"#6b7280",marginTop:2}}>Membre depuis {fmtDate(selected.createdAt)}</div></div>
            <div style={{textAlign:"right"}}><div style={{fontSize:24,fontWeight:700,color:"#d4a853"}}>⭐ {selected.points||0} pts</div><div style={{fontSize:12,color:"#9ca3af"}}>CA : {fmt(spent)} · {cInv.length} cmde{cInv.length>1?"s":""}</div></div>
          </div>
        </div>
        <div style={S.card}><h3 style={S.cardTitle}>🧾 Historique</h3>
          {cInv.length===0&&<p style={S.empty}>Aucune facture</p>}
          {cInv.map(inv=><div key={inv.id} style={S.row}><div><div style={{fontWeight:600}}>{fmt(inv.total)}</div><div style={{fontSize:11,color:"#9ca3af"}}>{fmtDate(inv.paidAt)} · {PAY_MODES[inv.payMode]||"—"}</div></div><span style={{fontSize:11,color:"#9ca3af"}}>{inv.items.length} art.</span></div>)}
        </div>
      </div>
    );
  }

  return(
    <div style={S.page}>
      <div style={{...S.pageHeader,flexWrap:"wrap",gap:8}}>
        <h1 style={S.pageTitle}>👥 Clients ({clients.length})</h1>
        <button style={{...S.btn,width:"auto"}} onClick={()=>setForm({role:"client",name:"",email:"",password:"client123",points:0,refNumber:genRef()})}>＋ Nouveau</button>
      </div>
      <input style={S.input} placeholder="🔍 Nom, email ou REF…" value={search} onChange={e=>setSearch(e.target.value)}/>
      {filtered.map(c=>(
        <div key={c.id} style={S.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div style={{cursor:"pointer"}} onClick={()=>setSelected(c)}><div style={{fontWeight:700}}>{c.name}</div><div style={{fontSize:12,color:"#9ca3af"}}>{c.email}</div><div style={{fontSize:11,color:"#d4a853",fontWeight:700}}>{c.refNumber}</div></div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              <span style={S.pill}>⭐ {c.points||0}</span>
              <button style={S.btnSm} onClick={()=>setSelected(c)}>👁️</button>
              <button style={S.btnSm} onClick={()=>setForm({...c,_newPw:""})}>✏️</button>
              <button style={{...S.btnSm,...S.btnDanger}} onClick={()=>setDelConfirm(c)}>🗑️</button>
            </div>
          </div>
        </div>
      ))}
      {form&&<div style={S.modal}><div style={S.modalCard} className="modal-card-mobile">
        <h3 style={S.cardTitle}>{form.id?"✏️ Modifier":"＋ Nouveau"} client</h3>
        <label style={S.label}>Nom</label><input style={S.input} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/>
        <label style={S.label}>Email</label><input style={S.input} type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}/>
        <label style={S.label}>{form.id?"Nouveau mot de passe (vide = inchangé)":"Mot de passe"}</label>
        <input style={S.input} type="password" value={form._newPw!==undefined?form._newPw:form.password||""} onChange={e=>setForm(p=>({...p,[p.id?"_newPw":"password"]:e.target.value}))}/>
        <label style={S.label}>Points</label><input style={S.input} type="number" min="0" value={form.points||0} onChange={e=>setForm(p=>({...p,points:parseInt(e.target.value)||0}))}/>
        <label style={S.label}>Référence</label>
        <div style={{display:"flex",gap:8}}><input style={{...S.input,marginBottom:0}} value={form.refNumber||""} onChange={e=>setForm(p=>({...p,refNumber:e.target.value}))}/><button style={S.btnSm} onClick={()=>setForm(p=>({...p,refNumber:genRef()}))}>🔄</button></div>
        <div style={{height:12}}/>
        <div style={{display:"flex",gap:8}}><button style={S.btn} onClick={()=>saveClient(form)}>💾 Sauvegarder</button><button style={S.btnOutline} onClick={()=>setForm(null)}>Annuler</button></div>
      </div></div>}
      {delConfirm&&<div style={S.modal}><div style={{...S.modalCard,maxWidth:360}}>
        <h3 style={{...S.cardTitle,color:"#ef4444"}}>🗑️ Supprimer {delConfirm.name} ?</h3>
        <p style={{fontSize:13,color:"#9ca3af",marginBottom:12}}>Action irréversible.</p>
        <div style={{display:"flex",gap:8}}><button style={{...S.btn,background:"#7f1d1d",color:"#fca5a5",border:"1px solid #991b1b"}} onClick={()=>delClient(delConfirm.id)}>🗑️ Supprimer</button><button style={S.btnOutline} onClick={()=>setDelConfirm(null)}>Annuler</button></div>
      </div></div>}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN LOYALTY + SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════
function AdminLoyalty({rewards,updateRewards,settings,updateSettings,users,showToast}) {
  const [form,setForm]=useState(null);
  const top=[...users].filter(u=>u.role==="client").sort((a,b)=>(b.points||0)-(a.points||0)).slice(0,10);
  const save=async(r)=>{if(!r.name||!r.points)return showToast("Requis","error");await updateRewards(r.id?rewards.map(x=>x.id===r.id?r:x):[...rewards,{...r,id:genId()}]);setForm(null);showToast("Sauvegardé ✅");};
  return(
    <div style={S.page}>
      <h1 style={S.pageTitle}>⭐ Programme fidélité</h1>
      <div style={S.card}>
        <h3 style={S.cardTitle}>⚙️ Points par euro</h3>
        <div style={{display:"flex",gap:8}}>
          <input style={{...S.input,marginBottom:0,flex:1}} type="number" min="0" step="0.1" value={settings.pointsPerEuro||1} onChange={e=>updateSettings({...settings,pointsPerEuro:parseFloat(e.target.value)||1})}/>
          <button style={S.btnSm} onClick={()=>showToast("Sauvegardé ✅")}>OK</button>
        </div>
      </div>
      <div style={S.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <h3 style={{...S.cardTitle,marginBottom:0}}>🎁 Récompenses</h3>
          <button style={{...S.btn,width:"auto",padding:"8px 14px"}} onClick={()=>setForm({name:"",points:"",desc:""})}>＋</button>
        </div>
        {rewards.map(r=>(
          <div key={r.id} style={S.row}>
            <div><div style={{fontWeight:700}}>{r.name}</div><div style={{fontSize:12,color:"#9ca3af"}}>{r.desc}</div></div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={S.pill}>⭐ {r.points}</span>
              <button style={S.btnSm} onClick={()=>setForm({...r})}>✏️</button>
              <button style={{...S.btnSm,...S.btnDanger}} onClick={async()=>{await updateRewards(rewards.filter(x=>x.id!==r.id));showToast("Supprimé");}}>🗑️</button>
            </div>
          </div>
        ))}
      </div>
      {top.length>0&&<div style={S.card}><h3 style={S.cardTitle}>🏆 Top clients</h3>
        {top.map((c,i)=><div key={c.id} style={S.row}><div style={{display:"flex",gap:10,alignItems:"center"}}><span style={{fontWeight:700,color:"#d4a853",width:20}}>#{i+1}</span><div><div style={{fontWeight:600}}>{c.name}</div><div style={{fontSize:11,color:"#d4a853"}}>{c.refNumber}</div></div></div><span style={S.pill}>⭐ {c.points||0}</span></div>)}
      </div>}
      {form&&<div style={S.modal}><div style={S.modalCard}>
        <h3 style={S.cardTitle}>{form.id?"Modifier":"Ajouter"} récompense</h3>
        <label style={S.label}>Nom</label><input style={S.input} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/>
        <label style={S.label}>Description</label><input style={S.input} value={form.desc||""} onChange={e=>setForm(p=>({...p,desc:e.target.value}))}/>
        <label style={S.label}>Points</label><input style={S.input} type="number" min="0" value={form.points} onChange={e=>setForm(p=>({...p,points:parseInt(e.target.value)||0}))}/>
        <div style={{display:"flex",gap:8}}><button style={S.btn} onClick={()=>save(form)}>💾</button><button style={S.btnOutline} onClick={()=>setForm(null)}>Annuler</button></div>
      </div></div>}
    </div>
  );
}

function AdminSettings({settings,updateSettings,currentUser,updateUsers,users,showToast,logout}) {
  const DAYS=[["lundi","Lundi"],["mardi","Mardi"],["mercredi","Mercredi"],["jeudi","Jeudi"],["vendredi","Vendredi"],["samedi","Samedi"],["dimanche","Dimanche"]];
  const [employees,setEmployees]=useState(users.filter(u=>u.role==="employee"));
  const [form,setForm]=useState(null);
  const [section,setSection]=useState("infos");
  const [contactForm,setContactForm]=useState({...settings});
  const [hoursForm,setHoursForm]=useState(typeof settings.hours==="object"?{...settings.hours}:{lundi:"10:00-00:00",mardi:"10:00-00:00",mercredi:"10:00-00:00",jeudi:"10:00-00:00",vendredi:"10:00-00:00",samedi:"09:30-00:00",dimanche:"Fermé"});
  const [pushTitle,setPushTitle]=useState("");
  const [pushBody,setPushBody]=useState("");
  const [pushSending,setPushSending]=useState(false);
  useEffect(()=>setEmployees(users.filter(u=>u.role==="employee")),[users]);

  const saveEmp=async(e)=>{
    if(!e.name||!e.email) return showToast("Nom et email requis","error");
    const existing=await dbGet("users")||[];
    let nu;
    if(e.id){const orig=existing.find(u=>u.id===e.id);const pw=e._newPw?await hashPw(e._newPw):orig.password;const{_newPw,...clean}=e;nu=existing.map(u=>u.id===e.id?{...clean,password:pw}:u);}
    else{if(!e.password||e.password.length<6)return showToast("Mot de passe min 6 car.","error");const h=await hashPw(e.password);nu=[...existing,{...e,id:genId(),role:"employee",points:0,refNumber:genRef(),password:h,createdAt:new Date().toISOString()}];}
    await updateUsers(nu);setForm(null);showToast("Employé sauvegardé ✅");
  };
  const saveContact=async()=>{await updateSettings({...contactForm,hours:hoursForm});showToast("Infos mises à jour ✅");};
  const saveHours=async()=>{await updateSettings({...settings,hours:hoursForm});showToast("Horaires mis à jour ✅");};

  const sendGlobalPush=async()=>{
    if(!pushTitle.trim()||!pushBody.trim()) return showToast("Titre et message requis","error");
    setPushSending(true);
    const clients=users.filter(u=>u.role==="client");
    let sent=0;
    for(const cl of clients){
      try{
        const snap=await getDoc(doc(db,"restopro_push",cl.id));
        if(snap.exists()){
          await fetch("/api/send-push",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({subscription:JSON.parse(snap.data().sub),title:pushTitle,body:pushBody,tag:"promo",url:"/"})});
          sent++;
        }
      }catch{}
    }
    setPushSending(false);setPushTitle("");setPushBody("");
    showToast(`Notification envoyée à ${sent} client${sent>1?"s":""} ✅`);
  };

  const tabs=[["infos","📍 Infos"],["hours","🕐 Horaires"],["push","🔔 Notifs"],["employees","👨‍🍳 Employés"]];

  return(
    <div style={S.page}>
      <h1 style={S.pageTitle}>⚙️ Paramètres</h1>
      <div style={{...S.tabBar,marginBottom:20}}>
        {tabs.map(([k,l])=><div key={k} style={{...S.tab,...(section===k?S.tabActive:{})}} onClick={()=>setSection(k)}>{l}</div>)}
      </div>

      {/* ── Infos restaurant ── */}
      {section==="infos"&&<div style={S.card}>
        <h3 style={S.cardTitle}>📍 Informations du restaurant</h3>
        {[["restaurantName","🏠 Nom du restaurant"],["address","📍 Adresse complète"],["phone","📞 Téléphone"],["email","✉️ Email"],["siret","🏢 SIRET"],["googleMapsUrl","🗺️ Lien Google Maps"]].map(([key,label])=>(
          <div key={key}><label style={S.label}>{label}</label><input style={S.input} value={contactForm[key]||""} onChange={e=>setContactForm(p=>({...p,[key]:e.target.value}))}/></div>
        ))}
        <button style={{...S.btn,width:"auto"}} onClick={saveContact}>💾 Sauvegarder</button>
      </div>}

      {/* ── Horaires ── */}
      {section==="hours"&&<div style={S.card}>
        <h3 style={S.cardTitle}>🕐 Horaires d'ouverture</h3>
        <div style={{fontSize:12,color:"#9ca3af",marginBottom:16}}>Format : HH:MM-HH:MM (ex: 10:00-23:00) ou "Fermé"</div>
        {DAYS.map(([key,label])=>(
          <div key={key} style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
            <div style={{width:90,fontWeight:600,fontSize:14,flexShrink:0,color:hoursForm[key]==="Fermé"?"#6b7280":"#f3f4f6"}}>{label}</div>
            <input style={{...S.input,marginBottom:0,flex:1}} value={hoursForm[key]||""} onChange={e=>setHoursForm(p=>({...p,[key]:e.target.value}))} placeholder="10:00-23:00 ou Fermé"/>
            <button style={{...S.btnSm,flexShrink:0}} onClick={()=>setHoursForm(p=>({...p,[key]:"Fermé"}))}>Fermé</button>
          </div>
        ))}
        <button style={{...S.btn,width:"auto",marginTop:8}} onClick={saveHours}>💾 Sauvegarder</button>
      </div>}


      {/* ── Notifications push ── */}
      {section==="push"&&<div style={S.card}>
        <h3 style={S.cardTitle}>🔔 Notification globale clients</h3>
        <div style={{background:"#1c1a00",border:"1px solid #d4a853",borderRadius:10,padding:12,marginBottom:16,fontSize:13,color:"#fde68a",lineHeight:1.7}}>
          📱 Envoyez une notification push à <strong>tous vos clients</strong> qui ont activé les notifications (Android &amp; iOS).
        </div>
        <label style={S.label}>📣 Titre de la notification</label>
        <input style={S.input} placeholder="Ex: 🎉 Promotion du soir !" value={pushTitle} onChange={e=>setPushTitle(e.target.value)} maxLength={50}/>
        <div style={{fontSize:11,color:"#9ca3af",marginBottom:12,textAlign:"right"}}>{pushTitle.length}/50</div>
        <label style={S.label}>💬 Message</label>
        <textarea style={{...S.input,resize:"vertical",minHeight:80}} placeholder="Ex: 1 table de 2 personnes = -10% sur l'addition finale ce soir ! Réservez maintenant." value={pushBody} onChange={e=>setPushBody(e.target.value)} maxLength={200}/>
        <div style={{fontSize:11,color:"#9ca3af",marginBottom:16,textAlign:"right"}}>{pushBody.length}/200</div>
        {pushTitle&&pushBody&&<div style={{background:"#0d1117",borderRadius:12,padding:14,marginBottom:16,border:"1px solid #374151"}}>
          <div style={{fontSize:11,color:"#9ca3af",marginBottom:6}}>Aperçu :</div>
          <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
            <div style={{width:36,height:36,borderRadius:8,background:"#d4a853",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>🍽️</div>
            <div><div style={{fontWeight:700,fontSize:13}}>{pushTitle}</div><div style={{fontSize:12,color:"#9ca3af",marginTop:3}}>{pushBody}</div></div>
          </div>
        </div>}
        <button style={{...S.btn,width:"auto",opacity:pushSending?0.6:1}} onClick={sendGlobalPush} disabled={pushSending}>
          {pushSending?"⏳ Envoi en cours…":"📤 Envoyer à tous les clients"}
        </button>
        <div style={{fontSize:12,color:"#6b7280",marginTop:10}}>Seuls les clients ayant activé les notifications recevront le message.</div>
      </div>}

      {/* ── Employés ── */}
      {section==="employees"&&<div style={S.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <h3 style={{...S.cardTitle,marginBottom:0}}>👨‍🍳 Employés ({employees.length})</h3>
          <button style={{...S.btn,width:"auto",padding:"8px 14px"}} onClick={()=>setForm({role:"employee",name:"",email:"",password:""})}>＋ Ajouter</button>
        </div>
        {employees.length===0&&<p style={S.empty}>Aucun employé</p>}
        {employees.map(e=>(
          <div key={e.id} style={S.row}>
            <div><div style={{fontWeight:700}}>{e.name}</div><div style={{fontSize:12,color:"#9ca3af"}}>{e.email}</div></div>
            <div style={{display:"flex",gap:8}}><button style={S.btnSm} onClick={()=>setForm({...e,_newPw:""})}>✏️</button><button style={{...S.btnSm,...S.btnDanger}} onClick={async()=>{const ex=await dbGet("users")||[];await updateUsers(ex.filter(u=>u.id!==e.id));showToast("Supprimé");}}>🗑️</button></div>
          </div>
        ))}
      </div>}

      <UserSettings currentUser={currentUser} users={users} updateUsers={updateUsers} showToast={showToast} setCurrentUser={()=>{}} logout={logout}/>

      {form&&<div style={S.modal}><div style={S.modalCard}>
        <h3 style={S.cardTitle}>{form.id?"✏️ Modifier":"＋ Nouvel"} employé</h3>
        <label style={S.label}>Nom</label><input style={S.input} value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/>
        <label style={S.label}>Email</label><input style={S.input} type="email" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}/>
        <label style={S.label}>{form.id?"Nouveau mot de passe (vide = inchangé)":"Mot de passe *"}</label>
        <input style={S.input} type="password" value={form._newPw!==undefined?form._newPw:form.password||""} onChange={e=>setForm(p=>({...p,[p.id?"_newPw":"password"]:e.target.value}))}/>
        <div style={{display:"flex",gap:8}}><button style={S.btn} onClick={()=>saveEmp(form)}>💾</button><button style={S.btnOutline} onClick={()=>setForm(null)}>Annuler</button></div>
      </div></div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMP CLIENTS
// ═══════════════════════════════════════════════════════════════════════════════
function EmpClients({users,updateUsers,showToast}) {
  const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [pw,setPw]=useState(""); const [loading,setLoading]=useState(false); const [lastRef,setLastRef]=useState(null);
  const create=async()=>{
    if(!name||!email||!pw) return showToast("Remplissez tous les champs","error");
    if(pw.length<6) return showToast("Mot de passe min 6 car.","error");
    setLoading(true);
    const existing=await dbGet("users")||[];
    if(existing.find(u=>u.email.toLowerCase()===email.toLowerCase())){setLoading(false);return showToast("Email déjà utilisé","error");}
    const hashed=await hashPw(pw);
    const ref=genRef();
    const newUser={id:genId(),role:"client",name:name.trim(),email:email.trim(),password:hashed,points:0,refNumber:ref,createdAt:new Date().toISOString(),mustChangePassword:true};
    await updateUsers([...existing,newUser]);
    // Message automatique de bienvenue
    const freshMsgs=await dbGet("messages")||[];
    const welcomeMsg={id:genId(),clientId:newUser.id,clientName:newUser.name,motif:"Bienvenue",text:`Bonjour ${name.trim()} ! 👋 Votre compte RestoPro vient d'être créé.

🔑 Votre mot de passe temporaire a été défini par notre équipe. Pour votre sécurité, nous vous invitons à le modifier dès maintenant dans ⚙️ Mon compte → Changer le mot de passe.

Votre numéro de référence fidélité : ${ref}

Bienvenue parmi nous !`,createdAt:new Date().toISOString(),fromAdmin:true,readByAdmin:true,readByClient:false};
    await dbSet("messages",[...freshMsgs,welcomeMsg]);
    setLastRef(ref);setName("");setEmail("");setPw("");setLoading(false);showToast(`Compte créé ! Réf : ${ref} ✅`);
  };
  return(
    <div style={S.page}>
      <h1 style={S.pageTitle}>👤 Créer un compte client</h1>
      {lastRef&&<div style={{...S.card,background:"#1a3a1a",border:"1px solid #166534",textAlign:"center",padding:20}}>
        <div style={{fontSize:24,marginBottom:8}}>✅ Compte créé</div>
        <div style={{fontSize:20,fontWeight:700,color:"#d4a853",letterSpacing:3}}>{lastRef}</div>
        <div style={{fontSize:12,color:"#86efac",marginTop:4}}>Communiquez ce numéro au client</div>
      </div>}
      <div style={S.card}>
        <h3 style={S.cardTitle}>Nouveau client</h3>
        <div style={{...S.card,background:"#1c1a00",border:"1px solid #d4a853",padding:10,marginBottom:12,fontSize:12,color:"#fde68a"}}>ℹ️ Vous ne pouvez que créer des comptes. Les infos existants sont confidentiels.</div>
        <label style={S.label}>Nom complet</label><input style={S.input} placeholder="Jean Dupont" value={name} onChange={e=>setName(e.target.value)}/>
        <label style={S.label}>Email</label><input style={S.input} placeholder="client@email.com" value={email} onChange={e=>setEmail(e.target.value)} type="email"/>
        <label style={S.label}>Mot de passe temporaire</label><input style={S.input} placeholder="Min 6 caractères" value={pw} onChange={e=>setPw(e.target.value)} type="password"/>
        <button style={{...S.btn,width:"auto",opacity:loading?0.6:1}} onClick={create} disabled={loading}>{loading?"⏳…":"Créer le compte"}</button>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// USER SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════
function UserSettings({currentUser,users,updateUsers,showToast,setCurrentUser,logout}) {
  const [name,setName]=useState(currentUser.name||"");
  const [email,setEmail]=useState(currentUser.email||"");
  const [pwOld,setPwOld]=useState(""); const [pwNew,setPwNew]=useState(""); const [pwConf,setPwConf]=useState("");
  const [loading,setLoading]=useState(false);
  const [confirmLogout,setConfirmLogout]=useState(false);
  const saveProfile=async()=>{
    if(!name.trim()||!email.trim()) return showToast("Requis","error");
    const fresh=await dbGet("users")||[];
    if(fresh.find(u=>u.email.toLowerCase()===email.toLowerCase()&&u.id!==currentUser.id)) return showToast("Email déjà utilisé","error");
    setLoading(true);
    const updated={...currentUser,name:name.trim(),email:email.trim()};
    await updateUsers(fresh.map(u=>u.id===currentUser.id?updated:u));
    if(setCurrentUser) setCurrentUser(updated);
    setLoading(false);showToast("Profil mis à jour ✅");
  };
  const savePassword=async()=>{
    if(!pwOld||!pwNew||!pwConf) return showToast("Remplissez tous les champs","error");
    const ok=await checkPw(pwOld,currentUser.password);
    if(!ok) return showToast("Mot de passe actuel incorrect","error");
    if(pwNew.length<6) return showToast("Minimum 6 caractères","error");
    if(pwNew!==pwConf) return showToast("Ne correspondent pas","error");
    setLoading(true);
    const fresh=await dbGet("users")||[];
    const hashed=await hashPw(pwNew);
    const updated={...currentUser,password:hashed};
    await updateUsers(fresh.map(u=>u.id===currentUser.id?updated:u));
    if(setCurrentUser) setCurrentUser(updated);
    setPwOld("");setPwNew("");setPwConf("");
    setLoading(false);showToast("Mot de passe changé ✅");
  };
  return(
    <>
      <div style={S.card}>
        <h3 style={S.cardTitle}>👤 Mon profil</h3>
        <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16,padding:14,background:"#0d1117",borderRadius:10,border:"1px solid #21262d"}}>
          <div style={{width:48,height:48,borderRadius:"50%",background:"#1f2937",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>
            {currentUser.role==="admin"?"👑":currentUser.role==="employee"?"👨‍🍳":"👤"}
          </div>
          <div>
            <div style={{fontWeight:700}}>{currentUser.name}</div>
            <div style={{fontSize:12,color:"#9ca3af"}}>{currentUser.email}</div>
            {currentUser.refNumber&&<div style={{fontSize:12,color:"#d4a853",marginTop:3,fontWeight:700,letterSpacing:1}}>{currentUser.refNumber}</div>}
            {currentUser.role==="client"&&<div style={{fontSize:11,color:"#9ca3af",marginTop:2}}>⭐ {currentUser.points||0} points de fidélité</div>}
          </div>
        </div>
        <label style={S.label}>Nom complet</label><input style={S.input} value={name} onChange={e=>setName(e.target.value)}/>
        <label style={S.label}>Email</label><input style={S.input} type="email" value={email} onChange={e=>setEmail(e.target.value)}/>
        <button style={{...S.btn,width:"auto",opacity:loading?0.6:1}} onClick={saveProfile} disabled={loading}>{loading?"⏳…":"💾 Sauvegarder"}</button>
      </div>
      <div style={S.card}>
        <h3 style={S.cardTitle}>🔒 Changer le mot de passe</h3>
        <label style={S.label}>Mot de passe actuel</label><input style={S.input} type="password" value={pwOld} onChange={e=>setPwOld(e.target.value)} placeholder="••••••••"/>
        <label style={S.label}>Nouveau mot de passe</label><input style={S.input} type="password" value={pwNew} onChange={e=>setPwNew(e.target.value)} placeholder="Min 6 caractères"/>
        <label style={S.label}>Confirmer</label><input style={{...S.input,marginBottom:10}} type="password" value={pwConf} onChange={e=>setPwConf(e.target.value)} placeholder="••••••••"/>
        {pwNew&&pwConf&&<div style={{marginBottom:10,fontSize:12}}>{pwNew===pwConf?<span style={{color:"#22c55e"}}>✅ Correspondent</span>:<span style={{color:"#ef4444"}}>❌ Ne correspondent pas</span>}</div>}
        <button style={{...S.btn,width:"auto",opacity:loading?0.6:1}} onClick={savePassword} disabled={loading}>{loading?"⏳…":"🔑 Changer"}</button>
      </div>
      {logout&&<div style={S.card}>
        <h3 style={S.cardTitle}>🚪 Déconnexion</h3>
        <p style={{fontSize:13,color:"#9ca3af",marginBottom:14}}>Vous serez redirigé vers la page de connexion.</p>
        {!confirmLogout
          ?<button style={{...S.btn,background:"#7f1d1d",color:"#fca5a5",border:"1px solid #991b1b",width:"auto"}} onClick={()=>setConfirmLogout(true)}>🚪 Se déconnecter</button>
          :<div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <span style={{fontSize:13,color:"#fca5a5"}}>Confirmer ?</span>
            <button style={{...S.btn,background:"#7f1d1d",color:"#fca5a5",border:"1px solid #991b1b",width:"auto"}} onClick={logout}>✅ Oui</button>
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
function ClientMenu({menu,placeOrder,showToast,cart,setCart,setPage,currentUser,rewards}) {
  const cats=["entree","plat","dessert","boisson","menu"];
  const [activeTab,setActiveTab]=useState("entree");
  const [showCart,setShowCart]=useState(false);
  const [detailModal,setDetailModal]=useState(null);
  const [orderType,setOrderType]=useState("surplace");
  const [payMode,setPayMode]=useState("comptoir");
  const [tableNum,setTableNum]=useState("");
  const [itemModal,setItemModal]=useState(null);
  const [itemNote,setItemNote]=useState("");
  const [showPay,setShowPay]=useState(false);
  const [paying,setPaying]=useState(false);
  const [showRewards,setShowRewards]=useState(false);
  const [selectedReward,setSelectedReward]=useState(null);
  const avRewards=rewards.filter(r=>r.points<=(currentUser.points||0));
  const addItem=(item)=>{setCart(prev=>{const ex=prev.find(x=>x.id===item.id&&x.note===itemNote);return ex?prev.map(x=>(x.id===item.id&&x.note===itemNote)?{...x,qty:x.qty+1}:x):[...prev,{...item,qty:1,note:itemNote,cartKey:genId()}];});showToast(`${item.name} ajouté ✅`);setItemModal(null);};
  const removeItem=(cartKey)=>setCart(prev=>prev.filter(x=>x.cartKey!==cartKey));
  const total=cart.reduce((s,i)=>s+i.price*i.qty,0);
  const goPayment=()=>{
    if(!cart.length) return showToast("Panier vide","error");
    if(orderType==="surplace"&&!tableNum.trim()) return showToast("N° de table requis","error");
    if(payMode==="cb") return showToast("Option indisponible pour le moment","error");
    setShowCart(false);setShowPay(true);
  };
  const confirmPayment=async()=>{
    setPaying(true);
    await placeOrder(cart,orderType,tableNum.trim(),selectedReward);
    setCart([]);setSelectedReward(null);setShowPay(false);setPaying(false);setTableNum("");setPage("client-orders");
    showToast(payMode==="comptoir"?"Commande envoyée ! Réglez au comptoir 🏦":"Commande confirmée 🎉");
  };
  const items=menu.filter(m=>m.cat===activeTab&&m.available);
  return(
    <div style={S.page}>
      <div style={S.pageHeader}>
        <h1 style={S.pageTitle}>🍽️ Menu</h1>
        <button style={{...S.btn,width:"auto",position:"relative"}} onClick={()=>setShowCart(true)}>🛒 {cart.length>0&&<span style={S.badge}>{cart.reduce((s,i)=>s+i.qty,0)}</span>}</button>
      </div>
      <div style={S.tabBar}>{cats.map(c=><div key={c} style={{...S.tab,...(activeTab===c?S.tabActive:{})}} onClick={()=>setActiveTab(c)}>{CAT_ICONS[c]} {CAT_LABELS[c]}</div>)}</div>
      <div style={S.menuGrid} className="menu-grid-mobile">
        {items.length===0&&<p style={S.empty}>Aucun article</p>}
        {items.map(item=>(
          <div key={item.id} style={{...S.menuCard,cursor:"pointer"}} className="menu-card-mobile" onClick={()=>setDetailModal(item)}>
            <div style={{fontSize:32,marginBottom:8}}>{CAT_ICONS[item.cat]}</div>
            <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>{item.name}</div>
            <div style={{fontSize:12,color:"#9ca3af",flex:1,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden"}}>{item.desc}</div>
            {item.details&&<div style={{fontSize:11,color:"#d4a853",marginTop:4}}>ℹ️ Voir détails</div>}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10}}>
              <span style={{color:"#d4a853",fontWeight:700,fontSize:15}}>{fmt(item.price)}</span>
              <span style={{fontSize:11,color:"#9ca3af"}}>+{item.points} pts</span>
            </div>
            <button style={{...S.btn,marginTop:8}} onClick={e=>{e.stopPropagation();setItemModal(item);setItemNote("");}}>Ajouter</button>
          </div>
        ))}
      </div>
      {detailModal&&<div style={S.modal} className="modal-mobile"><div style={S.modalCard} className="modal-card-mobile">
        <div style={{textAlign:"center",marginBottom:16}}>
          <div style={{fontSize:48,marginBottom:8}}>{CAT_ICONS[detailModal.cat]}</div>
          <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:22,color:"#d4a853",marginBottom:4}}>{detailModal.name}</h3>
          <div style={{fontSize:13,color:"#9ca3af"}}>{CAT_LABELS[detailModal.cat]}</div>
        </div>
        {detailModal.desc&&<div style={{background:"#0d1117",borderRadius:10,padding:14,marginBottom:12,fontSize:14,color:"#d1d5db",lineHeight:1.7}}>{detailModal.desc}</div>}
        {detailModal.details&&<div style={{background:"#0d1117",borderRadius:10,padding:14,marginBottom:12}}>
          <div style={{fontWeight:700,color:"#d4a853",marginBottom:8,fontSize:13}}>📋 Détails du plat</div>
          <div style={{fontSize:13,color:"#d1d5db",lineHeight:1.8,whiteSpace:"pre-wrap"}}>{detailModal.details}</div>
        </div>}
        {detailModal.allergens&&<div style={{background:"#1c1a00",border:"1px solid #d4a853",borderRadius:10,padding:12,marginBottom:12}}>
          <div style={{fontWeight:700,color:"#d4a853",marginBottom:4,fontSize:13}}>⚠️ Allergènes</div>
          <div style={{fontSize:13,color:"#fde68a"}}>{detailModal.allergens}</div>
        </div>}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderTop:"1px solid #30363d",borderBottom:"1px solid #30363d",marginBottom:16}}>
          <span style={{fontSize:20,fontWeight:700,color:"#d4a853"}}>{fmt(detailModal.price)}</span>
          <span style={{fontSize:13,color:"#9ca3af"}}>⭐ +{detailModal.points} points</span>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button style={S.btn} onClick={()=>{setItemModal(detailModal);setDetailModal(null);setItemNote("");}}>🛒 Ajouter au panier</button>
          <button style={{...S.btnOutline,width:"auto",padding:"12px 16px"}} onClick={()=>setDetailModal(null)}>✕</button>
        </div>
      </div></div>}
      {itemModal&&<div style={S.modal} className="modal-mobile"><div style={S.modalCard} className="modal-card-mobile">
        <h3 style={S.cardTitle}>{CAT_ICONS[itemModal.cat]} {itemModal.name}</h3>
        {itemModal.desc&&<p style={{fontSize:13,color:"#9ca3af",marginBottom:12}}>{itemModal.desc}</p>}
        <label style={S.label}>✏️ Personnalisation</label>
        <textarea style={{...S.input,resize:"vertical",minHeight:64}} placeholder="Ex : sans oignons…" value={itemNote} onChange={e=>setItemNote(e.target.value)}/>
        <div style={{display:"flex",gap:8}}><button style={S.btn} onClick={()=>addItem(itemModal)}>Ajouter</button><button style={S.btnOutline} onClick={()=>setItemModal(null)}>Annuler</button></div>
      </div></div>}
      {showCart&&<div style={S.modal} className="modal-mobile"><div style={S.modalCard} className="modal-card-mobile">
        <h3 style={S.cardTitle}>🛒 Mon panier</h3>
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <div style={{...S.orderTypeBtn,flex:1,fontSize:13,...(orderType==="surplace"?S.orderTypeBtnActive:{})}} onClick={()=>setOrderType("surplace")}>🪑 Sur place</div>
          <div style={{...S.orderTypeBtn,flex:1,fontSize:13,...(orderType==="emporter"?S.orderTypeBtnActive:{})}} onClick={()=>setOrderType("emporter")}>🥡 Emporter</div>
        </div>
        {orderType==="surplace"&&<input style={S.input} placeholder="N° de table *" value={tableNum} onChange={e=>setTableNum(e.target.value)}/>}
        <div style={{display:"flex",gap:8,marginBottom:12}}>
          <div style={{...S.orderTypeBtn,flex:1,fontSize:12,...(payMode==="comptoir"?S.orderTypeBtnActive:{})}} onClick={()=>setPayMode("comptoir")}>🏦 Comptoir</div>
          <div style={{...S.orderTypeBtn,flex:1,fontSize:12,opacity:0.4,cursor:"not-allowed",position:"relative"}} onClick={()=>showToast("Bientôt disponible","error")}>💳 CB<span style={{position:"absolute",top:-6,right:-4,background:"#374151",color:"#9ca3af",fontSize:8,padding:"1px 4px",borderRadius:4,fontWeight:700}}>BIENTÔT</span></div>
        </div>
        {avRewards.length>0&&<div style={{marginBottom:12}}>
          <div style={{fontSize:12,color:"#d4a853",fontWeight:600,marginBottom:6}}>🎁 Utiliser une récompense</div>
          {avRewards.map(r=><div key={r.id} style={{...S.orderTypeBtn,fontSize:12,marginBottom:6,...(selectedReward?.id===r.id?S.orderTypeBtnActive:{})}} onClick={()=>setSelectedReward(selectedReward?.id===r.id?null:r)}>{r.name} (⭐ {r.points} pts)</div>)}
        </div>}
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
        {cart.length>0&&<div style={{borderTop:"1px solid #374151",paddingTop:10,marginTop:8}}>
          <div style={{display:"flex",justifyContent:"space-between",fontWeight:700,marginBottom:10}}><span>Total</span><span style={{color:"#d4a853"}}>{fmt(total)}</span></div>
          <button style={S.btn} onClick={goPayment}>🏦 Commander & payer au comptoir</button>
        </div>}
        <button style={{...S.btnOutline,marginTop:8}} onClick={()=>setShowCart(false)}>Fermer</button>
      </div></div>}
      {showPay&&<div style={S.modal} className="modal-mobile"><div style={S.modalCard} className="modal-card-mobile">
        <h3 style={S.cardTitle}>🏦 Confirmer la commande</h3>
        <div style={{background:"#0d1117",border:"1px solid #374151",borderRadius:12,padding:16,marginBottom:16}}>
          <div style={{fontSize:24,fontWeight:700,color:"#d4a853"}}>{fmt(total)}</div>
          {orderType==="surplace"&&<div style={{fontSize:12,color:"#93c5fd",marginTop:4}}>🪑 Table {tableNum}</div>}
          {orderType==="emporter"&&<div style={{fontSize:12,color:"#86efac",marginTop:4}}>🥡 À emporter</div>}
          {selectedReward&&<div style={{fontSize:12,color:"#d4a853",marginTop:4}}>🎁 Récompense : {selectedReward.name}</div>}
        </div>
        <div style={{background:"#1c1a00",border:"1px solid #d4a853",borderRadius:10,padding:12,marginBottom:14,fontSize:13,color:"#fde68a",lineHeight:1.6}}>
          📋 Rendez-vous au comptoir pour régler <strong>{fmt(total)}</strong>.
        </div>
        {paying?<div style={{textAlign:"center",padding:16,color:"#d4a853"}}>⏳ Envoi en cuisine…</div>
          :<div style={{display:"flex",gap:8}}>
            <button style={S.btn} onClick={confirmPayment}>✅ Confirmer</button>
            <button style={S.btnOutline} onClick={()=>{setShowPay(false);setShowCart(true);}}>← Retour</button>
          </div>
        }
      </div></div>}
    </div>
  );
}

function ClientOrders({orders,currentUser}) {
  const mine=orders.filter(o=>o.clientId===currentUser.id&&o.status!=="done");
  return(
    <div style={S.page}>
      <h1 style={S.pageTitle}>📋 Commandes en cours</h1>
      {mine.length===0&&<div style={{...S.card,textAlign:"center",padding:40}}><div style={{fontSize:40,marginBottom:12}}>✅</div><p style={{color:"#6b7280"}}>Aucune commande en cours</p></div>}
      {mine.map(order=>(
        <div key={order.id} style={S.orderCard}>
          <div style={S.orderHeader}>
            <div><div style={{fontWeight:700,marginBottom:2}}>#{order.id.slice(0,6).toUpperCase()}</div><div style={{fontSize:12,color:"#9ca3af"}}>{fmtDate(order.createdAt)}</div><div style={{fontSize:12,color:"#9ca3af"}}>{order.orderType==="surplace"?`🪑 Table ${order.tableNumber}`:"🥡 À emporter"}</div></div>
            <span style={{...S.statusBadge,background:STATUS_CFG[order.status].color}}>{STATUS_CFG[order.status].icon} {STATUS_CFG[order.status].label}</span>
          </div>
          {order.items.map((it,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}><span>{it.qty}× {it.name}</span><span style={{color:"#d4a853"}}>{fmt(it.price*it.qty)}</span></div>)}
          <div style={{borderTop:"1px solid #30363d",paddingTop:10,marginTop:8,display:"flex",justifyContent:"space-between",fontWeight:700}}><span>Total</span><span style={{color:"#d4a853"}}>{fmt(order.total)}</span></div>
        </div>
      ))}
    </div>
  );
}

function ClientHistory({invoices,currentUser,settings,users}) {
  const mine=[...invoices].filter(i=>i.clientId===currentUser.id).reverse();
  const [expanded,setExpanded]=useState(null);
  const spent=mine.reduce((s,i)=>s+i.total,0);
  return(
    <div style={S.page}>
      <h1 style={S.pageTitle}>🧾 Historique</h1>
      {mine.length>0&&<div style={S.statsGrid}><div style={S.statCard}><div style={{fontSize:20,marginBottom:4}}>🧾</div><div style={{fontSize:18,fontWeight:700,color:"#d4a853"}}>{mine.length}</div><div style={{fontSize:12,color:"#9ca3af"}}>Commandes</div></div><div style={S.statCard}><div style={{fontSize:20,marginBottom:4}}>💰</div><div style={{fontSize:18,fontWeight:700,color:"#22c55e"}}>{fmt(spent)}</div><div style={{fontSize:12,color:"#9ca3af"}}>Dépensé</div></div></div>}
      {mine.length===0&&<p style={S.empty}>Aucune commande</p>}
      {mine.map(inv=>(
        <div key={inv.id} style={S.card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div><div style={{fontWeight:700}}>{inv.invoiceNum||'#'+inv.id.slice(0,8).toUpperCase()}</div><div style={{fontSize:12,color:"#9ca3af"}}>{fmtDate(inv.paidAt)}</div><div style={{fontSize:12,color:"#9ca3af"}}>{inv.orderType==="surplace"?`🪑 Table ${inv.tableNumber}`:"🥡 À emporter"}</div></div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={{color:"#d4a853",fontWeight:700,fontSize:15}}>{fmt(inv.total)}</span>
              <button style={S.btnSm} onClick={()=>setExpanded(expanded===inv.id?null:inv.id)}>🔍</button>
              <button style={{...S.btnSm,background:"#1a3a1a",color:"#86efac",borderColor:"#166534"}} onClick={()=>{const c=users.find(u=>u.id===inv.cashierId);printTicket(inv,settings,c?c.name:inv.cashierName||"");}}>🖨️</button>
            </div>
          </div>
          {expanded===inv.id&&<div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #30363d"}}>
            {inv.items.map((it,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}><span>{it.qty}× {it.name}{it.note&&<span style={{color:"#f97316",fontSize:11}}> ({it.note})</span>}</span><span style={{color:"#d4a853"}}>{fmt(it.price*it.qty)}</span></div>)}
            {inv.rewardUsed&&<div style={{fontSize:12,color:"#d4a853",marginTop:4}}>⭐ {inv.rewardUsed}</div>}
          </div>}
        </div>
      ))}
    </div>
  );
}

function ClientLoyalty({currentUser,rewards,placeOrder,showToast,setPage}) {
  const [redeeming,setRedeeming]=useState(null);
  const avail=rewards.filter(r=>r.points<=(currentUser.points||0));
  const redeemReward=async(r)=>{
    const fakeItem={id:"reward-"+r.id,cat:"menu",name:r.name,desc:r.desc,price:0,points:0,qty:1,note:"🎁 Récompense fidélité",cartKey:genId()};
    await placeOrder([fakeItem],"surplace","",r);
    setRedeeming(null);showToast(`Récompense utilisée ! 🎉`);setPage("client-orders");
  };
  return(
    <div style={S.page}>
      <h1 style={S.pageTitle}>⭐ Fidélité</h1>
      <div style={{...S.card,textAlign:"center",padding:28}}>
        <div style={{fontSize:52,fontWeight:800,color:"#d4a853",marginBottom:6}}>{currentUser.points||0}</div>
        <div style={{fontSize:15,color:"#9ca3af"}}>points accumulés</div>
        {currentUser.refNumber&&<div style={{fontSize:13,color:"#d4a853",marginTop:10,padding:"5px 16px",background:"#1c1a00",borderRadius:20,display:"inline-block",letterSpacing:2,fontWeight:700}}>{currentUser.refNumber}</div>}
      </div>
      {rewards.map(r=>{const canUse=r.points<=(currentUser.points||0);return(
        <div key={r.id} style={{...S.card,opacity:canUse?1:0.5}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div><div style={{fontWeight:700}}>{r.name}</div><div style={{fontSize:12,color:"#9ca3af"}}>{r.desc}</div></div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <span style={S.pill}>⭐ {r.points}</span>
              {canUse&&<button style={{...S.btn,width:"auto",padding:"8px 14px"}} onClick={()=>setRedeeming(r)}>Utiliser</button>}
            </div>
          </div>
        </div>
      );})}
      {redeeming&&<div style={S.modal}><div style={S.modalCard}>
        <h3 style={S.cardTitle}>🎁 Confirmer la récompense ?</h3>
        <div style={{background:"#0d1117",borderRadius:10,padding:14,marginBottom:14,border:"1px solid #30363d"}}>
          <div style={{fontWeight:700,marginBottom:4}}>{redeeming.name}</div>
          <div style={{color:"#d4a853"}}>⭐ {redeeming.points} pts → Reste {(currentUser.points||0)-redeeming.points} pts</div>
        </div>
        <div style={{display:"flex",gap:8}}><button style={S.btn} onClick={()=>redeemReward(redeeming)}>✅ Confirmer</button><button style={S.btnOutline} onClick={()=>setRedeeming(null)}>Annuler</button></div>
      </div></div>}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// HOOK + STYLES
// ═══════════════════════════════════════════════════════════════════════════════
function useBreakpoint() {
  const [w,setW]=useState(window.innerWidth);
  useEffect(()=>{const h=()=>setW(window.innerWidth);window.addEventListener("resize",h);return()=>window.removeEventListener("resize",h);},[]);
  return{isMobile:w<640,isTablet:w>=640&&w<1024,isDesktop:w>=1024,w};
}

const CSS=`
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=DM+Sans:wght@400;500;600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  html{font-size:clamp(13px,1.5vw,15px);}
  body{background:#0d1117;overscroll-behavior:none;-webkit-text-size-adjust:100%;}
  html,body{height:100%;width:100%;}
  ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-track{background:#161b22;}::-webkit-scrollbar-thumb{background:#374151;border-radius:3px;}
  textarea,input,select,button{font-family:'DM Sans',sans-serif;-webkit-tap-highlight-color:transparent;font-size:inherit;}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  .sidebar-desktop{display:flex;}
  .auth-card-mobile{}

  /* ── Mobile <640px ── */
  @media(max-width:639px){
    html{font-size:14px;}
    .sidebar-desktop{display:none!important;}
    .auth-card-mobile{padding:20px 16px!important;margin:12px!important;border-radius:12px!important;}
    .modal-mobile{padding:0!important;align-items:flex-end!important;}
    .modal-card-mobile{border-radius:16px 16px 0 0!important;max-height:90dvh!important;padding:16px!important;width:100%!important;max-width:100%!important;}
    .menu-grid-mobile{grid-template-columns:repeat(2,1fr)!important;gap:8px!important;}
    .menu-card-mobile{padding:10px!important;}
    .stats-grid-mobile{grid-template-columns:repeat(2,1fr)!important;gap:8px!important;}
    .page-mobile{padding:12px!important;}
    .hide-mobile{display:none!important;}
    .card-mobile{padding:14px!important;}
  }

  /* ── Tablette 640-1023px ── */
  @media(min-width:640px) and (max-width:1023px){
    html{font-size:14px;}
    .sidebar-desktop{width:68px!important;}
    .sidebar-label{display:none!important;}
    .sidebar-role-text{display:none!important;}
    .sidebar-logo-text{display:none!important;}
    .nav-item-tablet{justify-content:center!important;padding:12px 0!important;}
    .menu-grid-tablet{grid-template-columns:repeat(3,1fr)!important;}
    .stats-grid-tablet{grid-template-columns:repeat(3,1fr)!important;}
  }

  /* ── Grand écran >1400px ── */
  @media(min-width:1400px){
    html{font-size:15px;}
  }

  /* Touch targets minimum 44px pour mobile */
  @media(max-width:639px){
    button,a,[role=button]{min-height:40px;}
    input,select,textarea{min-height:44px;font-size:16px!important;}
  }
`;
const CSS_TAG=<style dangerouslySetInnerHTML={{__html:CSS}}/>;

// Fluid spacing helpers
const sp=(d,t,m)=>({padding:`clamp(${m}px,${t}vw,${d}px)`});

const S={
  app:{fontFamily:"'DM Sans',sans-serif",minHeight:"100vh",background:"#0d1117",color:"#f3f4f6"},
  loading:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0d1117"},
  spinner:{width:40,height:40,border:"3px solid #374151",borderTop:"3px solid #d4a853",borderRadius:"50%",animation:"spin 1s linear infinite"},
  toast:{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:99999,padding:"10px 18px",borderRadius:10,color:"#fff",fontWeight:600,fontSize:"clamp(12px,1.3vw,14px)",boxShadow:"0 4px 24px rgba(0,0,0,.5)",whiteSpace:"nowrap",maxWidth:"92vw",textAlign:"center",animation:"fadeIn .2s ease"},
  authPage:{minHeight:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#0d1117,#161b22,#0d1117)",padding:"clamp(12px,4vw,24px)"},
  authCard:{background:"#161b22",border:"1px solid #30363d",borderRadius:16,padding:"clamp(20px,5vw,40px)",width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,.5)"},
  logo:{fontSize:"clamp(22px,3vw,28px)",fontFamily:"'Playfair Display',serif",color:"#d4a853",textAlign:"center",marginBottom:8},
  authTitle:{fontFamily:"'Playfair Display',serif",fontSize:"clamp(18px,2.5vw,22px)",fontWeight:700,textAlign:"center",marginBottom:20,color:"#f3f4f6"},
  authLink:{textAlign:"center",marginTop:14,fontSize:"clamp(12px,1.2vw,13px)",color:"#9ca3af"},
  link:{color:"#d4a853",cursor:"pointer",fontWeight:600},
  remRow:{display:"flex",alignItems:"center",gap:8,marginBottom:10},
  layout:{display:"flex",height:"100dvh",overflow:"hidden"},
  sidebar:{width:220,height:"100dvh",overflowY:"auto",background:"#161b22",borderRight:"1px solid #30363d",display:"flex",flexDirection:"column",padding:"0 0 20px",flexShrink:0},
  sidebarLogo:{fontFamily:"'Playfair Display',serif",fontSize:"clamp(16px,1.5vw,20px)",color:"#d4a853",padding:"18px 18px 8px",borderBottom:"1px solid #30363d",marginBottom:6},
  sidebarRole:{padding:"4px 18px 8px",fontSize:"clamp(10px,1vw,12px)",color:"#9ca3af",fontWeight:600,textTransform:"uppercase",letterSpacing:1},
  navItem:{display:"flex",alignItems:"center",gap:10,padding:"clamp(10px,1.2vw,12px) 18px",cursor:"pointer",color:"#9ca3af",fontSize:"clamp(12px,1.2vw,14px)",transition:"all .2s",borderLeft:"3px solid transparent"},
  navActive:{background:"#1f2937",color:"#d4a853",borderLeft:"3px solid #d4a853"},
  main:{flex:1,overflowY:"auto",background:"#0d1117",height:"100dvh"},
  page:{padding:"clamp(12px,3vw,24px)",maxWidth:980,margin:"0 auto"},
  pageTitle:{fontFamily:"'Playfair Display',serif",fontSize:"clamp(18px,2.5vw,24px)",fontWeight:700,color:"#f3f4f6",marginBottom:"clamp(12px,2vw,20px)"},
  pageHeader:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"clamp(12px,2vw,20px)",flexWrap:"wrap",gap:8},
  card:{background:"#161b22",border:"1px solid #30363d",borderRadius:"clamp(8px,1vw,12px)",padding:"clamp(12px,2vw,20px)",marginBottom:"clamp(10px,1.5vw,16px)"},
  cardTitle:{fontFamily:"'Playfair Display',serif",fontSize:"clamp(15px,1.8vw,18px)",fontWeight:600,color:"#d4a853",marginBottom:"clamp(10px,1.5vw,16px)"},
  statsGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(clamp(100px,15vw,130px),1fr))",gap:"clamp(8px,1.2vw,12px)",marginBottom:"clamp(12px,2vw,20px)"},
  statCard:{background:"#161b22",border:"1px solid #30363d",borderRadius:"clamp(8px,1vw,12px)",padding:"clamp(10px,1.5vw,16px)",textAlign:"center"},
  row:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"clamp(8px,1vw,10px) 0",borderBottom:"1px solid #21262d"},
  menuGrid:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(clamp(140px,18vw,190px),1fr))",gap:"clamp(8px,1.2vw,14px)"},
  menuCard:{background:"#161b22",border:"1px solid #30363d",borderRadius:"clamp(8px,1vw,12px)",padding:"clamp(12px,1.5vw,18px)",display:"flex",flexDirection:"column"},
  tabBar:{display:"flex",gap:"clamp(4px,.6vw,6px)",marginBottom:"clamp(10px,1.5vw,16px)",flexWrap:"wrap"},
  tab:{padding:"clamp(5px,.8vw,7px) clamp(10px,1.2vw,14px)",borderRadius:20,cursor:"pointer",fontSize:"clamp(11px,1.1vw,13px)",background:"#161b22",border:"1px solid #30363d",color:"#9ca3af",transition:"all .2s",whiteSpace:"nowrap"},
  tabActive:{background:"#d4a853",color:"#0d1117",border:"1px solid #d4a853",fontWeight:600},
  orderCard:{background:"#161b22",border:"1px solid #30363d",borderRadius:"clamp(8px,1vw,12px)",padding:"clamp(10px,1.5vw,16px)",marginBottom:"clamp(8px,1vw,12px)"},
  orderHeader:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"clamp(8px,1vw,12px)"},
  statusBadge:{padding:"3px 9px",borderRadius:20,fontSize:"clamp(10px,1vw,11px)",fontWeight:600,color:"#fff",whiteSpace:"nowrap"},
  modal:{position:"fixed",inset:0,background:"rgba(0,0,0,.78)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:99999,padding:"clamp(8px,2vw,20px)"},
  modalCard:{background:"#161b22",border:"1px solid #30363d",borderRadius:"clamp(12px,1.5vw,16px)",padding:"clamp(16px,2.5vw,28px)",width:"100%",maxWidth:520,maxHeight:"92dvh",overflowY:"auto",animation:"slideUp .2s ease"},
  input:{display:"block",width:"100%",padding:"clamp(10px,1.2vw,12px) clamp(10px,1.2vw,14px)",marginBottom:"clamp(8px,1vw,12px)",background:"#0d1117",border:"1px solid #30363d",borderRadius:8,color:"#f3f4f6",fontSize:"clamp(14px,1.4vw,16px)",outline:"none",WebkitAppearance:"none"},
  label:{display:"block",fontSize:"clamp(11px,1vw,12px)",color:"#9ca3af",fontWeight:600,marginBottom:4},
  btn:{padding:"clamp(10px,1.2vw,12px) clamp(14px,2vw,20px)",background:"#d4a853",color:"#0d1117",border:"none",borderRadius:8,cursor:"pointer",fontWeight:700,fontSize:"clamp(13px,1.4vw,15px)",fontFamily:"'DM Sans',sans-serif",width:"100%",WebkitAppearance:"none"},
  btnOutline:{padding:"clamp(10px,1.2vw,12px) clamp(14px,2vw,20px)",background:"transparent",color:"#d4a853",border:"1px solid #d4a853",borderRadius:8,cursor:"pointer",fontWeight:600,fontSize:"clamp(13px,1.4vw,15px)",width:"100%"},
  btnSm:{padding:"clamp(5px,.8vw,7px) clamp(8px,1vw,12px)",background:"#1f2937",color:"#d1d5db",border:"1px solid #374151",borderRadius:6,cursor:"pointer",fontSize:"clamp(11px,1vw,12px)",whiteSpace:"nowrap"},
  btnDanger:{background:"#7f1d1d",color:"#fca5a5",border:"1px solid #991b1b"},
  badge:{background:"#d4a853",color:"#0d1117",borderRadius:10,padding:"1px 6px",fontSize:"clamp(9px,.9vw,10px)",fontWeight:700,marginLeft:4},
  pill:{background:"#1f2937",color:"#d4a853",borderRadius:12,padding:"2px 8px",fontSize:"clamp(10px,1vw,11px)",fontWeight:600},
  pillRed:{background:"#7f1d1d",color:"#fca5a5",borderRadius:12,padding:"2px 8px",fontSize:"clamp(10px,1vw,11px)",fontWeight:600},
  empty:{color:"#6b7280",textAlign:"center",padding:"clamp(16px,2vw,24px) 0",fontSize:"clamp(12px,1.2vw,14px)"},
  orderTypeBtn:{flex:1,padding:"clamp(9px,1vw,11px)",borderRadius:10,cursor:"pointer",border:"2px solid #374151",textAlign:"center",fontSize:"clamp(12px,1.2vw,14px)",fontWeight:600,color:"#9ca3af",background:"#0d1117",transition:"all .2s",position:"relative"},
  orderTypeBtnActive:{border:"2px solid #d4a853",color:"#d4a853",background:"#1f1a00"},
};

