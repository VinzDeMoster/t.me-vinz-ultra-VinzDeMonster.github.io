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
let currentUser = null, profile = null, activeForum = null, unsubscribeMessages = null, unsubscribeProfile = null, authMode = "login";

const toast = msg => { $("toast").textContent = msg; $("toast").classList.add("show"); setTimeout(()=>$("toast").classList.remove("show"),2500); };
const esc = s => String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const premiumUntilMillis = value => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value?.toMillis) return value.toMillis();
  if (value?.seconds != null) return Number(value.seconds) * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1e6);
  return 0;
};
const isPremiumActive = value => premiumUntilMillis(value) > Date.now();
const premiumBadgeLevel = count => {
  const n = Number(count || 0);
  if (n >= 4) return "green";
  if (n === 3) return "pink";
  if (n === 2) return "purple";
  if (n === 1) return "red";
  return "";
};
const premiumBadgeHTML = level => level ? `<span class="premium-verified ${level}" title="Premium ${level === "red" ? "Lv. 1" : level === "purple" ? "Lv. 2" : level === "pink" ? "Lv. 3" : "Lv. 4+"}" aria-label="Badge Premium"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 16.7 4.8 12.3l-1.9 1.9 6.3 6.3L21.2 8.5l-1.9-1.9z"/></svg></span>` : "";
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8))).map(x=>"ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x%32]).join("").match(/.{1,4}/g).join("-");
const emailForUsername = u => `${u.trim().toLowerCase().replace(/[^a-z0-9._-]/g,"_")}@secretforum.local`;

function showPage(name){
  document.querySelectorAll(".page").forEach(x=>x.classList.add("hidden"));
  $("page-"+name)?.classList.remove("hidden");
  document.querySelectorAll(".nav").forEach(x=>x.classList.toggle("active",x.dataset.page===name));
  const titles={home:["Beranda","Kelola forum rahasiamu."],join:["Bergabung Forum","Masukkan secret code untuk bergabung."],create:["Buat Forum","Buat ruang privat baru."],settings:["Pengaturan","Kelola akun dan keamanan."],contact:["Premium","Pilih paket Premium."],payment:["Pembayaran","Selesaikan pembayaran Premium."],admin:["Admin Panel","Kelola user, premium, dan akses admin."],forum:["Forum","Obrolan teks privat."]};
  $("pageTitle").textContent=titles[name]?.[0]||"Secret Forum"; $("pageSubtitle").textContent=titles[name]?.[1]||"";
  if(name==="admin" && profile?.isAdmin){ loadAdminForums(); loadSupportRequests(); }
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
  loadForums(); showPage("home");
}
async function loadProfile(user){
  const snap=await getDoc(doc(db,"users",user.uid));
  if(!snap.exists()){ await signOut(auth); throw new Error("Profil user tidak ditemukan."); }
  const adminSnap=await getDoc(doc(db,"admins",user.uid));
  const data=snap.data();
  const isAdmin=adminSnap.exists()&&adminSnap.data().enabled===true;
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
$("profileForm").onsubmit=async e=>{e.preventDefault(); const name=$("settingsDisplayName").value.trim(); if(!name)return; await updateDoc(doc(db,"users",currentUser.uid),{displayName:name}); profile.displayName=name; setLoggedInUI(); toast("Nama berhasil diubah.");};
$("passwordForm").onsubmit=async e=>{e.preventDefault(); try{await updatePassword(currentUser,$("newPassword").value); $("newPassword").value=""; toast("Password berhasil diubah.");}catch(err){toast("Demi keamanan, login ulang sebelum mengganti password.");}};
$("createForm").onsubmit=async e=>{
  e.preventDefault();
  try{
    const name=$("forumName").value.trim(), max=Number($("memberLimit").value), custom=$("secretCode").value.trim().toUpperCase(), ownerOnly=$("ownerOnlyMessages")?.checked===true;
    if(!name)return toast("Nama forum wajib diisi.");
    if(max<2||max>20)return toast("Jumlah anggota harus 2–20.");
    const premium=isPremiumActive(profile.premiumUntil);
    if(custom&&!premium)return toast("Custom code hanya untuk Premium.");
    const secret=custom||randomCode();
    const forumRef=doc(collection(db,"forums"));
    const codeRef=doc(db,"forumCodes",secret);
    await runTransaction(db,async tx=>{
      const codeSnap=await tx.get(codeRef);
      if(codeSnap.exists())throw new Error("Kode sudah dipakai, coba kode lain.");
      tx.set(forumRef,{name,maxMembers:max,secretCode:secret,ownerId:currentUser.uid,memberIds:[currentUser.uid],ownerOnly,createdAt:serverTimestamp()});
      tx.set(codeRef,{forumId:forumRef.id});
      tx.set(doc(db,"forums",forumRef.id,"members",currentUser.uid),{displayName:profile.displayName,username:profile.username,role:"owner",joinedAt:serverTimestamp()});
    });
    $("createForm").reset(); toast("Forum dibuat. Kode: "+secret,8000); loadForums();
  }catch(err){ toast(err.message.replace("Firebase: ","")); }
};
$("joinForm").onsubmit=async e=>{
  e.preventDefault();
  try{
    const code=$("joinCode").value.trim().toUpperCase();
    if(!code)return toast("Masukkan secret code.");
    const codeSnap=await getDoc(doc(db,"forumCodes",code));
    if(!codeSnap.exists())return toast("Secret code tidak ditemukan.");
    const forumId=codeSnap.data().forumId;
    const ref=doc(db,"forums",forumId);
    const s=await getDoc(ref);
    if(!s.exists())return toast("Forum tidak ditemukan.");
    const data=s.data(), existingMembers=data.memberIds||[];
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
  const map=new Map(); [...owned.docs,...joined.docs].forEach(d=>map.set(d.id,{id:d.id,...d.data()}));
  $("forumList").innerHTML=[...map.values()].map(f=>`<div class="forum-card glass"><span class="eyebrow">PRIVATE FORUM</span><h3>${esc(f.name)}</h3><p class="muted">${f.memberIds.length}/${f.maxMembers} anggota</p><p class="code">${esc(f.secretCode)}</p><button class="secondary wide" data-open="${f.id}">Buka forum</button></div>`).join("")||`<div class="form-card glass"><h3>Belum ada forum</h3><p class="muted">Buat forum baru atau bergabung dengan secret code.</p></div>`;
  document.querySelectorAll("[data-open]").forEach(b=>b.onclick=async()=>{const s=await getDoc(doc(db,"forums",b.dataset.open)); if(s.exists())openForum(s.id,s.data())});
}
function openForum(id,data){
  activeForum={id,...data}; showPage("forum"); $("activeForumName").textContent=data.name; $("activeForumMeta").textContent=`${data.memberIds.length}/${data.maxMembers} anggota • kode ${data.secretCode}`;
  $("copyCodeBtn").onclick=()=>navigator.clipboard.writeText(data.secretCode).then(()=>toast("Kode disalin."));
  const isOwner=profile.isAdmin===true || data.ownerId===currentUser.uid;
  const ownerOnlyBtn=$("ownerOnlyToggle");
  if(ownerOnlyBtn){
    ownerOnlyBtn.classList.toggle("hidden",data.ownerId!==currentUser.uid && !profile.isAdmin);
    ownerOnlyBtn.textContent=data.ownerOnly===true?"🔒 Hanya owner":"💬 Semua anggota";
    ownerOnlyBtn.title=data.ownerOnly===true?"Aktif: hanya owner/admin dapat mengirim":"Nonaktif: anggota dapat mengirim";
    ownerOnlyBtn.onclick=async()=>{
      try{await updateDoc(doc(db,"forums",id),{ownerOnly:!(activeForum.ownerOnly===true)});activeForum.ownerOnly=!activeForum.ownerOnly;ownerOnlyBtn.textContent=activeForum.ownerOnly?"🔒 Hanya owner":"💬 Semua anggota";toast(activeForum.ownerOnly?"Mode owner-only aktif.":"Semua anggota dapat mengirim.");}
      catch(err){toast(err.message.replace("Firebase: ",""));}
    };
  }
  const members=await Promise.all((data.memberIds||[]).map(async uid=>{try{const m=await getDoc(doc(db,"forums",id,"members",uid));return {uid,...(m.exists()?m.data():{})}}catch{return {uid}}}));
  const memberBox=$("forumMembers");
  if(memberBox){
    memberBox.innerHTML=members.map(m=>`<div class="member-row"><span><b>${esc(m.displayName||"User")}</b><small class="muted">@${esc(m.username||"")}</small></span>${m.uid===data.ownerId?'<span class="owner-tag">OWNER</span>':(data.ownerId===currentUser.uid||profile.isAdmin)?`<button class="secondary kick-btn" data-kick="${m.uid}">Kick</button>`:""}</div>`).join("");
    memberBox.querySelectorAll("[data-kick]").forEach(btn=>btn.onclick=async()=>{
      if(!confirm("Keluarkan anggota ini dari forum?"))return;
      try{
        const target=btn.dataset.kick;
        const freshRef=doc(db,"forums",id), fresh=await getDoc(freshRef);
        const arr=(fresh.data()?.memberIds||[]).filter(x=>x!==target);
        if(!arr.length)throw new Error("Forum harus memiliki owner.");
        await runTransaction(db,async tx=>{
          const snap=await tx.get(freshRef); const d=snap.data(); const next=(d.memberIds||[]).filter(x=>x!==target);
          if(next.length===d.memberIds.length-1){tx.update(freshRef,{memberIds:next});tx.delete(doc(db,"forums",id,"members",target));}
        });
        toast("Anggota dikeluarkan."); openForum(id,(await getDoc(freshRef)).data());
      }catch(err){toast(err.message.replace("Firebase: ",""));}
    });
  }
  $("messageForm").classList.toggle("hidden",data.ownerOnly===true && data.ownerId!==currentUser.uid && !profile.isAdmin);
  if(unsubscribeMessages)unsubscribeMessages();
  const q=query(collection(db,"forums",id,"messages"),orderBy("createdAt","asc"));
  unsubscribeMessages=onSnapshot(q,s=>{
    const box=$("messages");
    box.innerHTML=s.docs.map(d=>{
      const m=d.data(), me=m.uid===currentUser.uid, canDelete=me||profile.isAdmin===true;
      const verified=m.isAdmin?'<span class="verified" title="Admin terverifikasi" aria-label="Admin terverifikasi"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.2 16.7 4.8 12.3l-1.9 1.9 6.3 6.3L21.2 8.5l-1.9-1.9z"/></svg></span>':'';
      const premiumBadge=premiumBadgeHTML(premiumBadgeLevel(m.premiumPurchases));
      const deleteButton=canDelete?`<button class="msg-delete" data-delete-message="${d.id}" title="Hapus pesan" aria-label="Hapus pesan">🗑</button>`:"";
      return `<div class="msg ${me?"me":""}"><div class="msg-head"><div class="msg-name">${esc(m.displayName||"User")} ${verified} ${premiumBadge}</div>${deleteButton}</div><div class="msg-text">${esc(m.text).replace(/\n/g,"<br>")}</div><div class="msg-time">${m.createdAt?.toDate?.().toLocaleString("id-ID")||"baru saja"}</div></div>`
    }).join("");
    box.querySelectorAll("[data-delete-message]").forEach(btn=>btn.onclick=async()=>{
      if(!activeForum)return;
      if(!confirm("Hapus pesan ini?"))return;
      try{await deleteDoc(doc(db,"forums",activeForum.id,"messages",btn.dataset.deleteMessage));toast("Pesan dihapus.");}
      catch(err){toast(err.message.replace("Firebase: ",""));}
    });
    box.scrollTop=box.scrollHeight;
  });
}
$("messageForm").onsubmit=async e=>{
  e.preventDefault();
  const input=$("messageInput"),text=input.value.trim();
  if(!text||!activeForum)return;
  try{
    await addDoc(collection(db,"forums",activeForum.id,"messages"),{uid:currentUser.uid,displayName:profile.displayName,isAdmin:profile.isAdmin===true,premiumPurchases:Number(profile.premiumPurchases||0),text:text.slice(0,1000),createdAt:serverTimestamp()});
    input.value=""; input.style.height="auto";
  }catch(err){toast(err.message.replace("Firebase: ",""));}
};
$("messageInput").addEventListener("input",()=>{
  const el=$("messageInput"); el.style.height="auto"; el.style.height=Math.min(el.scrollHeight,150)+"px";
});

const PAYMENT_ACCOUNT="ISI NOMOR REKENING / QRIS";
const PAYMENT_QR_TEXT="ISI DATA QRIS / PEMBAYARAN";
let selectedPlan="";
document.querySelectorAll("[data-plan]").forEach(btn=>btn.onclick=()=>{selectedPlan=btn.dataset.plan;$("paymentPlanText").textContent="Paket Premium "+selectedPlan; $("paymentAccount").textContent=PAYMENT_ACCOUNT; showPage("payment");});
$("paidBtn").onclick=async()=>{
  try{
    $("paidBtn").disabled=true; $("paymentLoading").classList.remove("hidden");
    await addDoc(collection(db,"supportRequests"),{uid:currentUser.uid,username:profile.username,displayName:profile.displayName,message:"Pembelian Premium "+selectedPlan+" — menunggu verifikasi pembayaran.",type:"premium_purchase",plan:selectedPlan,status:"paid_pending",createdAt:serverTimestamp()});
    setTimeout(()=>{ $("paymentLoading").classList.add("hidden"); $("paidBtn").disabled=false; showPage("home"); toast("Pembayaran dikirim untuk verifikasi admin."); },1800);
  }catch(err){$("paidBtn").disabled=false;$("paymentLoading").classList.add("hidden");toast(err.message.replace("Firebase: ",""));}
};
async function loadAdminForums(){
  if(!profile?.isAdmin)return;
  try{
    const s=await getDocs(collection(db,"forums"));
    const forums=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>{
      const at=a.createdAt?.toMillis?.()||0, bt=b.createdAt?.toMillis?.()||0;
      return bt-at;
    });
    $("adminForumResults").innerHTML=forums.map((f,i)=>`<div class="notice" style="margin:8px 0;display:flex;justify-content:space-between;align-items:center;gap:12px"><span><span class="tiny muted">FORUM ${i+1}</span><br><b class="code">${esc(f.secretCode||"-")}</b></span><span class="tiny muted">${(f.memberIds||[]).length}/${f.maxMembers||"-"}</span></div>`).join("")||`<div class="notice">Belum ada forum.</div>`;
  }catch(err){
    $("adminForumResults").textContent="Gagal memuat forum: "+err.message.replace("Firebase: ","");
  }
}
async function loadSupportRequests(){
  if(!profile?.isAdmin)return;
  try{
    const s=await getDocs(query(collection(db,"supportRequests"),orderBy("createdAt","desc"),limit(30)));
    $("supportResults").innerHTML=s.docs.map(d=>{const r=d.data(); const t=r.createdAt?.toDate?.().toLocaleString("id-ID")||"baru saja"; return `<div class="notice" style="margin:8px 0"><b>@${esc(r.username||"user")}</b> — ${esc(r.displayName||"")}<br>${esc(r.message||"")}<br><span class="tiny muted">${t} • ${esc(r.status||"open")}</span><div style="margin-top:8px"><button class="secondary" onclick="adminCloseSupport('${d.id}')">Tandai selesai</button></div></div>`}).join("")||`<div class="notice">Belum ada permintaan Premium.</div>`;
  }catch(err){$("supportResults").textContent="Gagal memuat permintaan: "+err.message.replace("Firebase: ","");}
}
window.adminCloseSupport=async id=>{try{await updateDoc(doc(db,"supportRequests",id),{status:"done",handledAt:serverTimestamp()});toast("Permintaan ditandai selesai.");loadSupportRequests();}catch(err){toast(err.message.replace("Firebase: ",""));}};

$("userSearchForm").onsubmit=async e=>{e.preventDefault();const u=await getUserByUsername($("userSearch").value);$("userResults").innerHTML=u?`<div class="notice"><b>${esc(u.displayName)}</b> @${esc(u.username)}<br>Premium: ${isPremiumActive(u.premiumUntil)?"aktif":"tidak"}<br>Pembelian Premium: ${Number(u.premiumPurchases||0)}<br>Admin: ${u.isAdmin?"ya":"tidak"}<br>Banned: ${u.banned?"ya":"tidak"}<div style="margin-top:10px;display:flex;gap:6px"><button class="secondary" onclick="adminToggleBan('${u.id}',${!u.banned})">${u.banned?"Unban":"Ban"}</button><button class="secondary" onclick="adminSuspend('${u.id}')">Suspend 24h</button></div></div>`:"<div class='notice'>User tidak ditemukan.</div>"};
window.adminToggleBan=async(uid,value)=>{try{await updateDoc(doc(db,"users",uid),{banned:value});toast(value?"User dibanned.":"Ban dicabut.");}catch(err){toast(err.message.replace("Firebase: ",""));}};
window.adminSuspend=async uid=>{try{await updateDoc(doc(db,"users",uid),{suspendedUntil:new Date(Date.now()+86400000)});toast("User disuspend 24 jam.");}catch(err){toast(err.message.replace("Firebase: ",""));}};
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
let promoTimer=null;
function schedulePromo(){clearInterval(promoTimer);promoTimer=setInterval(()=>{if(profile&&!($("promo").classList.contains("hidden")))return;if(profile&&!profile.isAdmin){$("promo").classList.remove("hidden");setTimeout(()=>$("promo").classList.add("hidden"),5000)}},600000)}
$("promoClose").onclick=()=>$("promo").classList.add("hidden");
$("promoWeekly").onclick=()=>{selectedPlan="7 hari";$("paymentPlanText").textContent="Paket Premium 7 hari";$("paymentAccount").textContent=PAYMENT_ACCOUNT;showPage("payment");$("promo").classList.add("hidden");};
$("promoMonthly").onclick=()=>{selectedPlan="30 hari";$("paymentPlanText").textContent="Paket Premium 30 hari";$("paymentAccount").textContent=PAYMENT_ACCOUNT;showPage("payment");$("promo").classList.add("hidden");};

onAuthStateChanged(auth,async user=>{
  currentUser=user;
  if(user){try{await loadProfile(user);schedulePromo()}catch(e){toast(e.message)}}else{$("appView").classList.add("hidden");$("authView").classList.remove("hidden");}
});
