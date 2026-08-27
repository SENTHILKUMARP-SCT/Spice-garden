# Spice Garden — Free deployment setup

## Supabase
Run `database.sql` in the Supabase SQL Editor. It creates the PostgreSQL schema, sample restaurant/menu data, indexes, and admin account.

Admin login:
- Email: `admin@spicegarden.com`
- Password: `Admin@123`

## Render backend
- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm start`
- `DATABASE_URL`: Supabase PostgreSQL connection string
- `DATABASE_SSL`: `true`
- `JWT_SECRET`: long random value

Health check after deployment:
`https://YOUR-RENDER-SERVICE.onrender.com/api/health`

## Vercel frontend
- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment variable:
  `VITE_API_URL=https://YOUR-RENDER-SERVICE.onrender.com/api`
