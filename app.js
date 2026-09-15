import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updatePassword } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, addDoc, collection, collectionGroup, query, where, orderBy, onSnapshot, getDocs, serverTimestamp, runTransaction, limit, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

/*
  1) Buat Firebase project.
  2) Aktifkan Authentication > Email/Password dan Firestore.
  3) Tempel config web project di bawah.
  4) Deploy rules dari firestore.rules.
*/
const firebaseConfig = {
  apiKey: "AIzaSyCiYNxO1biZU5K0YJoCKij0-49Y_rAVt-E",
  authDomain: "secret-forum-database.firebaseapp.com",
  projectId: "secret-forum-database",
  storageBucket: "secret-forum-database.firebasestorage.app",
  messagingSenderId: "924307255457",
  appId: "1:924307255457:web:a47ac66a6f6e176f1f40e0",
  measurementId: "G-N98GMJHYED"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Media uploads use Cloudinary Free instead of Firebase Storage.
// Create an UNSIGNED upload preset in Cloudinary and put your values here.
const CLOUDINARY_CLOUD_NAME = "pyuohspq";
const CLOUDINARY_UPLOAD_PRESET = "secret_forum_upload";
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
const $ = id => document.getElementById(id);
let currentUser = null, profile = null, activeForum = null, unsubscribeMessages = null, unsubscribeProfile = null, unsubscribeActivations = null, unsubscribeInbox = null, unsubscribeMaintenance = null, authMode = "login";
let lastAdShownAt = 0, adScheduleTimeout = null;
const messageTextCache = new Map();
const localBotReplies = new Map();
const botHandledCommands = new Set();
const botCareHandledMessages = new Set();
const botSlowmodeLastSent = new Map();
let botExpiryTimer = null;
let botMenuConfig = { imageUrl:"", title:"Bot Care", updatedAt:null };
const BOT_PREFIXES = ["#",".","$","&","/"];
const BOT_MENU_SETTING = "siteSettings/botMenu";
function normalizeBotCommand(value){ const raw=String(value||"").trim(); if(!raw||!BOT_PREFIXES.includes(raw[0])) return null; const parts=raw.split(/\s+/); return {prefix:raw[0],cmd:(parts[0]||"").slice(1).toLowerCase(),arg:raw.slice((parts[0]||"").length).trim()}; }
function botRoleLabel(){ return profile?.isAuthor?"Author":profile?.isAdmin?"Admin":(isPremiumActive(profile?.premiumUntil)?"Premium":"Biasa"); }
async function loadBotMenuConfig(){ try{ const s=await getDoc(doc(db,"siteSettings","botMenu")); if(s.exists()) botMenuConfig={...botMenuConfig,...s.data()}; }catch(e){ console.warn("bot menu config:",e); } }
function botMenuImageUrl(url){ const u=String(url||""); if(!u)return ""; return u.includes("/upload/") ? u.replace("/upload/","/upload/ar_16:9,c_fill,w_1280/") : u; }
// Website creator / Author. Securely configure this UID, or create authors/{UID} with enabled:true in Firestore.
const AUTHOR_UID = "Lt8kkzctunb1lXA1rGxz1xXuYlv2";
const isAuthor = () => !!profile?.isAuthor;
const canAdmin = () => isAuthor() || !!profile?.isAdmin;
const isAuthorUid = uid => uid === AUTHOR_UID;
const canSeeActivity = () => canAdmin();
const actorRole = () => isAuthor() ? "Author" : (profile?.isAdmin ? "Admin" : "User");
async function logActivity(type,message,extra={}){if(!currentUser||!profile)return;try{await addDoc(collection(db,"activityLogs"),{type,message,actorId:currentUser.uid,actorName:profile.displayName,actorUsername:profile.username,actorRole:actorRole(),createdAt:serverTimestamp(),...extra});}catch(e){console.warn("activity log:",e);}}
const roleBadgeHTML = role => role === "author" ? '<span class="role-badge author">AUTHOR</span>' : role === "admin" ? '<span class="role-badge admin">ADMIN</span>' : '';

const toast = (msg,duration=2500) => { $("toast").textContent = msg; $("toast").classList.add("show"); setTimeout(()=>$("toast").classList.remove("show"),duration); };
const copyText = async (text) => { try { if(navigator.clipboard?.writeText) { await navigator.clipboard.writeText(String(text)); return true; } } catch(e) {} try { const ta=document.createElement("textarea"); ta.value=String(text); ta.style.position="fixed"; ta.style.opacity="0"; document.body.appendChild(ta); ta.select(); const ok=document.execCommand("copy"); ta.remove(); return ok; } catch(e) { return false; } };
const esc = s => String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const premiumUntilMillis = value => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value?.toMillis) return value.toMillis();
  if (value?.seconds != null) return Number(value.seconds) * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1e6);
  return 0;
};
const isPremiumActive = value => premiumUntilMillis(value) > Date.now();
const isUnlimitedPremium = () => canAdmin() || profile?.premiumUnlimited === true;
const canUsePremium = () => canAdmin() || isPremiumActive(profile?.premiumUntil);
const premiumBadgeLevel = count => {
  const n = Number(count || 0);
  if (n >= 4) return "green";
  if (n === 3) return "pink";
  if (n === 2) return "purple";
  if (n === 1) return "red";
  return "";
};
const premiumBadgeHTML = level => level ? `<span class="premium-verified ${level}" title="Premium ${level === "red" ? "Lv. 1" : level === "purple" ? "Lv. 2" : level === "pink" ? "Lv. 3" : "Lv. 4+"}" aria-label="Badge Premium"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 16.7 4.8 12.3l-1.9 1.9 6.3 6.3L21.2 8.5l-1.9-1.9z"/></svg></span>` : "";
const RANDOM_ALPHABET="ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const randomChars = length => { const bytes=crypto.getRandomValues(new Uint8Array(length)); return Array.from(bytes, x=>RANDOM_ALPHABET[x % RANDOM_ALPHABET.length]).join(""); };
const randomCode = () => { const chars=RANDOM_ALPHABET; let s=""; const a=crypto.getRandomValues(new Uint8Array(18)); for(const x of a)s+=chars[x%chars.length]; return s; };
const activationCode = () => { const chars=RANDOM_ALPHABET; let s=""; const a=crypto.getRandomValues(new Uint8Array(20)); for(const x of a)s+=chars[x%chars.length]; return s; };
async function uploadCloudinaryFile(file, folder, maxBytes=10*1024*1024){
  if(!file) return null;
  if(CLOUDINARY_CLOUD_NAME === "YOUR_CLOUD_NAME" || CLOUDINARY_UPLOAD_PRESET === "YOUR_UNSIGNED_UPLOAD_PRESET") throw new Error("Media belum dikonfigurasi. Isi Cloudinary di app.js.");
  if(file.size > maxBytes) throw new Error(`Ukuran file maksimal ${formatBytes(maxBytes)}.`);
  const form=new FormData(); form.append("file",file); form.append("upload_preset",CLOUDINARY_UPLOAD_PRESET); form.append("folder",folder);
  const res=await fetch(CLOUDINARY_UPLOAD_URL,{method:"POST",body:form}); const data=await res.json();
  if(!res.ok || !data.secure_url) throw new Error(data.error?.message||"Upload media gagal.");
  return {name:file.name,type:file.type||data.resource_type||"application/octet-stream",size:file.size,url:data.secure_url,provider:"cloudinary",publicId:data.public_id||""};
}
const emailForUsername = u => `${u.trim().toLowerCase().replace(/[^a-z0-9._-]/g,"_")}@secretforum.local`;

function updateMemberLimitUI(){
  const input=$("memberLimit"), note=$("memberLimitNote"), code=$("secretCode"), hint=$("premiumHint"), customNote=$("customCodeNote");
  if(!input)return;
  const premium=isPremiumActive(profile?.premiumUntil), unlimited=canAdmin();
  input.removeAttribute("max");
  if(!unlimited) input.max=premium?400:20;
  if(!unlimited && Number(input.value)>Number(input.max)) input.value=input.max;
  if(note) note.textContent=unlimited ? "Admin/Author: bebas menentukan jumlah anggota forum." : premium ? "Premium: kamu bisa mengatur batas 2–400 anggota." : "Akun biasa: batas maksimal 20 anggota.";
  if(code){
    code.disabled=!premium && !unlimited;
    code.value=(premium||unlimited)?code.value:"";
    code.placeholder=(premium||unlimited)?"Opsional: buat secret code sendiri":"Otomatis dibuat 18 karakter oleh sistem";
  }
  if(hint){hint.textContent=(premium||unlimited)?"CUSTOM":"AUTO";hint.classList.toggle("hidden",false);}
  if(customNote) customNote.textContent=(premium||unlimited) ? "Premium dapat menentukan secret code sendiri. Admin/Author memiliki akses penuh." : "Kode akun biasa dibuat otomatis 18 karakter dan tidak dapat diubah.";
}
function showPage(name){
  if((name==="admin" && !canAdmin()) || (name==="author" && !isAuthor()) || (name==="activity" && !canSeeActivity())){
    toast("Kamu tidak memiliki akses ke halaman ini.");
    return;
  }
  document.querySelectorAll(".page").forEach(x=>x.classList.add("hidden"));
  $("page-"+name)?.classList.remove("hidden");
  document.querySelectorAll(".nav").forEach(x=>x.classList.toggle("active",x.dataset.page===name));
  const titles={home:["Beranda","Kelola forum rahasiamu."],join:["Bergabung Forum","Masukkan secret code untuk bergabung."],create:["Buat Forum","Buat ruang privat baru."],settings:["Pengaturan","Kelola akun dan keamanan."],inbox:["Inbox","Informasi dan pesan penting akun."],contact:["Premium","Pilih paket Premium."],payment:["Pembayaran Premium","Selesaikan pembayaran Premium."],"bot-rental":["Sewa Bot","Sewa dan aktifkan Bot Care di forum."],admin:["Admin Panel","Kelola user, premium, forum, dan Inbox."],author:["Author Panel","Pemilik utama website dan otoritas tertinggi."],activity:["Aktivitas Website","Riwayat tindakan administrasi dan moderasi."],forum:["Forum","Obrolan teks privat."]};
  $("pageTitle").textContent=titles[name]?.[0]||"Secret Forum"; $("pageSubtitle").textContent=titles[name]?.[1]||"";
  if(name==="admin" && canAdmin()){ loadAdminForums(); loadSupportRequests(); loadAdsManagement("adminAdsResults"); loadMaintenanceSettings(); loadBotMenuAdminUI(); }
  if(name==="author" && isAuthor()){ loadAuthorPanel(); loadAdsManagement("authorAdsResults"); loadMaintenanceSettings(); loadBotMenuAdminUI(); }
  if(name==="activity" && currentUser) loadPublicActivity();
  if(name==="inbox" && currentUser) loadInbox();
  if(name==="settings" && currentUser) loadActivationStatus();
  if(name==="create") updateMemberLimitUI();
}
function setAuthMode(mode){ authMode=mode; document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.authTab===mode)); $("displayNameWrap").classList.toggle("hidden",mode!=="register"); $("authSubmit").textContent=mode==="login"?"Masuk":"Buat akun"; }
function setLoggedInUI(){
  $("authView").classList.add("hidden"); $("appView").classList.remove("hidden");
  $("sidebarName").textContent=profile.displayName; $("sidebarUsername").textContent="@"+profile.username; $("avatar").textContent=(profile.displayName||"?")[0].toUpperCase();
  $("settingsUsername").value=profile.username; $("settingsDisplayName").value=profile.displayName;
  const roleEl=$("sidebarRole"); if(roleEl){ roleEl.classList.toggle("hidden",!(profile.isAuthor||profile.isAdmin)); roleEl.textContent=profile.isAuthor?"AUTHOR":"ADMIN"; }
  $("adminNav")?.classList.toggle("hidden", !profile.isAdmin && !profile.isAuthor);
  $("authorNav")?.classList.toggle("hidden", !profile.isAuthor);
  $("activityNav")?.classList.toggle("hidden", !canSeeActivity());
  const premiumActive=isPremiumActive(profile.premiumUntil);
  $("sidebarPremium").classList.toggle("hidden",!premiumActive);
  $("adminNav").classList.toggle("hidden",!canAdmin()); $("authorNav")?.classList.toggle("hidden",!isAuthor()); $("adminSettingsCard").classList.toggle("hidden",!canAdmin());
  const status=profile.isAuthor?"AUTHOR":(profile.isAdmin?"ADMIN":(premiumActive?"PREMIUM":"BIASA"));
  const detail=profile.isAuthor?"Author • pemilik website • otoritas tertinggi.":(profile.isAdmin?"Akun memiliki akses administrasi.":(premiumActive?"Premium aktif sampai "+new Date(premiumUntilMillis(profile.premiumUntil)).toLocaleString("id-ID"):"Akun biasa tanpa Premium."));
  $("accountStatus").textContent=status; $("accountStatusDetail").textContent=detail;
  loadForums(); updateMemberLimitUI(); loadActivationStatus(); loadInbox(); showPage("home");
}
async function loadProfile(user){
  const snap=await getDoc(doc(db,"users",user.uid));
  if(!snap.exists()){ await signOut(auth); throw new Error("Profil user tidak ditemukan."); }
  const [adminSnap,authorSnap]=await Promise.all([getDoc(doc(db,"admins",user.uid)),getDoc(doc(db,"authors",user.uid))]);
  const data=snap.data();
  const isAuthor=(AUTHOR_UID && AUTHOR_UID!=="REPLACE_WITH_WEBSITE_CREATOR_UID" && user.uid===AUTHOR_UID) || (authorSnap.exists()&&authorSnap.data().enabled===true);
  const isAdmin=!isAuthor && ((adminSnap.exists()&&adminSnap.data().enabled===true) || data.isAdmin===true);
  const suspendedUntil=premiumUntilMillis(data.suspendedUntil);
  if(!isAuthor && !isAdmin && data.banned===true){
    await signOut(auth);
    throw new Error("Akun kamu telah dibanned oleh admin.");
  }
  if(!isAuthor && !isAdmin && suspendedUntil>Date.now()){
    await signOut(auth);
    throw new Error("Akun kamu sedang disuspend sampai "+new Date(suspendedUntil).toLocaleString("id-ID")+".");
  }
  profile={uid:user.uid,...data,premiumPurchases:Number(data.premiumPurchases||0),isAdmin,isAuthor};
  if(unsubscribeMaintenance)unsubscribeMaintenance();
  unsubscribeMaintenance=onSnapshot(doc(db,"siteSettings","maintenance"),s=>{
    const m=s.exists()?s.data():{}; applyMaintenance(m.enabled===true, m.message||"", m.imageUrl||"");
  },e=>console.warn("maintenance:",e));
  if(unsubscribeProfile)unsubscribeProfile();
  if(unsubscribeActivations)unsubscribeActivations();
  unsubscribeActivations=null;
  unsubscribeProfile=onSnapshot(doc(db,"users",user.uid),async s=>{
    if(!s.exists())return;
    const latest=s.data();
    const until=premiumUntilMillis(latest.suspendedUntil);
    if(!profile.isAuthor && !profile.isAdmin && (latest.banned===true || until>Date.now())){
      const reason=latest.banned===true?"Akun kamu telah dibanned oleh admin.":"Akun kamu sedang disuspend sampai "+new Date(until).toLocaleString("id-ID")+".";
      if(unsubscribeProfile)unsubscribeProfile();
      unsubscribeProfile=null;
      await signOut(auth);
      toast(reason);
      return;
    }
    profile={...profile,...latest,premiumPurchases:Number(latest.premiumPurchases||0)};
    setLoggedInUI();
  });
  setLoggedInUI();
  loadBotMenuConfig();
}
function applyMaintenance(enabled,message="",imageUrl=""){
  const modal=$("maintenanceModal"); if(!modal)return;
  const blocked=enabled && !!profile && !canAdmin();
  $("maintenanceMessage").textContent=message||"Untuk sementara waktu website ini tidak dapat digunakan.";
  const img=$("maintenanceImage");
  if(img){img.src=imageUrl||"";img.classList.toggle("hidden",!imageUrl);}
  modal.classList.toggle("hidden",!blocked); document.body.classList.toggle("maintenance-active",blocked);
}
async function saveMaintenance(enabled,message,imageFile=null){
  if(!canAdmin())return toast("Hanya Admin/Author yang dapat mengatur maintenance.");
  try{
    const old=await getDoc(doc(db,"siteSettings","maintenance")); let imageUrl=old.exists()?old.data().imageUrl||"":"";
    if(imageFile) imageUrl=(await uploadCloudinaryFile(imageFile,`secret-forum/maintenance/${currentUser.uid}`,10*1024*1024))?.url||imageUrl;
    await setDoc(doc(db,"siteSettings","maintenance"),{enabled:Boolean(enabled),message:String(message||""),imageUrl,updatedBy:currentUser.uid,updatedRole:actorRole(),updatedAt:serverTimestamp()},{merge:true});
    await logActivity(enabled?"maintenance_on":"maintenance_off",enabled?"Mengaktifkan maintenance website":"Menonaktifkan maintenance website"); toast(enabled?"Maintenance diaktifkan.":"Maintenance dinonaktifkan."); applyMaintenance(Boolean(enabled),String(message||""),imageUrl);
  }catch(e){toast(e.message.replace("Firebase: ",""));}
}
async function loadMaintenanceSettings(){
  if(!canAdmin())return;
  try{const s=await getDoc(doc(db,"siteSettings","maintenance"));const d=s.exists()?s.data():{}; ["admin","author"].forEach(role=>{const a=$(role+"MaintenanceEnabled"),m=$(role+"MaintenanceMessage");if(a)a.checked=d.enabled===true;if(m)m.value=d.message||"";}); applyMaintenance(d.enabled===true,d.message||"",d.imageUrl||"");}catch(e){console.warn("load maintenance:",e);}
}
$("adminMaintenanceForm")?.addEventListener("submit",async e=>{e.preventDefault();await saveMaintenance($("adminMaintenanceEnabled").checked,$("adminMaintenanceMessage").value.trim(),$("adminMaintenanceImage")?.files?.[0]||null);});
$("authorMaintenanceForm")?.addEventListener("submit",async e=>{e.preventDefault();await saveMaintenance($("authorMaintenanceEnabled").checked,$("authorMaintenanceMessage").value.trim(),$("authorMaintenanceImage")?.files?.[0]||null);});
$("adminMaintenanceImage")?.addEventListener("change",e=>{const f=e.target.files?.[0];if($("adminMaintenanceImageName"))$("adminMaintenanceImageName").textContent=f?`${f.name} • ${formatBytes(f.size)}`:"";});
$("authorMaintenanceImage")?.addEventListener("change",e=>{const f=e.target.files?.[0];if($("authorMaintenanceImageName"))$("authorMaintenanceImageName").textContent=f?`${f.name} • ${formatBytes(f.size)}`:"";});

