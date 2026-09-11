import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updatePassword } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, addDoc, collection, query, where, orderBy, onSnapshot, getDocs, serverTimestamp, runTransaction, limit, deleteDoc } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

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

const $ = id => document.getElementById(id);
let currentUser = null, profile = null, activeForum = null, unsubscribeMessages = null, unsubscribeProfile = null, unsubscribeActivations = null, unsubscribeInbox = null, authMode = "login";

const toast = (msg,duration=2500) => { $("toast").textContent = msg; $("toast").classList.add("show"); setTimeout(()=>$("toast").classList.remove("show"),duration); };
const esc = s => String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const premiumUntilMillis = value => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value?.toMillis) return value.toMillis();
  if (value?.seconds != null) return Number(value.seconds) * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1e6);
  return 0;
};
const isPremiumActive = value => premiumUntilMillis(value) > Date.now();
const canUsePremium = () => !!profile?.isAdmin || isPremiumActive(profile?.premiumUntil);
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
const randomCode = () => randomChars(18);
const activationCode = () => randomChars(20);
const emailForUsername = u => `${u.trim().toLowerCase().replace(/[^a-z0-9._-]/g,"_")}@secretforum.local`;

function updateMemberLimitUI(){
  const input=$("memberLimit"), note=$("memberLimitNote"), code=$("secretCode"), hint=$("premiumHint"), customNote=$("customCodeNote"), premium=isPremiumActive(profile?.premiumUntil);
  if(!input)return;
  input.max=premium?400:20;
  if(Number(input.value)>Number(input.max)) input.value=input.max;
  if(note) note.textContent=premium ? "Premium: kamu bisa mengatur batas 2–400 anggota." : "Akun biasa: batas maksimal 20 anggota.";
  if(code){
    code.disabled=!premium;
    code.value=premium?code.value:"";
    code.placeholder=premium?"Opsional: buat secret code sendiri":"Otomatis dibuat 18 karakter oleh sistem";
  }
  if(hint){hint.textContent=premium?"CUSTOM":"AUTO";hint.classList.toggle("hidden",false);}
  if(customNote) customNote.textContent=premium ? "Premium dapat menentukan secret code sendiri. Akun biasa mendapatkan kode acak 18 karakter." : "Kode akun biasa dibuat otomatis 18 karakter dan tidak dapat diubah.";
}
function showPage(name){
  document.querySelectorAll(".page").forEach(x=>x.classList.add("hidden"));
  $("page-"+name)?.classList.remove("hidden");
  document.querySelectorAll(".nav").forEach(x=>x.classList.toggle("active",x.dataset.page===name));
  const titles={home:["Beranda","Kelola forum rahasiamu."],join:["Bergabung Forum","Masukkan secret code untuk bergabung."],create:["Buat Forum","Buat ruang privat baru."],settings:["Pengaturan","Kelola akun dan keamanan."],inbox:["Inbox","Informasi dan pesan penting akun."],contact:["Premium","Pilih paket Premium."],payment:["Pembayaran Premium","Selesaikan pembayaran Premium."],admin:["Admin Panel","Kelola user, premium, dan akses admin."],forum:["Forum","Obrolan teks privat."]};
  $("pageTitle").textContent=titles[name]?.[0]||"Secret Forum"; $("pageSubtitle").textContent=titles[name]?.[1]||"";
  if(name==="admin" && profile?.isAdmin){ loadAdminForums(); loadSupportRequests(); }
  if(name==="inbox" && currentUser) loadInbox();
  if(name==="settings" && currentUser) loadActivationStatus();
  if(name==="create") updateMemberLimitUI();
}
function setAuthMode(mode){ authMode=mode; document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.authTab===mode)); $("displayNameWrap").classList.toggle("hidden",mode!=="register"); $("authSubmit").textContent=mode==="login"?"Masuk":"Buat akun"; }
function setLoggedInUI(){
  $("authView").classList.add("hidden"); $("appView").classList.remove("hidden");
  $("sidebarName").textContent=profile.displayName; $("sidebarUsername").textContent="@"+profile.username; $("avatar").textContent=(profile.displayName||"?")[0].toUpperCase();
  $("settingsUsername").value=profile.username; $("settingsDisplayName").value=profile.displayName;
  const premiumActive=isPremiumActive(profile.premiumUntil);
  $("sidebarPremium").classList.toggle("hidden",!premiumActive);
  $("adminNav").classList.toggle("hidden",!profile.isAdmin); $("adminSettingsCard").classList.toggle("hidden",!profile.isAdmin);
  const status=profile.isAdmin?"ADMIN":(premiumActive?"PREMIUM":"BIASA");
  const detail=profile.isAdmin?"Akun memiliki akses administrasi.":(premiumActive?"Premium aktif sampai "+new Date(premiumUntilMillis(profile.premiumUntil)).toLocaleString("id-ID"):"Akun biasa tanpa Premium.");
  $("accountStatus").textContent=status; $("accountStatusDetail").textContent=detail;
  loadForums(); updateMemberLimitUI(); loadActivationStatus(); loadInbox(); showPage("home");
}
async function loadProfile(user){
  const snap=await getDoc(doc(db,"users",user.uid));
  if(!snap.exists()){ await signOut(auth); throw new Error("Profil user tidak ditemukan."); }
  const adminSnap=await getDoc(doc(db,"admins",user.uid));
  const data=snap.data();
  const isAdmin=(adminSnap.exists()&&adminSnap.data().enabled===true) || data.isAdmin===true;
  const suspendedUntil=premiumUntilMillis(data.suspendedUntil);
  if(!isAdmin && data.banned===true){
    await signOut(auth);
    throw new Error("Akun kamu telah dibanned oleh admin.");
  }
  if(!isAdmin && suspendedUntil>Date.now()){
    await signOut(auth);
    throw new Error("Akun kamu sedang disuspend sampai "+new Date(suspendedUntil).toLocaleString("id-ID")+".");
  }
  profile={uid:user.uid,...data,premiumPurchases:Number(data.premiumPurchases||0),isAdmin};
  if(unsubscribeProfile)unsubscribeProfile();
  if(unsubscribeActivations)unsubscribeActivations();
  unsubscribeActivations=null;
  unsubscribeProfile=onSnapshot(doc(db,"users",user.uid),async s=>{
    if(!s.exists())return;
    const latest=s.data();
    const until=premiumUntilMillis(latest.suspendedUntil);
    if(!profile.isAdmin && (latest.banned===true || until>Date.now())){
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
}
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
    box.innerHTML=docs.map(d=>{const r=d.data();return `<div class="inbox-item ${r.read===true?"read":"unread"}"><div><span class="eyebrow">${esc(r.title||"INFORMASI")}</span><h3>${esc(r.subject||"Pesan dari Admin")}</h3><p class="muted">${esc(r.message||"").replace(/\n/g,"<br>")}</p><span class="tiny muted">${r.createdAt?.toDate?.().toLocaleString("id-ID")||"baru saja"}</span></div>${r.read===true?"":`<button class="secondary" data-read-inbox="${d.id}">Tandai dibaca</button>`}</div>`}).join("")||`<div class="notice">Belum ada pesan masuk.</div>`;
    box.querySelectorAll("[data-read-inbox]").forEach(b=>b.onclick=async()=>{try{await updateDoc(doc(db,"inbox",b.dataset.readInbox),{read:true});}catch(e){toast(e.message.replace("Firebase: ",""));}});
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
      const until=c.premiumUntil;
      const count=Number(us.data()?.premiumPurchases||0)+1;
      tx.update(userRef,{premiumUntil:until,premiumPurchases:count,lastActivationCode:code});
      tx.update(codeRef,{used:true,usedAt:serverTimestamp()});
    });
    $("activationCode").value=""; toast("Premium berhasil diaktifkan."); loadProfile(currentUser);
  }catch(err){toast(err.message.replace("Firebase: ",""));}
};
$("profileForm").onsubmit=async e=>{e.preventDefault(); const name=$("settingsDisplayName").value.trim(); if(!name)return; await updateDoc(doc(db,"users",currentUser.uid),{displayName:name}); profile.displayName=name; setLoggedInUI(); toast("Nama berhasil diubah.");};
$("passwordForm").onsubmit=async e=>{e.preventDefault(); try{await updatePassword(currentUser,$("newPassword").value); $("newPassword").value=""; toast("Password berhasil diubah.");}catch(err){toast("Demi keamanan, login ulang sebelum mengganti password.");}};
$("createForm").onsubmit=async e=>{
  e.preventDefault();
  try{
    const name=$("forumName").value.trim(), max=Number($("memberLimit").value), custom=$("secretCode").value.trim();
    if(!name)return toast("Nama forum wajib diisi.");
    const premium=isPremiumActive(profile.premiumUntil);
    const maxAllowed=premium?400:20;
    if(max<2||max>maxAllowed)return toast(premium?"Jumlah anggota Premium harus 2–400.":"Akun biasa hanya dapat membuat forum sampai 20 anggota.");
    if(custom&&!premium)return toast("Custom code hanya untuk Premium.");
    const secret=custom||randomCode();
    if(!custom && secret.length!==18)throw new Error("Gagal membuat secret code 18 karakter.");
    const forumRef=doc(collection(db,"forums"));
    const codeRef=doc(db,"forumCodes",secret);
    await runTransaction(db,async tx=>{
      const codeSnap=await tx.get(codeRef);
      if(codeSnap.exists())throw new Error("Kode sudah dipakai, coba kode lain.");
      tx.set(forumRef,{name,maxMembers:max,secretCode:secret,ownerId:currentUser.uid,memberIds:[currentUser.uid],ownerOnly:false,createdAt:serverTimestamp()});
      tx.set(codeRef,{forumId:forumRef.id});
      tx.set(doc(db,"forums",forumRef.id,"members",currentUser.uid),{displayName:profile.displayName,username:profile.username,role:"owner",joinedAt:serverTimestamp()});
    });
    $("createForm").reset();
    const createdBox=$("createdCodeNotice");
    if(createdBox){
      createdBox.classList.remove("hidden");
      createdBox.innerHTML=`<b>Forum berhasil dibuat.</b><br><span class="tiny muted">Secret code (18 karakter):</span><div class="created-code-row"><code>${esc(secret)}</code><button type="button" class="secondary" id="copyCreatedCode">Salin</button></div>`;
      $("copyCreatedCode").onclick=()=>navigator.clipboard.writeText(secret).then(()=>toast("Secret code disalin."));
    }
    toast("Forum berhasil dibuat. Secret code sudah ditampilkan di bawah form.",5000); loadForums();
  }catch(err){ toast(err.message.replace("Firebase: ","")); }
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
    const data=s.data(); if(!profile.isAdmin && data.banned===true)return toast("Forum ini telah dibanned oleh admin. Status: permanen.",7000); if(!profile.isAdmin && premiumUntilMillis(data.suspendedUntil)>Date.now())return toast("Forum ini sedang disuspend sampai "+new Date(premiumUntilMillis(data.suspendedUntil)).toLocaleString("id-ID")+".",7000); const existingMembers=data.memberIds||[];
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
  }catch(err){ toast(err.message.replace("Firebase: ","")); }
};
async function loadForums(){
  const owned=await getDocs(query(collection(db,"forums"),where("ownerId","==",currentUser.uid)));
  const joined=await getDocs(query(collection(db,"forums"),where("memberIds","array-contains",currentUser.uid)));
  const map=new Map(); [...owned.docs,...joined.docs].forEach(d=>{const f={id:d.id,...d.data()}; map.set(d.id,f);});
  $("forumList").innerHTML=[...map.values()].map(f=>{const suspended=premiumUntilMillis(f.suspendedUntil)>Date.now(); const status=f.banned?"BANNED • PERMANEN":(suspended?"SUSPENDED • SAMPAI "+new Date(premiumUntilMillis(f.suspendedUntil)).toLocaleString("id-ID"):"AKTIF"); return `<div class="forum-card glass"><span class="eyebrow">PRIVATE FORUM</span><h3>${esc(f.name)}</h3><p class="muted">${(f.memberIds||[]).length}/${f.maxMembers} anggota</p><p class="code">${esc(f.secretCode)}</p><p class="forum-status ${f.banned?"banned":suspended?"suspended":"active"}">${esc(status)}</p><button class="secondary wide" data-open="${f.id}">Buka forum</button></div>`}).join("")||`<div class="form-card glass"><h3>Belum ada forum</h3><p class="muted">Buat forum baru atau bergabung dengan secret code.</p></div>`;
  document.querySelectorAll("[data-open]").forEach(b=>b.onclick=async()=>{const s=await getDoc(doc(db,"forums",b.dataset.open)); if(s.exists())openForum(s.id,s.data())});
}
function openForum(id,data){
  if(!profile?.isAdmin && data.banned===true)return toast("Forum ini telah dibanned oleh admin. Status: permanen.",7000);
  const su=premiumUntilMillis(data.suspendedUntil);
  if(!profile?.isAdmin && su>Date.now())return toast("Forum ini sedang disuspend sampai "+new Date(su).toLocaleString("id-ID")+".",7000);
  activeForum={id,...data}; showPage("forum");
  $("activeForumName").textContent=data.name;
  $("activeForumMeta").textContent=`${(data.memberIds||[]).length}/${data.maxMembers} anggota • kode ${data.secretCode}`;
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
  const composerLocked=data.ownerOnly===true && !isOwner && !profile.isAdmin;
  setComposerState(composerLocked);
  const translatorAllowed=canUsePremium();
  $("translatorBody").classList.toggle("hidden",!translatorAllowed);
  $("translatorLocked").classList.toggle("hidden",translatorAllowed);
  $("copyCodeBtn").onclick=()=>navigator.clipboard.writeText(data.secretCode).then(()=>toast("Kode disalin."));
  $("leaveForumBtn").onclick=async()=>{
    if(profile.isAdmin)return;
    if(!confirm(isOwner?"Keluar dari forum? Kamu tetap tercatat sebagai owner dan dapat mengakses/mengelola forum lagi nanti.":"Keluar dari forum ini?"))return;
    try{await runTransaction(db,async tx=>{const ref=doc(db,"forums",id),snap=await tx.get(ref);if(!snap.exists())throw new Error("Forum tidak ditemukan.");const d=snap.data(), members=d.memberIds||[];tx.update(ref,{memberIds:members.filter(x=>x!==currentUser.uid)});tx.delete(doc(db,"forums",id,"members",currentUser.uid));}); toast(isOwner?"Kamu keluar sebagai anggota. Status owner tetap." : "Kamu keluar dari forum."); showPage("home"); loadForums();}catch(err){toast(err.message.replace("Firebase: ",""));}};
  $("ownerModeBtn").onclick=async()=>{
    try{
      const next=!activeForum.ownerOnly;
      await updateDoc(doc(db,"forums",id),{ownerOnly:next});
      activeForum.ownerOnly=next; $("ownerModeBtn").textContent=next?"Aktif • ON":"Nonaktif • OFF";
      $("ownerModeHint").textContent=next?"Mode aktif: hanya owner yang dapat mengirim chat.":"Mode nonaktif: semua anggota dapat mengirim chat.";
      const locked=next && currentUser.uid!==activeForum.ownerId && !profile.isAdmin;
      setComposerState(locked);
      toast(next?"Sekarang hanya owner yang dapat mengirim.":"Semua anggota dapat mengirim pesan.");
    }catch(err){toast(err.message.replace("Firebase: ",""));}
  };
  async function renderMembers(){
    if(!isOwner)return;
    try{
      const s=await getDocs(collection(db,"forums",id,"members"));
      $("memberResults").innerHTML=s.docs.map(d=>{
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
          $("activeForumMeta").textContent=`${activeForum.memberIds.length}/${activeForum.maxMembers} anggota • kode ${activeForum.secretCode}`;
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
    box.innerHTML=s.docs.map(d=>{
      const m=d.data(), me=m.uid===currentUser.uid, canDelete=me||profile.isAdmin===true;
      const verified=m.isAdmin?'<span class="verified" title="Admin terverifikasi" aria-label="Admin terverifikasi"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 16.7 4.8 12.3l-1.9-1.9 6.3 6.3L21.2 8.5l-1.9-1.9z"/></svg></span>':'';
      const premiumBadge=premiumBadgeHTML(premiumBadgeLevel(m.premiumPurchases));
      const deleteButton=canDelete?`<button class="msg-delete" data-delete-message="${d.id}" title="Hapus pesan" aria-label="Hapus pesan">🗑</button>`:"";
      const translateButton=canUsePremium()?`<button class="msg-translate" data-translate-message="${d.id}">✦ Terjemahkan</button>`:"";
      return `<div class="msg ${me?"me":""}" data-original-text="${esc(m.text)}"><div class="msg-head"><div class="msg-name">${esc(m.displayName||"User")} ${verified} ${premiumBadge}</div>${deleteButton}</div><div class="msg-text">${esc(m.text).replace(/\n/g,"<br>")}</div><div class="msg-tools">${translateButton}</div><div class="msg-time">${m.createdAt?.toDate?.().toLocaleString("id-ID")||"baru saja"}</div></div>`;
    }).join("");
    box.querySelectorAll("[data-delete-message]").forEach(btn=>btn.onclick=async()=>{
      if(!activeForum)return;
      if(!confirm("Hapus pesan ini?"))return;
      try{await deleteDoc(doc(db,"forums",activeForum.id,"messages",btn.dataset.deleteMessage));toast("Pesan dihapus.");}
      catch(err){toast(err.message.replace("Firebase: ",""));}
    });
    box.querySelectorAll("[data-translate-message]").forEach(btn=>btn.onclick=async()=>{
      const msgEl=btn.closest(".msg")?.querySelector(".msg-text");
      if(!msgEl)return;
      if(btn.dataset.translated === "true"){
        msgEl.innerHTML=esc(btn.dataset.original || "").replace(/\n/g,"<br>");
        btn.dataset.translated="false"; btn.textContent="✦ Terjemahkan sandi";
        return;
      }
      const original=btn.closest(".msg")?.dataset.originalText || "";
      if(!original)return toast("Pesan tidak ditemukan.");
      const result=decodeSecret(original,"auto");
      if(result.startsWith("Sandi belum dikenali"))return toast("Sandi belum dikenali. Pilih jenis sandi manual di alat Premium.");
      btn.dataset.original=original; btn.dataset.translated="true";
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
function translateSecret(){
  if(!canUsePremium())return toast("Fitur terjemahan hanya untuk Premium.");
  const input=$("translatorInput").value.trim(),type=$("translatorType").value;
  if(!input)return toast("Masukkan sandi terlebih dahulu.");
  const result=decodeSecret(input,type);const box=$("translatorResult");box.textContent=result;box.classList.remove("hidden");
}
$("translateBtn")?.addEventListener("click",translateSecret);
$("messageForm").onsubmit=async e=>{
  e.preventDefault();
  const input=$("messageInput"),text=input.value.trim();
  if(!text||!activeForum)return;
  if(activeForum.ownerOnly===true && activeForum.ownerId!==currentUser.uid && !profile.isAdmin)return toast("Hanya owner yang dapat mengirim pesan.");
  try{
    await addDoc(collection(db,"forums",activeForum.id,"messages"),{uid:currentUser.uid,displayName:profile.displayName,isAdmin:profile.isAdmin===true,premiumPurchases:Number(profile.premiumPurchases||0),text:text.slice(0,1000),createdAt:serverTimestamp()});
    input.value=""; input.style.height="auto";
  }catch(err){toast(err.message.replace("Firebase: ",""));}
};
$("messageInput").addEventListener("input",()=>{
  const el=$("messageInput"); el.style.height="auto"; el.style.height=Math.min(el.scrollHeight,150)+"px";
});

let selectedPremiumPlan=null;
document.querySelectorAll("[data-buy-plan]").forEach(btn=>btn.onclick=()=>{
  selectedPremiumPlan=btn.dataset.buyPlan;
  $("paymentPlanText").textContent=`Paket yang dipilih: Premium ${selectedPremiumPlan}.`;
  showPage("payment");
});
$("paidBtn").onclick=async()=>{
  if(!selectedPremiumPlan||!currentUser)return;
  const btn=$("paidBtn"); btn.disabled=true; $("paymentLoading").classList.remove("hidden"); btn.textContent="Memproses…";
  try{
    const days=selectedPremiumPlan==="1 minggu"?7:selectedPremiumPlan==="1 bulan"?30:365;
    await addDoc(collection(db,"supportRequests"),{uid:currentUser.uid,username:profile.username,displayName:profile.displayName,type:"premium_purchase",plan:selectedPremiumPlan,days,status:"waiting_verification",createdAt:serverTimestamp()});
    await new Promise(r=>setTimeout(r,1400));
    $("paymentLoading").textContent="Pembayaran dikirim untuk verifikasi admin.";
    await new Promise(r=>setTimeout(r,900));
    $("paymentLoading").classList.add("hidden"); $("paidBtn").disabled=false; $("paidBtn").textContent="Saya Sudah Bayar";
    toast("Permintaan pembayaran dikirim."); showPage("home");
  }catch(err){
    $("paymentLoading").classList.add("hidden"); btn.disabled=false; btn.textContent="Saya Sudah Bayar";
    toast(err.message.replace("Firebase: ",""));
  }
};

async function loadAdminForums(){
  if(!profile?.isAdmin)return;
  try{
    const s=await getDocs(collection(db,"forums"));
    const forums=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{
      const at=a.createdAt?.toMillis?.()||0, bt=b.createdAt?.toMillis?.()||0;
      return bt-at;
    });
    $("adminForumResults").innerHTML=forums.map((f,i)=>`<div class="notice" style="margin:8px 0;display:flex;justify-content:space-between;align-items:center;gap:12px"><span><span class="tiny muted">FORUM ${i+1}</span><br><b class="code">${esc(f.secretCode||"-")}</b></span><span class="tiny muted">${(f.memberIds||[]).length}/${f.maxMembers||"-"} • ${f.banned?"BANNED":(premiumUntilMillis(f.suspendedUntil)>Date.now()?"SUSPENDED":"AKTIF")}</span></div>`).join("")||`<div class="notice">Belum ada forum.</div>`;
  }catch(err){
    $("adminForumResults").textContent="Gagal memuat forum: "+err.message.replace("Firebase: ","");
  }
}
async function loadSupportRequests(){
  if(!profile?.isAdmin)return;
  try{
    const s=await getDocs(query(collection(db,"supportRequests"),orderBy("createdAt","desc"),limit(30)));
    $("supportResults").innerHTML=s.docs.map(d=>{const r=d.data(); const t=r.createdAt?.toDate?.().toLocaleString("id-ID")||"baru saja"; const ready=r.status==="ready"; const done=r.status==="done"; const action=ready?`<div><span class="tiny muted">Kode aktivasi (20 karakter): </span><b class="activation-code">${esc(r.activationCode||"-")}</b></div><div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap"><button class="secondary" onclick="navigator.clipboard?.writeText('${esc(r.activationCode||"")}');toast('Kode disalin.')">Salin kode</button><button class="secondary" onclick="adminCloseSupport('${d.id}')">Tandai selesai</button></div>`:(done?`<span class="tiny muted">Selesai</span>`:`<button class="secondary" onclick="adminVerifyPremium('${d.id}')">Verifikasi & buat kode</button>`); return `<div class="notice" style="margin:8px 0"><b>@${esc(r.username||"user")}</b> — ${esc(r.displayName||"")}<br>Paket: <b>${esc(r.plan||"Premium")}</b> (${Number(r.days||0)} hari)<br><span class="tiny muted">${t} • ${esc(r.status||"open")}</span><div style="margin-top:8px">${action}</div></div>`}).join("")||`<div class="notice">Belum ada permintaan Premium.</div>`;
  }catch(err){$("supportResults").textContent="Gagal memuat permintaan: "+err.message.replace("Firebase: ","");}
}
window.adminVerifyPremium=async id=>{try{await runTransaction(db,async tx=>{const reqRef=doc(db,"supportRequests",id);const snap=await tx.get(reqRef);if(!snap.exists())throw new Error("Permintaan tidak ditemukan.");const r=snap.data();if(r.status!=="waiting_verification")throw new Error("Permintaan ini sudah diproses.");const days=Number(r.days||0);if(!r.uid||days<=0)throw new Error("Data pembelian tidak valid.");const code=activationCode(); if(code.length!==20)throw new Error("Gagal membuat kode aktivasi 20 karakter."); const until=new Date(Date.now()+days*86400000);tx.set(doc(db,"premiumActivations",code),{uid:r.uid,plan:r.plan||"Premium",days,premiumUntil:until,used:false,codeLength:20,createdAt:serverTimestamp()});tx.update(reqRef,{status:"ready",activationCode:code,verifiedAt:serverTimestamp()});tx.set(doc(collection(db,"inbox")),{uid:r.uid,title:"PREMIUM",subject:"Kode aktivasi Premium kamu",message:`Pembayaran ${r.plan||"Premium"} telah diverifikasi admin. Kode aktivasi (20 karakter): ${code}. Masukkan kode ini di Pengaturan > Aktivasi Premium.`,activationCode:code,read:false,createdAt:serverTimestamp()});});toast("Pembayaran diverifikasi. Kode aktivasi dibuat dan dikirim ke Inbox.");loadSupportRequests();}catch(err){toast(err.message.replace("Firebase: ",""));}};
window.adminCloseSupport=async id=>{try{await updateDoc(doc(db,"supportRequests",id),{status:"done",handledAt:serverTimestamp()});toast("Permintaan ditandai selesai.");loadSupportRequests();}catch(err){toast(err.message.replace("Firebase: ",""));}};

$("userSearchForm").onsubmit=async e=>{e.preventDefault();const u=await getUserByUsername($("userSearch").value);$("userResults").innerHTML=u?`<div class="notice"><b>${esc(u.displayName)}</b> @${esc(u.username)}<br>Premium: ${isPremiumActive(u.premiumUntil)?"aktif":"tidak"}<br>Pembelian Premium: ${Number(u.premiumPurchases||0)}<br>Admin: ${u.isAdmin?"ya":"tidak"}<br>Banned: ${u.banned?"ya":"tidak"}<div style="margin-top:10px;display:flex;gap:6px"><button class="secondary" onclick="adminToggleBan('${u.id}',${!u.banned})">${u.banned?"Unban":"Ban"}</button><button class="secondary" onclick="adminSuspend('${u.id}')">Suspend 24h</button><button class="secondary" onclick="adminUnsuspend('${u.id}')">Unsuspend</button></div></div>`:"<div class='notice'>User tidak ditemukan.</div>"};
window.adminToggleBan=async(uid,value)=>{try{await updateDoc(doc(db,"users",uid),{banned:value});toast(value?"User dibanned.":"Ban dicabut.");}catch(err){toast(err.message.replace("Firebase: ",""));}};
window.adminSuspend=async uid=>{try{await updateDoc(doc(db,"users",uid),{suspendedUntil:new Date(Date.now()+86400000)});toast("User disuspend 24 jam.");}catch(err){toast(err.message.replace("Firebase: ",""));}};
window.adminUnsuspend=async uid=>{try{await updateDoc(doc(db,"users",uid),{suspendedUntil:null});toast("Suspend user dicabut.");}catch(err){toast(err.message.replace("Firebase: ",""));}};
$("forumModerationForm")?.addEventListener("submit",async e=>{e.preventDefault();try{const code=$("moderationCode").value.trim();const mode=$("forumModerationMode").value;if(!code)return toast("Masukkan secret code forum.");const cs=await getDoc(doc(db,"forumCodes",code));if(!cs.exists())return toast("Forum tidak ditemukan.");const ref=doc(db,"forums",cs.data().forumId);const fs=await getDoc(ref);if(!fs.exists())return toast("Forum tidak ditemukan.");const patch={};if(mode==="ban")patch.banned=true;if(mode==="unban")patch.banned=false;if(mode==="suspend")patch.suspendedUntil=new Date(Date.now()+Math.max(1,Number($("forumSuspendHours").value)||24)*3600000);if(mode==="unsuspend")patch.suspendedUntil=null;await updateDoc(ref,patch);toast(mode==="ban"?"Forum dibanned.":mode==="unban"?"Ban forum dicabut.":mode==="suspend"?"Forum disuspend.":"Suspend forum dicabut.");loadAdminForums();}catch(err){toast(err.message.replace("Firebase: ",""));}});
$("premiumForm").onsubmit=async e=>{
  e.preventDefault();
  try{
    const u=await getUserByUsername($("premiumUsername").value);
    if(!u)return toast("User tidak ditemukan.");
    const grant=$("premiumMode").value==="grant";
    const days=Number($("premiumDays").value);
    if(grant&&(!Number.isFinite(days)||days<=0))return toast("Durasi Premium tidak valid.");
    const ref=doc(db,"users",u.id);
    if(grant){
      const until=new Date(Date.now()+days*86400000);
      await runTransaction(db,async tx=>{
        const snap=await tx.get(ref);
        if(!snap.exists())throw new Error("User tidak ditemukan.");
        const count=Number(snap.data().premiumPurchases||0)+1;
        tx.update(ref,{premiumUntil:until,premiumPurchases:count});
      });
    }else{
      await updateDoc(ref,{premiumUntil:null});
    }
    toast(grant?"Premium diberikan. Badge Premium bertambah.":"Premium dicabut.");
  }catch(err){toast(err.message.replace("Firebase: ",""));}
};
$("adminForm").onsubmit=async e=>{e.preventDefault();try{const u=await getUserByUsername($("adminUsername").value);if(!u)return toast("User tidak ditemukan.");const grant=$("adminMode").value==="grant";await setDoc(doc(db,"admins",u.id),{uid:u.id,username:u.username,enabled:grant,updatedAt:serverTimestamp()},{merge:true});await updateDoc(doc(db,"users",u.id),{isAdmin:grant});toast(grant?"Admin diberikan.":"Admin dicabut.");}catch(err){toast(err.message.replace("Firebase: ",""));}};
$("refreshForumsBtn")?.addEventListener("click",loadAdminForums);
$("refreshSupportBtn")?.addEventListener("click",loadSupportRequests);

let promoTimer=null;
function schedulePromo(){clearInterval(promoTimer);promoTimer=setInterval(()=>{if(profile&&!($("promo").classList.contains("hidden")))return;if(profile&&!profile.isAdmin){$("promo").classList.remove("hidden");setTimeout(()=>$("promo").classList.add("hidden"),5000)}},600000)}
$("promoClose").onclick=()=>$("promo").classList.add("hidden");
$("promoWeekly").onclick=()=>showPage("contact");
$("promoMonthly").onclick=()=>showPage("contact");

onAuthStateChanged(auth,async user=>{
  currentUser=user;
  if(user){try{await loadProfile(user);schedulePromo()}catch(e){toast(e.message)}}else{$("appView").classList.add("hidden");$("authView").classList.remove("hidden");}
});
