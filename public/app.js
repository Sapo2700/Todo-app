// ============================================
// ESTADO DA APLICAÇÃO
// ============================================

let tasks = [];
let currentFilter = 'all';
let currentUser = null;

// ============================================
// INICIALIZAÇÃO
// ============================================

// Verificar se o utilizador está logado
async function checkAuth() {
    try {
        const response = await fetch('/api/me');
        const data = await response.json();
        
        if (!data.logged) {
            window.location.href = '/';
            return;
        }
        
        currentUser = data.username;
        document.getElementById('currentUser').textContent = currentUser;
        
        // Mostrar botão admin se for admin
        console.log('isAdmin:', data.isAdmin);
        if (data.isAdmin) {
            document.getElementById('adminBtn').classList.remove('hidden');
        }
        
        // Carregar tarefas
        await loadTasks();
        
    } catch (error) {
        console.error('Erro de autenticação:', error);
        window.location.href = '/';
    }
}

// ============================================
// GESTÃO DE TAREFAS
// ============================================

// Carregar tarefas do servidor
async function loadTasks() {
    try {
        const response = await fetch('/api/tasks');
        const data = await response.json();
        
        if (data.success) {
            tasks = data.tasks;
            renderTasks();
            updateStats();
        }
    } catch (error) {
        console.error('Erro ao carregar tarefas:', error);
    }
}

// Adicionar nova tarefa
async function addTask() {
    const input = document.getElementById('taskInput');
    const text = input.value.trim();
    
    if (text === '') {
        input.focus();
        return;
    }
    
    try {
        const response = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Adicionar ao início da lista
            tasks.unshift(data.task);
            renderTasks();
            updateStats();
            input.value = '';
            input.focus();
        } else {
            alert(data.error);
        }
    } catch (error) {
        console.error('Erro ao adicionar tarefa:', error);
        alert('Erro ao adicionar tarefa.');
    }
}

// Marcar/desmarcar tarefa como concluída
async function toggleTask(id) {
    const task = tasks.find(t => t._id === id);
    if (!task) return;
    
    const newStatus = !task.completed;
    
    try {
        const response = await fetch(`/api/tasks/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ completed: newStatus })
        });
        
        const data = await response.json();
        
        if (data.success) {
            task.completed = newStatus;
            renderTasks();
            updateStats();
        }
    } catch (error) {
        console.error('Erro ao atualizar tarefa:', error);
    }
}

// Eliminar tarefa
async function deleteTask(id) {
    if (!confirm('Tem certeza que quer eliminar esta tarefa?')) return;
    
    try {
        const response = await fetch(`/api/tasks/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            tasks = tasks.filter(t => t._id !== id);
            renderTasks();
            updateStats();
        }
    } catch (error) {
        console.error('Erro ao eliminar tarefa:', error);
    }
}

// ============================================
// FILTROS
// ============================================

function filterTasks(filter, btn) {
    currentFilter = document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = filter;
    renderTasks();
}

// ============================================
// RENDERIZAÇÃO
// ============================================

function renderTasks() {
    const taskList = document.getElementById('taskList');
    const tasksCount = document.getElementById('tasksCount');
    
    // Filtrar tarefas
    let filteredTasks = tasks;
    if (currentFilter === 'pending') {
        filteredTasks = tasks.filter(t => !t.completed);
    } else if (currentFilter === 'completed') {
        filteredTasks = tasks.filter(t => t.completed);
    }
    
    // Atualizar contador
    tasksCount.textContent = `${filteredTasks.length} tarefa(s)`;
    
    // Renderizar
    if (filteredTasks.length === 0) {
        taskList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <p>${currentFilter === 'all' ? 'Nenhuma tarefa ainda. Adiciona a primeira!' : 'Nenhuma tarefa encontrada.'}</p>
            </div>
        `;
        return;
    }
    
    taskList.innerHTML = filteredTasks.map(task => {
        const date = task.createdAt ? new Date(task.createdAt).toLocaleDateString('pt-BR') : '';
        return `
            <li class="task-item ${task.completed ? 'completed' : ''}">
                <div class="task-checkbox" onclick="toggleTask('${task._id}')"></div>
                <span class="task-text">${escapeHtml(task.text)}</span>
                <span class="task-date">${date}</span>
                <button class="btn-delete" onclick="deleteTask('${task._id}')">×</button>
            </li>
        `;
    }).join('');
}

function updateStats() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const pending = total - completed;
    
    document.getElementById('totalTasks').textContent = total;
    document.getElementById('pendingTasks').textContent = pending;
    document.getElementById('completedTasks').textContent = completed;
}

// ============================================
// UTILITÁRIOS
// ============================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// LOGOUT
// ============================================

async function logout() {
    try {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/';
    } catch (error) {
        console.error('Erro ao fazer logout:', error);
        window.location.href = '/';
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

// Enter para adicionar tarefa
document.getElementById('taskInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        addTask();
    }
});

// Iniciar aplicação
checkAuth();
