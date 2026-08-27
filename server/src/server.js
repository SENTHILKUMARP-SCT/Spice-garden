import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

if (!process.env.DATABASE_URL) {
  console.error('Missing DATABASE_URL in server/.env');
  process.exit(1);
}

const PORT = Number(process.env.PORT || 5000);
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const app = express();
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '1mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

function indiaDateParts() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const get = (type) => parts.find(p => p.type === type)?.value || '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}:${get('second')}` };
}

function normalizePickupTime(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(raw)) {
    return raw.length === 16 ? `${raw}:00+05:30` : `${raw.replace(' ', 'T')}+05:30`;
  }
  let m = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/);
  if (m) {
    const h = Number(m[1]), min = Number(m[2]), sec = Number(m[3] || 0);
    if (h >= 0 && h <= 23 && min <= 59 && sec <= 59) {
      const { date } = indiaDateParts();
      return `${date}T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}+05:30`;
    }
  }
  m = raw.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(AM|PM)$/i);
  if (m) {
    let h = Number(m[1]), min = Number(m[2] || 0);
    if (h >= 1 && h <= 12 && min <= 59) {
      const ap = m[3].toUpperCase();
      if (ap === 'PM' && h !== 12) h += 12;
      if (ap === 'AM' && h === 12) h = 0;
      const { date } = indiaDateParts();
      return `${date}T${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:00+05:30`;
    }
  }
  return null;
}

function dineIn(value) {
  return String(value || '').toLowerCase().replace(/[-_\s]/g, '') === 'dinein';
}

function newOrderNumber() {
  const { date } = indiaDateParts();
  const compact = date.replaceAll('-', '');
  const suffix = Math.floor(100000 + Math.random() * 900000);
  return `ORD-${compact}-${suffix}`;
}

// Render/API availability checks
app.get('/', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'Spice Garden API',
    message: 'Backend is running'
  });
});

app.get('/api/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'Spice Garden API',
    status: 'running'
  });
});

// Separate database check so /api/health never becomes unavailable
// just because PostgreSQL is temporarily unreachable.
app.get('/api/db-health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({
      ok: true,
      database: 'postgresql',
      status: 'connected'
    });
  } catch (e) {
    res.status(503).json({
      ok: false,
      database: 'postgresql',
      status: 'disconnected',
      error: e.message
    });
  }
});