async function getUserByUsername(username){
  const q=query(collection(db,"users"),where("usernameLower","==",username.trim().toLowerCase()),limit(1)); const s=await getDocs(q); return s.empty?null:{id:s.docs[0].id,...s.docs[0].data()};
}

document.querySelectorAll("[data-auth-tab]").forEach(b=>b.onclick=()=>setAuthMode(b.dataset.authTab));
document.querySelectorAll("[data-page],[data-page-go]").forEach(b=>b.onclick=()=>showPage(b.dataset.page||b.dataset.pageGo));
$("logoutBtn").onclick=()=>signOut(auth);
$("authForm").onsubmit=async e=>{
  e.preventDefault();
  const username=$("authUsername").value.trim(), password=$("authPassword").value;
  try{
    if(authMode==="register"){
      const displayName=$("authDisplayName").value.trim()||username;
      const cred=await createUserWithEmailAndPassword(auth,emailForUsername(username),password);
      await setDoc(doc(db,"users",cred.user.uid),{username,usernameLower:username.toLowerCase(),displayName,premiumUntil:null,premiumPurchases:0,isAdmin:false,banned:false,suspendedUntil:null,createdAt:serverTimestamp()});
      toast("Akun berhasil dibuat.");
    }else{
      await signInWithEmailAndPassword(auth,emailForUsername(username),password);
    }
  }catch(err){ toast(err.message.replace("Firebase: ","")); }
};
function loadActivationStatus(){
  if(!currentUser)return;
  if(unsubscribeActivations)unsubscribeActivations();
  unsubscribeActivations=onSnapshot(query(collection(db,"supportRequests"),where("uid","==",currentUser.uid)),s=>{
    const docs=s.docs.filter(d=>d.data().type==="premium_purchase").sort((a,b)=>(b.data().createdAt?.toMillis?.()||0)-(a.data().createdAt?.toMillis?.()||0));
    const ready=docs.find(d=>d.data().status==="ready" && d.data().activationCode);
    const box=$("activationStatus");
    if(!box)return;
    if(ready){
      const r=ready.data(); box.classList.remove("hidden"); box.innerHTML=`Pembayaran ${esc(r.plan||"Premium")} sudah diverifikasi. Kode aktivasi kamu: <b class="activation-code">${esc(r.activationCode)}</b><br><span class="tiny muted">Masukkan kode di atas untuk mengaktifkan Premium.</span>`;
    }else{ box.classList.add("hidden"); box.textContent=""; }
  },err=>console.warn("Activation status:",err));
}
function loadInbox(){
  if(!currentUser)return;
  if(unsubscribeInbox)unsubscribeInbox();
  unsubscribeInbox=onSnapshot(query(collection(db,"inbox"),where("uid","==",currentUser.uid)),snap=>{
    const docs=snap.docs.sort((a,b)=>(b.data().createdAt?.toMillis?.()||0)-(a.data().createdAt?.toMillis?.()||0));
    const badge=$("inboxBadge"),box=$("inboxResults");
    const unread=docs.filter(d=>d.data().read!==true).length;
    badge?.classList.toggle("hidden",unread===0); if(badge)badge.textContent=unread;
    if(!box)return;
    box.innerHTML=docs.map(d=>{const r=d.data(); const a=r.attachment; const media=a?.url&&String(a.type||"").startsWith("image/")?`<div class="inbox-attachment"><a href="${esc(a.url)}" target="_blank" rel="noopener"><img src="${esc(a.url)}" alt="${esc(a.name||"Gambar")}" loading="lazy"></a></div>`:""; return `<div class="inbox-item ${r.read===true?"read":"unread"}"><div><span class="eyebrow">${esc(r.title||"INFORMASI")}</span><h3>${esc(r.subject||"Pesan dari Admin")}</h3><p class="muted">${esc(r.message||"").replace(/\n/g,"<br>")}</p>${media}<span class="tiny muted">${r.createdAt?.toDate?.().toLocaleString("id-ID")||"baru saja"}</span></div><div class="inbox-actions">${r.read===true?"":`<button class="secondary" data-read-inbox="${d.id}">Tandai dibaca</button>`}<button class="secondary" data-delete-inbox="${d.id}">Hapus</button></div></div>`}).join("")||`<div class="notice">Belum ada pesan masuk.</div>`;
    box.querySelectorAll("[data-read-inbox]").forEach(b=>b.onclick=async()=>{try{await updateDoc(doc(db,"inbox",b.dataset.readInbox),{read:true});}catch(e){toast(e.message.replace("Firebase: ",""));}});
    box.querySelectorAll("[data-delete-inbox]").forEach(b=>b.onclick=async()=>{try{await deleteDoc(doc(db,"inbox",b.dataset.deleteInbox));toast("Pesan inbox dihapus.");}catch(e){toast(e.message.replace("Firebase: ",""));}});
  },err=>console.warn("Inbox listener:",err));
}
$("activationForm").onsubmit=async e=>{
  e.preventDefault();
  const code=$("activationCode").value.trim();
  if(!code)return toast("Masukkan kode aktivasi.");
  try{
    await runTransaction(db,async tx=>{
      const codeRef=doc(db,"premiumActivations",code), userRef=doc(db,"users",currentUser.uid);
      const [cs,us]=await Promise.all([tx.get(codeRef),tx.get(userRef)]);
      if(!cs.exists())throw new Error("Kode aktivasi tidak ditemukan.");
      const c=cs.data();
      if(c.uid!==currentUser.uid)throw new Error("Kode ini bukan untuk akun kamu.");
      if(c.used===true)throw new Error("Kode aktivasi sudah digunakan.");
      const until=c.get?.("premiumUntil", null) ?? c.premiumUntil ?? null;
      const unlimited=c.unlimited===true;
      const count=Number(us.data()?.premiumPurchases||0)+1;
      tx.update(userRef,{premiumUntil:until,premiumUnlimited:unlimited,premiumPurchases:count,lastActivationCode:code});
      tx.update(codeRef,{used:true,usedAt:serverTimestamp()});
    });
    $("activationCode").value=""; toast("Premium berhasil diaktifkan."); loadProfile(currentUser);
  }catch(err){toast(err.message.replace("Firebase: ",""));}
};
$("profileForm").onsubmit=async e=>{e.preventDefault(); const name=$("settingsDisplayName").value.trim(); if(!name)return; await updateDoc(doc(db,"users",currentUser.uid),{displayName:name}); profile.displayName=name; setLoggedInUI(); toast("Nama berhasil diubah.");};
$("passwordForm").onsubmit=async e=>{e.preventDefault(); const value=$("newPassword").value; if(!value)return toast("Masukkan password baru."); if(value.length<6)return toast("Password minimal 6 karakter."); try{await updatePassword(currentUser,value); $("newPassword").value=""; toast("Password berhasil diubah.");}catch(err){toast(err.code==="auth/requires-recent-login"?"Demi keamanan, login ulang sebelum mengganti password.":err.message.replace("Firebase: ",""));}};
$("createForm").onsubmit=async e=>{
  e.preventDefault();
  try{
    const name=$("forumName").value.trim(), max=Number($("memberLimit").value), custom=$("secretCode").value.trim();
    if(!name)return toast("Nama forum wajib diisi.");
    const premium=isPremiumActive(profile.premiumUntil), unlimited=canAdmin();
    const maxAllowed=unlimited?Number.MAX_SAFE_INTEGER:(premium?400:20);
    if(max<2||(!unlimited && max>maxAllowed))return toast(unlimited?"Jumlah anggota harus minimal 2.":premium?"Jumlah anggota Premium harus 2–400.":"Akun biasa hanya dapat membuat forum sampai 20 anggota.");
    if(custom&&!premium&&!unlimited)return toast("Custom code hanya untuk Premium/Admin/Author.");
    let secret=custom||randomCode();
    if(!custom && secret.length!==18)throw new Error("Gagal membuat secret code 18 karakter.");
    let forumRef=null, created=false;
    for(let attempt=0;attempt<5 && !created;attempt++){
      if(attempt>0 && !custom) secret=randomCode();
      forumRef=doc(collection(db,"forums"));
      const codeRef=doc(db,"forumCodes",secret);
      try{
        await runTransaction(db,async tx=>{
          const codeSnap=await tx.get(codeRef);
          if(codeSnap.exists())throw new Error("__CODE_EXISTS__");
          tx.set(forumRef,{name,maxMembers:max,secretCode:secret,ownerId:currentUser.uid,memberIds:[currentUser.uid],ownerOnly:false,createdAt:serverTimestamp()});
          tx.set(codeRef,{forumId:forumRef.id,createdAt:serverTimestamp()});
        });
        await setDoc(doc(db,"forums",forumRef.id,"members",currentUser.uid),{displayName:profile.displayName,username:profile.username,role:"owner",joinedAt:serverTimestamp()});
        created=true;
      }catch(e){
        if(e?.message!=="__CODE_EXISTS__"||custom||attempt===4)throw e;
      }
    }
    $("createForm").reset();
    const secretInput=$("secretCode");
    if(secretInput){
      secretInput.value=secret;
      secretInput.disabled=!premium && !unlimited;
    }
    const createdBox=$("createdCodeNotice");
    if(createdBox){
      createdBox.classList.remove("hidden");
      createdBox.innerHTML=`<b>Forum berhasil dibuat.</b><br><span class="tiny muted">Secret code forum:</span><div class="created-code-row"><code>${esc(secret)}</code><button type="button" class="secondary" id="copyCreatedCode">Salin</button></div><span class="tiny muted">Kode ini wajib disimpan untuk bergabung ke forum.</span>`;
      $("copyCreatedCode").onclick=async()=>{ const ok=await copyText(secret); toast(ok?"Secret code disalin.":"Gagal menyalin. Silakan salin manual."); };
    }
    toast("Forum berhasil dibuat. Secret code sudah ditampilkan di bawah form.",5000); await logActivity("forum_created",`Membuat forum “${name}”`,{forumId:forumRef.id,forumName:name}); loadForums();
  }catch(err){
    console.error("createForum:", err);
    const msg=err?.code==="permission-denied"
      ? "Tidak punya izin Firestore. Pastikan akun sudah aktif sebagai Admin/Author dan firestore.rules terbaru sudah di-deploy."
      : (err.message||"Gagal membuat forum.").replace("Firebase: ","");
    toast(msg,7000);
  }
};
$("joinForm").onsubmit=async e=>{
  e.preventDefault();
  try{
    const code=$("joinCode").value.trim();
    if(!code)return toast("Masukkan secret code.");
    const codeSnap=await getDoc(doc(db,"forumCodes",code));
    if(!codeSnap.exists())return toast("Secret code tidak ditemukan.");
    const forumId=codeSnap.data().forumId;
    const ref=doc(db,"forums",forumId);
    const s=await getDoc(ref);
    if(!s.exists())return toast("Forum tidak ditemukan.");
    const data=s.data(); if(!canAdmin() && data.banned===true)return toast("Forum ini telah dibanned oleh admin. Status: permanen.",7000); if(!canAdmin() && premiumUntilMillis(data.suspendedUntil)>Date.now())return toast("Forum ini sedang disuspend sampai "+new Date(premiumUntilMillis(data.suspendedUntil)).toLocaleString("id-ID")+".",7000); const existingMembers=data.memberIds||[];
    if(existingMembers.includes(currentUser.uid)){openForum(forumId,data);return}
    if(existingMembers.length>=data.maxMembers)return toast("Forum sudah penuh.");
    await runTransaction(db,async tx=>{
      const fresh=await tx.get(ref);
      if(!fresh.exists())throw new Error("Forum tidak ditemukan.");
      const freshData=fresh.data(), members=freshData.memberIds||[];
      if(members.includes(currentUser.uid))return;
      if(members.length>=freshData.maxMembers)throw new Error("Forum sudah penuh.");
      tx.update(ref,{memberIds:[...members,currentUser.uid]});
      tx.set(doc(db,"forums",forumId,"members",currentUser.uid),{displayName:profile.displayName,username:profile.username,role:"member",joinedAt:serverTimestamp()});
    });
    const latest=await getDoc(ref);
    openForum(forumId,latest.data());
    await logActivity("forum_joined",`Bergabung ke forum “${latest.data()?.name||"Forum"}”`,{forumId,forumName:latest.data()?.name||"Forum"});
  }catch(err){ toast(err.message.replace("Firebase: ","")); }
};
async function loadForums(){
  try{
    // Owner is always kept inside memberIds when the forum is created, so using
    // the memberIds query avoids a Firestore rules/query mismatch on ownerId.
    const joined=await getDocs(query(collection(db,"forums"),where("memberIds","array-contains",currentUser.uid)));
    const map=new Map(); [...joined.docs].forEach(d=>{const f={id:d.id,...d.data()}; map.set(d.id,f);});
    $("forumList").innerHTML=[...map.values()].map(f=>{const suspended=premiumUntilMillis(f.suspendedUntil)>Date.now(); const status=f.banned?"BANNED • PERMANEN":(suspended?"SUSPENDED • SAMPAI "+new Date(premiumUntilMillis(f.suspendedUntil)).toLocaleString("id-ID"):"AKTIF"); return `<div class="forum-card glass"><span class="eyebrow">PRIVATE FORUM</span><h3>${esc(f.name)}</h3><p class="muted">${(f.memberIds||[]).length}/${f.maxMembers||"∞"} anggota</p><p class="code">Secret code: ${esc(f.secretCode||"Belum tersedia")}</p><p class="forum-status ${f.banned?"banned":suspended?"suspended":"active"}">${esc(status)}</p><button class="secondary wide" data-open="${f.id}">Buka forum</button></div>`}).join("")||`<div class="form-card glass"><h3>Belum ada forum</h3><p class="muted">Buat forum baru atau bergabung dengan secret code.</p></div>`;
    document.querySelectorAll("[data-open]").forEach(b=>b.onclick=async()=>{try{const s=await getDoc(doc(db,"forums",b.dataset.open)); if(s.exists())openForum(s.id,s.data()); else toast("Forum tidak ditemukan.");}catch(err){toast(err.message.replace("Firebase: ",""));}});
  }catch(err){
    console.error("loadForums:",err);
    $("forumList").innerHTML=`<div class="notice">Gagal memuat forum: ${esc(err.message.replace("Firebase: ",""))}</div>`;
  }
}
const BOT_COMMANDS=["menu","help","ping","waktu","tanggal","info","forum","owner","anggota","kapasitas","sisa","status","mode","kode","bot","premium","profil","id","aturan","versi","random","angka","hitung","morse","hex","bin","base64","rot13","quote","clearall","rawatforum","slowmode","lock","unlock","welcome","rules","linkfilter","capsfilter","spamguard","stats","uptime","cari","upper","lower","panjang","reverse","echo","dice","coin","pilih"];
function botActiveFor(forum){return !!forum?.botCare?.enabled && premiumUntilMillis(forum.botCare.expiresAt)>Date.now();}
function botMenuText(forum){
  const now=new Date();
  const owner=currentUser?.uid===forum?.ownerId?"Iya":"Bukan";
  const lines=[
    `Hai ${profile?.displayName||"User"}! 👋`,
    `Tanggal: ${now.toLocaleDateString("id-ID",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}`,
    `Waktu: ${now.toLocaleTimeString("id-ID")}`,
    `Role: ${botRoleLabel()}`,
    `Owner Forum: ${owner}`,
    `Forum: ${forum?.name||"Forum"}`,
    "",
    "🤖 MENU BOT CARE • 50 FITUR",
    "Informasi: #help #ping #waktu #tanggal #info #forum #owner #anggota #kapasitas #sisa",
    "Status: #status #mode #kode #bot #premium #profil #id #aturan #versi",
    "Utilitas: #random #angka teks #hitung rumus #morse teks #hex teks #bin teks #base64 teks #rot13 teks #quote",
    "Moderasi: #clearall #rawatforum on/off #slowmode #lock #unlock #welcome #rules",
    "Proteksi: #linkfilter on/off #capsfilter on/off #spamguard on/off",
    "Statistik: #stats #uptime #server #members #admins #whoami #cari @username",
    "Teks/Game: #upper teks #lower teks #panjang teks #reverse teks #dice #coin #pilih A|B|C #echo teks",
    "",
    "👑 Perintah yang mengubah forum membutuhkan hak owner/Admin/Author.",
    "Bot Care dapat digunakan saat masa sewa aktif."
  ];
  return lines.join("\n");
}
function encodeMorseText(v){const map={a:".-",b:"-...",c:"-.-.",d:"-..",e:".",f:"..-.",g:"--.",h:"....",i:"..",j:".---",k:"-.-",l:".-..",m:"--",n:"-.",o:"---",p:".--.",q:"--.-",r:".-.",s:"...",t:"-",u:"..-",v:"...-",w:".--",x:"-..-",y:"-.--",z:"--.."," ":"/"};return [...v.toLowerCase()].map(c=>map[c]||c).join(" ")}
function encodeA1Z26(v){return [...v.toUpperCase()].map(c=>/[A-Z]/.test(c)?c.charCodeAt(0)-64:c===' '?0:c).join(' ')}
function encodeHex(v){return [...v].map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join(' ')}
function encodeBinary(v){return [...v].map(c=>c.charCodeAt(0).toString(2).padStart(8,'0')).join(' ')}
function encodeBase64(v){try{return btoa(unescape(encodeURIComponent(v)))}catch(e){return 'Gagal encode Base64.'}}
function rot13(v){return v.replace(/[A-Za-z]/g,c=>String.fromCharCode(c<='Z'?((c.charCodeAt(0)-65+13)%26)+65:((c.charCodeAt(0)-97+13)%26)+97))}
function botFeatureState(forum,key,def=false){return forum?.botCare?.features?.[key]===undefined?def:!!forum.botCare.features[key];}
function updateBotCareFeature(forum,key,value){
  return updateDoc(doc(db,"forums",forum.id),{botCare:{...(forum.botCare||{}),enabled:true,name:"Bot Care",botId:"BOT_CARE",features:{...(forum.botCare?.features||{}),[key]:!!value}}});
}
function botSafeChoices(arg){return String(arg||"").split("|").map(x=>x.trim()).filter(Boolean);}
function botDice(){return Math.floor(Math.random()*6)+1;}
function botReply(command,forum){
  const parsed=normalizeBotCommand(command); if(!parsed)return null;
  const {cmd,arg}=parsed;
  const members=(forum.memberIds||[]).filter(x=>x!=="BOT_CARE").length,max=forum.maxMembers||0,now=new Date();
  const r={
    help:'Gunakan #menu untuk melihat 50 fitur Bot Care.',
    ping:'Pong! Bot Care aktif ✓',
    waktu:`Sekarang pukul ${now.toLocaleTimeString('id-ID')}.`,
    tanggal:now.toLocaleDateString('id-ID',{weekday:'long',year:'numeric',month:'long',day:'numeric'}),
    info:`Forum: ${forum.name||'Forum'}\nAnggota: ${members}/${max||'∞'}\nRole kamu: ${botRoleLabel()}`,
    forum:`Forum ${forum.name||'Forum'} aktif.`,
    owner:forum.ownerId===currentUser.uid?'Kamu adalah owner forum.':`Forum dimiliki UID: ${forum.ownerId}`,
    anggota:`Jumlah anggota: ${members}`,
    kapasitas:`Kapasitas: ${max||'tanpa batas'}`,
    sisa:max?`Sisa slot: ${Math.max(0,max-members)}`:'Tidak dibatasi',
    status:forum.banned?'Forum dibanned.':premiumUntilMillis(forum.suspendedUntil)>Date.now()?`Forum disuspend sampai ${new Date(premiumUntilMillis(forum.suspendedUntil)).toLocaleString('id-ID')}.`:'Forum aktif.',
    mode:forum.ownerOnly?'Hanya owner yang dapat mengirim chat.':'Semua anggota dapat mengirim chat.',
    kode:`Secret code: ${forum.secretCode||'tidak tersedia'}`,
    bot:botActiveFor(forum)?`Bot Care aktif sampai ${new Date(premiumUntilMillis(forum.botCare.expiresAt)).toLocaleString('id-ID')}.`:'Bot Care tidak aktif.',
    premium:'Premium: custom secret code, translator sandi, dan kapasitas sampai 400 anggota.',
    profil:`Nama: ${profile.displayName}\nUsername: @${profile.username}`,
    id:`UID kamu: ${currentUser.uid}`,
    aturan:'Hormati anggota lain, jangan spam, dan ikuti aturan forum.',
    versi:'Bot Care v3.0 • 50 fitur',
    stats:`Statistik forum: ${members} anggota • ${max||'∞'} kapasitas • Bot ${botActiveFor(forum)?'aktif':'nonaktif'}`,
    uptime:botActiveFor(forum)?`Bot Care aktif hingga ${new Date(premiumUntilMillis(forum.botCare.expiresAt)).toLocaleString('id-ID')}.`:'Bot Care belum disewa.',
    server:'Secret Forum • Bot Care • Firebase',
    members:`Anggota aktif yang tercatat: ${members}`,
    admins:'Admin/Author dapat memakai fitur administrasi sesuai role.',
    whoami:`Kamu ${profile.displayName} (@${profile.username}) • ${botRoleLabel()}`,
  };
  if(cmd==='menu')return botMenuText(forum);
  if(r[cmd])return r[cmd];
  if(cmd==='random')return `Angka acak: ${Math.floor(Math.random()*100000)+1}`;
  if(cmd==='angka')return arg?encodeA1Z26(arg):'Format: #angka Halo';
  if(cmd==='hitung')return arg?decodeFormula(arg):'Format: #hitung 12+5';
  if(cmd==='morse')return arg?encodeMorseText(arg):'Format: #morse Halo';
  if(cmd==='hex')return arg?encodeHex(arg):'Format: #hex Halo';
  if(cmd==='bin')return arg?encodeBinary(arg):'Format: #bin Halo';
  if(cmd==='base64')return arg?encodeBase64(arg):'Format: #base64 Halo';
  if(cmd==='rot13')return arg?rot13(arg):'Format: #rot13 Halo';
  if(cmd==='quote'){const q=['Tetap tenang dan lanjutkan.','Kode rahasia tetap aman.','Satu forum, satu ruang untuk berbagi.'];return q[Math.floor(Math.random()*q.length)]}
  if(cmd==='upper')return arg?arg.toUpperCase():'Format: #upper teks';
  if(cmd==='lower')return arg?arg.toLowerCase():'Format: #lower TEKS';
  if(cmd==='panjang')return `Panjang teks: ${String(arg||'').length} karakter.`;
  if(cmd==='reverse')return arg?[...arg].reverse().join(''):'Format: #reverse teks';
  if(cmd==='dice')return `🎲 Dadu: ${botDice()}`;
  if(cmd==='coin')return `🪙 Koin: ${Math.random()<.5?'HEAD':'TAIL'}`;
  if(cmd==='pilih'){const a=botSafeChoices(arg);return a.length?`🎯 Pilihan Bot: ${a[Math.floor(Math.random()*a.length)]}`:'Format: #pilih A|B|C';}
  if(cmd==='echo')return arg||'Format: #echo teks';
  if(cmd==='cari')return arg?`Pencarian @${arg.replace(/^@/,'')} tersedia melalui Admin/Author.`:'Format: #cari @username';
  return `Perintah ${parsed.prefix}${cmd||''} belum dikenal. Ketik #menu.`;
}
function pushLocalBotReply(forumId,text,meta={}){const arr=localBotReplies.get(forumId)||[];arr.push({text,createdAt:new Date(),imageUrl:meta.imageUrl||""});if(arr.length>20)arr.shift();localBotReplies.set(forumId,arr);const box=$("messages");if(!box)return;const image=meta.imageUrl?`<img class="bot-menu-image" src="${esc(meta.imageUrl)}" alt="Menu Bot Care" loading="lazy">`:"";box.insertAdjacentHTML('beforeend',`<div class="msg bot-msg"><div class="msg-head"><div class="msg-name">Bot Care <span class="bot-badge">BOT</span></div></div>${image}<div class="msg-text">${esc(text).replace(/\n/g,'<br>')}</div><div class="msg-time">${new Date().toLocaleString('id-ID')}</div></div>`);box.scrollTop=box.scrollHeight;}
function userMentionToUsername(arg){return String(arg||"").trim().replace(/^@/,'').toLowerCase();}
async function executeBotCommand(command,forum,messageId){
  const parsed=normalizeBotCommand(command); if(!parsed)return null; const {cmd,arg}=parsed;
  const management= currentUser.uid===forum.ownerId || canAdmin();
  if(cmd==='lock'||cmd==='unlock'){
    if(!management)return '⛔ Hanya owner/Admin/Author yang dapat mengunci chat.';
    const on=cmd==='lock';
    await updateDoc(doc(db,'forums',forum.id),{ownerOnly:on});
    activeForum.ownerOnly=on;
    const locked=on && currentUser.uid!==forum.ownerId && !canAdmin();
    if($('messageInput')){$('messageInput').disabled=locked;$('messageInput').placeholder=locked?'Chat dikunci oleh owner…':'Tulis pesan teks…';}
    return on?'🔒 Chat dikunci. Hanya owner/Admin/Author yang dapat mengirim.':'🔓 Chat dibuka untuk anggota.';
  }
  if(cmd==='clearall'){
    if(!management)return '⛔ Hanya owner/Admin/Author yang dapat clearall.';
    const snap=await getDocs(collection(db,'forums',forum.id,'messages'));
    if(!snap.size)return 'Tidak ada pesan untuk dihapus.';
    for(let i=0;i<snap.docs.length;i+=450){const batch=writeBatch(db);snap.docs.slice(i,i+450).forEach(d=>batch.delete(d.ref));await batch.commit();}
    await logActivity('bot_clearall',`Bot Care menghapus seluruh pesan forum “${forum.name||'Forum'}”`,{forumId:forum.id});
    return `🧹 Semua ${snap.size} pesan forum berhasil dihapus.`;
  }
  if(cmd==='rawatforum'){
    if(!management)return '⛔ Hanya owner/Admin/Author yang dapat mengaktifkan RawatForum.';
    const on=/^(on|aktif)$/i.test(arg),off=/^(off|mati)$/i.test(arg);
    if(!on&&!off)return 'Format: #rawatforum on atau #rawatforum off';
    const features={...(forum.botCare?.features||{}),rawatforum:on,linkfilter:on,capsfilter:on,spamguard:on};
    await updateDoc(doc(db,'forums',forum.id),{botCare:{...(forum.botCare||{}),enabled:true,name:'Bot Care',botId:'BOT_CARE',features}});
    activeForum.botCare={...(activeForum.botCare||{}),enabled:true,features};
    return on?'🛡️ RawatForum aktif. Bot akan memantau spam, link, CAPS berlebihan, dan kata kasar.':'🔓 RawatForum dinonaktifkan.';
  }
  if(['slowmode','linkfilter','capsfilter','spamguard','welcome','rules'].includes(cmd)){
    if(!management)return '⛔ Hanya owner/Admin/Author yang dapat mengatur fitur ini.';
    const on=/^(on|aktif)$/i.test(arg),off=/^(off|mati)$/i.test(arg);
    if(!on&&!off && cmd!=='slowmode' && cmd!=='rules' && cmd!=='welcome')return `Format: ${parsed.prefix}${cmd} on/off`;
    if(cmd==='slowmode'){
      const sec=Math.max(0,Math.min(3600,Number(arg)||0));
      await updateBotCareFeature(forum,'slowmode',sec>0); activeForum.botCare={...(activeForum.botCare||{}),features:{...(activeForum.botCare?.features||{}),slowmode:sec>0,slowmodeSec:sec}};
      return sec?`🐢 Slowmode aktif: ${sec} detik.`:'🐢 Slowmode dimatikan.';
    }
    if(cmd==='rules'){return `📜 Aturan forum:\n${forum.rulesText||'Belum ada aturan khusus. Hormati anggota dan jangan spam.'}`;}
    if(cmd==='welcome'){return '👋 Welcome message Bot Care siap digunakan.';}
    await updateBotCareFeature(forum,cmd,on);
    activeForum.botCare={...(activeForum.botCare||{}),features:{...(activeForum.botCare?.features||{}),[cmd]:on}};
    return `${on?'✅':'🔓'} ${cmd} ${on?'aktif':'nonaktif'}.`;
  }
  if(cmd==='givepremium'){
    if(!canAdmin())return '⛔ Hanya Admin/Author yang dapat menggunakan givepremium.';
    const parts=arg.split(/\s+/).filter(Boolean), username=userMentionToUsername(parts[0]), days=Math.max(1,Math.min(3650,Number(parts[1])||7));
    if(!username)return 'Format: #givepremium @username 7';
    const target=await getUserByUsername(username); if(!target)return 'User tidak ditemukan.';
    const until=Math.max(premiumUntilMillis(target.premiumUntil),Date.now())+days*86400000;
    await updateDoc(doc(db,'users',target.id),{premiumUntil:new Date(until),premiumUnlimited:false,premiumPurchases:Number(target.premiumPurchases||0)+1});
    await logActivity('premium_granted_bot',`Bot memberikan Premium ${days} hari kepada @${target.username}`,{targetUid:target.id,days});
    return `✅ Premium ${days} hari diberikan kepada @${target.username}.`;
  }
  if(cmd==='kick'){
    if(!management)return '⛔ Hanya owner/Admin/Author yang dapat kick.';
    const username=userMentionToUsername(arg); if(!username)return 'Format: #kick @username';
    let target=null;
    if(canAdmin()){ target=await getUserByUsername(username); }
    else { const ms=await getDocs(collection(db,'forums',forum.id,'members')); const found=ms.docs.map(d=>({id:d.id,...d.data()})).find(x=>String(x.username||'').toLowerCase()===username); if(found)target=found; }
    if(!target)return 'User tidak ditemukan atau bukan anggota forum.'; if(target.id===forum.ownerId)return '⛔ Owner tidak dapat di-kick.';
    await runTransaction(db,async tx=>{const ref=doc(db,'forums',forum.id),snap=await tx.get(ref);if(!snap.exists())throw new Error('Forum tidak ditemukan.');const d=snap.data(),members=d.memberIds||[];if(!members.includes(target.id))throw new Error('User bukan anggota forum.');tx.update(ref,{memberIds:members.filter(x=>x!==target.id)});tx.delete(doc(db,'forums',forum.id,'members',target.id));});
    await logActivity('forum_kick_bot',`Kick @${target.username||username} dari forum “${forum.name||'Forum'}”`,{forumId:forum.id,targetUid:target.id}); return `✅ @${target.username||username} dikeluarkan dari forum.`;
  }
  if(cmd==='mode'){
    if(!management)return '⛔ Hanya owner/Admin/Author yang dapat mengubah mode chat.';
    const on=/^(on|aktif|owner)$/i.test(arg), off=/^(off|mati|semua)$/i.test(arg); if(!on&&!off)return 'Format: #mode on atau #mode off';
    await updateDoc(doc(db,'forums',forum.id),{ownerOnly:on}); activeForum.ownerOnly=on; const isOwner=currentUser.uid===forum.ownerId; if($('messageInput')){$('messageInput').disabled=on&&!isOwner&&!canAdmin();$('messageInput').placeholder=on&&!isOwner&&!canAdmin()?'Chat dikunci oleh owner…':'Tulis pesan teks…';} if($('messageForm'))$('messageForm').classList.toggle('locked',on&&!isOwner&&!canAdmin());
    await logActivity('forum_mode_bot',`${on?'Mengaktifkan':'Menonaktifkan'} mode owner-only di forum “${forum.name||'Forum'}”`,{forumId:forum.id,ownerOnly:on}); return on?'🔒 Mode owner-only aktif.':'🔓 Semua anggota dapat mengirim chat.';
  }
  if(cmd==='hapuspesan'){
    if(!management)return '⛔ Hanya owner/Admin/Author yang dapat menghapus pesan.';
    const snap=await getDocs(query(collection(db,'forums',forum.id,'messages'),orderBy('createdAt','desc'),limit(20)));
    const candidate=snap.docs.find(d=>d.id!==messageId && String(d.data().text||'').trim()!=='' ); if(!candidate)return 'Tidak ada pesan yang dapat dihapus.';
    await deleteDoc(candidate.ref); return `🗑 Pesan terakhir dihapus.`;
  }
  if(cmd==='sensor'){
    if(!management)return '⛔ Hanya owner/Admin/Author yang dapat mengubah sensor.';
    const on=/^(on|aktif)$/i.test(arg),off=/^(off|mati)$/i.test(arg);if(!on&&!off)return 'Format: #sensor on atau #sensor off';
    await updateDoc(doc(db,'forums',forum.id),{profanityFilter:on}); activeForum.profanityFilter=on; return on?'🛡 Sensor kata kasar aktif.':'Sensor kata kasar dinonaktifkan.';
  }
  return null;
}

