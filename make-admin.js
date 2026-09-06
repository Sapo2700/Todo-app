const Datastore = require('nedb-promises');
const path = require('path');

const dbPath = path.join(__dirname, 'data');
const users = Datastore.create({ 
    filename: path.join(dbPath, 'users.db'), 
    autoload: true 
});

async function makeAdmin(username) {
    try {
        const user = await users.findOne({ username });
        
        if (!user) {
            console.log(`❌ Utilizador "${username}" não encontrado.`);
            console.log('\nUtilizadores existentes:');
            const allUsers = await users.find({});
            allUsers.forEach(u => console.log(`  - ${u.username} (admin: ${u.admin || false})`));
            return;
        }

        await users.update({ _id: user._id }, { $set: { admin: true } });
        console.log(`✅ Utilizador "${username}" agora é administrador!`);
        console.log(`   Pode aceder ao painel admin em: http://localhost:3000/admin`);
        
    } catch (error) {
        console.error('Erro:', error);
    }
}

async function removeAdmin(username) {
    try {
        const user = await users.findOne({ username });
        
        if (!user) {
            console.log(`❌ Utilizador "${username}" não encontrado.`);
            return;
        }

        await users.update({ _id: user._id }, { $set: { admin: false } });
        console.log(`✅ Admin removido de "${username}".`);
        
    } catch (error) {
        console.error('Erro:', error);
    }
}

async function listUsers() {
    try {
        const allUsers = await users.find({});
        console.log('\n📋 Utilizadores registados:\n');
        allUsers.forEach(u => {
            console.log(`  ${u.admin ? '👑' : '👤'} ${u.username} (admin: ${u.admin || false})`);
        });
        console.log('');
    } catch (error) {
        console.error('Erro:', error);
    }
}

// Comandos
const args = process.argv.slice(2);
const command = args[0];
const username = args[1];

console.log('\n🔧 Ferramenta de Administração\n');

if (!command) {
    console.log('Comandos disponíveis:');
    console.log('  make-admin <username>   - Tornar utilizador admin');
    console.log('  remove-admin <username> - Remover admin');
    console.log('  list                   - Listar utilizadores');
    console.log('\nExemplo: node make-admin.js make-admin rodelas\n');
    process.exit(0);
}

if (command === 'list') {
    listUsers().then(() => process.exit(0));
} else if (command === 'make-admin') {
    if (!username) {
        console.log('❌ Especifica o nome do utilizador.');
        console.log('Exemplo: node make-admin.js make-admin rodelas');
        process.exit(1);
    }
    makeAdmin(username).then(() => process.exit(0));
} else if (command === 'remove-admin') {
    if (!username) {
        console.log('❌ Especifica o nome do utilizador.');
        console.log('Exemplo: node make-admin.js remove-admin rodelas');
        process.exit(1);
    }
    removeAdmin(username).then(() => process.exit(0));
} else {
    console.log(`❌ Comando desconhecido: ${command}`);
    process.exit(1);
}
