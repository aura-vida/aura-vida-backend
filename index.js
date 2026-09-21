import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import authRoutes from './src/routes/auth.routes.js';
import { swaggerSpec } from './src/config/swagger.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ── Swagger UI ──────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Aura Vida API Docs',
    swaggerOptions: {
        persistAuthorization: true, // keeps the JWT bearer token set between page refreshes
    }
}));

// ── Routes ──────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// Test route
app.get('/', (req, res) => {
    res.send('Aura Vida Backend is running. Visit /api-docs for the API documentation.');
});

// Supabase health check
app.get('/api/health/supabase', async (req, res) => {
    try {
        res.json({ message: 'Supabase client is configured via src/config/supabase.js' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Swagger API Docs: http://localhost:${PORT}/api-docs`);
});