const BOT_RENTAL_PLANS={
  "3 hari":{days:3,price:1000},
  "1 minggu":{days:7,price:2000},
  "2 bulan":{days:60,price:5000},
  "1 tahun":{days:365,price:20000},
  "permanen":{days:0,price:50000}
};
const botLicenseCode=()=>randomChars(20);
async function requestBotRental(planName){
  if(!currentUser||!profile)return;
  const plan=BOT_RENTAL_PLANS[planName]; if(!plan)return toast('Paket bot tidak ditemukan.');
  try{
    await addDoc(collection(db,'supportRequests'),{uid:currentUser.uid,username:profile.username,displayName:profile.displayName,type:'bot_rental',plan:planName,days:plan.days,price:plan.price,maxForums:20,status:'waiting_verification',createdAt:serverTimestamp()});
    toast('Permintaan sewa Bot Care dikirim. Setelah pembayaran diverifikasi Admin, kode 20 karakter akan dikirim ke Inbox.');
  }catch(e){toast(e.message.replace('Firebase: ',''));}
}
async function activateBotLicense(){
  if(!currentUser||!profile)return;
  const code=$('botLicenseCode')?.value.trim(), secret=$('botLicenseForumCode')?.value.trim();
  if(!code||code.length<20||!secret)return toast('Masukkan kode bot dan secret code forum.');
  try{
    const cs=await getDoc(doc(db,'forumCodes',secret)); if(!cs.exists())throw new Error('Secret code forum tidak ditemukan.');
    const forumId=cs.data().forumId, forumRef=doc(db,'forums',forumId);
    const fs=await getDoc(forumRef); if(!fs.exists())throw new Error('Forum tidak ditemukan.');
    if(fs.data().ownerId!==currentUser.uid && !canAdmin())throw new Error('Hanya owner forum yang dapat memasang Bot Care.');
    await runTransaction(db,async tx=>{
      const licRef=doc(db,'botLicenses',code),ls=await tx.get(licRef); if(!ls.exists())throw new Error('Kode sewa Bot Care tidak valid.');
      const lic=ls.data(); if(lic.uid!==currentUser.uid && !canAdmin())throw new Error('Kode bot ini bukan milik akun kamu.');
      const used=Array.isArray(lic.usedForums)?lic.usedForums:[]; if(used.includes(forumId))throw new Error('Bot Care sudah aktif di forum ini.');
      const expires=Number(lic.days||0)>0?new Date(Date.now()+Number(lic.days)*86400000):null;
      if(used.length>=Number(lic.maxForums||20) && !canAdmin())throw new Error(`Batas lisensi sudah mencapai ${lic.maxForums||20} forum.`);
      const nextUsed=[...used,forumId];
      tx.update(licRef,{usedForums:nextUsed});
      tx.update(forumRef,{botCare:{enabled:true,name:'Bot Care',botId:'BOT_CARE',expiresAt:expires,addedBy:currentUser.uid,addedRole:actorRole(),licenseCode:code,maxForums:Number(lic.maxForums||20),features:{}}});
    });
    toast('Bot Care berhasil diaktifkan di forum.');
    $('botLicenseCode').value='';$('botLicenseForumCode').value='';
    await logActivity('bot_license_activated',`Mengaktifkan Bot Care di forum “${fs.data().name||'Forum'}”`,{forumId,licenseCode:code});
  }catch(e){toast(e.message.replace('Firebase: ',''));}
}
$("botRentalPlans")?.querySelectorAll("[data-bot-plan]")?.forEach(b=>b.addEventListener("click",()=>{
  selectedBotPlan=b.dataset.botPlan; selectedPremiumPlan=null;
  const p=BOT_RENTAL_PLANS[selectedBotPlan];
  $("paymentPlanText").textContent=`Sewa Bot Care ${selectedBotPlan} • Rp${Number(p?.price||0).toLocaleString("id-ID")}. Setelah pembayaran diverifikasi, kode 20 karakter dikirim ke Inbox.`;
  showPage("payment");
}));
$("botActivationForm")?.addEventListener("submit",e=>{e.preventDefault();activateBotLicense();});
async function configureBot(code,days,remove=false){if(!canAdmin())return toast('Hanya Admin/Author yang dapat mengelola Bot Care.');try{const cs=await getDoc(doc(db,'forumCodes',code.trim()));if(!cs.exists())throw new Error('Secret code forum tidak ditemukan.');const forumId=cs.data().forumId,ref=doc(db,'forums',forumId),fs=await getDoc(ref);if(!fs.exists())throw new Error('Forum tidak ditemukan.');if(remove){await updateDoc(ref,{botCare:null});await logActivity('bot_removed',`Mengeluarkan Bot Care dari forum “${fs.data().name||'Forum'}”`,{forumId});toast('Bot Care dikeluarkan dari forum.');return}const n=Math.max(1,Math.min(3650,Number(days)||3));const expires=new Date(Date.now()+n*86400000);await updateDoc(ref,{botCare:{enabled:true,name:'Bot Care',botId:'BOT_CARE',expiresAt:expires,addedBy:currentUser.uid,addedRole:actorRole()}});await logActivity('bot_added',`Memasukkan Bot Care ke forum “${fs.data().name||'Forum'}” selama ${n} hari`,{forumId,days:n});toast(`Bot Care aktif ${n} hari.`)}catch(e){toast(e.message.replace('Firebase: ',''))}}
$("adminBotForm")?.addEventListener('submit',async e=>{e.preventDefault();await configureBot($("adminBotCode").value,$("adminBotDays").value);e.target.reset();$("adminBotDays").value=3});
$("authorBotForm")?.addEventListener('submit',async e=>{e.preventDefault();await configureBot($("authorBotCode").value,$("authorBotDays").value);e.target.reset();$("authorBotDays").value=3});
$("adminBotRemoveBtn")?.addEventListener('click',async()=>{const c=prompt('Secret code forum:','');if(c)await configureBot(c,1,true)}); $("authorBotRemoveBtn")?.addEventListener('click',async()=>{const c=prompt('Secret code forum:','');if(c)await configureBot(c,1,true)});

