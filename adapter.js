// Fait passer l'appli de la base claude.ai à Supabase, sans changer le code de l'appli :
// il fournit window.claude.use("db") avec les mêmes fonctions (collection().onSnapshot, doc().set).
(function(){
  const cfg = window.CARNET_CONFIG || {};
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:true}});
  window.__sb = sb;
  const cacheKey = t => "carnet-cache-" + t;
  const readCache = t => { try { return JSON.parse(localStorage.getItem(cacheKey(t))) || null } catch(e){ return null } };
  const writeCache = (t, rows) => { try { localStorage.setItem(cacheKey(t), JSON.stringify(rows)) } catch(e){} };
  const snap = (map, fromCache) => ({ docs:[...map.values()].sort((a,b)=>a.id<b.id?-1:1).map(r=>({id:r.id, exists:true, data:()=>r.data, metadata:{fromCache, hasPendingWrites:false}})),
    size: map.size, empty: !map.size, metadata:{fromCache, hasPendingWrites:false} });

  function collection(table){
    return {
      onSnapshot(next, error){
        const map = new Map(); let alive = true;
        const cached = readCache(table);
        if (cached) { cached.forEach(r=>map.set(r.id, r)); setTimeout(()=>alive && next(snap(map, true)), 0); }
        async function load(){
          const rows = []; let from = 0;
          for(;;){
            const { data, error: err } = await sb.from(table).select("id,data").range(from, from + 999);
            if (err) throw err;
            rows.push(...data); if (data.length < 1000) break; from += 1000;
          }
          map.clear(); rows.forEach(r=>map.set(r.id, r)); writeCache(table, rows);
          if (alive) next(snap(map, false));
        }
        load().catch(e=>{ if (!cached && error) error({code:"unavailable", message:String(e.message||e)}) });
        const ch = sb.channel("rt-" + table).on("postgres_changes", {event:"*", schema:"public", table}, p=>{
          if (p.eventType === "DELETE") map.delete(p.old.id); else map.set(p.new.id, {id:p.new.id, data:p.new.data});
          writeCache(table, [...map.values()]); if (alive) next(snap(map, false));
        }).subscribe();
        const onVis = ()=>{ if (document.visibilityState === "visible") load().catch(()=>{}) };
        document.addEventListener("visibilitychange", onVis); window.addEventListener("online", onVis);
        return ()=>{ alive = false; sb.removeChannel(ch); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("online", onVis) };
      },
      doc(id){
        return { id, async set(data){
          const { error } = await sb.from(table).upsert({ id, data });
          if (error) throw { code: error.code === "42501" ? "not_granted" : "unavailable", message: error.message };
        } };
      }
    };
  }
  const db = { collection };

  // Écran de connexion (lien magique par e-mail)
  let resolveDb; const dbReady = new Promise(r=>resolveDb=r);
  window.claude = { use: name => name === "db" ? dbReady : Promise.resolve(null) };
  const gate = document.getElementById("login");
  function showGate(msg){ gate.hidden = false; if (msg) document.getElementById("login-msg").textContent = msg; }
  async function start(){
    const { data:{ session } } = await sb.auth.getSession();
    if (session) { gate.hidden = true; document.getElementById("who").textContent = session.user.email; resolveDb(db); }
    else if (!navigator.onLine && readCache("bxl_annonces")) { gate.hidden = true; resolveDb(db); }
    else showGate();
  }
  sb.auth.onAuthStateChange((ev, session)=>{ if (ev === "SIGNED_IN" && session) { gate.hidden = true; document.getElementById("who").textContent = session.user.email; resolveDb(db); } });
  const msg = t => document.getElementById("login-msg").textContent = t;
  const traduire = m => /invalid login/i.test(m) ? "Adresse ou mot de passe incorrect." : /rate limit|limit exceeded/i.test(m) ? "Trop d'e-mails envoyés pour l'instant : connectez-vous avec votre mot de passe." : m;
  document.getElementById("login-form").addEventListener("submit", async e=>{
    e.preventDefault(); const email = document.getElementById("login-email").value.trim(), pass = document.getElementById("login-pass").value;
    if (!email) return; if (!pass) { msg("Entrez votre mot de passe, ou demandez un lien par e-mail."); return; }
    const btn = document.getElementById("login-go"); btn.disabled = true; msg("Connexion…");
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    btn.disabled = false; msg(error ? traduire(error.message) : "");
  });
  document.getElementById("login-magic").addEventListener("click", async ()=>{
    const email = document.getElementById("login-email").value.trim(); if (!email) { msg("Entrez d'abord votre adresse e-mail."); return; }
    const { error } = await sb.auth.signInWithOtp({ email, options:{ emailRedirectTo: location.origin + location.pathname, shouldCreateUser: false } });
    msg(error ? traduire(error.message) : "Lien envoyé. Ouvrez l'e-mail sur cet appareil et touchez le lien.");
  });
  document.getElementById("logout").addEventListener("click", async ()=>{ await sb.auth.signOut(); try { Object.keys(localStorage).filter(k=>k.startsWith("carnet-cache-")).forEach(k=>localStorage.removeItem(k)) } catch(e){} location.reload(); });
  start();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
})();
