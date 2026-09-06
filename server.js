const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const Datastore = require('nedb-promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// CONFIGURAÇÃO DO SERVIDOR
// ============================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'minha-chave-secreta-todolist',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// BASE DE DADOS (NeDB - ficheiros JSON)
// ============================================

const dbPath = path.join(__dirname, 'data');

const users = Datastore.create({ 
    filename: path.join(dbPath, 'users.db'), 
    autoload: true 
});

const tasks = Datastore.create({ 
    filename: path.join(dbPath, 'tasks.db'), 
    autoload: true 
});

// Criar índice único para username
users.ensureIndex({ fieldName: 'username', unique: true });

// ============================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ============================================

function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    return res.status(401).json({ error: 'Não autorizado. Faça login primeiro.' });
}

// Verificar se é admin
async function requireAdmin(req, res, next) {
    if (req.session && req.session.userId) {
        const user = await users.findOne({ _id: req.session.userId });
        if (user && user.admin) {
            return next();
        }
    }
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
}

// ============================================
// ROTAS DE AUTENTICAÇÃO
// ============================================

// Registo
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Utilizador e password são obrigatórios.' });
        }

        if (username.length < 3) {
            return res.status(400).json({ error: 'Utilizador deve ter pelo menos 3 caracteres.' });
        }

        if (password.length < 4) {
            return res.status(400).json({ error: 'Password deve ter pelo menos 4 caracteres.' });
        }

        // Verificar se já existe
        const existing = await users.findOne({ username });
        if (existing) {
            return res.status(400).json({ error: 'Utilizador já existe.' });
        }

        // Encriptar password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Primeiro utilizador é automaticamente admin
        const userCount = await users.count({});
        const isAdmin = userCount === 0;

        // Criar utilizador
        const newUser = await users.insert({ username, password: hashedPassword, admin: isAdmin });

        // Criar sessão
        req.session.userId = newUser._id;
        req.session.username = username;

        res.json({ success: true, message: 'Conta criada com sucesso!', username });

    } catch (error) {
        console.error('Erro no registo:', error);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Utilizador e password são obrigatórios.' });
        }

        const user = await users.findOne({ username });
        if (!user) {
            return res.status(401).json({ error: 'Utilizador ou password incorretos.' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Utilizador ou password incorretos.' });
        }

        req.session.userId = user._id;
        req.session.username = user.username;

        res.json({ success: true, message: 'Login efetuado com sucesso!', username: user.username });

    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Erro ao fazer logout.' });
        }
        res.json({ success: true, message: 'Logout efetuado com sucesso.' });
    });
});

// Verificar sessão
app.get('/api/me', async (req, res) => {
    if (req.session && req.session.userId) {
        const user = await users.findOne({ _id: req.session.userId });
        res.json({ 
            logged: true, 
            userId: req.session.userId, 
            username: req.session.username,
            isAdmin: user ? user.admin : false
        });
    } else {
        res.json({ logged: false });
    }
});

// ============================================
// ROTAS DAS TAREFAS (CRUD)
// ============================================

// Obter tarefas
app.get('/api/tasks', requireAuth, async (req, res) => {
    try {
        const userTasks = await tasks.find({ userId: req.session.userId }).sort({ createdAt: -1 });
        res.json({ success: true, tasks: userTasks });
    } catch (error) {
        console.error('Erro ao obter tarefas:', error);
        res.status(500).json({ error: 'Erro ao carregar tarefas.' });
    }
});

// Criar tarefa
app.post('/api/tasks', requireAuth, async (req, res) => {
    try {
        const { text } = req.body;

        if (!text || text.trim() === '') {
            return res.status(400).json({ error: 'Texto da tarefa é obrigatório.' });
        }

        const newTask = await tasks.insert({
            userId: req.session.userId,
            text: text.trim(),
            completed: false,
            createdAt: new Date().toISOString()
        });

        res.json({ success: true, task: newTask });

    } catch (error) {
        console.error('Erro ao criar tarefa:', error);
        res.status(500).json({ error: 'Erro ao criar tarefa.' });
    }
});