function openForum(id,data){
  if(!canAdmin() && data.banned===true)return toast("Forum ini telah dibanned oleh admin. Status: permanen.",7000);
  const su=premiumUntilMillis(data.suspendedUntil);
  if(!canAdmin() && su>Date.now())return toast("Forum ini sedang disuspend sampai "+new Date(su).toLocaleString("id-ID")+".",7000);
  activeForum={id,...data};
  if(botExpiryTimer){clearTimeout(botExpiryTimer);botExpiryTimer=null;} if(activeForum.botCare?.enabled){const remain=premiumUntilMillis(activeForum.botCare.expiresAt)-Date.now();if(remain>0&&canAdmin())botExpiryTimer=setTimeout(()=>updateDoc(doc(db,"forums",id),{botCare:null}).then(()=>toast("Masa Bot Care berakhir. Bot otomatis dikeluarkan.")).catch(()=>{}),remain);else if(remain<=0&&canAdmin())updateDoc(doc(db,"forums",id),{botCare:null}).catch(()=>{});}
  showPage("forum");
  $("activeForumName").textContent=data.name;
  $("activeForumMeta").textContent=`${(data.memberIds||[]).filter(x=>x!=="BOT_CARE").length}/${data.maxMembers||"∞"} anggota • kode ${data.secretCode||"kode belum tersedia"}${botActiveFor(data)?" • 🤖 Bot Care aktif":""}`;
  const isOwner=currentUser.uid===data.ownerId;
  $("ownerControls").classList.toggle("hidden",!isOwner);
  $("ownerModeBtn").textContent=data.ownerOnly?"Aktif • ON":"Nonaktif • OFF";
  $("ownerModeHint").textContent=data.ownerOnly?"Mode aktif: hanya owner yang dapat mengirim chat.":"Mode nonaktif: semua anggota dapat mengirim chat.";
  const setComposerState=(locked)=>{
    $("messageInput").disabled=locked;
    $("messageForm").querySelector("button").disabled=locked;
    $("messageInput").placeholder=locked?"Chat dikunci oleh owner…":"Tulis pesan teks…";
    $("messageForm").classList.toggle("locked",locked);
  };
  const composerLocked=data.ownerOnly===true && !isOwner && !canAdmin();
  setComposerState(composerLocked);
  $("copyCodeBtn").onclick=async()=>{const ok=await copyText(data.secretCode||"");toast(ok?"Kode disalin.":"Gagal menyalin kode.");};
  $("leaveForumBtn").onclick=async()=>{
    if(canAdmin())return;
    if(!confirm(isOwner?"Keluar dari forum? Kamu tetap tercatat sebagai owner dan dapat mengakses/mengelola forum lagi nanti.":"Keluar dari forum ini?"))return;
    try{await runTransaction(db,async tx=>{const ref=doc(db,"forums",id),snap=await tx.get(ref);if(!snap.exists())throw new Error("Forum tidak ditemukan.");const d=snap.data(), members=d.memberIds||[];tx.update(ref,{memberIds:members.filter(x=>x!==currentUser.uid)});tx.delete(doc(db,"forums",id,"members",currentUser.uid));}); toast(isOwner?"Kamu keluar sebagai anggota. Status owner tetap." : "Kamu keluar dari forum."); showPage("home"); loadForums();}catch(err){toast(err.message.replace("Firebase: ",""));}};
  $("ownerModeBtn").onclick=async()=>{
    try{
      const next=!activeForum.ownerOnly;
      await updateDoc(doc(db,"forums",id),{ownerOnly:next});
      activeForum.ownerOnly=next; $("ownerModeBtn").textContent=next?"Aktif • ON":"Nonaktif • OFF";
      $("ownerModeHint").textContent=next?"Mode aktif: hanya owner yang dapat mengirim chat.":"Mode nonaktif: semua anggota dapat mengirim chat.";
      const locked=next && currentUser.uid!==activeForum.ownerId && !canAdmin();
      setComposerState(locked);
      toast(next?"Sekarang hanya owner yang dapat mengirim.":"Semua anggota dapat mengirim pesan.");
    }catch(err){toast(err.message.replace("Firebase: ",""));}
  };
  async function renderMembers(){
    if(!isOwner)return;
    try{
      const s=await getDocs(collection(db,"forums",id,"members"));
      $("memberResults").innerHTML=(botActiveFor(activeForum)?`<div class="member-item bot-member"><span><b>Bot Care</b><br><span class="tiny muted">BOT • sampai ${new Date(premiumUntilMillis(activeForum.botCare.expiresAt)).toLocaleString("id-ID")}</span></span><span class="tiny muted">BOT</span></div>`:"")+s.docs.map(d=>{
        const m=d.data(), self=d.id===currentUser.uid;
        return `<div class="member-item"><span><b>${esc(m.displayName||m.username||"User")}</b><br><span class="tiny muted">@${esc(m.username||"")}${m.role==="owner"?" • OWNER":""}</span></span>${self?'<span class="tiny muted">Kamu</span>':`<button class="secondary" data-kick="${d.id}">Kick</button>`}</div>`;
      }).join("")||'<div class="notice">Belum ada anggota.</div>';
      document.querySelectorAll("[data-kick]").forEach(btn=>btn.onclick=async()=>{
        if(!confirm("Kick anggota ini dari forum?"))return;
        try{
          await runTransaction(db,async tx=>{
            const ref=doc(db,"forums",id), snap=await tx.get(ref);
            if(!snap.exists()||snap.data().ownerId!==currentUser.uid)throw new Error("Hanya owner yang dapat kick.");
            const members=snap.data().memberIds||[];
            if(!members.includes(btn.dataset.kick))throw new Error("Anggota sudah keluar.");
            tx.update(ref,{memberIds:members.filter(x=>x!==btn.dataset.kick)});
            tx.delete(doc(db,"forums",id,"members",btn.dataset.kick));
          });
          const latest=await getDoc(doc(db,"forums",id)); activeForum={id,...latest.data()};
          $("activeForumMeta").textContent=`${activeForum.memberIds.length}/${activeForum.maxMembers||"∞"} anggota • kode ${activeForum.secretCode||"kode belum tersedia"}`;
          renderMembers(); toast("Anggota dikeluarkan.");
        }catch(err){toast(err.message.replace("Firebase: ",""));}
      });
    }catch(err){$("memberResults").textContent="Gagal memuat anggota: "+err.message.replace("Firebase: ","");}
  }
  renderMembers();
  if(unsubscribeMessages)unsubscribeMessages();
  const q=query(collection(db,"forums",id,"messages"),orderBy("createdAt","asc"));
  unsubscribeMessages=onSnapshot(q,s=>{
    const box=$("messages");
    messageTextCache.clear();
    box.innerHTML=s.docs.map(d=>{
      const m=d.data(), me=m.uid===currentUser.uid, canDelete=me||canAdmin();
      messageTextCache.set(d.id, m.text||"");
      const authorBadge=m.isAuthor?roleBadgeHTML("author"):"";
      const verified=m.isAdmin?'<span class="verified" title="Admin terverifikasi" aria-label="Admin terverifikasi"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 16.7 4.8 12.3l-1.9-1.9 6.3 6.3L21.2 8.5l-1.9-1.9z"/></svg></span>':'';
      const premiumBadge=premiumBadgeHTML(premiumBadgeLevel(m.premiumPurchases));
      const deleteButton=canDelete?`<button class="msg-delete" data-delete-message="${d.id}" title="Hapus pesan" aria-label="Hapus pesan">🗑</button>`:"";
      const translateButton=canUsePremium()?`<button class="msg-translate" data-translate-message="${d.id}">✦ Terjemahkan sandi</button>`:"";
      const text=String(m.text||"");
      const isLong=text.length>1200;
      const preview=isLong?text.slice(0,1200):text;
      let attachmentHTML="";
      const a=m.attachment;
      if(a?.url){
        const type=String(a.type||"");
        if(type.startsWith("image/")) attachmentHTML=`<div class="msg-attachment image-attachment"><a href="${esc(a.url)}" target="_blank" rel="noopener"><img src="${esc(a.url)}" alt="${esc(a.name||"Foto")}" loading="lazy"></a></div>`;
        else if(type.startsWith("video/")) attachmentHTML=`<div class="msg-attachment video-attachment"><video controls preload="metadata" src="${esc(a.url)}"></video></div>`;
        else attachmentHTML=`<div class="msg-attachment file-attachment"><span>📎</span><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.name||"Unduh file")}</a><span class="tiny muted">${a.size?formatBytes(a.size):""}</span></div>`;
      }
      return `<div class="msg ${me?"me":""}" data-message-id="${d.id}"><div class="msg-head"><div class="msg-name">${esc(m.displayName||"User")} ${authorBadge} ${verified} ${premiumBadge}</div>${deleteButton}</div>${attachmentHTML}<div class="msg-text ${isLong?"collapsed":""}" data-preview-text="${esc(preview)}">${esc(preview).replace(/\n/g,"<br>")}</div>${isLong?`<button class="read-more" data-read-more="${d.id}">Baca selengkapnya</button>`:""}<div class="msg-tools">${translateButton}</div><div class="msg-time">${m.createdAt?.toDate?.().toLocaleString("id-ID")||"baru saja"}</div></div>`;
    }).join("") || '<div class="notice">Belum ada pesan.</div>';
    if(botActiveFor(activeForum) && botFeatureState(activeForum,'rawatforum',false)){
      const badLink=/https?:\/\/|www\./i, capsRatio=(s)=>{const letters=(s.match(/[A-Za-z]/g)||[]).length,upper=(s.match(/[A-Z]/g)||[]).length;return letters>=12?upper/letters:.0;};
      s.docs.forEach(d=>{
        if(botCareHandledMessages.has(d.id))return;
        const m=d.data(), text=String(m.text||'');
        if(!text || m.uid===currentUser.uid && d.id==='__never__')return;
        let warning='';
        if(containsProfanity(text)) warning='⚠️ RawatForum mendeteksi kata yang tidak pantas. Mohon gunakan bahasa yang sopan.';
        else if(badLink.test(text) && botFeatureState(activeForum,'linkfilter',true)) warning='🔗 RawatForum mendeteksi tautan. Pastikan link yang dibagikan aman.';
        else if(capsRatio(text)>=0.8 && botFeatureState(activeForum,'capsfilter',true)) warning='🔠 RawatForum mendeteksi penggunaan CAPS berlebihan.';
        else if(botFeatureState(activeForum,'spamguard',true)){const key=`${m.uid}|${text.trim().toLowerCase()}`;const now=Date.now();const old=Number(localStorage.getItem(`botspam:${key}`)||0);if(old&&now-old<20000)warning='🚦 RawatForum mendeteksi pesan berulang/spam. Mohon beri jeda.';localStorage.setItem(`botspam:${key}`,String(now));}
        if(warning){botCareHandledMessages.add(d.id);pushLocalBotReply(id,warning);}
      });
    }
    if(activeForum?.profanityFilter===true && (currentUser.uid===activeForum.ownerId || canAdmin())){
      s.docs.forEach(d=>{const m=d.data();if(typeof m.text==='string'&&containsProfanity(m.text)){deleteDoc(d.ref).catch(()=>{});}});
    }
    const lr=localBotReplies.get(id)||[]; if(lr.length) box.insertAdjacentHTML("beforeend",lr.map(r=>`<div class="msg bot-msg"><div class="msg-head"><div class="msg-name">Bot Care <span class="bot-badge">BOT</span></div></div>${r.imageUrl?`<img class="bot-menu-image" src="${esc(r.imageUrl)}" alt="Menu Bot Care" loading="lazy">`:""}<div class="msg-text">${esc(r.text).replace(/\n/g,"<br>")}</div><div class="msg-time">${r.createdAt.toLocaleString("id-ID")}</div></div>`).join(""));
    if(botActiveFor(activeForum)){const cutoff=Date.now()-10*60*1000;s.docs.forEach(d=>{const m=d.data(),created=m.createdAt?.toMillis?.()||0;if(typeof m.text==='string'&&normalizeBotCommand(m.text)&&created>=cutoff&&!botHandledCommands.has(d.id)){botHandledCommands.add(d.id);setTimeout(async()=>{try{const result=await executeBotCommand(m.text,activeForum,d.id);const text=result||botReply(m.text,activeForum)||'';const parsed=normalizeBotCommand(m.text);const imageUrl=parsed?.cmd==='menu'?botMenuImageUrl(botMenuConfig.imageUrl):'';pushLocalBotReply(id,text,{imageUrl});}catch(err){pushLocalBotReply(id,`⚠️ ${err.message.replace('Firebase: ','')}`);}},220);}});}
    box.querySelectorAll("[data-read-more]").forEach(btn=>btn.onclick=()=>{
      const msgEl=btn.closest(".msg")?.querySelector(".msg-text");
      const full=messageTextCache.get(btn.dataset.readMore)||"";
      if(!msgEl)return;
      const expanded=btn.dataset.expanded==="true";
      msgEl.innerHTML=esc(expanded?full:full.slice(0,1200)).replace(/\n/g,"<br>");
      msgEl.classList.toggle("collapsed",!expanded);
      btn.dataset.expanded=expanded?"false":"true";
      btn.textContent=expanded?"Baca selengkapnya":"Sembunyikan";
    });
    box.querySelectorAll("[data-delete-message]").forEach(btn=>btn.onclick=async()=>{
      if(!activeForum)return;
      if(!confirm("Hapus pesan ini?"))return;
      try{
        const messageSnap=await getDoc(doc(db,"forums",activeForum.id,"messages",btn.dataset.deleteMessage));
        await deleteDoc(doc(db,"forums",activeForum.id,"messages",btn.dataset.deleteMessage));
        // Media berada di Cloudinary. Penghapusan pesan tidak menghapus asset Cloudinary
        // karena penghapusan asset memerlukan API secret/server-side authentication.
        toast("Pesan dihapus.");
      }catch(err){toast(err.message.replace("Firebase: ",""));}
    });
    box.querySelectorAll("[data-translate-message]").forEach(btn=>btn.onclick=async()=>{
      const msgEl=btn.closest(".msg")?.querySelector(".msg-text");
      if(!msgEl)return;
      const id=btn.dataset.translateMessage;
      if(btn.dataset.translated === "true"){
        const original=messageTextCache.get(id)||"";
        msgEl.innerHTML=esc(original.length>1200?original.slice(0,1200):original).replace(/\n/g,"<br>");
        msgEl.classList.toggle("collapsed",original.length>1200);
        btn.dataset.translated="false"; btn.textContent="✦ Terjemahkan sandi";
        return;
      }
      const original=messageTextCache.get(id)||"";
      if(!original)return toast("Pesan tidak ditemukan.");
      const result=decodeSecret(original,"auto");
      if(result.startsWith("Sandi belum dikenali"))return toast("Sandi belum dikenali. Gunakan format Morse, angka, rumus, biner/hex/Base64/URL/ROT13.");
      btn.dataset.translated="true";
      msgEl.classList.remove("collapsed");
      msgEl.innerHTML=esc(result).replace(/\n/g,"<br>");
      btn.textContent="↩ Kembalikan sandi";
    });
    box.scrollTop=box.scrollHeight;
  },err=>{
    console.error("Messages listener:",err);
    toast("Gagal memuat chat: "+err.message.replace("Firebase: ",""));
  });
}
const MORSE={".-":"A","-...":"B","-.-.":"C","-..":"D",".":"E","..-.":"F","--.":"G","....":"H","..":"I",".---":"J","-.-":"K",".-..":"L","--":"M","-.":"N","---":"O",".--.":"P","--.-":"Q",".-.":"R","...":"S","-":"T","..-":"U","...-":"V",".--":"W","-..-":"X","-.--":"Y","--..":"Z","-----":"0",".----":"1","..---":"2","...--":"3","....-":"4",".....":"5","-....":"6","--...":"7","---..":"8","----.":"9",".-.-.-":".","--..--":",","..--..":"?","-.-.--":"!","-....-":"-",".-..-.":"'","-.--.":"(","-.--.-":")"};
function decodeMorse(v){
  const x=v.trim();
  const words=x.split(/\s*\/\s*|\s{2,}/).filter(Boolean);
  return words.map(word=>word.trim().split(/\s+/).filter(Boolean).map(x=>MORSE[x]||`[${x}]`).join("")).join(" ");
}
function decodeNumbers(v){
  const x=v.trim();
  const nums=x.split(/[^0-9]+/).filter(Boolean).map(Number);
  if(!nums.length)return "";
  if(nums.every(n=>n>=1&&n<=26))return nums.map(n=>String.fromCharCode(64+n)).join("");
  if(nums.every(n=>n>=32&&n<=126))return nums.map(n=>String.fromCharCode(n)).join("");
  return "Tidak dikenali sebagai sandi angka A1Z26/ASCII.";
}
function decodeBinary(v){
  const bits=v.trim().replace(/\s+/g," ");
  if(!/^(?:[01]{8})(?:\s+[01]{8})*$/.test(bits))return null;
  return bits.split(/\s+/).map(b=>String.fromCharCode(parseInt(b,2))).join("");
}
function decodeHex(v){
  const x=v.trim().replace(/0x/gi,"").replace(/[,:-]+/g," ");
  if(!/^(?:[0-9a-fA-F]{2})(?:\s+[0-9a-fA-F]{2})*$/.test(x))return null;
  return x.split(/\s+/).map(h=>String.fromCharCode(parseInt(h,16))).join("");
}
function decodeDigital(v){
  const x=v.trim();
  const bin=decodeBinary(x); if(bin!==null)return bin;
  const hex=decodeHex(x); if(hex!==null)return hex;
  try{const normalized=x.replace(/-/g,"+").replace(/_/g,"/").replace(/\s/g,"");if(/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)&&normalized.length>=4&&normalized.length%4===0){const out=atob(normalized);if(out) return [...out].map(c=>c.charCodeAt(0)<32?`\\x${c.charCodeAt(0).toString(16).padStart(2,"0")}`:c).join("");}}catch(e){}
  try{if(/(?:%[0-9A-F]{2})+/i.test(x))return decodeURIComponent(x);}catch(e){}
  // ROT13 is a common modern/digital text encoding.
  if(/^[A-Za-z0-9\s.,!?'-]+$/.test(x) && /[A-Za-z]/.test(x))return x.replace(/[A-Za-z]/g,c=>{const b=c<="Z"?65:97;return String.fromCharCode((c.charCodeAt(0)-b+13)%26+b);});
  return "Tidak dikenali sebagai sandi digital (biner, hex, Base64, URL, atau ROT13).";
}
function decodeFormula(v){
  const x=v.trim();
  if(!/^[0-9+\-*/().%\s×÷]+$/.test(x)||!/[+\-*/%×÷]/.test(x))return "Rumus hanya mendukung angka dan operator + − × ÷ %.";
  const safe=x.replace(/×/g,"*").replace(/÷/g,"/");
  try{const tokens=safe.match(/\d+(?:\.\d+)?|[+\-*/%.()]/g)||[];let pos=0;
    function expr(){let n=term();while(tokens[pos]==="+"||tokens[pos]==="-"){const op=tokens[pos++],r=term();n=op==="+"?n+r:n-r;}return n;}
    function term(){let n=factor();while(tokens[pos]==="*"||tokens[pos]==="/"||tokens[pos]==="%"){const op=tokens[pos++],r=factor();n=op==="*"?n*r:op==="/"?n/r:n%r;}return n;}
    function factor(){if(tokens[pos]==="("){pos++;const n=expr();if(tokens[pos]!==")")throw 0;pos++;return n;}if(tokens[pos]==="-"){pos++;return -factor();}const n=Number(tokens[pos++]);if(!Number.isFinite(n))throw 0;return n;}
    const n=expr();if(pos!==tokens.length||!Number.isFinite(n))throw 0;return `Hasil rumus: ${n}`;
  }catch(e){return "Rumus tidak valid.";}
}
function looksLikeMorse(x){return /^[.\-\s/]+$/.test(x)&&/[.\-]/.test(x)&&x.replace(/[.\-\s/]/g,"")==="";}
function looksLikeNumber(x){return /^\d+(?:[\s,;:.]+\d+)*$/.test(x);}
function decodeSecret(v,type){
  const x=v.trim();
  if(type==="morse")return decodeMorse(x);
  if(type==="number")return decodeNumbers(x);
  if(type==="formula")return decodeFormula(x);
  if(type==="digital")return decodeDigital(x);
  if(looksLikeMorse(x))return decodeMorse(x);
  const bin=decodeBinary(x); if(bin!==null)return bin;
  const hex=decodeHex(x); if(hex!==null)return hex;
  if(looksLikeNumber(x)){const n=decodeNumbers(x);if(!n.startsWith("Tidak dikenali"))return n;}
  if(/[+*/%×÷]/.test(x))return decodeFormula(x);
  if(/(?:%[0-9A-F]{2})+/i.test(x))return decodeDigital(x);
  try{const normalized=x.replace(/-/g,"+").replace(/_/g,"/").replace(/\s/g,"");if(/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)&&normalized.length>=4&&normalized.length%4===0){const out=atob(normalized);if(out && /[\x20-\x7E]/.test(out))return out;}}catch(e){}
  return "Sandi belum dikenali. Pilih jenis sandi secara manual.";
}
function formatBytes(bytes){const n=Number(bytes||0);if(!n)return "";if(n<1024)return n+" B";if(n<1024*1024)return (n/1024).toFixed(1)+" KB";if(n<1024*1024*1024)return (n/1024/1024).toFixed(1)+" MB";return (n/1024/1024/1024).toFixed(1)+" GB";}
const PROFANITY_WORDS=["anjing","bangsat","bajingan","brengsek","goblok","tolol","kontol","memek","ngentot","jancok","pantek","kampret","asu","babi","monyet","tai","setan","idiot"];
function normalizeProfanityText(value){return String(value||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/0/g,"o").replace(/1/g,"i").replace(/3/g,"e").replace(/4/g,"a").replace(/5/g,"s").replace(/7/g,"t").replace(/@/g,"a").replace(/\$/g,"s").replace(/[^a-z0-9]+/g,"");}
function containsProfanity(value){const n=normalizeProfanityText(value);return PROFANITY_WORDS.some(w=>n.includes(w));}
const MAX_MESSAGE_LENGTH=100000;
const MAX_ATTACHMENT_SIZE=100*1024*1024;
function setAttachmentLabel(){const f=$("messageAttachment")?.files?.[0];const label=$("attachmentName");if(label)label.textContent=f?`${f.name} • ${formatBytes(f.size)}`:"";}
$("messageAttachment")?.addEventListener("change",setAttachmentLabel);
$("messageForm").onsubmit=async e=>{
  e.preventDefault();
  const input=$("messageInput"), fileInput=$("messageAttachment"), text=input.value.trim(), file=fileInput?.files?.[0]||null;
  if(!activeForum)return;
  if(activeForum.ownerOnly===true && activeForum.ownerId!==currentUser.uid && !canAdmin())return toast("Hanya owner yang dapat mengirim pesan.");
  const slowSec=Number(activeForum.botCare?.features?.slowmodeSec||0); if(botActiveFor(activeForum)&&slowSec>0&&!canAdmin()){const last=Number(botSlowmodeLastSent.get(activeForum.id)||0),wait=slowSec-Math.floor((Date.now()-last)/1000);if(wait>0)return toast(`Slowmode aktif. Tunggu ${wait} detik.`);}
  if(!text && !file)return;
  if(text.length>MAX_MESSAGE_LENGTH)return toast("Pesan terlalu panjang. Maksimal 100.000 karakter.");
  if(file && file.size>MAX_ATTACHMENT_SIZE)return toast("Ukuran file maksimal 100 MB.");
  const sendBtn=$("messageForm").querySelector("button[type=submit]");
  if(sendBtn){sendBtn.disabled=true;sendBtn.textContent=file?"Mengunggah…":"Mengirim…";}
  try{
    let attachment=null;
    if(file){
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,120);
      if(CLOUDINARY_CLOUD_NAME === "YOUR_CLOUD_NAME" || CLOUDINARY_UPLOAD_PRESET === "YOUR_UNSIGNED_UPLOAD_PRESET") {
        throw new Error("Media belum dikonfigurasi. Isi CLOUDINARY_CLOUD_NAME dan CLOUDINARY_UPLOAD_PRESET di app.js.");
      }
      const isImage=(file.type||"").startsWith("image/");
      const maxForType=isImage?10*1024*1024:((file.type||"").startsWith("video/")?100*1024*1024:10*1024*1024);
      if(file.size>maxForType) throw new Error(isImage?"Foto maksimal 10 MB pada paket Cloudinary Free.":((file.type||"").startsWith("video/")?"Video maksimal 100 MB pada paket Cloudinary Free.":"File maksimal 10 MB pada paket Cloudinary Free."));
      const form=new FormData();
      form.append("file",file);
      form.append("upload_preset",CLOUDINARY_UPLOAD_PRESET);
      form.append("folder",`secret-forum/${activeForum.id}/${currentUser.uid}`);
      const uploadRes=await fetch(CLOUDINARY_UPLOAD_URL,{method:"POST",body:form});
      const uploadData=await uploadRes.json();
      if(!uploadRes.ok || !uploadData.secure_url) throw new Error(uploadData.error?.message||"Upload media gagal.");
      attachment={name:file.name,type:file.type||uploadData.resource_type||"application/octet-stream",size:file.size,url:uploadData.secure_url,provider:"cloudinary",publicId:uploadData.public_id||""};
    }
    await addDoc(collection(db,"forums",activeForum.id,"messages"),{uid:currentUser.uid,displayName:profile.displayName,isAdmin:profile.isAdmin===true,isAuthor:profile.isAuthor===true,premiumPurchases:Number(profile.premiumPurchases||0),text:text.slice(0,MAX_MESSAGE_LENGTH),...(attachment?{attachment}:{}),createdAt:serverTimestamp()});
    if(slowSec>0)botSlowmodeLastSent.set(activeForum.id,Date.now());
    logActivity("message_sent",`Mengirim pesan di forum “${activeForum.name||"Forum"}` ,{forumId:activeForum.id,forumName:activeForum.name||"Forum"}).catch(()=>{});
    input.value=""; input.style.height="auto"; if(fileInput){fileInput.value="";setAttachmentLabel();}
  }catch(err){toast(err.message.replace("Firebase: ",""));}
  finally{if(sendBtn){sendBtn.disabled=false;sendBtn.textContent="Kirim";}}
};
$("messageInput").addEventListener("input",()=>{
  const el=$("messageInput"); el.style.height="auto"; el.style.height=Math.min(el.scrollHeight,180)+"px";
  const count=$("messageCount"); if(count)count.textContent=`${el.value.length.toLocaleString("id-ID")}/100.000`;
});

