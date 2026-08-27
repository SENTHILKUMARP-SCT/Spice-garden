import { useEffect, useMemo, useState } from "react"
import {
  ArrowRight, Check, ChevronRight, Clock3, MapPin, MessageCircle, Minus,
  Phone, Plus, Search, ShoppingBag, Trash2, Utensils, X
} from "lucide-react"
import { Canvas } from "@react-three/fiber"
import { Environment, Float, OrbitControls, ContactShadows, Text } from "@react-three/drei"
import { menuItems, type MenuItem } from "./data/menu"
import { restaurant } from "./config/restaurant"
import { buildWhatsAppMessage, createOrderNumber, type CartItem, type CustomerDetails } from "./utils/whatsapp"

const CART_KEY = "spice-garden-black-white-cart-v2"
const API=(import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '')

function whatsappUrlNumber(value:any){
  const digits=String(value||"").replace(/\\D/g,"")
  if(digits.length===10)return `91${digits}`
  return digits
}

function money(v:number|string|null|undefined){const n=Number(v);return `${restaurant.currency}${Number.isFinite(n)?n.toFixed(0):"0"}`}
function getInitialTable(){return new URLSearchParams(window.location.search).get("table") || ""}

function Hero3D(){
  return <div className="hero3d">
    <Canvas camera={{position:[0,0,6],fov:42}}>
      <ambientLight intensity={1.6}/>
      <directionalLight position={[3,4,5]} intensity={2.2} color="#ffffff"/>
      <Environment preset="studio"/>
      <Float speed={1.2} rotationIntensity={0.35} floatIntensity={0.55}>
        <group rotation={[0.15,-0.2,0.05]}>
          <mesh position={[0,-0.45,0]} rotation={[0,0.1,0]}>
            <cylinderGeometry args={[1.75,1.55,0.28,64]}/>
            <meshStandardMaterial color="#111111" metalness={0.7} roughness={0.18}/>
          </mesh>
          <mesh position={[0,-0.25,0]}>
            <torusGeometry args={[1.35,0.08,20,64]}/>
            <meshStandardMaterial color="#ffffff" metalness={0.45} roughness={0.18}/>
          </mesh>
          <mesh position={[0,-0.13,0]}>
            <cylinderGeometry args={[1.15,1.15,0.08,64]}/>
            <meshStandardMaterial color="#f4f4f4" roughness={0.7}/>
          </mesh>
          <Text position={[0,0.38,0.05]} fontSize={0.38} color="#ffffff" anchorX="center">SPICE</Text>
          <Text position={[0,0.02,0.05]} fontSize={0.25} color="#ffffff" anchorX="center">GARDEN</Text>
          <mesh position={[-1.65,0.65,-0.2]} rotation={[0.4,0.5,0.3]}>
            <boxGeometry args={[0.35,0.35,0.35]}/>
            <meshStandardMaterial color="#ffffff" metalness={0.4} roughness={0.25}/>
          </mesh>
          <mesh position={[1.6,0.35,0.1]} rotation={[0.2,-0.4,0.6]}>
            <boxGeometry args={[0.22,0.22,0.22]}/>
            <meshStandardMaterial color="#111111" metalness={0.6} roughness={0.2}/>
          </mesh>
        </group>
      </Float>
      <ContactShadows position={[0,-1.6,0]} opacity={0.5} scale={5.5} blur={2.5}/>
      <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={1.1}/>
    </Canvas>
  </div>
}

