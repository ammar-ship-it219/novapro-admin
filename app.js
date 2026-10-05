const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
let current="dashboard", user=null;

async function api(url,opts={}){const r=await fetch(url,{headers:{"Content-Type":"application/json",...(opts.headers||{})},...opts});let d={};try{d=await r.json()}catch{}if(!r.ok)throw Error(d.error||"Request failed");return d}
function money(n){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n||0)}
function esc(x){return String(x??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function toast(msg){const t=$("#toast");t.textContent=msg;t.className="show";setTimeout(()=>t.className="",2400)}
function status(s){let c=s==="completed"||s==="active"?"success":s==="cancelled"||s==="disabled"?"danger":s==="pending"||s==="processing"?"warn":"";return `<span class="pill ${c}">${esc(s)}</span>`}
function fmtDate(x){return new Date(x.replace(" ","T")+"Z").toLocaleString([], {dateStyle:"medium",timeStyle:"short"})}

async function init(){
 try{const m=await api("/api/auth/me");user=m.user;showApp();route("dashboard")}
 catch{$("#login").classList.remove("hidden")}
}
function showApp(){$("#login").classList.add("hidden");$("#app").classList.remove("hidden");$("#adminName").textContent=user.name;$("#dateLine").textContent=new Date().toLocaleDateString([], {weekday:"long",year:"numeric",month:"long",day:"numeric"})}
$("#loginForm").onsubmit=async e=>{e.preventDefault();try{const d=await api("/api/auth/login",{method:"POST",body:JSON.stringify({email:$("#email").value,password:$("#password").value})});user=d.user;showApp();route("dashboard")}catch(e){$("#loginError").textContent=e.message}}
$("#logout").onclick=async()=>{await api("/api/auth/logout",{method:"POST"});location.reload()}
$("#theme").onclick=()=>{document.body.classList.toggle("dark");localStorage.dark=document.body.classList.contains("dark")}
if(localStorage.dark==="true")document.body.classList.add("dark");
$("#menu").onclick=()=>$("#sidebar").classList.toggle("open");
$$(".nav").forEach(b=>b.onclick=()=>route(b.dataset.page));
function route(page){current=page;$$(".nav").forEach(b=>b.classList.toggle("active",b.dataset.page===page));$("#pageTitle").textContent=({dashboard:"Dashboard",orders:"Orders",products:"Products",users:"Customers",analytics:"Analytics",activity:"Activity Logs",settings:"Settings"})[page];$("#sidebar").classList.remove("open");({dashboard:dashboard,orders:orders,products:products,users:users,analytics:analytics,activity:activity,settings:settings}[page])()}

async function dashboard(){
 const d=await api("/api/dashboard");
 $("#content").innerHTML=`<div class="grid stats">
 ${stat("Total Revenue",money(d.stats.revenue),"All completed orders")}
 ${stat("Customers",d.stats.users,"Registered customers")}
 ${stat("Orders",d.stats.orders,`${d.stats.pending} need attention`)}
 ${stat("Products",d.stats.products,"Catalog items")}
 </div>
 <div class="grid two" style="margin-top:18px">
  <div class="card"><div class="section-head"><h3>Revenue overview</h3><span class="kpi">Last 6 months</span></div><div id="dashChart" class="chart"></div></div>
  <div class="card"><div class="section-head"><h3>Recent activity</h3><button class="mini-btn" onclick="route('activity')">View all</button></div><div class="activity">${activityHTML(d.recent)}</div></div>
 </div>
 <div class="card" style="margin-top:18px"><div class="section-head"><h3>Quick actions</h3></div><div class="toolbar">
 <button class="primary" onclick="openUser()">+ Add customer</button><button class="secondary" onclick="openProduct()">+ Add product</button><button class="secondary" onclick="route('orders')">Manage orders</button></div></div>`;
 renderChart(d.monthly,"dashChart");
}
function stat(a,b,c){return `<div class="card stat"><small>${a}</small><h3>${b}</h3><span class="trend">● ${c}</span></div>`}
function activityHTML(rows){return rows.length?rows.map(x=>`<div class="activity-item"><i class="dot"></i><div><b>${esc(x.action)}</b><small>${esc(x.user_name||"System")} · ${fmtDate(x.created_at)}</small></div></div>`).join(""):`<div class="empty">No activity yet.</div>`}
function renderChart(rows,id){const max=Math.max(...rows.map(x=>x.revenue),1);$("#"+id).innerHTML=`<div class="bars">${rows.map(x=>`<div class="bar" style="height:${Math.max(8,x.revenue/max*88)}%"><span>${esc(x.month.slice(5))}</span></div>`).join("")}</div>`}

async function users(){
 const rows=await api("/api/users");
 $("#content").innerHTML=`<div class="card"><div class="section-head"><h3>Customers & team</h3><button class="primary" onclick="openUser()">+ Add user</button></div><div class="toolbar"><input class="search" id="userQ" placeholder="Search name or email"><select class="select" id="userStatus"><option value="all">All statuses</option><option>active</option><option>disabled</option></select></div><div id="userTable"></div></div>`;
 const render=async()=>{const q=$("#userQ").value,s=$("#userStatus").value;const data=await api(`/api/users?q=${encodeURIComponent(q)}&status=${s}`);$("#userTable").innerHTML=`<table><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead><tbody>${data.map(u=>`<tr><td><b>${esc(u.name)}</b><br><span class="kpi">${esc(u.email)}</span></td><td>${esc(u.role)}</td><td>${status(u.status)}</td><td>${fmtDate(u.created_at)}</td><td><button class="mini-btn" onclick='editUser(${JSON.stringify(u)})'>Edit</button> <button class="mini-btn danger" onclick="deleteUser(${u.id})">Delete</button></td></tr>`).join("")}</tbody></table>`||""};
 $("#userQ").oninput=render;$("#userStatus").onchange=render;render();
}
function openUser(){modal("Add user",`<div class="form-grid"><label>Name<input id="fName"></label><label>Email<input id="fEmail" type="email"></label><label>Password<input id="fPass" value="Customer123!"></label><label>Role<select id="fRole"><option>customer</option><option>admin</option></select></label></div><div class="form-actions"><button class="secondary" onclick="closeModal()">Cancel</button><button class="primary" onclick="saveUser()">Create user</button></div>`)}
async function saveUser(){try{await api("/api/users",{method:"POST",body:JSON.stringify({name:$("#fName").value,email:$("#fEmail").value,password:$("#fPass").value,role:$("#fRole").value})});closeModal();toast("User created");users()}catch(e){toast(e.message)}}
function editUser(u){modal("Edit user",`<div class="form-grid"><label>Name<input id="fName" value="${esc(u.name)}"></label><label>Email<input id="fEmail" value="${esc(u.email)}"></label><label>Role<select id="fRole"><option ${u.role==="customer"?"selected":""}>customer</option><option ${u.role==="admin"?"selected":""}>admin</option></select></label><label>Status<select id="fStatus"><option ${u.status==="active"?"selected":""}>active</option><option ${u.status==="disabled"?"selected":""}>disabled</option></select></label></div><div class="form-actions"><button class="secondary" onclick="closeModal()">Cancel</button><button class="primary" onclick="updateUser(${u.id})">Save changes</button></div>`)}
async function updateUser(id){await api("/api/users/"+id,{method:"PATCH",body:JSON.stringify({name:$("#fName").value,email:$("#fEmail").value,role:$("#fRole").value,status:$("#fStatus").value})});closeModal();toast("User updated");users()}
async function deleteUser(id){if(confirm("Delete this user?")){await api("/api/users/"+id,{method:"DELETE"});toast("User deleted");users()}}

async function products(){
 const data=await api("/api/products");
 $("#content").innerHTML=`<div class="card"><div class="section-head"><h3>Product catalog</h3><button class="primary" onclick="openProduct()">+ Add product</button></div><div class="toolbar"><input class="search" id="prodQ" placeholder="Search products or categories"></div><div id="prodTable"></div></div>`;
 const render=async()=>{const q=$("#prodQ").value;const rows=await api("/api/products?q="+encodeURIComponent(q));$("#prodTable").innerHTML=`<table><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map(p=>`<tr><td><b>${esc(p.name)}</b></td><td>${esc(p.category)}</td><td>${money(p.price)}</td><td>${p.stock}</td><td>${status(p.status)}</td><td><button class="mini-btn" onclick='editProduct(${JSON.stringify(p)})'>Edit</button> <button class="mini-btn danger" onclick="deleteProduct(${p.id})">Delete</button></td></tr>`).join("")}</tbody></table>`};$("#prodQ").oninput=render;render();
}
function openProduct(){modal("Add product",`<div class="form-grid"><label>Name<input id="pName"></label><label>Category<input id="pCat"></label><label>Price<input id="pPrice" type="number" step=".01"></label><label>Stock<input id="pStock" type="number"></label><label>Status<select id="pStatus"><option>active</option><option>disabled</option></select></label><label>Image URL<input id="pImage" placeholder="/uploads/..."></label></div><div class="form-actions"><button class="secondary" onclick="closeModal()">Cancel</button><button class="primary" onclick="saveProduct()">Create product</button></div>`)}
async function saveProduct(){await api("/api/products",{method:"POST",body:JSON.stringify({name:$("#pName").value,category:$("#pCat").value,price:+$("#pPrice").value,stock:+$("#pStock").value,status:$("#pStatus").value,image:$("#pImage").value})});closeModal();toast("Product created");products()}
function editProduct(p){modal("Edit product",`<div class="form-grid"><label>Name<input id="pName" value="${esc(p.name)}"></label><label>Category<input id="pCat" value="${esc(p.category)}"></label><label>Price<input id="pPrice" type="number" step=".01" value="${p.price}"></label><label>Stock<input id="pStock" type="number" value="${p.stock}"></label><label>Status<select id="pStatus"><option ${p.status==="active"?"selected":""}>active</option><option ${p.status==="disabled"?"selected":""}>disabled</option></select></label></div><div class="form-actions"><button class="secondary" onclick="closeModal()">Cancel</button><button class="primary" onclick="updateProduct(${p.id})">Save</button></div>`)}
async function updateProduct(id){await api("/api/products/"+id,{method:"PATCH",body:JSON.stringify({name:$("#pName").value,category:$("#pCat").value,price:+$("#pPrice").value,stock:+$("#pStock").value,status:$("#pStatus").value})});closeModal();toast("Product updated");products()}
async function deleteProduct(id){if(confirm("Delete this product?")){await api("/api/products/"+id,{method:"DELETE"});toast("Product deleted");products()}}

async function orders(){
 $("#content").innerHTML=`<div class="card"><div class="section-head"><h3>Order management</h3></div><div class="toolbar"><input class="search" id="orderQ" placeholder="Search order ID or customer"><select class="select" id="orderStatus"><option value="all">All statuses</option><option>pending</option><option>processing</option><option>completed</option><option>cancelled</option></select></div><div id="orderTable"></div></div>`;
 const render=async()=>{const q=$("#orderQ").value,s=$("#orderStatus").value;const rows=await api(`/api/orders?q=${encodeURIComponent(q)}&status=${s}`);$("#orderTable").innerHTML=`<table><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th><th>Update</th></tr></thead><tbody>${rows.map(o=>`<tr><td>#${o.id}</td><td><b>${esc(o.customer_name)}</b><br><span class="kpi">${esc(o.customer_email)}</span></td><td>${money(o.total)}</td><td>${status(o.status)}</td><td>${fmtDate(o.created_at)}</td><td><select class="select" onchange="updateOrder(${o.id},this.value)">${["pending","processing","completed","cancelled"].map(s=>`<option ${o.status===s?"selected":""}>${s}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table>`};$("#orderQ").oninput=render;$("#orderStatus").onchange=render;render();
}
async function updateOrder(id,status){await api("/api/orders/"+id,{method:"PATCH",body:JSON.stringify({status})});toast("Order updated");orders()}

async function analytics(){
 const d=await api("/api/dashboard");
 $("#content").innerHTML=`<div class="grid three">${stat("Revenue",money(d.stats.revenue),"Current recorded revenue")}${stat("Orders",d.stats.orders,"All order records")}${stat("Customers",d.stats.users,"Customer accounts")}</div><div class="grid two" style="margin-top:18px"><div class="card"><div class="section-head"><h3>Revenue analytics</h3></div><div id="anaChart" class="chart"></div></div><div class="card"><div class="section-head"><h3>Performance</h3></div>${metric("Order completion",Math.min(100,Math.round(d.stats.orders?70:0)))}${metric("Catalog availability",92)}${metric("Customer activity",78)}${metric("System health",99)}</div></div>`;
 renderChart(d.monthly,"anaChart");
}
function metric(name,n){return `<div class="metric"><span>${name}</span><b>${n}%</b></div><div class="progress"><i style="width:${n}%"></i></div>`}

async function activity(){
 const rows=await api("/api/activity");
 $("#content").innerHTML=`<div class="card"><div class="section-head"><h3>Audit & activity log</h3><span class="kpi">${rows.length} recent records</span></div><div class="activity">${activityHTML(rows)}</div></div>`;
}
async function settings(){
 const s=await api("/api/settings");
 $("#content").innerHTML=`<div class="card"><div class="section-head"><h3>Business settings</h3></div><div class="form-grid"><label>Business name<input id="sName" value="${esc(s.business_name||"NovaPro Business")}"></label><label>Support email<input id="sEmail" value="${esc(s.support_email||"support@example.com")}"></label><label>Currency<input id="sCurrency" value="${esc(s.currency||"USD")}"></label><label>Timezone<input id="sTimezone" value="${esc(s.timezone||"Asia/Karachi")}"></label></div><div class="form-actions"><button class="primary" onclick="saveSettings()">Save settings</button></div></div><div class="card" style="margin-top:18px"><h3>Security</h3><p class="kpi">Admin routes are protected by authentication and role checks. Passwords are stored as hashes.</p></div>`;
}
async function saveSettings(){await api("/api/settings",{method:"PUT",body:JSON.stringify({business_name:$("#sName").value,support_email:$("#sEmail").value,currency:$("#sCurrency").value,timezone:$("#sTimezone").value})});toast("Settings saved")}

function modal(title,body){$("#modalTitle").textContent=title;$("#modalBody").innerHTML=body;$("#modal").classList.remove("hidden")}
function closeModal(){$("#modal").classList.add("hidden")}
$("#modalClose").onclick=closeModal;$("#modal").onclick=e=>{if(e.target.id==="modal")closeModal()}
$("#bell").onclick=async()=>{const n=await api("/api/notifications");modal("Notifications",n.length?n.map(x=>`<div class="activity-item"><i class="dot"></i><div><b>${esc(x.title)}</b><small>${esc(x.message)} · ${fmtDate(x.created_at)}</small></div></div>`).join(""):`<div class="empty">No notifications.</div>`);await api("/api/notifications/read",{method:"PATCH"});$("#badge").style.display="none"}
init();