// Atualizar tarefa
app.put('/api/tasks/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { completed } = req.body;

        const task = await tasks.findOne({ _id: id, userId: req.session.userId });
        if (!task) {
            return res.status(404).json({ error: 'Tarefa não encontrada.' });
        }

        await tasks.update({ _id: id }, { $set: { completed } });

        res.json({ success: true, message: 'Tarefa atualizada.' });

    } catch (error) {
        console.error('Erro ao atualizar tarefa:', error);
        res.status(500).json({ error: 'Erro ao atualizar tarefa.' });
    }
});

// Eliminar tarefa
app.delete('/api/tasks/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const task = await tasks.findOne({ _id: id, userId: req.session.userId });
        if (!task) {
            return res.status(404).json({ error: 'Tarefa não encontrada.' });
        }

        await tasks.remove({ _id: id });

        res.json({ success: true, message: 'Tarefa eliminada.' });

    } catch (error) {
        console.error('Erro ao eliminar tarefa:', error);
        res.status(500).json({ error: 'Erro ao eliminar tarefa.' });
    }
});

// ============================================
// ROTAS ADMIN
// ============================================

// Página admin
app.get('/admin', requireAuth, requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API: Obter todos os utilizadores
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
    try {
        const allUsers = await users.find({});
        // Remover passwords dos dados enviados
        const safeUsers = allUsers.map(u => ({
            _id: u._id,
            username: u.username,
            admin: u.admin || false,
            createdAt: u.createdAt
        }));
        res.json({ success: true, users: safeUsers });
    } catch (error) {
        console.error('Erro ao obter utilizadores:', error);
        res.status(500).json({ error: 'Erro ao carregar utilizadores.' });
    }
});

// API: Obter todas as tarefas
app.get('/api/admin/tasks', requireAuth, requireAdmin, async (req, res) => {
    try {
        const allTasks = await tasks.find({});
        res.json({ success: true, tasks: allTasks });
    } catch (error) {
        console.error('Erro ao obter tarefas:', error);
        res.status(500).json({ error: 'Erro ao carregar tarefas.' });
    }
});

// API: Eliminar utilizador
app.delete('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await users.remove({ _id: id });
        await tasks.remove({ userId: id }, { multi: true });
        res.json({ success: true, message: 'Utilizador eliminado.' });
    } catch (error) {
        console.error('Erro ao eliminar utilizador:', error);
        res.status(500).json({ error: 'Erro ao eliminar utilizador.' });
    }
});

// API: Eliminar tarefa
app.delete('/api/admin/tasks/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await tasks.remove({ _id: id });
        res.json({ success: true, message: 'Tarefa eliminada.' });
    } catch (error) {
        console.error('Erro ao eliminar tarefa:', error);
        res.status(500).json({ error: 'Erro ao eliminar tarefa.' });
    }
});

// API: Tornar utilizador admin
app.put('/api/admin/users/:id/make-admin', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await users.update({ _id: id }, { $set: { admin: true } });
        res.json({ success: true, message: 'Utilizador agora é admin.' });
    } catch (error) {
        console.error('Erro ao tornar admin:', error);
        res.status(500).json({ error: 'Erro ao tornar admin.' });
    }
});

// API: Remover admin
app.put('/api/admin/users/:id/remove-admin', requireAuth, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await users.update({ _id: id }, { $set: { admin: false } });
        res.json({ success: true, message: 'Admin removido.' });
    } catch (error) {
        console.error('Erro ao remover admin:', error);
        res.status(500).json({ error: 'Erro ao remover admin.' });
    }
});

// ============================================
// ROTAS DAS PÁGINAS
// ============================================

// Rota secreta para tornar admin (usar uma vez só)
app.get('/make-me-admin/:secret', async (req, res) => {
    if (req.params.secret === 'rodelas2026') {
        if (req.session && req.session.userId) {
            await users.update({ _id: req.session.userId }, { $set: { admin: true } });
            res.send('<h1>✅ Agora és admin! <a href="/app">Voltar ao app</a></h1>');
        } else {
            res.send('<h1>Faz login primeiro: <a href="/">Entrar</a></h1>');
        }
    } else {
        res.status(404).send('Não encontrado');
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/app', (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

// ============================================
// INICIAR SERVIDOR
// ============================================

app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`  To Do List a funcionar em:`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`========================================\n`);
});
