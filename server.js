const express = require("express");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const multer = require("multer");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "development-secret-change-me";
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "business.db"));
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'customer',
 status TEXT NOT NULL DEFAULT 'active',
 avatar TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 category TEXT NOT NULL,
 price REAL NOT NULL DEFAULT 0,
 stock INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'active',
 image TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 total REAL NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending',
 items_json TEXT NOT NULL DEFAULT '[]',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS notifications (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 title TEXT NOT NULL,
 message TEXT NOT NULL,
 type TEXT NOT NULL DEFAULT 'info',
 is_read INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS activity_logs (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER,
 action TEXT NOT NULL,
 entity TEXT,
 entity_id INTEGER,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings (
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL
);
`);

function seed() {
  const count = db.prepare("SELECT COUNT(*) c FROM users").get().c;
  if (count) return;
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || "ChangeMe123!", 10);
  const admin = db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)")
    .run("Administrator", process.env.ADMIN_EMAIL || "admin@example.com", hash, "admin");
  const customerHash = bcrypt.hashSync("Customer123!", 10);
  const u1 = db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)")
    .run("Ava Morgan", "ava@example.com", customerHash, "customer").lastInsertRowid;
  const u2 = db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)")
    .run("Noah Williams", "noah@example.com", customerHash, "customer").lastInsertRowid;
  const p = db.prepare("INSERT INTO products(name,category,price,stock,status) VALUES(?,?,?,?,?)");
  p.run("Premium Headphones","Electronics",149.99,42,"active");
  p.run("Urban Backpack","Accessories",79.00,18,"active");
  p.run("Smart Watch Pro","Electronics",229.00,7,"active");
  p.run("Minimal Sneakers","Fashion",119.00,31,"active");
  const order = db.prepare("INSERT INTO orders(user_id,total,status,items_json) VALUES(?,?,?,?)");
  order.run(u1, 298.99, "completed", JSON.stringify([{product:"Premium Headphones",qty:2}]));
  order.run(u2, 229.00, "processing", JSON.stringify([{product:"Smart Watch Pro",qty:1}]));
  db.prepare("INSERT INTO notifications(title,message,type) VALUES(?,?,?)")
    .run("Welcome","Your professional admin workspace is ready.","success");
  db.prepare("INSERT INTO activity_logs(user_id,action,entity) VALUES(?,?,?)")
    .run(admin.lastInsertRowid,"System initialized","system");
}
seed();

const upload = multer({ dest: path.join(__dirname, "data/uploads") });
fs.mkdirSync(path.join(__dirname, "data/uploads"), {recursive:true});
app.use(express.json({limit:"2mb"}));
app.use(cookieParser());
app.use("/uploads", express.static(path.join(__dirname, "data/uploads")));
app.use(express.static(path.join(__dirname, "public")));

function auth(required=true) {
  return (req,res,next)=>{
    const token = req.cookies.token || (req.headers.authorization||"").replace("Bearer ","");
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      if (required) return res.status(401).json({error:"Authentication required"});
      next();
    }
  };
}
function adminOnly(req,res,next){
  if(req.user?.role !== "admin") return res.status(403).json({error:"Admin access required"});
  next();
}
function log(action, entity=null, entity_id=null, user_id=null){
  db.prepare("INSERT INTO activity_logs(user_id,action,entity,entity_id) VALUES(?,?,?,?)")
    .run(user_id,action,entity,entity_id);
}

app.post("/api/auth/login",(req,res)=>{
  const {email,password}=req.body;
  const u=db.prepare("SELECT * FROM users WHERE email=?").get(email||"");
  if(!u || !bcrypt.compareSync(password||"",u.password_hash) || u.status!=="active")
    return res.status(401).json({error:"Invalid credentials or inactive account"});
  const token=jwt.sign({id:u.id,email:u.email,role:u.role,name:u.name},JWT_SECRET,{expiresIn:"7d"});
  res.cookie("token",token,{httpOnly:true,sameSite:"lax",secure:false,maxAge:7*864e5});
  res.json({user:{id:u.id,name:u.name,email:u.email,role:u.role}});
});
app.post("/api/auth/logout",(req,res)=>{res.clearCookie("token");res.json({ok:true});});
app.get("/api/auth/me",auth(),(req,res)=>res.json({user:req.user}));

app.post("/api/auth/register",(req,res)=>{
  const {name,email,password}=req.body;
  if(!name||!email||!password||password.length<8) return res.status(400).json({error:"Name, email and 8+ character password are required"});
  try{
    const hash=bcrypt.hashSync(password,10);
    const r=db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)").run(name,email,hash,"customer");
    res.status(201).json({id:r.lastInsertRowid,message:"Account created"});
  }catch(e){res.status(409).json({error:"Email already exists"});}
});

app.get("/api/dashboard",auth(),adminOnly,(req,res)=>{
  const revenue=db.prepare("SELECT COALESCE(SUM(total),0) v FROM orders WHERE status!='cancelled'").get().v;
  const users=db.prepare("SELECT COUNT(*) c FROM users WHERE role='customer'").get().c;
  const orders=db.prepare("SELECT COUNT(*) c FROM orders").get().c;
  const products=db.prepare("SELECT COUNT(*) c FROM products").get().c;
  const pending=db.prepare("SELECT COUNT(*) c FROM orders WHERE status IN ('pending','processing')").get().c;
  const monthly=db.prepare(`
    SELECT substr(created_at,1,7) month, ROUND(SUM(total),2) revenue
    FROM orders WHERE status!='cancelled'
    GROUP BY month ORDER BY month DESC LIMIT 6`).all().reverse();
  const recent=db.prepare(`SELECT a.*,u.name user_name FROM activity_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 8`).all();
  res.json({stats:{revenue,users,orders,products,pending},monthly,recent});
});

app.get("/api/users",auth(),adminOnly,(req,res)=>{
  const q=(req.query.q||"").toLowerCase(), status=req.query.status||"all";
  let sql="SELECT id,name,email,role,status,created_at FROM users WHERE 1=1", params=[];
  if(q){sql+=" AND (lower(name) LIKE ? OR lower(email) LIKE ?)";params.push(`%${q}%`,`%${q}%`);}
  if(status!=="all"){sql+=" AND status=?";params.push(status);}
  sql+=" ORDER BY id DESC";
  res.json(db.prepare(sql).all(...params));
});
app.post("/api/users",auth(),adminOnly,(req,res)=>{
  const {name,email,password="Customer123!",role="customer"}=req.body;
  try{
    const r=db.prepare("INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)")
      .run(name,email,bcrypt.hashSync(password,10),role);
    log("Created user","user",r.lastInsertRowid,req.user.id);
    res.status(201).json({id:r.lastInsertRowid});
  }catch(e){res.status(409).json({error:"Email already exists"});}
});
app.patch("/api/users/:id",auth(),adminOnly,(req,res)=>{
  const {name,email,role,status}=req.body;
  db.prepare("UPDATE users SET name=COALESCE(?,name),email=COALESCE(?,email),role=COALESCE(?,role),status=COALESCE(?,status) WHERE id=?")
    .run(name,email,role,status,req.params.id);
  log("Updated user","user",req.params.id,req.user.id); res.json({ok:true});
});
app.delete("/api/users/:id",auth(),adminOnly,(req,res)=>{
  if(String(req.user.id)===String(req.params.id)) return res.status(400).json({error:"You cannot delete your own account"});
  db.prepare("DELETE FROM users WHERE id=?").run(req.params.id);
  log("Deleted user","user",req.params.id,req.user.id); res.json({ok:true});
});

app.get("/api/products",auth(),(req,res)=>{
  const q=(req.query.q||"").toLowerCase();
  const rows=db.prepare("SELECT * FROM products WHERE lower(name) LIKE ? OR lower(category) LIKE ? ORDER BY id DESC")
    .all(`%${q}%`,`%${q}%`);
  res.json(rows);
});
app.post("/api/products",auth(),adminOnly,(req,res)=>{
  const {name,category,price=0,stock=0,status="active",image}=req.body;
  const r=db.prepare("INSERT INTO products(name,category,price,stock,status,image) VALUES(?,?,?,?,?,?)")
    .run(name,category,Number(price),Number(stock),status,image||null);
  log("Created product","product",r.lastInsertRowid,req.user.id); res.status(201).json({id:r.lastInsertRowid});
});
app.patch("/api/products/:id",auth(),adminOnly,(req,res)=>{
  const {name,category,price,stock,status,image}=req.body;
  db.prepare("UPDATE products SET name=COALESCE(?,name),category=COALESCE(?,category),price=COALESCE(?,price),stock=COALESCE(?,stock),status=COALESCE(?,status),image=COALESCE(?,image) WHERE id=?")
    .run(name,category,price,stock,status,image,req.params.id);
  log("Updated product","product",req.params.id,req.user.id);res.json({ok:true});
});
app.delete("/api/products/:id",auth(),adminOnly,(req,res)=>{
  db.prepare("DELETE FROM products WHERE id=?").run(req.params.id);
  log("Deleted product","product",req.params.id,req.user.id);res.json({ok:true});
});
app.post("/api/uploads",auth(),adminOnly,upload.single("file"),(req,res)=>{
  if(!req.file)return res.status(400).json({error:"No file"});
  res.json({url:"/uploads/"+req.file.filename});
});

app.get("/api/orders",auth(),adminOnly,(req,res)=>{
  const q=(req.query.q||"").toLowerCase(), status=req.query.status||"all";
  let sql=`SELECT o.*,u.name customer_name,u.email customer_email FROM orders o JOIN users u ON u.id=o.user_id WHERE 1=1`,p=[];
  if(q){sql+=" AND (lower(u.name) LIKE ? OR CAST(o.id AS TEXT) LIKE ?)";p.push(`%${q}%`,`%${q}%`);}
  if(status!=="all"){sql+=" AND o.status=?";p.push(status);}
  sql+=" ORDER BY o.id DESC";
  res.json(db.prepare(sql).all(...p));
});
app.patch("/api/orders/:id",auth(),adminOnly,(req,res)=>{
  const {status}=req.body;
  db.prepare("UPDATE orders SET status=? WHERE id=?").run(status,req.params.id);
  log("Updated order status","order",req.params.id,req.user.id);
  db.prepare("INSERT INTO notifications(title,message,type) VALUES(?,?,?)").run("Order updated",`Order #${req.params.id} is now ${status}.`,"info");
  res.json({ok:true});
});

app.get("/api/notifications",auth(),adminOnly,(req,res)=>res.json(db.prepare("SELECT * FROM notifications ORDER BY id DESC LIMIT 30").all()));
app.patch("/api/notifications/read",auth(),adminOnly,(req,res)=>{db.prepare("UPDATE notifications SET is_read=1").run();res.json({ok:true});});
app.get("/api/activity",auth(),adminOnly,(req,res)=>res.json(db.prepare(`SELECT a.*,u.name user_name FROM activity_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 100`).all()));

app.get("/api/settings",auth(),adminOnly,(req,res)=>{
  const rows=db.prepare("SELECT key,value FROM settings").all();res.json(Object.fromEntries(rows.map(x=>[x.key,x.value])));
});
app.put("/api/settings",auth(),adminOnly,(req,res)=>{
  const stmt=db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  const tx=db.transaction(obj=>Object.entries(obj||{}).forEach(([k,v])=>stmt.run(k,String(v))));
  tx(req.body);log("Updated system settings","settings",null,req.user.id);res.json({ok:true});
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`Pro Admin running at http://localhost:${PORT}`));
