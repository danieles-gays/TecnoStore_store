const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'w4r3h0us3_jwt_s3cr3t';

// POST /api/auth/login — sin rate limiting
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Correo electrónico y contraseña requeridos.' });
    }

    db.get('SELECT * FROM users WHERE username = ? OR email = ?', [username, username], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });

        if (!user) {
            return res.status(401).json({ error: 'Credenciales incorrectas.' });
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(401).json({ error: 'Credenciales incorrectas.' });
        }

        const token = jwt.sign(
            { type: 'user', userId: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            token,
            user: { id: user.id, username: user.username, email: user.email, role: user.role }
        });
    });
});

// POST /api/auth/forgot-password — enumera usuarios y devuelve el token en la respuesta
router.post('/forgot-password', (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'El campo email es obligatorio.' });
    }

    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });

        if (!user) {
            // Respuesta diferente → enumeración de usuarios
            return res.status(404).json({ error: 'No existe ninguna cuenta asociada a ese correo.' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 3600000; // 1 hora

        db.run(
            'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?',
            [token, expires, user.id],
            (err) => {
                if (err) return res.status(500).json({ error: err.message });

                // El token se devuelve en la respuesta en lugar de enviarse solo por correo
                res.json({
                    success: true,
                    message: 'Enlace de recuperación generado. Revisa tu bandeja de entrada.',
                    reset_url: `/reset-password?token=${token}`
                });
            }
        );
    });
});

// POST /api/auth/reset-password
router.post('/reset-password', (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
        return res.status(400).json({ error: 'Token y nueva contraseña requeridos.' });
    }

    db.get(
        'SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > ?',
        [token, Date.now()],
        async (err, user) => {
            if (err) return res.status(500).json({ error: err.message });
            if (!user) return res.status(400).json({ error: 'Token inválido o expirado.' });

            const hashed = await bcrypt.hash(password, 10);

            db.run(
                'UPDATE users SET password = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
                [hashed, user.id],
                (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true, message: 'Contraseña actualizada correctamente.' });
                }
            );
        }
    );
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
    db.get('SELECT id, username, email, role, created_at FROM users WHERE id = ?', [req.user.userId], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
        res.json(user);
    });
});

module.exports = router;