let selectedPremiumPlan=null, selectedBotPlan=null;
const PREMIUM_PRICES={"1 minggu":78000,"1 bulan":299000,"1 tahun":710000};
document.querySelectorAll("[data-buy-plan]").forEach(btn=>btn.onclick=()=>{
  selectedPremiumPlan=btn.dataset.buyPlan;
  $("paymentPlanText").textContent=`Paket yang dipilih: Premium ${selectedPremiumPlan} • Rp${(PREMIUM_PRICES[selectedPremiumPlan]||0).toLocaleString("id-ID")}.`;
  showPage("payment");
});
$("paidBtn").onclick=async()=>{
  if((!selectedPremiumPlan&&!selectedBotPlan)||!currentUser)return;
  const btn=$("paidBtn"); btn.disabled=true; $("paymentLoading").classList.remove("hidden"); btn.textContent="Memproses…";
  try{
    if(selectedBotPlan){
      const p=BOT_RENTAL_PLANS[selectedBotPlan],days=Number(p?.days||0);
      await addDoc(collection(db,"supportRequests"),{uid:currentUser.uid,username:profile.username,displayName:profile.displayName,type:"bot_rental",plan:selectedBotPlan,price:Number(p?.price||0),days,maxForums:20,status:"waiting_verification",createdAt:serverTimestamp()});
    }else{
      const days=selectedPremiumPlan==="1 minggu"?7:selectedPremiumPlan==="1 bulan"?30:365;
      await addDoc(collection(db,"supportRequests"),{uid:currentUser.uid,username:profile.username,displayName:profile.displayName,type:"premium_purchase",plan:selectedPremiumPlan,price:Number(PREMIUM_PRICES[selectedPremiumPlan]||0),days,status:"waiting_verification",createdAt:serverTimestamp()});
    }
    await new Promise(r=>setTimeout(r,900));
    $("paymentLoading").textContent="Pembayaran dikirim untuk verifikasi admin.";
    await new Promise(r=>setTimeout(r,700));
    $("paymentLoading").classList.add("hidden"); $("paidBtn").disabled=false; $("paidBtn").textContent="Saya Sudah Bayar";
    toast(selectedBotPlan?"Permintaan sewa Bot Care dikirim.":"Permintaan Premium dikirim.");
    selectedBotPlan=null;selectedPremiumPlan=null;showPage("home");
  }catch(err){
    $("paymentLoading").classList.add("hidden"); btn.disabled=false; btn.textContent="Saya Sudah Bayar";
    toast(err.message.replace("Firebase: ",""));
  }
};


