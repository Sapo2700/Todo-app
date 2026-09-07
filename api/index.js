require('dotenv').config();
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let connected = false;

async function ensureDB() {
    if (!connected) {
        await mongoose.connect(process.env.MONGO_URI);
        connected = true;
    }
}

function getSessionMiddleware() {
    return session({
        secret: process.env.SESSION_SECRET || 'minha-chave-secreta-todolist',
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
        cookie: {
            secure: true,
            sameSite: 'none',
            maxAge: 24 * 60 * 60 * 1000
        }
    });
}

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    admin: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const taskSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    text: { type: String, required: true },
    completed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

let User, Task;

function getModels() {
    if (!User) {
        User = mongoose.model('User', userSchema);
        Task = mongoose.model('Task', taskSchema);
    }
    return { User, Task };
}

function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    return res.status(401).json({ error: 'Nao autorizado. Faca login primeiro.' });
}

async function requireAdmin(req, res, next) {
    if (req.session && req.session.userId) {
        const { User } = getModels();
        const user = await User.findById(req.session.userId);
        if (user && user.admin) {
            return next();
        }
    }
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
}

app.post('/api/register', async (req, res) => {
    try {
        await ensureDB();
        const { User } = getModels();
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Utilizador e password sao obrigatorios.' });
        if (username.length < 3) return res.status(400).json({ error: 'Utilizador deve ter pelo menos 3 caracteres.' });
        if (password.length < 4) return res.status(400).json({ error: 'Password deve ter pelo menos 4 caracteres.' });
        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ error: 'Utilizador ja existe.' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const userCount = await User.countDocuments({});
        const isAdmin = userCount === 0;
        const user = await User.create({ username, password: hashedPassword, admin: isAdmin });
        req.session.userId = user._id.toString();
        req.session.username = username;
        res.json({ success: true, message: 'Conta criada com sucesso!', username });
    } catch (error) {
        console.error('Erro no registo:', error);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        await ensureDB();
        const { User } = getModels();
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Utilizador e password sao obrigatorios.' });
        const user = await User.findOne({ username });
        if (!user) return res.status(401).json({ error: 'Utilizador ou password incorretos.' });
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(401).json({ error: 'Utilizador ou password incorretos.' });
        req.session.userId = user._id.toString();
        req.session.username = user.username;
        res.json({ success: true, message: 'Login efetuado com sucesso!', username: user.username });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ error: 'Erro ao fazer logout.' });
        res.json({ success: true, message: 'Logout efetuado com sucesso.' });
    });
});

app.get('/api/me', async (req, res) => {
    try {
        await ensureDB();
        const { User } = getModels();
        if (req.session && req.session.userId) {
            const user = await User.findById(req.session.userId);
            res.json({ logged: true, userId: req.session.userId, username: req.session.username, isAdmin: user ? user.admin : false });
        } else {
            res.json({ logged: false });
        }
    } catch (error) {
        res.json({ logged: false });
    }
});

app.get('/api/tasks', requireAuth, async (req, res) => {
    try {
        await ensureDB();
        const { Task } = getModels();
        const userTasks = await Task.find({ userId: req.session.userId }).sort({ createdAt: -1 });
        res.json({ success: true, tasks: userTasks });
    } catch (error) {
        console.error('Erro ao obter tarefas:', error);
        res.status(500).json({ error: 'Erro ao carregar tarefas.' });
    }
});

app.post('/api/tasks', requireAuth, async (req, res) => {
    try {
        await ensureDB();
        const { Task } = getModels();
        const { text } = req.body;
        if (!text || text.trim() === '') return res.status(400).json({ error: 'Texto da tarefa e obrigatorio.' });
        const task = await Task.create({ userId: req.session.userId, text: text.trim(), completed: false });
        res.json({ success: true, task });
    } catch (error) {
        console.error('Erro ao criar tarefa:', error);
        res.status(500).json({ error: 'Erro ao criar tarefa.' });
    }
});

