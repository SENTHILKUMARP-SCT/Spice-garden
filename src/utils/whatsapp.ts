import { restaurant } from "../config/restaurant"
import type { MenuItem } from "../data/menu"

export type CartItem = { item: MenuItem; quantity: number; note?: string }
export type CustomerDetails = {
  name: string
  phone: string
  orderType: "Dine-in" | "Takeaway"
  tableNumber: string
  pickupTime: string
  instructions: string
}

export function createOrderNumber() {
  const now = new Date()
  return `ORD-${now.toISOString().slice(0,10).replace(/-/g,"")}-${now.toTimeString().slice(0,8).replace(/:/g,"")}`
}

export function buildWhatsAppMessage(cart: CartItem[], customer: CustomerDetails, subtotal: number, packaging: number, tax: number, total: number, orderNumber: string) {
  const items = cart.map((entry,index) =>
    `${index+1}. ${entry.item.name} × ${entry.quantity} - ${restaurant.currency}${(entry.item.price*entry.quantity).toFixed(0)}${entry.note ? `\n   Note: ${entry.note}` : ""}`
  ).join("\n")
  return `Hello *${restaurant.name}* 👋

I would like to place an order.

*ORDER NUMBER:* ${orderNumber}

*ORDER DETAILS*
${items}

*Subtotal:* ${restaurant.currency}${subtotal.toFixed(0)}
${packaging > 0 ? `*Packaging:* ${restaurant.currency}${packaging.toFixed(0)}\n` : ""}${tax > 0 ? `*Tax:* ${restaurant.currency}${tax.toFixed(0)}\n` : ""}*TOTAL:* ${restaurant.currency}${total.toFixed(0)}

*CUSTOMER DETAILS*
Name: ${customer.name}
Phone: ${customer.phone}
Order Type: ${customer.orderType}${customer.orderType === "Dine-in" ? `\nTable: ${customer.tableNumber}` : ""}${customer.pickupTime ? `\nPickup Time: ${customer.pickupTime}` : ""}

${customer.instructions ? `*Special Instructions:*\n${customer.instructions}\n` : ""}Thank you!`
}

export function openWhatsApp(message: string) {
  const digits=String(restaurant.whatsappNumber||"").replace(/\D/g,"")
  const number=digits.length===10?`91${digits}`:digits
  window.location.href = `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}
