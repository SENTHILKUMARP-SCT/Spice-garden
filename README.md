# Spice Garden — 3D Black & White Exact Menu Project

This ZIP uses the supplied menu source as the authoritative menu data.

## Exact menu
- 58 dish entries are included.
- IDs run from 1 through 60 because the supplied source has gaps at IDs 33 and 37.
- Names, categories, descriptions, prices, food types, bestseller flags, availability flags, and image URLs are preserved exactly from the supplied source.
- The same exact image URLs are in `src/data/menu.ts` and `database.sql`.
- `REFERENCE-MENU-SOURCE.txt` contains the supplied source used for verification.

## Run
1. Import `database.sql` into MySQL Workbench.
2. Open `server/.env` and set `DB_PASSWORD` to your MySQL password.
3. Terminal 1:
   `cd server`
   `npm install`
   `npm run dev`
4. Terminal 2, from project root:
   `npm install`
   `npm run dev`
5. Open the Vite URL, normally `http://localhost:5173`.

## Note about images
The exact URLs from the supplied source are intentionally preserved. They are third-party URLs, so availability is controlled by those hosts.

## Admin Dashboard
Open `http://localhost:5173/admin` after starting the frontend.
Demo credentials after importing the supplied database.sql:
- Email: `admin@spicegarden.com`
- Password: `Admin@123`
The first successful login upgrades the bootstrap password to a bcrypt hash in MySQL.


## Image fix
Paneer Butter Masala no longer uses the broken loremflickr URL. It now uses a stable Wikimedia Commons redirect, with a local SVG fallback if an image host is unavailable.


## Live menu updates
The customer website polls the MySQL API every 30 seconds. Admin changes to menu availability, price, name, image, category, bestseller status, and restaurant settings are picked up automatically without reloading the page. The polling updates React state only, so the current scroll position, search, category, open cart, and other UI state are preserved.


## Cart fix
The customer cart now validates stored cart data before rendering, safely handles stale localStorage entries, prevents the cart button from navigating, and includes an error recovery screen instead of a blank page.


## WhatsApp Checkout
The checkout uses a dedicated order summary with item quantities, subtotal, packaging, total, and a prominent green 'Send order to WhatsApp' action, matching the supplied reference layout.


## Packaging rule
Packaging charge applies only to **Takeaway** orders. Dine-in orders always show ₹0 packaging and the backend also enforces this rule when saving the order.


## Frontend Cart / Order Summary
The cart checkout now uses the supplied reference layout: order type, table/pickup details, special instructions, itemized order summary, subtotal, conditional packaging (takeaway only), total, and a green Send order to WhatsApp button. Dine-in never shows a packaging line.


## Order synchronization
Customer orders are committed to MySQL before WhatsApp is opened. Takeaway pickup times such as `8.30pm`, `8:30 PM`, `8 PM`, and `20:30` are normalized to MySQL DATETIME. The Admin Dashboard polls orders and statistics every 5 seconds.


## Editable WhatsApp Settings
The Admin > Restaurant Settings WhatsApp field is editable. Saving validates and stores the number in the MySQL `restaurants.whatsapp_number` column and reloads the saved value. Customer WhatsApp links use the restaurant setting.


### WhatsApp number format
In Admin > Restaurant Settings, enter the restaurant's WhatsApp number. A 10-digit Indian number such as `9994521119` is stored as entered, while the customer WhatsApp link automatically uses the international `91` prefix (`919994521119`).


### Dine-in order grouping
Active Dine-in orders reuse the order number only when the calendar day, customer name, phone number, and table number all match. Completed or Cancelled orders are never reused. Takeaway orders always receive a new order number.
