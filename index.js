import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import authRoutes from './src/routes/auth.routes.js';
import userRoutes from './src/routes/user.routes.js';
import practitionerRoutes from './src/routes/practitioner.routes.js';
import availabilityRoutes from './src/routes/availability.routes.js';
import serviceRoutes from './src/routes/service.routes.js';
import appointmentRoutes from './src/routes/appointment.routes.js';
import locationRoutes from './src/routes/location.routes.js';
import paymentRoutes from './src/routes/payment.routes.js';
import adminRoutes from './src/routes/admin.routes.js';
import notificationRoutes from './src/routes/notification.routes.js';
import contactRoutes from './src/routes/contact.routes.js';
import blogRoutes from './src/routes/blog.routes.js';
import reviewRoutes from './src/routes/review.routes.js';
import waitlistRoutes from './src/routes/waitlist.routes.js';
import spaceRoutes from './src/routes/space.routes.js';
import couponRoutes from './src/routes/coupon.routes.js';
import { swaggerSpec } from './src/config/swagger.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5000',   // Swagger UI
    'http://localhost:8080',
    'http://localhost:5173',
    'http://3.107.114.205:5000',
    'https://kusalabackend.duckdns.org',
    'https://pizza-circumstances-knives-governments.trycloudflare.com',
    'https://www.kusala.in',
    process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, server-to-server)
        if (!origin) return callback(null, true);
        if (
            allowedOrigins.includes(origin) ||
            /\.vercel\.app$/.test(origin)
        ) {
            return callback(null, true);
        }
        return callback(null, false);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning', 'X-Tunnel-Skip-AntiPhishing-Page'],
}));

// ── Razorpay Webhook: capture raw body BEFORE express.json() strips it ───────
// HMAC signature verification needs the exact raw bytes Razorpay sent.
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }), (req, _res, next) => {
    req.rawBody = req.body?.toString('utf8') || '';
    try { req.body = JSON.parse(req.rawBody); } catch { req.body = {}; }
    next();
});

app.use(express.json());

// ── Swagger UI ──────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Kusala API Docs',
    swaggerOptions: { persistAuthorization: true }
}));

// ── Routes ──────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api', availabilityRoutes);
app.use('/api', appointmentRoutes);
app.use('/api', serviceRoutes);
app.use('/api', locationRoutes);
app.use('/api', paymentRoutes);
app.use('/api', practitionerRoutes); // Mounted after specific prefixes to prevent /:slug capturing everything
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/content', blogRoutes);      // → /api/content/blogs
app.use('/api/reviews', reviewRoutes);
app.use('/api', waitlistRoutes);
app.use('/api', spaceRoutes);
app.use('/api', couponRoutes);

// Test route
app.get('/', (req, res) => {
    res.send('Kusala Backend is running. Visit /api-docs for the API documentation.');
});

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health Check (HEALTH-001)
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API is healthy
 */
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), service: 'kusala-api' });
});

// Legacy Supabase health check
app.get('/api/health/supabase', async (req, res) => {
    try {
        res.json({ message: 'Supabase client is configured via src/config/supabase.js' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Global error handling middleware (handles multer file errors, payload issues, etc.)
app.use((err, req, res, next) => {
    if (err) {
        console.error('API Error:', err.message || err);
        const status = err.status || err.statusCode || 400;
        return res.status(status).json({
            error: err.message || 'An error occurred while processing the request.',
        });
    }
    next();
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Swagger API Docs: http://localhost:${PORT}/api-docs`);
});