export default function App(){
  const [cart,setCart]=useState<CartItem[]>(()=>{
    try{
      const raw=JSON.parse(localStorage.getItem(CART_KEY)||"[]")
      if(!Array.isArray(raw)) return []
      return raw.filter((x:any)=>x && x.item && Number.isFinite(Number(x.item.id)) && Number(x.quantity)>0)
        .map((x:any)=>({...x,quantity:Math.max(1,Number(x.quantity))}))
    }catch{return []}
  })
  const [category,setCategory]=useState("All")
  const [foodFilter,setFoodFilter]=useState<"all"|"veg"|"nonveg">("all")
  const [search,setSearch]=useState("")
  const [selected,setSelected]=useState<MenuItem|null>(null)
  const [qty,setQty]=useState(1)
  const [note,setNote]=useState("")
  const [cartOpen,setCartOpen]=useState(false)
  const [checkoutOpen,setCheckoutOpen]=useState(false)
  const [error,setError]=useState("")
  const [sending,setSending]=useState(false)
  const [customer,setCustomer]=useState<CustomerDetails>({
    name:"",phone:"",orderType:getInitialTable()?"Dine-in":"Takeaway",
    tableNumber:getInitialTable(),pickupTime:"",instructions:""
  })
  const [apiMenu,setApiMenu]=useState<MenuItem[]>(menuItems)
  const [apiRestaurant,setApiRestaurant]=useState<any>(null)

  useEffect(()=>{localStorage.setItem(CART_KEY,JSON.stringify(cart))},[cart])

  useEffect(()=>{
    let disposed=false
    const refreshMenuAndRestaurant=async()=>{
      try{
        const response=await fetch(`${API}/menu/1?_=${Date.now()}`,{cache:"no-store"})
        if(response.ok){
          const rows=await response.json()
          if(Array.isArray(rows)&&rows.length&&!disposed){
            const nextMenu: MenuItem[] = rows.map((x:any)=>({
              id:Number(x.id),name:x.name,category:x.category_name||"Main Course",
              description:x.description||"",price:Number(x.price),image:x.image_url,
              foodType:(String(x.food_type||"").toLowerCase().replace(/[_\s]/g,"-")==="non-veg"||String(x.food_type||"").toLowerCase()==="nonveg"?"non-veg":"veg") as MenuItem["foodType"],
              isBestseller:Boolean(x.is_bestseller),isAvailable:Boolean(x.is_available)
            }))
            setApiMenu(nextMenu)
            setSelected(current=>{
              if(!current)return current
              return nextMenu.find((x:MenuItem)=>x.id===current.id)||current
            })
            setCart(current=>current.map(entry=>{
              const latest=nextMenu.find((x:MenuItem)=>x.id===entry.item.id)
              return latest?{...entry,item:latest}:null
            }).filter(Boolean) as CartItem[])
          }
        }
      }catch{}
      try{
        const response=await fetch(`${API}/restaurant/1?_=${Date.now()}`,{cache:"no-store"})
        if(response.ok&&!disposed)setApiRestaurant(await response.json())
      }catch{}
    }
    refreshMenuAndRestaurant()
    const intervalId=window.setInterval(refreshMenuAndRestaurant,5000)
    return()=>{disposed=true;window.clearInterval(intervalId)}
  },[])

  const categories=useMemo(()=>["All",...Array.from(new Set(apiMenu.map(x=>x.category)))], [apiMenu])
  const filtered=useMemo(()=>{
    const t=search.trim().toLowerCase()
    return apiMenu.filter(x=>{
      const matchesCategory=category==="All"||x.category===category
      const matchesFood=foodFilter==="all"||(foodFilter==="veg"?x.foodType==="veg":x.foodType==="non-veg")
      const matchesSearch=!t||`${x.name} ${x.description} ${x.category}`.toLowerCase().includes(t)
      return matchesCategory&&matchesFood&&matchesSearch
    })
  },[apiMenu,category,foodFilter,search])

  const subtotal=cart.reduce((s,x)=>s+x.item.price*x.quantity,0)
  const packaging=cart.length && customer.orderType==="Takeaway" ? Number(apiRestaurant?.packaging_charge??restaurant.packagingCharge) : 0
  const tax=subtotal*(Number(apiRestaurant?.tax_percentage??restaurant.taxPercentage)/100)
  const total=subtotal+packaging+tax
  const cartCount=cart.reduce((s,x)=>s+x.quantity,0)

  function add(item:MenuItem,n=1,noteText=""){
    if(!item.isAvailable)return
    setCart(c=>{
      const old=c.find(x=>x.item.id===item.id)
      return old?c.map(x=>x.item.id===item.id?{...x,quantity:x.quantity+n,note:noteText||x.note}:x):[...c,{item,quantity:n,note:noteText}]
    })
  }
  function change(id:number,d:number){setCart(c=>c.map(x=>x.item.id===id?{...x,quantity:x.quantity+d}:x).filter(x=>x.quantity>0))}
  function remove(id:number){setCart(c=>c.filter(x=>x.item.id!==id))}
  function openItem(item:MenuItem){setSelected(item);setQty(1);setNote("")}

  async function placeOrder(){
    if(!customer.name.trim())return setError("Please enter your name.")
    if(!/^[0-9+\-\s()]{8,}$/.test(customer.phone.trim()))return setError("Please enter a valid phone number.")
    if(customer.orderType==="Dine-in"&&!customer.tableNumber.trim())return setError("Please enter your table number.")
    if(!cart.length)return setError("Your cart is empty.")
    setError("");setSending(true)
    const orderNumber=createOrderNumber()
    try{
      const response=await fetch(`${API}/orders`,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          restaurant_id:1,customer_name:customer.name.trim(),customer_phone:customer.phone.trim(),
          order_type:customer.orderType==="Dine-in"?"dine-in":"takeaway",
          table_number:customer.orderType==="Dine-in"?customer.tableNumber.trim():null,
          pickup_time:customer.pickupTime||null,special_instructions:customer.instructions.trim()||null,
          items:cart.map(x=>({menu_item_id:x.item.id,quantity:x.quantity,special_instructions:x.note||null}))
        })
      })
      if(!response.ok)throw new Error("Could not save the order.")
      const saved=await response.json()
      const msg=buildWhatsAppMessage(cart,customer,Number(saved.subtotal??subtotal),Number(saved.packaging_charge??packaging),Number(saved.tax??tax),Number(saved.total??total),saved.order_number||orderNumber)
      localStorage.removeItem(CART_KEY);setCart([]);setCheckoutOpen(false);setCartOpen(false)
      const number=saved.whatsapp_number||apiRestaurant?.whatsapp_number||restaurant.whatsappNumber
      window.location.href=`https://wa.me/${whatsappUrlNumber(number)}?text=${encodeURIComponent(msg)}`
    }catch(e){
      console.error("Order save failed:",e)
      setError(e instanceof Error ? e.message : "The order could not be saved. Please check that the backend is running.")
    }finally{setSending(false)}
  }

  return <div className="app">
    <header className="topbar">
      <button className="logo" onClick={()=>window.scrollTo({top:0,behavior:"smooth"})}>
        <span className="logoMark">SG</span><span><b>SPICE GARDEN</b><small>3D DIGITAL MENU</small></span>
      </button>
      <nav><a href="#home">Home</a><a href="#menu">Menu</a><a href="#about">About</a></nav>
      <button type="button" className="cartButton" onClick={(e)=>{e.preventDefault();setCartOpen(true)}}><ShoppingBag size={18}/> Cart <span>{cartCount}</span></button>
    </header>

    <main id="home">
      <section className="hero">
        <div className="heroText">
          <span className="kicker"><span/> BLACK & WHITE DINING EXPERIENCE</span>
          <h1>Authentic<br/><i>flavours.</i><br/>Made fresh.</h1>
          <p>{apiRestaurant?.description||restaurant.description}</p>
          <div className="heroActions"><a href="#menu" className="whiteBtn">Explore menu <ArrowRight size={17}/></a><a href="#about" className="outlineBtn">Restaurant info</a></div>
        </div>
        <Hero3D/>
      </section>

      <section className="infoStrip" id="about">
        <div><MapPin/><span><small>LOCATION</small>{apiRestaurant?.address||restaurant.address}</span></div>
        <div><Clock3/><span><small>OPENING HOURS</small>{apiRestaurant?.opening_time?.slice(0,5)||restaurant.openingTime} – {apiRestaurant?.closing_time?.slice(0,5)||restaurant.closingTime}</span></div>
        <div><Phone/><span><small>CALL US</small>{apiRestaurant?.phone||restaurant.phone}</span></div>
        <a href={`https://wa.me/${whatsappUrlNumber(apiRestaurant?.whatsapp_number||restaurant.whatsappNumber)}`} target="_blank" rel="noreferrer"><MessageCircle/><span><small>ORDER</small>WhatsApp</span></a>
      </section>

      <section id="menu" className="menuSection">
        <div className="menuHead"><div><span className="kicker dark"><span/> OUR MENU</span><h2>Choose something <i>delicious.</i></h2><p>Every dish from the reference menu, with its original image source.</p></div><div className="searchBox"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search dishes..."/></div></div>
        <div className="foodFilters" aria-label="Food type filter">
          <button type="button" className={foodFilter==="all"?"active":""} onClick={()=>setFoodFilter("all")}>All</button>
          <button type="button" className={foodFilter==="veg"?"active":""} onClick={()=>setFoodFilter("veg")}><span className="foodDot vegDot"/>Veg</button>
          <button type="button" className={foodFilter==="nonveg"?"active":""} onClick={()=>setFoodFilter("nonveg")}><span className="foodDot nonVegDot"/>Non-Veg</button>
        </div>
        <div className="categories">{categories.map(c=><button key={c} className={category===c?"active":""} onClick={()=>setCategory(c)}>{c}</button>)}</div>
        <div className="dishGrid">{filtered.map(item=><article className="dishCard" key={item.id}>
          <button className="dishImage" onClick={()=>openItem(item)}><img src={item.image} alt={item.name}/><div className="badges"><span className={item.foodType==="veg"?"veg":"nonveg"}>{item.foodType==="veg"?"VEG":"NON-VEG"}</span>{item.isBestseller&&<span className="best">BESTSELLER</span>}</div></button>
          <div className="dishBody"><div className="dishTop"><div><small>{item.category}</small><h3>{item.name}</h3></div><b>{money(item.price)}</b></div><p>{item.description}</p>
          {(()=>{const q=cart.find(x=>x.item.id===item.id)?.quantity||0;return q?<div className="quantity"><button onClick={()=>change(item.id,-1)}><Minus/></button><strong>{q}</strong><button onClick={()=>change(item.id,1)}><Plus/></button></div>:<button className="addButton" disabled={!item.isAvailable} onClick={()=>add(item)}><Plus size={17}/>{item.isAvailable?"Add to cart":"Unavailable"}</button>})()}</div>
        </article>)}</div>
        {!filtered.length&&<div className="empty">No food items found.</div>}
      </section>
    </main>

    <footer><div><b>SPICE GARDEN</b><span>BLACK & WHITE DIGITAL MENU</span></div><a href={`https://wa.me/${whatsappUrlNumber(apiRestaurant?.whatsapp_number||restaurant.whatsappNumber)}`} target="_blank" rel="noreferrer"><MessageCircle/> Order on WhatsApp</a></footer>

    {selected&&<div className="overlay" onClick={()=>setSelected(null)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="close" onClick={()=>setSelected(null)}><X/></button><img src={selected.image} alt={selected.name}/><div className="modalBody"><small>{selected.category}</small><h2>{selected.name}</h2><p>{selected.description}</p><b className="modalPrice">{money(selected.price)}</b><label>Special instructions<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Less spicy, no onion, extra gravy..."/></label><div className="selectQty"><span>Quantity</span><div><button onClick={()=>setQty(Math.max(1,qty-1))}><Minus/></button><b>{qty}</b><button onClick={()=>setQty(qty+1)}><Plus/></button></div></div><button className="whiteBtn black" disabled={!selected.isAvailable} onClick={()=>{add(selected,qty,note.trim());setSelected(null);setCartOpen(true)}}>{selected.isAvailable?"Add to cart":"Unavailable"} {!selected.isAvailable?null:<Plus size={17}/>}</button></div></div></div>}

    {cartOpen&&<div className="overlay" onClick={()=>setCartOpen(false)}><aside className="sidePanel" onClick={e=>e.stopPropagation()}><div className="panelHead"><h2>Your cart</h2><button onClick={()=>setCartOpen(false)}><X/></button></div>{!cart.length?<div className="empty">Your cart is empty.</div>:<><div className="cartList">{cart.filter(x=>x?.item).map(x=><div className="cartRow" key={x.item.id}><img src={x.item.image||"/images/dish-placeholder.svg"} alt={x.item.name}/><div className="cartInfo"><b>{x.item.name}</b><small>{money(Number(x.item.price)||0)}</small><div className="miniQty"><button onClick={()=>change(x.item.id,-1)}><Minus/></button><span>{x.quantity}</span><button onClick={()=>change(x.item.id,1)}><Plus/></button></div></div><button className="trash" onClick={()=>remove(x.item.id)}><Trash2 size={17}/></button></div>)}</div><div className="summary"><div><span>Subtotal</span><b>{money(subtotal)}</b></div>{packaging>0&&<div><span>Packaging</span><b>{money(packaging)}</b></div>}<div className="grand"><span>Total</span><b>{money(total)}</b></div></div><button className="whiteBtn black full" onClick={()=>{setCartOpen(false);setCheckoutOpen(true)}}>Proceed to order <ChevronRight/></button></>}</aside></div>}

    {checkoutOpen&&<div className="overlay" onClick={()=>setCheckoutOpen(false)}><div className="checkout" onClick={e=>e.stopPropagation()}>
      <div className="panelHead"><h2>Order details</h2><button type="button" onClick={()=>setCheckoutOpen(false)}><X/></button></div>
      {error&&<div className="error">{error}</div>}

      <label>Name<input value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})} placeholder="Your name"/></label>
      <label>Phone number<input value={customer.phone} onChange={e=>setCustomer({...customer,phone:e.target.value})} placeholder="+91 98765 43210"/></label>

      <label>Order type <span className="required">*</span>
        <div className="orderTypes checkout-order-types">
          <button type="button" className={customer.orderType==="Dine-in"?"selected":""} onClick={()=>setCustomer({...customer,orderType:"Dine-in"})}>Dine-in</button>
          <button type="button" className={customer.orderType==="Takeaway"?"selected":""} onClick={()=>setCustomer({...customer,orderType:"Takeaway"})}>Takeaway</button>
        </div>
      </label>

      {customer.orderType==="Dine-in"
        ? <label>Table number <span className="required">*</span><input value={customer.tableNumber} onChange={e=>setCustomer({...customer,tableNumber:e.target.value})} placeholder="12"/></label>
        : <label>Pickup time (optional)<input value={customer.pickupTime} onChange={e=>setCustomer({...customer,pickupTime:e.target.value})} placeholder="8:30 PM"/></label>}

      <label>Special instructions<textarea value={customer.instructions} onChange={e=>setCustomer({...customer,instructions:e.target.value})} placeholder="Less spicy, no onion..."/></label>

      <div className="order-summary">
        <h3>Order summary</h3>
        <div className="order-summary-items">
          {cart.filter(x=>x?.item).map(x=>
            <div className="order-summary-row" key={x.item.id}>
              <span>{x.item.name} × {x.quantity}</span>
              <strong>{money((Number(x.item.price)||0)*x.quantity)}</strong>
            </div>
          )}
        </div>
        <div className="order-summary-divider"></div>
        <div className="order-summary-row"><span>Subtotal</span><span>{money(subtotal)}</span></div>
        {packaging>0&&<div className="order-summary-row"><span>Packaging</span><span>{money(packaging)}</span></div>}
        <div className="order-summary-row order-summary-total"><strong>Total</strong><strong>{money(total)}</strong></div>
      </div>

      <button className="whatsapp-checkout-btn" disabled={sending} onClick={placeOrder}>
        <MessageCircle size={22}/>
        <span>{sending?"Saving order...":"Send order to WhatsApp"}</span>
      </button>
      <p className="whatsapp-checkout-note">Your order reference is generated locally and the final order is sent to the restaurant through WhatsApp.</p>
    </div></div>}
  </div>
}