app.get('/api/menu/:restaurantId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT m.*, c.name AS category_name
       FROM menu_items m LEFT JOIN categories c ON c.id=m.category_id
       WHERE m.restaurant_id=$1 AND m.is_available=true
       ORDER BY c.display_order, m.name`, [req.params.restaurantId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/categories/:restaurantId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM categories WHERE restaurant_id=$1 AND is_active=true ORDER BY display_order`,
      [req.params.restaurantId]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/restaurant/:restaurantId', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM restaurants WHERE id=$1', [req.params.restaurantId]);
    if (!rows.length) return res.status(404).json({ error: 'Restaurant not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orders', async (req, res) => {
  const client = await pool.connect();
  try {
    const { restaurant_id, customer_name, customer_phone, order_type, table_number, pickup_time, special_instructions, items } = req.body || {};
    if (!restaurant_id || !customer_name || !customer_phone || !order_type || !items?.length) {
      return res.status(400).json({ error: 'Missing required order details' });
    }
    if (dineIn(order_type) && !String(table_number || '').trim()) {
      return res.status(400).json({ error: 'Table number is required for dine-in orders' });
    }

    await client.query('BEGIN');
    const { rows: restaurantRows } = await client.query('SELECT * FROM restaurants WHERE id=$1 FOR UPDATE', [restaurant_id]);
    if (!restaurantRows.length) throw new Error('Restaurant not found');

    const ids = items.map(x => Number(x.menu_item_id)).filter(Number.isFinite);
    if (!ids.length) throw new Error('No valid menu items in order');
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
    const { rows: dbItems } = await client.query(
      `SELECT id,name,price FROM menu_items WHERE restaurant_id=$1 AND is_available=true AND id IN (${placeholders})`,
      [restaurant_id, ...ids]
    );
    const lookup = new Map(dbItems.map(x => [Number(x.id), x]));
    let subtotal = 0;
    const normalized = [];
    for (const item of items) {
      const db = lookup.get(Number(item.menu_item_id));
      if (!db) throw new Error(`Menu item unavailable: ${item.menu_item_id}`);
      const quantity = Math.max(1, Number(item.quantity) || 1);
      const line = Number(db.price) * quantity;
      subtotal += line;
      normalized.push({ ...item, item_name: db.name, unit_price: Number(db.price), quantity, subtotal: line });
    }

    const tax = subtotal * (Number(restaurantRows[0].tax_percentage) || 0) / 100;
    const packaging = String(order_type).toLowerCase() === 'takeaway' ? (Number(restaurantRows[0].packaging_charge) || 0) : 0;
    const total = subtotal + tax + packaging;
    const normalizedPickupTime = String(order_type).toLowerCase() === 'takeaway' ? normalizePickupTime(pickup_time) : null;

    // Same day + same name + same phone + Dine-in + same table + active order => reuse order number.
    // Completed/Cancelled orders or a new day => create a new order number.
    let orderNumber = newOrderNumber();
    let existingOrderId = null;
    if (dineIn(order_type)) {
      const { rows: existing } = await client.query(
        `SELECT id, order_number
         FROM orders
         WHERE restaurant_id=$1
           AND LOWER(TRIM(customer_name))=LOWER(TRIM($2))
           AND regexp_replace(customer_phone, '\\D', '', 'g')=regexp_replace($3, '\\D', '', 'g')
           AND order_type='dine-in'
           AND (created_at AT TIME ZONE 'Asia/Kolkata')::date=(NOW() AT TIME ZONE 'Asia/Kolkata')::date
           AND table_number=TRIM($4)
           AND status NOT IN ('Completed','Cancelled')
         ORDER BY id DESC LIMIT 1 FOR UPDATE`,
        [restaurant_id, customer_name, customer_phone, String(table_number).trim()]
      );
      if (existing.length) {
        existingOrderId = Number(existing[0].id);
        orderNumber = existing[0].order_number;
      }
    }

    let orderId;
    if (existingOrderId) {
      const { rows } = await client.query(
        `UPDATE orders SET subtotal=subtotal+$1, tax=tax+$2, packaging_charge=packaging_charge+$3, total=total+$4,
          special_instructions=CASE
            WHEN $5::text IS NULL OR $5::text='' THEN special_instructions
            WHEN special_instructions IS NULL OR special_instructions='' THEN $5
            ELSE CONCAT(special_instructions,' | ',$5) END,
          updated_at=NOW()
         WHERE id=$6 RETURNING id`,
        [subtotal, tax, packaging, total, special_instructions || null, existingOrderId]
      );
      orderId = Number(rows[0].id);
    } else {
      const { rows } = await client.query(
        `INSERT INTO orders
          (restaurant_id,order_number,customer_name,customer_phone,order_type,table_number,pickup_time,special_instructions,subtotal,tax,packaging_charge,total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [restaurant_id, orderNumber, customer_name, customer_phone, order_type, dineIn(order_type) ? String(table_number).trim() : null,
         normalizedPickupTime, special_instructions || null, subtotal, tax, packaging, total]
      );
      orderId = Number(rows[0].id);
    }

    for (const x of normalized) {
      await client.query(
        `INSERT INTO order_items (order_id,menu_item_id,item_name,quantity,unit_price,special_instructions,subtotal)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [orderId, x.menu_item_id, x.item_name, x.quantity, x.unit_price, x.special_instructions || null, x.subtotal]
      );
    }

    await client.query('COMMIT');
    console.log(`Order saved: #${orderNumber} (id=${orderId}, restaurant=${restaurant_id})`);
    res.status(201).json({ ok: true, id: orderId, order_number: orderNumber, subtotal, tax, packaging_charge: packaging, total,
      whatsapp_number: restaurantRows[0].whatsapp_number });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Order save failed:', e);
    res.status(400).json({ ok: false, error: e.message });
  } finally { client.release(); }
});

function adminAuth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!token) throw new Error('Missing token');
    req.user = jwt.verify(token, JWT_SECRET);
    if (req.user.role !== 'admin') throw new Error('Admin only');
    next();
  } catch { res.status(401).json({ error: 'Unauthorized' }); }
}

