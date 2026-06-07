/**
 * Static Lens Photography — Booking Server
 *
 * A lightweight Node.js/Express server to handle booking form submissions.
 * Stores bookings in a local SQLite database and logs them for follow-up.
 *
 * Setup:
 *   1. cd booking-server
 *   2. npm install
 *   3. npm start
 *
 * The server runs on port 3001 (configurable via PORT env).
 * The booking page (booking.html) POSTs to /api/book.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const fs = require('fs');

const PORT = process.env.PORT || 3001;
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Serve the booking page and website static files
// Adjust the paths based on your deployment structure
app.use(express.static(path.join(__dirname, '..'))); // serves booking.html and website/index.html

// ─── Database Setup ──────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'bookings.db');
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id    TEXT UNIQUE NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    status        TEXT NOT NULL DEFAULT 'pending',

    -- Client Info
    full_name     TEXT NOT NULL,
    phone         TEXT NOT NULL,
    email         TEXT,
    instagram     TEXT,
    referral      TEXT,

    -- Shoot Details
    shoot_type    TEXT NOT NULL,
    package_name  TEXT NOT NULL,
    preferred_date TEXT NOT NULL,
    preferred_time TEXT,
    location      TEXT NOT NULL,
    num_people    INTEGER DEFAULT 1,
    notes         TEXT,

    -- Add-Ons
    fast_delivery INTEGER DEFAULT 0,
    prints        TEXT DEFAULT 'none',
    album         TEXT DEFAULT 'none',
    flash_drive   INTEGER DEFAULT 0,

    -- Terms agreed
    terms_accepted INTEGER DEFAULT 1
  );
`);

// ─── API Routes ──────────────────────────────────────────────────

/**
 * POST /api/book
 * Receives a booking form submission and stores it in the database.
 */
app.post('/api/book', (req, res) => {
  try {
    const data = req.body;

    // Validate required fields
    if (!data.fullName || !data.phone || !data.shootType || !data.package || !data.date || !data.location) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: fullName, phone, shootType, package, date, location'
      });
    }

    // Generate a unique booking ID
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(Math.random() * 9000) + 1000;
    const bookingId = `SL-${dateStr}-${rand}`;

    // Insert into database
    const stmt = db.prepare(`
      INSERT INTO bookings (
        booking_id, full_name, phone, email, instagram, referral,
        shoot_type, package_name, preferred_date, preferred_time,
        location, num_people, notes, fast_delivery, prints, album, flash_drive
      ) VALUES (
        @booking_id, @full_name, @phone, @email, @instagram, @referral,
        @shoot_type, @package_name, @preferred_date, @preferred_time,
        @location, @num_people, @notes, @fast_delivery, @prints, @album, @flash_drive
      )
    `);

    stmt.run({
      booking_id: bookingId,
      full_name: data.fullName,
      phone: data.phone,
      email: data.email || null,
      instagram: data.instagram || null,
      referral: data.referral || null,
      shoot_type: data.shootType,
      package_name: data.package,
      preferred_date: data.date,
      preferred_time: data.time || null,
      location: data.location,
      num_people: parseInt(data.numPeople) || 1,
      notes: data.notes || null,
      fast_delivery: data.fastDelivery === '1' ? 1 : 0,
      prints: data.prints || 'none',
      album: data.album || 'none',
      flash_drive: data.flashDrive === '1' ? 1 : 0
    });

    // Also log to a simple JSON file as backup
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
    const logFile = path.join(logDir, `${bookingId}.json`);
    fs.writeFileSync(logFile, JSON.stringify({ ...data, bookingId, createdAt: new Date().toISOString() }, null, 2));

    console.log(`[BOOKING] ${bookingId} — ${data.fullName} (${data.shootType}) — ${data.date}`);

    res.status(200).json({
      success: true,
      bookingId,
      message: 'Booking request received. We will confirm within 24 hours.'
    });

  } catch (err) {
    console.error('[ERROR] Booking failed:', err.message);
    res.status(500).json({
      success: false,
      error: 'Internal server error. Please try again or contact us via WhatsApp.'
    });
  }
});

/**
 * GET /api/bookings
 * Returns all bookings (admin use only — no auth for simplicity; add in production).
 */
app.get('/api/bookings', (req, res) => {
  try {
    const bookings = db.prepare('SELECT * FROM bookings ORDER BY created_at DESC').all();
    res.json({ success: true, count: bookings.length, bookings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/bookings/:id
 * Returns a single booking by booking_id.
 */
app.get('/api/bookings/:id', (req, res) => {
  try {
    const booking = db.prepare('SELECT * FROM bookings WHERE booking_id = ?').get(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    res.json({ success: true, booking });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /health
 * Health check endpoint.
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ─── Start Server ────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ⚡ Static Lens Booking Server running on http://0.0.0.0:${PORT}`);
  console.log(`  📸 Booking form: http://localhost:${PORT}/booking.html`);
  console.log(`  📋 API:          http://localhost:${PORT}/api/book\n`);
});