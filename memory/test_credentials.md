# Test credentials — MapApp

## Admin (seeded on backend startup from backend/.env, is_pro=true)
- email: admin@mapapp.app
- password: Ma-XjKTb93osTQxQhe1wD
- role: admin

## Test user (registered via API, is_pro=false)
- email: tester@geopulse.app
- password: Tester#2026
- role: user

## Auth endpoints (httpOnly cookies: access_token 15 min, refresh_token 7 d)
- POST /api/auth/register {email, password(8+), name?}
- POST /api/auth/login {email, password}  (5 failures → 15 min lockout)
- POST /api/auth/logout
- POST /api/auth/refresh
- GET  /api/auth/me
- POST /api/auth/claim-license {session_id}  (attach a paid Stripe session to the account)
- PUT  /api/auth/branding {company, contact_name, phone, email, website, tagline}
- POST /api/auth/branding/logo (multipart file, png/jpg/webp/svg ≤2MB) → Emergent Object Storage
- GET  /api/auth/branding/logo
- DELETE /api/auth/branding/logo

## Stripe (test mode)
- Card 4242 4242 4242 4242, any future expiry / CVC
- Product lookup_key: geopulse_pro_onetime ($9 one-time)
