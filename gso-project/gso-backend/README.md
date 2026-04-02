# GSO System — Full Stack (Node.js + React + SQLite)

## 📁 Project Structure

```
gso-backend/          ← Node.js + Express + SQLite
  server.js           ← Main API server
  db.js               ← Database setup (auto-creates tables)
  email.js            ← Email notifications
  .env.example        ← Config template
  gso.db              ← SQLite database (auto-created on first run)

gso-frontend/         ← React frontend
  src/App.js          ← Main UI
  src/api.js          ← API calls to backend
  public/index.html
```

---

## 🚀 Setup & Run

### Requirements
- Node.js v18+ (https://nodejs.org)

---

### Step 1 — Setup Backend

```bash
cd gso-backend
npm install
cp .env.example .env
```

Edit `.env` with your settings (at minimum, change JWT_SECRET).

```bash
npm run dev     # development (auto-restart)
# or
npm start       # production
```

Backend runs at: **http://localhost:5000**
Database file `gso.db` is created automatically.

---

### Step 2 — Setup Frontend

Open a new terminal:

```bash
cd gso-frontend
npm install
npm start
```

Frontend runs at: **http://localhost:3000**

---

## 🔑 Default Admin Login

| Field    | Value      |
|----------|------------|
| Username | `admin`    |
| Password | `admin123` |

Change these in `.env`:
```
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

---

## 📧 Email Setup (Optional)

To enable real email notifications, edit `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password
ADMIN_EMAIL=admin@yourdomain.com
```

To get a Gmail App Password:
1. Go to Google Account → Security
2. Enable 2-Factor Authentication
3. Search "App Passwords" → Create one for "Mail"
4. Paste the 16-character password into SMTP_PASS

If email is not configured, notifications are printed to the server console.

---

## 🗄️ Database (SQLite)

The database is stored in `gso-backend/gso.db`. Tables:

| Table         | Description                        |
|---------------|------------------------------------|
| users         | Registered user accounts           |
| requests      | Service requests                   |
| notifications | Per-user in-app notifications      |

To view/edit the database, use [DB Browser for SQLite](https://sqlitebrowser.org/) (free).

---

## 🌐 API Endpoints

| Method | Endpoint                          | Auth    | Description              |
|--------|-----------------------------------|---------|--------------------------|
| POST   | /api/auth/register                | None    | Register new user        |
| POST   | /api/auth/login                   | None    | Login (user or admin)    |
| GET    | /api/user/requests                | User    | Get my requests          |
| POST   | /api/user/requests                | User    | Submit new request       |
| GET    | /api/user/notifications           | User    | Get my notifications     |
| PATCH  | /api/user/notifications/read      | User    | Mark all as read         |
| GET    | /api/admin/users                  | Admin   | Get all users            |
| PATCH  | /api/admin/users/:id/status       | Admin   | Approve/reject user      |
| GET    | /api/admin/requests               | Admin   | Get all requests         |
| PATCH  | /api/admin/requests/:id/status    | Admin   | Approve/disapprove req   |
| GET    | /api/admin/stats                  | Admin   | Dashboard statistics     |
| GET    | /api/health                       | None    | Server health check      |