app.post('/api/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1 AND role=\'admin\' AND is_active=true LIMIT 1', [email]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid email or password' });
    const u = rows[0];
    const ok = await bcrypt.compare(String(password), String(u.password_hash));
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
    const token = jwt.sign({ id: u.id, email: u.email, role: u.role, restaurant_id: u.restaurant_id }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ token, user: { id: u.id, name: u.full_name, email: u.email, role: u.role } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/stats/:restaurantId', adminAuth, async (req, res) => {
  try {
    const r = req.params.restaurantId;
    const day = `(created_at AT TIME ZONE 'Asia/Kolkata')::date=(NOW() AT TIME ZONE 'Asia/Kolkata')::date`;

    // pg.query() returns a QueryResult object, not a MySQL-style [rows, fields] array.
    // Keep the dashboard counters consistent: today's orders/revenue are date-scoped,
    // while Pending/Cancelled show all currently outstanding/history counts.
    const [ordersResult, revenueResult, pendingResult, completedResult, cancelledResult, menuResult] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS orders FROM orders WHERE restaurant_id=$1 AND ${day}`, [r]),
      pool.query(`SELECT COALESCE(SUM(total),0)::numeric AS revenue FROM orders WHERE restaurant_id=$1 AND ${day} AND status<>'Cancelled'`, [r]),
      pool.query(`SELECT COUNT(*)::int AS pending FROM orders WHERE restaurant_id=$1 AND status='Pending'`, [r]),
      pool.query(`SELECT COUNT(*)::int AS completed FROM orders WHERE restaurant_id=$1 AND status='Completed'`, [r]),
      pool.query(`SELECT COUNT(*)::int AS cancelled FROM orders WHERE restaurant_id=$1 AND status='Cancelled'`, [r]),
      pool.query('SELECT COUNT(*)::int AS "menuItems" FROM menu_items WHERE restaurant_id=$1', [r])
    ]);

    const a = ordersResult.rows[0];
    const b = revenueResult.rows[0];
    const c = pendingResult.rows[0];
    const d = completedResult.rows[0];
    const f = cancelledResult.rows[0];
    const e = menuResult.rows[0];

    res.set('Cache-Control', 'no-store');
    res.json({
      orders: Number(a.orders || 0),
      revenue: Number(b.revenue || 0),
      pending: Number(c.pending || 0),
      completed: Number(d.completed || 0),
      cancelled: Number(f.cancelled || 0),
      menuItems: Number(e.menuItems || 0)
    });
  } catch (e) {
    console.error('Admin stats failed:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/admin/menu/:restaurantId', adminAuth, async (req, res) => {
  try { const { rows } = await pool.query(`SELECT m.*,c.name category_name FROM menu_items m LEFT JOIN categories c ON c.id=m.category_id WHERE m.restaurant_id=$1 ORDER BY c.display_order,m.name`, [req.params.restaurantId]); res.json(rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/admin/menu', adminAuth, async (req, res) => {
  try { const x = req.body; const { rows } = await pool.query(`INSERT INTO menu_items(restaurant_id,category_id,name,description,price,image_url,food_type,is_bestseller,is_available) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [x.restaurant_id,x.category_id||null,x.name,x.description||'',Number(x.price),x.image_url||'',x.food_type||'veg',!!x.is_bestseller,x.is_available!==false]); res.status(201).json({ id: rows[0].id }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/admin/menu/:id', adminAuth, async (req, res) => {
  try { const x=req.body; await pool.query(`UPDATE menu_items SET category_id=$1,name=$2,description=$3,price=$4,image_url=$5,food_type=$6,is_bestseller=$7,is_available=$8,updated_at=NOW() WHERE id=$9`, [x.category_id||null,x.name,x.description||'',Number(x.price),x.image_url||'',x.food_type||'veg',!!x.is_bestseller,x.is_available!==false,req.params.id]); res.json({ok:true}); }
  catch(e){res.status(400).json({error:e.message});}
});
app.delete('/api/admin/menu/:id', adminAuth, async (req,res)=>{try{await pool.query('DELETE FROM menu_items WHERE id=$1',[req.params.id]);res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/admin/categories/:restaurantId',adminAuth,async(req,res)=>{try{const {rows}=await pool.query('SELECT * FROM categories WHERE restaurant_id=$1 ORDER BY display_order,name',[req.params.restaurantId]);res.json(rows)}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/admin/categories',adminAuth,async(req,res)=>{try{const x=req.body;const {rows}=await pool.query('INSERT INTO categories(restaurant_id,name,display_order,is_active) VALUES($1,$2,$3,$4) RETURNING id',[x.restaurant_id,x.name,Number(x.display_order||0),x.is_active!==false]);res.status(201).json({id:rows[0].id})}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/admin/orders/:restaurantId',adminAuth,async(req,res)=>{try{const {rows}=await pool.query('SELECT * FROM orders WHERE restaurant_id=$1 ORDER BY created_at DESC',[req.params.restaurantId]);res.json(rows)}catch(e){res.status(500).json({error:e.message})}});
app.put('/api/admin/orders/:id/status',adminAuth,async(req,res)=>{try{const allowed=['Pending','Accepted','Preparing','Ready','Completed','Cancelled'];if(!allowed.includes(req.body.status))return res.status(400).json({error:'Invalid status'});await pool.query('UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2',[req.body.status,req.params.id]);res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/admin/restaurant/:restaurantId',adminAuth,async(req,res)=>{try{const {rows}=await pool.query('SELECT * FROM restaurants WHERE id=$1',[req.params.restaurantId]);res.json(rows[0]||{})}catch(e){res.status(500).json({error:e.message})}});
app.put('/api/admin/restaurant/:restaurantId',adminAuth,async(req,res)=>{try{const x=req.body||{};const whatsapp=String(x.whatsapp_number||'').replace(/\D/g,'');if(whatsapp.length<10||whatsapp.length>15)return res.status(400).json({ok:false,error:'Valid WhatsApp number is required'});const {rows}=await pool.query(`UPDATE restaurants SET name=$1,description=$2,address=$3,phone=$4,whatsapp_number=$5,opening_time=$6,closing_time=$7,tax_percentage=$8,packaging_charge=$9,google_maps_url=$10,instagram_url=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,[x.name,x.description,x.address,x.phone,whatsapp,x.opening_time||null,x.closing_time||null,Number(x.tax_percentage||0),Number(x.packaging_charge||0),x.google_maps_url||null,x.instagram_url||null,req.params.restaurantId]);if(!rows.length)return res.status(404).json({ok:false,error:'Restaurant not found'});res.json({ok:true,restaurant:rows[0]})}catch(e){console.error('Restaurant settings update failed:',e);res.status(400).json({ok:false,error:e.message})}});
app.get('/api/admin/staff/:restaurantId',adminAuth,async(req,res)=>{try{const {rows}=await pool.query('SELECT id,full_name name,email,phone,role,is_active,created_at FROM users WHERE restaurant_id=$1 ORDER BY created_at DESC',[req.params.restaurantId]);res.json(rows)}catch(e){res.status(500).json({error:e.message})}});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Spice Garden API running on port ${PORT}`);
});
