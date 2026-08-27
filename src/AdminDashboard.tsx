import {useEffect,useRef,useState} from 'react'
import {BarChart3, Boxes, ClipboardList, LogOut, Menu as MenuIcon, Plus, Settings, Users, X, Pencil, Trash2, CheckCircle2} from 'lucide-react'
const API=(import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, ''); const RID=1

type Item={id:number;name:string;category_id:number|null;category_name:string;description:string;price:number;image_url:string;food_type:string;is_bestseller:boolean;is_available:boolean}

type Cat={id:number;name:string;display_order:number;is_active:boolean}
export default function AdminDashboard(){
 const [authed,setAuthed]=useState(!!sessionStorage.getItem('adminToken')); const [email,setEmail]=useState('admin@spicegarden.com'); const [password,setPassword]=useState('Admin@123'); const [loginError,setLoginError]=useState('')
 const [tab,setTab]=useState('dashboard'); const [items,setItems]=useState<Item[]>([]); const [cats,setCats]=useState<Cat[]>([]); const [orders,setOrders]=useState<any[]>([]); const [stats,setStats]=useState<any>({}); const [restaurant,setRestaurant]=useState<any>({}); const restaurantDirty=useRef(false); const [staff,setStaff]=useState<any[]>([]); const [editing,setEditing]=useState<any>(null); const [message,setMessage]=useState('')
 const token=sessionStorage.getItem('adminToken')||''
 const headers={'Content-Type':'application/json',Authorization:`Bearer ${token}`}
 async function load(){
  if(!authed)return;
  try{
    const results=await Promise.all([
      fetch(`${API}/admin/menu/${RID}`,{headers}),
      fetch(`${API}/admin/categories/${RID}`,{headers}),
      fetch(`${API}/admin/orders/${RID}`,{headers}),
      fetch(`${API}/admin/stats/${RID}`,{headers}),
      fetch(`${API}/admin/restaurant/${RID}`,{headers}),
      fetch(`${API}/admin/staff/${RID}`,{headers})
    ]);
    const [m,c,o,stx,r,staffRes]=results;
    if(results.some(x=>x.status===401)){
      sessionStorage.removeItem('adminToken');
      setAuthed(false);
      setLoginError('Your admin session expired. Please sign in again.');
      return;
    }
    if(m.ok)setItems(await m.json());
    if(c.ok)setCats(await c.json());
    if(o.ok)setOrders(await o.json());
    if(stx.ok)setStats(await stx.json());
    if(r.ok && !restaurantDirty.current)setRestaurant(await r.json());
    if(staffRes.ok)setStaff(await staffRes.json());
  }catch(e){
    setMessage('Could not load admin data. Make sure the backend API is running.');
    console.error(e);
  }
}
 useEffect(()=>{if(!authed)return;load();const timer=window.setInterval(load,5000);return()=>window.clearInterval(timer)},[authed])
 async function login(e:any){e.preventDefault();setLoginError('');const r=await fetch(`${API}/admin/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});const d=await r.json();if(!r.ok)return setLoginError(d.error||'Login failed');sessionStorage.setItem('adminToken',d.token);setAuthed(true)}
 async function saveMenu(e:any){e.preventDefault();const body={...editing,restaurant_id:RID};const url=editing.id?`${API}/admin/menu/${editing.id}`:`${API}/admin/menu`;const r=await fetch(url,{method:editing.id?'PUT':'POST',headers,body:JSON.stringify(body)});if(r.ok){setEditing(null);setMessage('Menu item saved');load()}else setMessage('Could not save menu item')}
 async function deleteMenu(id:number){if(!confirm('Delete this menu item?'))return;await fetch(`${API}/admin/menu/${id}`,{method:'DELETE',headers});load()}
 async function status(id:number,status:string){await fetch(`${API}/admin/orders/${id}/status`,{method:'PUT',headers,body:JSON.stringify({status})});load()}
 async function saveRestaurant(e:any){
  e.preventDefault();
  const whatsapp=String(restaurant.whatsapp_number||'').replace(/\D/g,'');
  if(whatsapp.length<10){setMessage('Please enter a valid WhatsApp number');return}
  const payload={...restaurant,whatsapp_number:whatsapp};
  try{
    const r=await fetch(`${API}/admin/restaurant/${RID}`,{method:'PUT',headers,body:JSON.stringify(payload)});
    const d=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.error||'Could not save restaurant settings');
    restaurantDirty.current=false;
    setRestaurant((x:any)=>({...x,whatsapp_number:whatsapp}));
    setMessage(`Restaurant settings updated successfully. WhatsApp: ${whatsapp}`);
    load();
  }catch(err:any){
    console.error(err);
    setMessage(err?.message||'Could not save restaurant settings');
  }
}
 async function saveCat(e:any){e.preventDefault();const r=await fetch(`${API}/admin/categories`,{method:'POST',headers,body:JSON.stringify({...editing,restaurant_id:RID})});if(r.ok){setEditing(null);load()}}
 if(!authed)return <div className="adminLogin"><form onSubmit={login}><div className="adminLogo">SG</div><h1>Admin Portal</h1><p>Spice Garden · Black & White</p><label>Email<input value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label>{loginError&&<div className="adminError">{loginError}</div>}<button className="adminPrimary">Sign in</button><small>Demo admin: admin@spicegarden.com / Admin@123</small></form></div>
 const nav:Array<[string,string,any]>=[['dashboard','Dashboard',BarChart3],['orders','Orders',ClipboardList],['menu','Menu',MenuIcon],['categories','Categories',Boxes],['settings','Restaurant Settings',Settings],['staff','Staff',Users]]
 return <div className="adminShell"><aside className="adminSide"><div className="adminBrand"><b>SG</b><span>SPICE GARDEN<small>ADMIN</small></span></div>{nav.map(([id,label,Icon]:any)=><button className={tab===id?'selected':''} onClick={()=>setTab(id)} key={id}><Icon size={18}/>{label}</button>)}<button className="logout" onClick={()=>{sessionStorage.removeItem('adminToken');setAuthed(false)}}><LogOut size={18}/>Logout</button></aside><main className="adminMain"><div className="adminTop"><div><small>ADMIN PANEL</small><h1>{nav.find(x=>x[0]===tab)?.[1]}</h1></div><a className="viewSite" href="/">View customer site ↗</a></div>{message&&<div className="adminMessage">{message}<button onClick={()=>setMessage('')}><X size={14}/></button></div>}
 {tab==='dashboard'&&<div className="dash"><div className="statGrid"><Stat title="Today's Orders" value={stats.orders||0}/><Stat title="Today's Revenue" value={`₹${Number(stats.revenue||0).toFixed(0)}`}/><Stat title="Pending" value={stats.pending||0}/><Stat title="Cancelled" value={stats.cancelled||0}/><Stat title="Menu Items" value={stats.menuItems||0}/></div><div className="panel"><h2>Recent Orders</h2><p className="adminLiveNote">Orders refresh automatically every 5 seconds.</p><OrdersTable orders={orders.slice(0,8)} onStatus={status}/></div></div>}
 {tab==='orders'&&<div className="panel"><h2>All Orders</h2><OrdersTable orders={orders} onStatus={status}/></div>}
 {tab==='menu'&&<div className="panel"><div className="panelHead"><h2>Menu Items</h2><button className="adminPrimary small" onClick={()=>setEditing({name:'',category_id:cats[0]?.id||null,description:'',price:0,image_url:'',food_type:'veg',is_bestseller:false,is_available:true})}><Plus size={16}/> Add Dish</button></div><div className="adminTable"><div className="tr th"><span>Dish</span><span>Category</span><span>Price</span><span>Status</span><span>Actions</span></div>{items.map(i=><div className="tr" key={i.id}><span className="dishCell"><img src={i.image_url} onError={(e)=>{e.currentTarget.onerror=null;e.currentTarget.src="/images/dish-placeholder.svg";}}/><b>{i.name}</b></span><span>{i.category_name}</span><span>₹{i.price}</span><span>{i.is_available?<i className="pill ok">Available</i>:<i className="pill off">Unavailable</i>}</span><span className="actions"><button onClick={()=>setEditing(i)}><Pencil size={15}/></button><button onClick={()=>deleteMenu(i.id)}><Trash2 size={15}/></button></span></div>)}</div></div>}
 {tab==='categories'&&<div className="panel"><div className="panelHead"><h2>Categories</h2><button className="adminPrimary small" onClick={()=>setEditing({name:'',display_order:cats.length+1,is_active:true})}><Plus size={16}/> Add Category</button></div>{cats.map(c=><div className="categoryRow" key={c.id}><b>{c.display_order}. {c.name}</b><span>{c.is_active?'Active':'Disabled'}</span></div>)}</div>}
 {tab==='settings'&&<form className="panel settingsForm" onSubmit={saveRestaurant}><h2>Restaurant Settings</h2><label>Name<input value={restaurant.name||''} onChange={e=>{restaurantDirty.current=true;setRestaurant({...restaurant,name:e.target.value})}}/></label><label>Description<textarea value={restaurant.description||''} onChange={e=>{restaurantDirty.current=true;setRestaurant({...restaurant,description:e.target.value})}}/></label><label>Address<input value={restaurant.address||''} onChange={e=>{restaurantDirty.current=true;setRestaurant({...restaurant,address:e.target.value})}}/></label><div className="two"><label>Phone<input value={restaurant.phone||''} onChange={e=>{restaurantDirty.current=true;setRestaurant({...restaurant,phone:e.target.value})}}/></label><label>WhatsApp<input type="tel" inputMode="numeric" autoComplete="tel" value={restaurant.whatsapp_number||''} onChange={e=>{restaurantDirty.current=true;setRestaurant({...restaurant,whatsapp_number:e.target.value.replace(/\D/g,'')})}} placeholder="9994521119"/></label></div><div className="two"><label>Opening<input type="time" value={(restaurant.opening_time||'').slice(0,5)} onChange={e=>{restaurantDirty.current=true;setRestaurant({...restaurant,opening_time:e.target.value})}}/></label><label>Closing<input type="time" value={(restaurant.closing_time||'').slice(0,5)} onChange={e=>{restaurantDirty.current=true;setRestaurant({...restaurant,closing_time:e.target.value})}}/></label></div><div className="two"><label>Tax %<input type="number" value={restaurant.tax_percentage||0} onChange={e=>{restaurantDirty.current=true;setRestaurant({...restaurant,tax_percentage:e.target.value})}}/></label><label>Packaging ₹<input type="number" value={restaurant.packaging_charge||0} onChange={e=>{restaurantDirty.current=true;setRestaurant({...restaurant,packaging_charge:e.target.value})}}/></label></div><button className="adminPrimary">Save Settings</button></form>}
 {tab==='staff'&&<div className="panel"><h2>Staff Accounts</h2>{staff.map(s=><div className="categoryRow" key={s.id}><b>{s.name||s.email}</b><span>{s.role} · {s.is_active?'Active':'Disabled'}</span></div>)}</div>}
 {editing&&<div className="adminModal"><form onSubmit={editing.name!==undefined&&editing.category_id!==undefined?saveMenu:saveCat}><button type="button" className="modalX" onClick={()=>setEditing(null)}><X/></button><h2>{editing.id?'Edit Dish':editing.category_id!==undefined?'Add Dish':'Add Category'}</h2>{editing.category_id!==undefined&&<><label>Name<input required value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></label><label>Category<select value={editing.category_id||''} onChange={e=>setEditing({...editing,category_id:Number(e.target.value)})}>{cats.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Description<textarea value={editing.description||''} onChange={e=>setEditing({...editing,description:e.target.value})}/></label><div className="two"><label>Price<input type="number" required value={editing.price} onChange={e=>setEditing({...editing,price:e.target.value})}/></label><label>Food Type<select value={editing.food_type} onChange={e=>setEditing({...editing,food_type:e.target.value})}><option value="veg">Veg</option><option value="nonveg">Non-Veg</option></select></label></div><label>Image URL<input value={editing.image_url||''} onChange={e=>setEditing({...editing,image_url:e.target.value})}/></label><label className="check"><input type="checkbox" checked={!!editing.is_bestseller} onChange={e=>setEditing({...editing,is_bestseller:e.target.checked})}/> Bestseller</label><label className="check"><input type="checkbox" checked={!!editing.is_available} onChange={e=>setEditing({...editing,is_available:e.target.checked})}/> Available</label></>}{editing.category_id===undefined&&<><label>Category Name<input required value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})}/></label><label>Display Order<input type="number" value={editing.display_order} onChange={e=>setEditing({...editing,display_order:e.target.value})}/></label></>}<button className="adminPrimary">Save</button></form></div>}
 </main></div>
}
function Stat({title,value}:{title:string,value:any}){return <div className="stat"><small>{title}</small><strong>{value}</strong></div>}
function OrdersTable({orders,onStatus}:{orders:any[],onStatus:(id:number,s:string)=>void}){return <div className="adminTable"><div className="tr th"><span>Order</span><span>Customer</span><span>Total</span><span>Status</span><span>Action</span></div>{orders.map(o=><div className="tr" key={o.id}><span><b>#{o.order_number}</b><small>{new Date(o.created_at).toLocaleString()}</small></span><span>{o.customer_name}<small>{o.order_type}{o.table_number?` · Table ${o.table_number}`:''}</small></span><span>₹{o.total}</span><span><i className={`pill ${String(o.status).toLowerCase()}`}>{o.status}</i></span><span><select value={o.status} onChange={e=>onStatus(o.id,e.target.value)}><option>Pending</option><option>Accepted</option><option>Preparing</option><option>Ready</option><option>Completed</option><option>Cancelled</option></select></span></div>)}</div>}