async function loadSupportRequests(){
  if(!canAdmin())return;
  try{
    const s=await getDocs(query(collection(db,"supportRequests"),orderBy("createdAt","desc"),limit(50)));
    $("supportResults").innerHTML=s.docs.map(d=>{
      const r=d.data(),t=r.createdAt?.toDate?.().toLocaleString("id-ID")||"baru saja",ready=r.status==="ready",done=r.status==="done";
      let action;
      if(r.type==="bot_rental"){
        action=ready?`<div><span class="tiny muted">Kode Bot Care (20 karakter): </span><b class="activation-code">${esc(r.activationCode||"-")}</b></div><button class="secondary" onclick="navigator.clipboard?.writeText('${esc(r.activationCode||"")}');toast('Kode disalin.')">Salin kode</button><button class="secondary" onclick="adminCloseSupport('${d.id}')">Tandai selesai</button>`:(done?`<span class="tiny muted">Selesai</span>`:`<button class="secondary" onclick="adminVerifyBotRental('${d.id}')">Verifikasi & buat kode Bot Care</button>`);
      }else{
        action=ready?`<div><span class="tiny muted">Kode aktivasi (20 karakter): </span><b class="activation-code">${esc(r.activationCode||"-")}</b></div><button class="secondary" onclick="navigator.clipboard?.writeText('${esc(r.activationCode||"")}');toast('Kode disalin.')">Salin kode</button><button class="secondary" onclick="adminCloseSupport('${d.id}')">Tandai selesai</button>`:(done?`<span class="tiny muted">Selesai</span>`:`<button class="secondary" onclick="adminVerifyPremium('${d.id}')">Verifikasi & buat kode</button>`);
      }
      return `<div class="notice" style="margin:8px 0"><b>@${esc(r.username||"user")}</b> — ${esc(r.displayName||"")}<br>${r.type==="bot_rental"?"🤖 Sewa Bot Care":"💎 Premium"} • Paket: <b>${esc(r.plan||"Premium")}</b> • Rp${Number(r.price||0).toLocaleString("id-ID")} • ${Number(r.days||0)?Number(r.days)+" hari":"Permanen"}<br><span class="tiny muted">${t} • ${esc(r.status||"open")}</span><div style="margin-top:8px">${action}</div></div>`;
    }).join("")||`<div class="notice">Belum ada permintaan.</div>`;
  }catch(err){$("supportResults").textContent="Gagal memuat permintaan: "+err.message.replace("Firebase: ","");}
}
window.adminVerifyPremium=async id=>{try{let verified=null;await runTransaction(db,async tx=>{const reqRef=doc(db,"supportRequests",id);const snap=await tx.get(reqRef);if(!snap.exists())throw new Error("Permintaan tidak ditemukan.");const r=snap.data();if(r.status!=="waiting_verification")throw new Error("Permintaan ini sudah diproses.");const days=Number(r.days||0);if(!r.uid||days<=0)throw new Error("Data pembelian tidak valid.");const code=activationCode();if(code.length!==20)throw new Error("Gagal membuat kode aktivasi 20 karakter.");const until=new Date(Date.now()+days*86400000);verified={r,code};tx.set(doc(db,"premiumActivations",code),{uid:r.uid,plan:r.plan||"Premium",days,premiumUntil:until,unlimited:false,used:false,codeLength:20,createdAt:serverTimestamp()});tx.update(reqRef,{status:"ready",activationCode:code,verifiedAt:serverTimestamp()});tx.set(doc(collection(db,"inbox")),{uid:r.uid,title:"PREMIUM",subject:"Kode aktivasi Premium kamu",message:`Pembayaran ${r.plan||"Premium"} telah diverifikasi admin. Kode aktivasi (20 karakter): ${code}. Masukkan kode ini di Pengaturan > Aktivasi Premium.`,activationCode:code,read:false,createdAt:serverTimestamp()});});toast("Pembayaran diverifikasi. Kode aktivasi dibuat dan dikirim ke Inbox.");if(verified)await logActivity("premium_verified",`Memverifikasi Premium ${verified.r.plan||"Premium"} untuk @${verified.r.username||"user"}`,{targetUid:verified.r.uid,plan:verified.r.plan||"Premium"});loadSupportRequests();}catch(err){toast(err.message.replace("Firebase: ",""));}};
window.adminVerifyBotRental=async id=>{
  try{
    let made=null;
    await runTransaction(db,async tx=>{
      const reqRef=doc(db,"supportRequests",id),snap=await tx.get(reqRef);
      if(!snap.exists())throw new Error("Permintaan sewa tidak ditemukan.");
      const r=snap.data(); if(r.type!=="bot_rental"||r.status!=="waiting_verification")throw new Error("Permintaan ini sudah diproses.");
      const code=botLicenseCode(); if(code.length!==20)throw new Error("Gagal membuat kode Bot Care.");
      made={r,code};
      tx.set(doc(db,"botLicenses",code),{uid:r.uid,plan:r.plan||"Sewa Bot Care",days:Number(r.days||0),maxForums:20,usedForums:[],used:false,codeLength:20,createdAt:serverTimestamp(),createdBy:currentUser.uid});
      tx.update(reqRef,{status:"ready",activationCode:code,verifiedAt:serverTimestamp()});
      tx.set(doc(collection(db,"inbox")),{uid:r.uid,title:"BOT CARE",subject:"Kode aktivasi sewa Bot Care",message:`Pembayaran ${r.plan||"Sewa Bot Care"} telah diverifikasi. Kode Bot Care (20 karakter): ${code}. Kode ini dapat dipakai maksimal 20 forum. Masukkan kode dan secret code forum di Pengaturan > Aktivasi Bot Care.`,activationCode:code,read:false,createdAt:serverTimestamp()});
    });
    toast("Sewa Bot Care diverifikasi. Kode 20 karakter dikirim ke Inbox.");
    if(made)await logActivity("bot_rental_verified",`Memverifikasi sewa Bot Care ${made.r.plan||""} untuk @${made.r.username||"user"}`,{targetUid:made.r.uid,plan:made.r.plan||""});
    loadSupportRequests();
  }catch(e){toast(e.message.replace("Firebase: ",""));}
};
async function createCustomActivation(formPrefix){
  if(!canAdmin())return toast("Tidak memiliki akses.");
  const username=$(formPrefix+"Username").value.trim();
  const code=$(formPrefix+"Code").value.trim();
  const unlimited=$(formPrefix+"Unlimited").checked;
  const days=Math.max(1,Number($(formPrefix+"Days").value)||30);
  if(!username||code.length!==20)return toast("Username wajib diisi dan kode harus tepat 20 karakter.");
  try{
    const target=await getUserByUsername(username); if(!target)return toast("User tidak ditemukan.");
    const ref=doc(db,"premiumActivations",code);
    if((await getDoc(ref)).exists())return toast("Kode tersebut sudah digunakan. Pilih kode lain.");
    const until=unlimited?null:new Date(Date.now()+days*86400000);
    await setDoc(ref,{uid:target.id,plan:"Premium custom",days:unlimited?0:days,premiumUntil:until,unlimited,used:false,codeLength:20,createdAt:serverTimestamp(),createdBy:currentUser.uid});
    await addDoc(collection(db,"inbox"),{uid:target.id,title:actorRole().toUpperCase(),subject:"Kode aktivasi Premium custom",message:`Kamu menerima kode aktivasi Premium custom dari ${actorRole()}. Kode: ${code}. ${unlimited?"Durasi: TAK TERBATAS.":`Durasi: ${days} hari.`} Masukkan kode ini di Pengaturan > Aktivasi Premium.`,activationCode:code,read:false,createdAt:serverTimestamp()});
    await logActivity("premium_custom_code",`Membuat kode Premium custom untuk @${target.username}`,{targetUid:target.id,unlimited,days:unlimited?0:days});
    $(formPrefix+"Code").value="";toast("Kode aktivasi custom berhasil dibuat dan dikirim ke Inbox.");
  }catch(e){toast(e.message.replace("Firebase: ",""));}
}