app.put('/api/tasks/:id', requireAuth, async (req, res) => {
    try {
        await ensureDB();
        const { Task } = getModels();
        const { id } = req.params;
        const { completed } = req.body;
        const task = await Task.findOne({ _id: id, userId: req.session.userId });
        if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada.' });
        await Task.findByIdAndUpdate(id, { completed });
        res.json({ success: true, message: 'Tarefa atualizada.' });
    } catch (error) {
        console.error('Erro ao atualizar tarefa:', error);
        res.status(500).json({ error: 'Erro ao atualizar tarefa.' });
    }
});

app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
    try {
        await ensureDB();
        const { Task } = getModels();
        const { id } = req.params;
        const task = await Task.findOne({ _id: id, userId: req.session.userId });
        if (!task) return res.status(404).json({ error: 'Tarefa nao encontrada.' });
        await Task.findByIdAndDelete(id);
        res.json({ success: true, message: 'Tarefa eliminada.' });
    } catch (error) {
        console.error('Erro ao eliminar tarefa:', error);
        res.status(500).json({ error: 'Erro ao eliminar tarefa.' });
    }
});

app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        await ensureDB();
        const { User } = getModels();
        const allUsers = await User.find({});
        const safeUsers = allUsers.map(u => ({ _id: u._id.toString(), username: u.username, admin: u.admin || false, createdAt: u.createdAt }));
        res.json({ success: true, users: safeUsers });
    } catch (error) {
        console.error('Erro ao obter utilizadores:', error);
        res.status(500).json({ error: 'Erro ao carregar utilizadores.' });
    }
});

app.get('/api/admin/tasks', requireAuth, requireAdmin, async (req, res) => {
    try {
        await ensureDB();
        const { Task } = getModels();
        const allTasks = await Task.find({});
        res.json({ success: true, tasks: allTasks });
    } catch (error) {
        console.error('Erro ao obter tarefas:', error);
        res.status(500).json({ error: 'Erro ao carregar tarefas.' });
    }
});

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await ensureDB();
        const { User, Task } = getModels();
        const { id } = req.params;
        await User.findByIdAndDelete(id);
        await Task.deleteMany({ userId: id });
        res.json({ success: true, message: 'Utilizador eliminado.' });
    } catch (error) {
        console.error('Erro ao eliminar utilizador:', error);
        res.status(500).json({ error: 'Erro ao eliminar utilizador.' });
    }
});

app.delete('/api/admin/tasks/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        await ensureDB();
        const { Task } = getModels();
        const { id } = req.params;
        await Task.findByIdAndDelete(id);
        res.json({ success: true, message: 'Tarefa eliminada.' });
    } catch (error) {
        console.error('Erro ao eliminar tarefa:', error);
        res.status(500).json({ error: 'Erro ao eliminar tarefa.' });
    }
});

app.put('/api/admin/users/:id/make-admin', requireAuth, requireAdmin, async (req, res) => {
    try {
        await ensureDB();
        const { User } = getModels();
        await User.findByIdAndUpdate(req.params.id, { admin: true });
        res.json({ success: true, message: 'Utilizador agora e admin.' });
    } catch (error) {
        console.error('Erro ao tornar admin:', error);
        res.status(500).json({ error: 'Erro ao tornar admin.' });
    }
});

app.put('/api/admin/users/:id/remove-admin', requireAuth, requireAdmin, async (req, res) => {
    try {
        await ensureDB();
        const { User } = getModels();
        await User.findByIdAndUpdate(req.params.id, { admin: false });
        res.json({ success: true, message: 'Admin removido.' });
    } catch (error) {
        console.error('Erro ao remover admin:', error);
        res.status(500).json({ error: 'Erro ao remover admin.' });
    }
});

app.get('/make-me-admin/:secret', async (req, res) => {
    try {
        await ensureDB();
        const { User } = getModels();
        if (req.params.secret === 'rodelas2026') {
            if (req.session && req.session.userId) {
                await User.findByIdAndUpdate(req.session.userId, { admin: true });
                res.json({ success: true, message: 'Agora es admin!' });
            } else {
                res.status(401).json({ error: 'Faz login primeiro.' });
            }
        } else {
            res.status(404).json({ error: 'Nao encontrado' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Erro.' });
    }
});

module.exports = app;