window.adminCloseSupport=async id=>{try{await updateDoc(doc(db,"supportRequests",id),{status:"done",handledAt:serverTimestamp()});toast("Permintaan ditandai selesai.");loadSupportRequests();}catch(err){toast(err.message.replace("Firebase: ",""));}};

$("customActivationForm")?.addEventListener("submit",e=>{e.preventDefault();createCustomActivation("customActivation")});
$("authorCustomActivationForm")?.addEventListener("submit",e=>{e.preventDefault();createCustomActivation("authorCustomActivation")});
$("userSearchForm").onsubmit=async e=>{
  e.preventDefault();
  try{
    const u=await getUserByUsername($("userSearch").value);
    if(!u){$("userResults").innerHTML="<div class='notice'>User tidak ditemukan.</div>";return;}
    const [targetAdminSnap,targetAuthorSnap]=await Promise.all([getDoc(doc(db,"admins",u.id)),getDoc(doc(db,"authors",u.id))]);
    const targetAuthor=targetAuthorSnap.exists()&&targetAuthorSnap.data().enabled===true;
    const targetAdmin=(targetAdminSnap.exists()&&targetAdminSnap.data().enabled===true)||u.isAdmin===true;
    const self=u.id===currentUser.uid;
    const controls=((isAuthor() && !targetAuthor && !self) || (!isAuthor() && !targetAdmin && !self)) ? `<div class="admin-user-actions">
      <button class="secondary" onclick="authorOrAdminBanUser('${u.id}')">${u.banned?"Unban":"Ban permanen"}</button>
      <button class="secondary" onclick="authorOrAdminSuspendUser('${u.id}')">Suspend</button>
      <button class="secondary" onclick="authorOrAdminUnsuspendUser('${u.id}')">Unsuspend</button>
      ${isAuthor()?`<button class="secondary" onclick="authorToggleAdmin('${u.id}',${!targetAdmin})">${targetAdmin?"Berhentikan Admin":"Jadikan Admin"}</button>`:""}
    </div>` : (targetAdmin ? `<div class="notice">Admin tidak dapat mengelola akun Admin lain. Hanya Author yang dapat mengelola Admin.</div>` : `<div class="notice">Akun kamu sendiri tidak dapat dimoderasi dari sini.</div>`);
    $("userResults").innerHTML=`<div class="notice"><b>${esc(u.displayName)}</b> @${esc(u.username)}<br>Premium: ${isPremiumActive(u.premiumUntil)?"aktif":"tidak"}<br>Pembelian Premium: ${Number(u.premiumPurchases||0)}<br>Role: ${targetAuthor?"Author":(targetAdmin?"Admin":"User")}<br>Banned: ${u.banned?"ya":"tidak"}<div style="margin-top:10px">${controls}</div></div>`;
  }catch(err){toast(err.message.replace("Firebase: ",""));}
};
window.authorOrAdminBanUser=async uid=>{
  try{
    const target=await getDoc(doc(db,"users",uid)); if(!target.exists())throw new Error("User tidak ditemukan.");
    const d=target.data();
    const targetAuthorSnap=await getDoc(doc(db,"authors",uid));
    if(uid===currentUser.uid)throw new Error("Kamu tidak dapat membanned akun sendiri.");
    if(targetAuthorSnap.exists()&&targetAuthorSnap.data().enabled===true)throw new Error("Author tidak dapat dibanned.");
    if(!isAuthor() && d.isAdmin===true)throw new Error("Admin tidak dapat membanned Admin lain. Hanya Author.");
    const next=!d.banned;
    await updateDoc(doc(db,"users",uid),{banned:next,suspendedUntil:next?null:d.suspendedUntil||null});
    toast(next?"User dibanned permanen.":"Ban user dicabut."); await logActivity(next?"user_banned":"user_unbanned",`${next?"Membanned permanen":"Mengunban"} @${d.username}`,{targetUid:uid});
  }catch(err){toast(err.message.replace("Firebase: ",""));}
};
window.authorOrAdminSuspendUser=async uid=>{
  try{
    const target=await getDoc(doc(db,"users",uid)); if(!target.exists())throw new Error("User tidak ditemukan.");
    if(uid===currentUser.uid)throw new Error("Kamu tidak dapat mensuspend akun sendiri.");
    const targetAuthorSnap=await getDoc(doc(db,"authors",uid));
    if(targetAuthorSnap.exists()&&targetAuthorSnap.data().enabled===true)throw new Error("Author tidak dapat disuspend.");
    if(!isAuthor() && target.data().isAdmin===true)throw new Error("Admin tidak dapat mensuspend Admin lain. Hanya Author.");
    const hours=Math.max(1,Number(prompt("Suspend berapa jam?","24"))||24);
    await updateDoc(doc(db,"users",uid),{suspendedUntil:new Date(Date.now()+hours*3600000)});
    toast(`User disuspend ${hours} jam.`); await logActivity("user_suspended",`Mensuspend @${target.data().username} selama ${hours} jam`,{targetUid:uid,hours});
  }catch(err){toast(err.message.replace("Firebase: ",""));}
};
window.authorOrAdminUnsuspendUser=async uid=>{
  try{
    const target=await getDoc(doc(db,"users",uid)); if(!target.exists())throw new Error("User tidak ditemukan.");
    const targetAuthorSnap=await getDoc(doc(db,"authors",uid));
    if(targetAuthorSnap.exists()&&targetAuthorSnap.data().enabled===true)throw new Error("Author tidak dapat diubah statusnya.");
    if(!isAuthor() && target.data().isAdmin===true)throw new Error("Admin tidak dapat mengubah Admin lain. Hanya Author.");
    await updateDoc(doc(db,"users",uid),{suspendedUntil:null}); toast("Suspend user dicabut."); await logActivity("user_unsuspended",`Membuka suspend @${target.data().username}`,{targetUid:uid});
  }catch(err){toast(err.message.replace("Firebase: ",""));}
};
window.authorToggleAdmin=async(uid,grant)=>{
  if(!isAuthor())return toast("Hanya Author yang dapat mengatur Admin.");
  try{
    const target=await getDoc(doc(db,"users",uid)); if(!target.exists())throw new Error("User tidak ditemukan.");
    const targetAuthorSnap=await getDoc(doc(db,"authors",uid)); if(targetAuthorSnap.exists()&&targetAuthorSnap.data().enabled===true)throw new Error("Author tidak dapat diturunkan menjadi Admin.");
    await setDoc(doc(db,"admins",uid),{uid,username:target.data().username,enabled:grant,updatedAt:serverTimestamp()},{merge:true});
    await updateDoc(doc(db,"users",uid),{isAdmin:grant});
    toast(grant?"Admin diberikan.":"Admin dicabut."); await logActivity(grant?"admin_granted":"admin_revoked",`${grant?"Menjadikan":"Mencabut Admin dari"} @${target.data().username}`,{targetUid:uid});
  }catch(err){toast(err.message.replace("Firebase: ",""));}
};


async function authorDeleteForum(secret){
  if(!isAuthor())return toast("Hanya Author yang dapat menghapus forum.");
  if(!secret)return toast("Secret code forum tidak ditemukan.");
  if(!confirm("Hapus forum ini secara permanen beserta anggota, pesan, dan secret code?"))return;
  try{
    const codeRef=doc(db,"forumCodes",secret);
    const codeSnap=await getDoc(codeRef);
    if(!codeSnap.exists())throw new Error("Secret code tidak ditemukan.");
    const forumId=codeSnap.data().forumId;
    const forumRef=doc(db,"forums",forumId);
    const forumSnap=await getDoc(forumRef);
    if(!forumSnap.exists())throw new Error("Forum tidak ditemukan.");

    const refs=[];
    const [membersSnap,messagesSnap]=await Promise.all([
      getDocs(collection(db,"forums",forumId,"members")),
      getDocs(collection(db,"forums",forumId,"messages"))
    ]);
    membersSnap.docs.forEach(d=>refs.push(d.ref));
    messagesSnap.docs.forEach(d=>refs.push(d.ref));
    refs.push(forumRef,codeRef);

    for(let i=0;i<refs.length;i+=450){
      const batch=writeBatch(db);
      refs.slice(i,i+450).forEach(ref=>batch.delete(ref));
      await batch.commit();
    }
    toast("Forum berhasil dihapus permanen.");
    await logActivity("forum_deleted",`Menghapus forum “${forumSnap.data().name||"Forum"}” secara permanen`,{forumId,forumName:forumSnap.data().name||"Forum"});
    loadAdminForums();
    loadAuthorPanel();
    loadForums();
  }catch(err){
    toast(err.message.replace("Firebase: ",""));
  }
}

$("refreshForumsBtn")?.addEventListener("click",loadAdminForums);
$("refreshSupportBtn")?.addEventListener("click",loadSupportRequests);

async function sendInboxMessage(usernameId,subjectId,messageId){
  if(!canAdmin())return toast("Tidak memiliki akses.");
  const username=$(usernameId).value.trim(),subject=$(subjectId).value.trim(),message=$(messageId).value.trim();
  if(!username||!subject||!message)return toast("Lengkapi penerima, judul, dan isi pesan.");
  try{
    const target=await getUserByUsername(username);if(!target)return toast("User tidak ditemukan.");
    await addDoc(collection(db,"inbox"),{uid:target.id,title:actorRole().toUpperCase(),subject,message,senderId:currentUser.uid,senderRole:actorRole(),senderName:profile.displayName,read:false,createdAt:serverTimestamp()});
    await logActivity("inbox_sent",`Mengirim Inbox kepada @${target.username}: ${subject}`,{targetUid:target.id,subject});
    $(subjectId).value="";$(messageId).value="";toast("Pesan berhasil dikirim ke Inbox.");
  }catch(e){toast(e.message.replace("Firebase: ",""));}
}
$("adminInboxForm")?.addEventListener("submit",e=>{e.preventDefault();sendInboxMessage("adminInboxUsername","adminInboxSubject","adminInboxMessage")});
$("authorInboxForm")?.addEventListener("submit",e=>{e.preventDefault();sendInboxMessage("authorInboxUsername","authorInboxSubject","authorInboxMessage")});
async function broadcastInboxMessage(subject,message,attachment=null,actorLabel="AUTHOR"){
  if(!canAdmin())return;
  if(!subject||(!message&&!attachment))return toast("Lengkapi judul dan isi pesan.");
  try{
    const users=await getDocs(collection(db,"users"));
    for(let i=0;i<users.docs.length;i+=450){
      const batch=writeBatch(db);
      users.docs.slice(i,i+450).forEach(u=>batch.set(doc(collection(db,"inbox")),{uid:u.id,title:actorLabel,subject,message:message||"",...(attachment?{attachment}:{}),senderId:currentUser.uid,senderRole:actorRole(),senderName:profile.displayName,read:false,createdAt:serverTimestamp()}));
      await batch.commit();
    }
    await logActivity("inbox_broadcast",`Mengirim pesan ke seluruh user: ${subject}`,{subject,recipientCount:users.size,hasAttachment:!!attachment});
    toast(`Pesan dikirim ke ${users.size} user.`); return true;
  }catch(e){toast(e.message.replace("Firebase: ","")); return false;}
}
async function submitBroadcast(formPrefix){
  const subject=$(formPrefix+"Subject").value.trim(), message=$(formPrefix+"Message").value.trim(), file=$(formPrefix+"Image")?.files?.[0]||null;
  if(!subject||(!message&&!file))return toast("Isi judul dan minimal teks atau gambar.");
  try{
    const btn=$(formPrefix+"Form")?.querySelector("button[type=submit]"); if(btn){btn.disabled=true;btn.textContent="Mengunggah…";}
    const attachment=file?await uploadCloudinaryFile(file,`secret-forum/inbox-broadcast/${currentUser.uid}`,10*1024*1024):null;
    const ok=await broadcastInboxMessage(subject,message,attachment,actorRole().toUpperCase());
    if(ok){$(formPrefix+"Form").reset();} if(btn){btn.disabled=false;btn.textContent="Kirim ke seluruh user";}
  }catch(e){toast(e.message.replace("Firebase: ","")); const btn=$(formPrefix+"Form")?.querySelector("button[type=submit]");if(btn){btn.disabled=false;btn.textContent="Kirim ke seluruh user";}}
}
$("authorBroadcastForm")?.addEventListener("submit",e=>{e.preventDefault();submitBroadcast("authorBroadcast")});
$("adminBroadcastForm")?.addEventListener("submit",e=>{e.preventDefault();submitBroadcast("adminBroadcast")});
async function renderActivity(container){
  try{
    const s=await getDocs(query(collection(db,"activityLogs"),orderBy("createdAt","desc"),limit(100)));
    $(container).innerHTML=s.docs.map(d=>{const r=d.data(),t=r.createdAt?.toDate?.().toLocaleString("id-ID")||"baru saja";return `<div class="activity-item"><div><b>${esc(r.actorRole||"Admin")}</b> • ${esc(r.actorName||r.actorUsername||"User")}<p>${esc(r.message||"Aktivitas")}</p></div><span class="tiny muted">${esc(t)}</span></div>`}).join("")||`<div class="notice">Belum ada aktivitas tercatat.</div>`;
  }catch(e){$(container).innerHTML=`<div class="notice">Gagal memuat aktivitas: ${esc(e.message.replace("Firebase: ",""))}</div>`;}
}
function loadPublicActivity(){if(currentUser && canSeeActivity())renderActivity("publicActivityResults");}
async function saveBotMenuImage(file){
  if(!canAdmin())return toast("Hanya Admin/Author yang dapat mengganti foto menu Bot Care.");
  if(!file)return toast("Pilih gambar menu terlebih dahulu.");
  if(!(file.type||"").startsWith("image/"))return toast("File harus berupa gambar.");
  try{
    const uploaded=await uploadCloudinaryFile(file,`secret-forum/bot-menu/${currentUser.uid}`,10*1024*1024);
    await setDoc(doc(db,"siteSettings","botMenu"),{imageUrl:uploaded.url,title:"Bot Care",updatedBy:currentUser.uid,updatedRole:actorRole(),updatedAt:serverTimestamp()},{merge:true});
    botMenuConfig.imageUrl=uploaded.url;
    toast("Foto menu Bot Care berhasil diganti.");
    const preview=$(isAuthor()?"authorBotMenuPreview":"adminBotMenuPreview"); if(preview){preview.src=botMenuImageUrl(uploaded.url);preview.classList.remove("hidden");}
    await logActivity("bot_menu_image_updated","Mengganti foto menu Bot Care");
  }catch(e){toast(e.message.replace("Firebase: ",""));}
}
async function loadBotMenuAdminUI(){
  if(!canAdmin())return;
  await loadBotMenuConfig();
  ["admin","author"].forEach(role=>{const img=$(role+"BotMenuPreview");if(img&&botMenuConfig.imageUrl){img.src=botMenuImageUrl(botMenuConfig.imageUrl);img.classList.remove("hidden");}});
}
$("adminBotMenuForm")?.addEventListener("submit",async e=>{e.preventDefault();await saveBotMenuImage($("adminBotMenuImage")?.files?.[0]);});
$("authorBotMenuForm")?.addEventListener("submit",async e=>{e.preventDefault();await saveBotMenuImage($("authorBotMenuImage")?.files?.[0]);});
$("adminBotMenuImage")?.addEventListener("change",e=>{const f=e.target.files?.[0];if($("adminBotMenuImageName"))$("adminBotMenuImageName").textContent=f?`${f.name} • ${formatBytes(f.size)}`:"";});
$("authorBotMenuImage")?.addEventListener("change",e=>{const f=e.target.files?.[0];if($("authorBotMenuImageName"))$("authorBotMenuImageName").textContent=f?`${f.name} • ${formatBytes(f.size)}`:"";});

function loadAuthorPanel(){if(isAuthor())renderActivity("authorActivityResults");}
$("refreshAuthorActivityBtn")?.addEventListener("click",()=>renderActivity("authorActivityResults"));
$("authorDeleteForumForm")?.addEventListener("submit",async e=>{e.preventDefault();const code=$("authorDeleteForumCode").value.trim();if(code){await authorDeleteForum(code);e.target.reset();}});

async function loadUserMonitor(containerId){
  if(!canAdmin()) return;
  const box=$(containerId);
  if(!box)return;
  box.innerHTML='<div class="notice">Memuat data user dan forum…</div>';
  try{
    const [usersSnap, forumsSnap, adminsSnap, authorsSnap]=await Promise.all([
      getDocs(collection(db,"users")),
      getDocs(collection(db,"forums")),
      getDocs(collection(db,"admins")),
      getDocs(collection(db,"authors"))
    ]);
    const forums=forumsSnap.docs.map(d=>({id:d.id,...d.data()}));
    const adminIds=new Set(adminsSnap.docs.filter(d=>d.data().enabled===true).map(d=>d.id));
    const authorIds=new Set(authorsSnap.docs.filter(d=>d.data().enabled===true).map(d=>d.id));
    authorIds.add(AUTHOR_UID);
    const rows=usersSnap.docs.map(d=>{
      const u={id:d.id,...d.data()};
      const joined=forums.filter(f=>(f.memberIds||[]).includes(u.id));
      const role=authorIds.has(u.id)?"Author":adminIds.has(u.id)?"Admin":"User";
      const premium=isPremiumActive(u.premiumUntil)||u.premiumUnlimited===true;
      const forumNames=joined.map(f=>f.name||"Forum");
      return {u,joined,role,premium,forumNames};
    }).sort((a,b)=>(a.u.username||"").localeCompare(b.u.username||""));
    box.innerHTML=rows.map(({u,joined,role,premium,forumNames})=>{
      const until=u.premiumUnlimited===true?"Tidak terbatas":(u.premiumUntil?new Date(premiumUntilMillis(u.premiumUntil)).toLocaleString("id-ID"):"-");
      const status=u.banned?"BANNED":(premiumUntilMillis(u.suspendedUntil)>Date.now()?"SUSPENDED":"AKTIF");
      return `<div class="user-monitor-card">
        <div class="user-monitor-head"><div><b>${esc(u.displayName||"User")}</b><div class="tiny muted">@${esc(u.username||"-")}</div></div><span class="role-badge ${role.toLowerCase()}">${esc(role)}</span></div>
        <div class="user-monitor-grid">
          <span><small>Status</small><b>${esc(status)}</b></span>
          <span><small>Premium</small><b>${premium?"Aktif":"Tidak"}</b></span>
          <span><small>Premium sampai</small><b>${esc(until)}</b></span>
          <span><small>Forum</small><b>${joined.length}</b></span>
          <span><small>Pembelian Premium</small><b>${Number(u.premiumPurchases||0)}</b></span>
          <span><small>Password</small><b>Tidak dapat dilihat</b></span>
        </div>
        <div class="tiny muted">Forum diikuti: ${forumNames.length?esc(forumNames.join(", ")): "Belum bergabung ke forum."}</div>
      </div>`;
    }).join("")||'<div class="notice">Belum ada user.</div>';
  }catch(e){
    box.innerHTML=`<div class="notice">Gagal memuat user: ${esc(e.message.replace("Firebase: ",""))}</div>`;
  }
}
$("refreshUserMonitor")?.addEventListener("click",()=>loadUserMonitor("userMonitorResults"));
$("refreshAuthorUserMonitor")?.addEventListener("click",()=>loadUserMonitor("authorUserMonitorResults"));
$("authorUserSearchForm")?.addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    const u=await getUserByUsername($("authorUserSearch").value);
    if(!u){$("authorUserResults").innerHTML="<div class='notice'>User tidak ditemukan.</div>";return;}
    const as=await getDoc(doc(db,"admins",u.id)),aus=await getDoc(doc(db,"authors",u.id));
    const ta=aus.exists()&&aus.data().enabled===true,td=(as.exists()&&as.data().enabled===true)||u.isAdmin===true;
    $("authorUserResults").innerHTML=`<div class="notice"><b>${esc(u.displayName)}</b> @${esc(u.username)}<br>Role: ${ta?"Author":td?"Admin":"User"}<br>Ban: ${u.banned?"ya":"tidak"}<br>Suspend: ${premiumUntilMillis(u.suspendedUntil)>Date.now()?"aktif":"tidak"}<div class="admin-user-actions" style="margin-top:10px">${!ta&&u.id!==currentUser.uid?`<button class="secondary" onclick="authorOrAdminBanUser('${u.id}')">${u.banned?"Unban":"Ban permanen"}</button><button class="secondary" onclick="authorOrAdminSuspendUser('${u.id}')">Suspend</button><button class="secondary" onclick="authorOrAdminUnsuspendUser('${u.id}')">Unsuspend</button><button class="secondary" onclick="authorToggleAdmin('${u.id}',${!td})">${td?"Berhentikan Admin":"Jadikan Admin"}</button>`:""}</div></div>`;
  }catch(e){toast(e.message.replace("Firebase: ",""));}
});

function adIntervalLabel(sec){sec=Number(sec||120);if(sec<60)return sec+" detik";if(sec%3600===0)return (sec/3600)+" jam";if(sec%60===0)return (sec/60)+" menit";return sec+" detik";}
async function showRandomAd(){
  if(!profile || profile.isAdmin || profile.isAuthor || isPremiumActive(profile.premiumUntil)) return;
  const now=Date.now(); if(now-lastAdShownAt<50000)return;
  try{
    const snap=await getDocs(query(collection(db,"ads"),where("active","==",true),limit(50)));
    if(!snap.size)return;
    const due=snap.docs.filter(d=>{
      const a=d.data(); const interval=Math.min(36000,Math.max(50,Number(a.intervalSec||120))); const key="sf_ad_next_"+d.id; const next=Number(localStorage.getItem(key)||0); return now>=next;
    });
    if(!due.length)return;
    const d=due[Math.floor(Math.random()*due.length)], ad=d.data();
    const modal=$("adModal"), img=$("adImage"), title=$("adTitle"), body=$("adBody"), close=$("adClose"); if(!modal||!img||!close)return;
    img.src=ad.imageUrl||""; img.alt=ad.title||"Iklan"; title.textContent=ad.title||"Iklan"; body.textContent=ad.description||"";
    const interval=Math.min(36000,Math.max(50,Number(ad.intervalSec||120))); localStorage.setItem("sf_ad_next_"+d.id,String(now+interval*1000)); lastAdShownAt=now;
    const start=Date.now(); close.disabled=true; const tick=()=>{const left=Math.max(0,5000-(Date.now()-start));close.textContent=left?`Tutup (${Math.ceil(left/1000)}s)`:"Tutup ×";close.disabled=left>0;if(left)requestAnimationFrame(tick)};tick(); modal.classList.remove("hidden");
    close.onclick=()=>{modal.classList.add("hidden");if(ad.linkUrl)window.open(ad.linkUrl,"_blank","noopener");};
  }catch(e){console.warn("ad:",e);}
}
function scheduleAds(){
  if(window.adTimer)clearInterval(window.adTimer); if(adScheduleTimeout)clearTimeout(adScheduleTimeout);
  if(profile && !profile.isAdmin && !profile.isAuthor && !isPremiumActive(profile.premiumUntil)){
    adScheduleTimeout=setTimeout(showRandomAd,2500); window.adTimer=setInterval(showRandomAd,5000);
  }
}
async function publishAd(formId){
  if(!canAdmin())return; const form=$(formId);if(!form)return;
  const prefix=formId.replace("Form",""); const file=$(prefix+"Image")?.files?.[0]; const title=$(prefix+"Title")?.value.trim(); const description=$(prefix+"Description")?.value.trim(); const linkUrl=$(prefix+"Link")?.value.trim(); const intervalSec=Math.min(36000,Math.max(50,Number($(prefix+"Interval")?.value||120)));
  if(!file||!title)return toast("Judul dan gambar iklan wajib diisi.");
  try{const btn=form.querySelector("button[type=submit]");if(btn){btn.disabled=true;btn.textContent="Mengunggah…";} const attachment=await uploadCloudinaryFile(file,`secret-forum/ads/${currentUser.uid}`,10*1024*1024); await addDoc(collection(db,"ads"),{title,description,linkUrl,imageUrl:attachment.url,imageName:attachment.name,active:true,intervalSec,createdBy:currentUser.uid,createdByRole:actorRole(),createdAt:serverTimestamp(),updatedAt:serverTimestamp()}); await logActivity("ad_published",`Menerbitkan iklan “${title}”`,{intervalSec}); toast("Iklan berhasil diterbitkan.");form.reset(); await loadAdsManagement(isAuthor()?"authorAdsResults":"adminAdsResults");}catch(e){toast(e.message.replace("Firebase: ",""));}finally{const btn=form.querySelector("button[type=submit]");if(btn){btn.disabled=false;btn.textContent=isAuthor()?"Terbitkan iklan":"Terbitkan iklan";}}
}
async function loadAdsManagement(containerId){
  if(!canAdmin())return; const box=$(containerId);if(!box)return;box.innerHTML='<div class="notice">Memuat semua iklan…</div>';
  try{const s=await getDocs(query(collection(db,"ads"),orderBy("createdAt","desc"),limit(100)));box.innerHTML=s.docs.map(d=>{const a=d.data(),id=d.id,interval=Math.min(36000,Math.max(50,Number(a.intervalSec||120)));return `<div class="ad-manage-card"><div class="ad-manage-thumb">${a.imageUrl?`<img src="${esc(a.imageUrl)}" alt="${esc(a.title||"Iklan")}">`:""}</div><div class="ad-manage-info"><b>${esc(a.title||"Iklan")}</b><p class="tiny muted">${esc(a.description||"Tanpa deskripsi")}</p><span class="tiny">${a.active?"AKTIF":"NONAKTIF"} • tampil tiap ${esc(adIntervalLabel(interval))}</span></div><div class="ad-manage-actions"><button class="secondary" data-ad-toggle="${id}" data-active="${a.active?"1":"0"}">${a.active?"Nonaktifkan":"Aktifkan"}</button><button class="secondary" data-ad-edit="${id}">Ubah</button><button class="secondary" data-ad-delete="${id}">Hapus</button></div></div>`}).join("")||'<div class="notice">Belum ada iklan terpasang.</div>';
    box.querySelectorAll("[data-ad-toggle]").forEach(b=>b.onclick=async()=>{try{await updateDoc(doc(db,"ads",b.dataset.adToggle),{active:b.dataset.active!=="1",updatedAt:serverTimestamp()});await logActivity("ad_status",`${b.dataset.active==="1"?"Menonaktifkan":"Mengaktifkan"} iklan`);loadAdsManagement(containerId);}catch(e){toast(e.message.replace("Firebase: ",""));}});
    box.querySelectorAll("[data-ad-delete]").forEach(b=>b.onclick=async()=>{if(!confirm("Hapus iklan ini?"))return;try{await deleteDoc(doc(db,"ads",b.dataset.adDelete));await logActivity("ad_deleted","Menghapus iklan",{adId:b.dataset.adDelete});loadAdsManagement(containerId);}catch(e){toast(e.message.replace("Firebase: ",""));}});
    box.querySelectorAll("[data-ad-edit]").forEach(b=>b.onclick=async()=>{const d=await getDoc(doc(db,"ads",b.dataset.adEdit));if(!d.exists())return;const a=d.data();const title=prompt("Judul iklan:",a.title||"");if(title===null)return;const description=prompt("Deskripsi iklan:",a.description||"");if(description===null)return;const link=prompt("Link iklan (opsional):",a.linkUrl||"");if(link===null)return;const iv=prompt("Jeda tampil dalam detik (50–36000):",String(a.intervalSec||120));if(iv===null)return;const interval=Math.min(36000,Math.max(50,Number(iv)||120));try{await updateDoc(doc(db,"ads",b.dataset.adEdit),{title:title.trim().slice(0,100),description:description.trim().slice(0,300),linkUrl:link.trim(),intervalSec:interval,updatedAt:serverTimestamp()});await logActivity("ad_updated",`Mengubah iklan “${title.trim()}”`,{adId:b.dataset.adEdit});loadAdsManagement(containerId);}catch(e){toast(e.message.replace("Firebase: ",""));}});
  }catch(e){box.innerHTML=`<div class="notice">Gagal memuat iklan: ${esc(e.message.replace("Firebase: ",""))}</div>`;}
}
$("adminAdForm")?.addEventListener("submit",e=>{e.preventDefault();publishAd("adminAdForm")});
$("authorAdForm")?.addEventListener("submit",e=>{e.preventDefault();publishAd("authorAdForm")});
$("refreshAdminAdsBtn")?.addEventListener("click",()=>loadAdsManagement("adminAdsResults"));
$("refreshAuthorAdsBtn")?.addEventListener("click",()=>loadAdsManagement("authorAdsResults"));

let promoTimer=null;
function schedulePromo(){clearInterval(promoTimer);promoTimer=setInterval(()=>{if(profile&&!($("promo").classList.contains("hidden")))return;if(profile&&!profile.isAdmin&&!profile.isAuthor){$("promo").classList.remove("hidden");setTimeout(()=>$("promo").classList.add("hidden"),5000)}},600000)}
$("promoClose").onclick=()=>$("promo").classList.add("hidden");
$("promoWeekly").onclick=()=>showPage("contact");
$("promoMonthly").onclick=()=>showPage("contact");

onAuthStateChanged(auth,async user=>{
  currentUser=user;
  if(!user){ profile=null; activeForum=null; if(unsubscribeMessages)unsubscribeMessages(); if(unsubscribeProfile)unsubscribeProfile(); if(unsubscribeActivations)unsubscribeActivations(); if(unsubscribeInbox)unsubscribeInbox(); if(unsubscribeMaintenance)unsubscribeMaintenance(); unsubscribeMessages=unsubscribeProfile=unsubscribeActivations=unsubscribeInbox=unsubscribeMaintenance=null; if(promoTimer){clearInterval(promoTimer); promoTimer=null;} if(window.adTimer){clearInterval(window.adTimer);window.adTimer=null;} if(adScheduleTimeout){clearTimeout(adScheduleTimeout);adScheduleTimeout=null;} if(botExpiryTimer){clearTimeout(botExpiryTimer);botExpiryTimer=null;} $("promo")?.classList.add("hidden"); $("adModal")?.classList.add("hidden"); }
  if(user){try{await loadProfile(user);schedulePromo();scheduleAds()}catch(e){toast(e.message)}}else{$("appView").classList.add("hidden");$("authView").classList.remove("hidden");}
});
